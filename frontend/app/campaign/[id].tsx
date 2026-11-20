import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { StateView, Loader, StatusBadge, Button } from "@/src/components/common";
import { ConfirmDialog } from "@/src/components/ConfirmDialog";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";
import { brevo, Campaign, Readiness } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";
import { useFocusRefetch } from "@/src/hooks/use-focus-refetch";
import { nf, fmtDateTime } from "@/src/lib/format";
import { openWeb, WEB_HOME_URL, webCampaignReportUrl, webCampaignEditUrl } from "@/src/lib/open-web";

const pad = (n: number) => String(n).padStart(2, "0");

// Device timezone offset in minutes (east of UTC positive).
const tzOffsetMin = () => -new Date().getTimezoneOffset();

// "Asia/Kolkata GMT +05:30" like Brevo web.
function tzLabel() {
  let name = "";
  try {
    name = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    name = "";
  }
  const off = tzOffsetMin();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const gmt = `GMT ${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return name ? `${name} ${gmt}` : gmt;
}

// Local Date -> ISO 8601 with the device's offset, e.g. 2026-11-09T11:00:00+05:30.
function toOffsetISO(d: Date) {
  const off = tzOffsetMin();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d: Date) => `${WEEKDAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;

const MISSING_LABEL: Record<string, string> = {
  sender: "Sender",
  recipients: "Recipients",
  subject: "Subject",
  design: "Design",
};

// Draft checklist steps, in display order, with the hint shown when missing.
const STEPS: { key: string; label: string; hint: string }[] = [
  { key: "sender", label: "Sender", hint: "Choose a sender" },
  { key: "recipients", label: "Recipients", hint: "Choose recipients" },
  { key: "subject", label: "Subject", hint: "Add a subject line" },
  { key: "design", label: "Design", hint: "Create your email content" },
];

// Missing steps derived from the campaign itself (used when readiness isn't loaded).
function deriveMissing(c: Campaign): string[] {
  const raw = c as any;
  const missing: string[] = [];
  if (!c.sender?.email && !c.sender?.name) missing.push("sender");
  const r = raw.recipients || {};
  if (!(r.listIds?.length || r.segmentIds?.length)) missing.push("recipients");
  if (!c.subject) missing.push("subject");
  if (!raw.htmlContent) missing.push("design");
  return missing;
}

// Rate 0–100 for a numerator/denominator, never NaN/Infinity.
const ratePct = (num?: number, den?: number) => {
  if (!den || !num) return 0;
  const v = (num / den) * 100;
  return isFinite(v) ? v : 0;
};
// Web-style label: "0%" when zero, otherwise 2 decimals ("2.04%").
const rateLabel = (v: number) => (v === 0 ? "0%" : `${v.toFixed(2)}%`);

// Normalize Brevo status: case-insensitive + underscore/camelCase tolerant.
// "in_process" | "inProcess" -> "inprocess", "Queued" -> "queued".
const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

type StatusAction = {
  target: string; // status to set
  confirm: string;
  cancel: string;
  question: string;
  body: string;
};

// STRICT rules:
//   queued (scheduled) OR inprocess (running) -> Suspend
//   suspended -> Resume
//   everything else (draft, sent, archive, ...) -> no status action
function actionFor(status?: string): StatusAction | null {
  const n = norm(status);
  if (n === "suspended") {
    return {
      target: "queued",
      confirm: "Resume campaign",
      cancel: "Cancel",
      question: "Resume this campaign?",
      body: "The campaign will be re-queued and may resume sending.",
    };
  }
  if (n === "queued" || n === "inprocess") {
    return {
      target: "suspended",
      confirm: "Suspend campaign",
      cancel: "Keep sending",
      question: "Suspend this campaign?",
      body: "The campaign will stop sending until you resume it.",
    };
  }
  return null;
}

type BarAction = {
  title: string;
  variant: "primary" | "secondary" | "destructive";
  icon: keyof typeof Ionicons.glyphMap;
  iconRight?: boolean;
  onPress: () => void;
  testID: string;
};

export default function CampaignDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useBrevo();
  const [campaign, setCampaign] = useState<Campaign | null>(() => cache.get<Campaign>(cacheKeys.campaign(id)) || null);
  const [loading, setLoading] = useState(!cache.get<Campaign>(cacheKeys.campaign(id)));
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // --- Draft send/schedule (sheet is reworked in the next UI batch) ---
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendMode, setSendMode] = useState<"now" | "later">("now");
  const [dayOffset, setDayOffset] = useState(0);
  const [hour, setHour] = useState(() => Math.min(23, new Date().getHours() + 1));
  const [minute, setMinute] = useState(0);
  const [openPicker, setOpenPicker] = useState<"date" | "hour" | "minute" | null>(null);
  const [confirmMode, setConfirmMode] = useState<null | "now" | "later">(null);
  const [sending, setSending] = useState(false);
  const sendingRef = React.useRef(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await brevo.getCampaign(token, id);
      setCampaign(res);
      cache.set(cacheKeys.campaign(id), res);
      // Readiness only matters for drafts (the only sendable state here).
      if ((res?.status || "").toLowerCase() === "draft") {
        try {
          setReadiness(await brevo.getCampaignReadiness(token, id));
        } catch {
          setReadiness(null);
        }
      } else {
        setReadiness(null);
      }
    } catch (e: any) {
      if (!cache.get<Campaign>(cacheKeys.campaign(id))) setError(e?.message || "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useFocusRefetch(load);
  // Deep link / reload: the saved session restores after first focus, so load once it arrives.
  const hadToken = React.useRef(!!token);
  React.useEffect(() => {
    if (token && !hadToken.current) {
      hadToken.current = true;
      load();
    }
  }, [token, load]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/campaigns");
  };

  const g = campaign?.statistics?.globalStats || {};
  const action = actionFor(campaign?.status);
  const destructive = action?.target === "suspended";
  const nStatus = norm(campaign?.status);
  const isDraft = nStatus === "draft";
  const isSuspended = nStatus === "suspended";

  // Date next to the status pill (same rules as the list, lower-case lead-in).
  let dateText = "";
  if (campaign?.sentDate) dateText = `on ${fmtDateTime(campaign.sentDate)}`;
  else if (nStatus === "cancelled" || nStatus === "canceled" || isSuspended)
    dateText = `on ${fmtDateTime(campaign?.modifiedAt)}`;
  else if (campaign?.scheduledAt) dateText = `for ${fmtDateTime(campaign.scheduledAt)}`;
  else if (campaign?.createdAt) dateText = `created on ${fmtDateTime(campaign.createdAt)}`;

  // Rates (0–100).
  const deliveryRate = ratePct(g.delivered, g.sent);
  const openRate = ratePct(g.uniqueViews, g.delivered);
  const clickRate = ratePct(g.uniqueClicks, g.delivered);
  const unsubRate = ratePct(g.unsubscriptions, g.delivered);
  // Conversions only if the response actually carries one.
  const convRaw = (g as any).conversions;
  const hasConversions = typeof convRaw === "number";
  const convRate = ratePct(convRaw, g.delivered);
  const soft = g.softBounces || 0;
  const hard = g.hardBounces || 0;

  // Results exist once something has gone out (or the campaign is sent/archived).
  const hasResults = (g.sent || 0) > 0 || nStatus === "sent" || nStatus === "archive" || nStatus === "archived";
  const lowDelivery = (g.sent || 0) >= 10 && deliveryRate < 80;

  // Draft readiness: API data when present, otherwise derived from the campaign.
  const missing = readiness ? readiness.missing : campaign ? deriveMissing(campaign) : [];
  const unsupportedRecipients = missing.includes("unsupported_recipients");
  const draftReady = readiness ? readiness.ready : missing.length === 0;

  // Selected schedule moment (local) + display strings.
  const scheduledDate = (() => {
    const base = new Date();
    base.setDate(base.getDate() + dayOffset);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
  })();
  const whenText = `${dayLabel(scheduledDate)}, ${pad(hour)}:${pad(minute)} ${tzLabel()}`;

  // Recipient summary for the confirmation.
  const lists = readiness?.recipients?.lists || [];
  const segments = readiness?.recipients?.segments || [];
  const recipientNames = [...lists.map((l) => l.name), ...segments.map((s) => s.name)].join(", ");
  const recipientCount = lists.reduce((a, l) => a + (l.count || 0), 0);
  const recipientLine =
    recipientCount > 0
      ? `${nf(recipientCount)} contacts in ${recipientNames}`
      : recipientNames
      ? `${recipientNames}`
      : "your recipients";

  const dateOptions = [...Array(60)].map((_, d) => {
    const base = new Date();
    base.setDate(base.getDate() + d);
    return { offset: d, label: dayLabel(base) };
  });

  const errText = (e: any) => {
    const st = e?.upstreamStatus || e?.status;
    if (st === 402) return "You don't have enough email credits to send this campaign.";
    if (st === 400 && Array.isArray(e?.detail?.missing)) {
      return `Complete these steps on Brevo web first: ${e.detail.missing
        .map((m: string) => MISSING_LABEL[m] || m)
        .join(", ")}.`;
    }
    return e?.message || "Something went wrong. Please try again.";
  };

  const runSend = async () => {
    if (sendingRef.current) return; // synchronous guard: one request per tap burst
    sendingRef.current = true;
    setSending(true);
    setSheetError(null);
    try {
      if (confirmMode === "now") {
        await brevo.sendCampaignNow(token, id);
      } else {
        await brevo.scheduleCampaign(token, id, toOffsetISO(scheduledDate));
      }
      setConfirmMode(null);
      setScheduleOpen(false);
      cache.del(cacheKeys.campaigns);
      toast.show(confirmMode === "now" ? "Campaign sent" : `Campaign scheduled for ${whenText}`, "success");
      await load(); // status flips to sent/queued; Suspend action reappears
    } catch (e: any) {
      setSheetError(errText(e));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const applyStatus = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await brevo.updateCampaignStatus(token, id, action.target);
      setConfirmOpen(false);
      cache.del(cacheKeys.campaigns);
      toast.show(
        action.target === "suspended" ? "Campaign suspended" : "Campaign resumed",
        "success"
      );
      await load(); // refetch so the status badge flips
    } catch (e: any) {
      setConfirmOpen(false);
      const status = e?.upstreamStatus || e?.status;
      if (status === 403) {
        toast.show(
          "This action needs an updated permission. Please sign out and sign in again.",
          "error"
        );
      } else {
        toast.show(e?.message || "Couldn't update the campaign", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  // --- Sticky bottom action, one per status ---
  let barAction: BarAction | null = null;
  if (campaign) {
    if (nStatus === "sent" || nStatus === "archive" || nStatus === "archived") {
      barAction = {
        title: "View full report on Brevo web",
        variant: "secondary",
        icon: "open-outline",
        iconRight: true,
        onPress: () => openWeb(webCampaignReportUrl(campaign.id)),
        testID: "campaign-view-report",
      };
    } else if (action && destructive) {
      barAction = {
        title: "Suspend sending",
        variant: "destructive",
        icon: "pause-outline",
        onPress: () => setConfirmOpen(true),
        testID: "campaign-status-action",
      };
    } else if (action) {
      barAction = {
        title: "Resume sending",
        variant: "primary",
        icon: "play-outline",
        onPress: () => setConfirmOpen(true),
        testID: "campaign-status-action",
      };
    } else if (isDraft && draftReady) {
      barAction = {
        title: "Schedule or send now",
        variant: "primary",
        icon: "calendar-outline",
        onPress: () => toast.show("Coming next", "info"),
        testID: "campaign-schedule-button",
      };
    } else if (isDraft) {
      barAction = {
        title: "Continue on Brevo web",
        variant: "primary",
        icon: "open-outline",
        iconRight: true,
        onPress: () => openWeb(webCampaignEditUrl(campaign.id)),
        testID: "campaign-continue-web",
      };
    }
  }

  const backLink = (
    <Pressable onPress={goBack} hitSlop={12} style={styles.backLink} testID="header-back-button">
      <Ionicons name="chevron-back" size={22} color={colors.accent} />
      <Text style={styles.backText}>Campaigns</Text>
    </Pressable>
  );

  const renderDraft = (c: Campaign) => (
    <>
      {draftReady ? (
        <Banner
          tone="success"
          text="Ready to send. All required steps are complete."
          linkLabel="Edit on Brevo web"
          onLink={() => openWeb(webCampaignEditUrl(c.id))}
          testID="campaign-ready"
        />
      ) : (
        <Banner
          tone="info"
          text={
            unsupportedRecipients
              ? "This campaign includes individually added contacts. Schedule it on Brevo web."
              : "Complete all required steps on Brevo web to send this campaign."
          }
          testID="campaign-not-ready"
        />
      )}
      <Text style={styles.section}>{draftReady ? "Checklist" : "Required steps"}</Text>
      <View style={styles.listCard} testID="campaign-checklist">
        {STEPS.map((s, i) => {
          const todo = missing.includes(s.key);
          return (
            <View key={s.key} style={[styles.stepRow, i > 0 && styles.rowDivider]} testID={`step-${s.key}`}>
              <Ionicons
                name={todo ? "ellipse-outline" : "checkmark-circle-outline"}
                size={24}
                color={todo ? colors.warningText : colors.accent}
              />
              <View style={styles.stepBody}>
                <Text style={styles.stepLabel}>{s.label}</Text>
                {todo ? <Text style={styles.stepHint}>{s.hint}</Text> : null}
              </View>
              {todo ? (
                <View style={styles.todoTag} testID={`step-${s.key}-todo`}>
                  <Text style={styles.todoText}>To do</Text>
                </View>
              ) : (
                <Text style={styles.addedText}>Added</Text>
              )}
            </View>
          );
        })}
      </View>
    </>
  );

  const renderResults = () => (
    <>
      {lowDelivery ? (
        <Banner
          tone="warning"
          text={`Most emails didn't arrive: only ${rateLabel(deliveryRate)} were delivered; ${nf(soft)} soft bounced${
            hard > 0 ? ` and ${nf(hard)} hard bounced` : ""
          }.`}
          linkLabel="Review your sender and list on Brevo web"
          onLink={() => openWeb(WEB_HOME_URL)}
          testID="campaign-deliverability-warning"
        />
      ) : null}
      <Text style={styles.section}>Performance</Text>
      <View style={styles.grid}>
        <CompactStat label="Delivered" value={nf(g.delivered)} sub={`${rateLabel(deliveryRate)} delivery rate`} rate={deliveryRate} barColor={colors.success} testID="kpi-delivered" />
        <CompactStat label="Opens" value={nf(g.uniqueViews)} sub={`${rateLabel(openRate)} open rate`} rate={openRate} barColor={colors.success} testID="kpi-opens" />
        <CompactStat label="Clicks" value={nf(g.uniqueClicks)} sub={`${rateLabel(clickRate)} click-through rate`} rate={clickRate} barColor={colors.success} testID="kpi-clicks" />
        <CompactStat label="Unsubscribes" value={nf(g.unsubscriptions)} sub={`${rateLabel(unsubRate)} unsubscribe rate`} rate={unsubRate} barColor={colors.negativePress} testID="kpi-unsubscribes" />
        {hasConversions ? (
          <CompactStat label="Conversions" value={nf(convRaw)} sub={`${rateLabel(convRate)} conversion rate`} rate={convRate} barColor={colors.success} testID="kpi-conversions" />
        ) : null}
        <View style={[styles.stat, styles.statFull]} testID="kpi-bounces">
          <View style={styles.bounceHead}>
            <Text style={styles.statLabel}>Bounces</Text>
            <Text style={styles.bounceTotal}>{nf(soft + hard)}</Text>
          </View>
          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: colors.warningBg }]}>
              <Text style={[styles.pillText, { color: colors.warningText }]}>{`Soft ${nf(soft)}`}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.pillText, { color: colors.onSurfaceSecondary }]}>{`Hard ${nf(hard)}`}</Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );

  const renderNotSent = (c: Campaign) => (
    <>
      <Text style={styles.section}>Performance</Text>
      <View style={styles.dashedCard} testID="campaign-no-results">
        <View style={styles.dashedIcon}>
          <Ionicons name="pulse-outline" size={20} color={colors.onSurfaceSecondary} />
        </View>
        <Text style={styles.dashedTitle}>No results yet</Text>
        <Text style={styles.dashedSub}>Stats appear once the first emails are delivered.</Text>
      </View>
      <Text style={styles.section}>Details</Text>
      <View style={styles.listCard} testID="campaign-details">
        <DetailRow label="Sender" value={c.sender?.name || c.sender?.email || "—"} />
        {c.scheduledAt ? <DetailRow label="Scheduled for" value={fmtDateTime(c.scheduledAt)} divider /> : null}
        <DetailRow label="Campaign ID" value={`#${c.id}`} divider />
      </View>
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      {loading ? (
        <>
          <View style={styles.hPad}>{backLink}</View>
          <Loader />
        </>
      ) : error ? (
        <>
          <View style={styles.hPad}>{backLink}</View>
          <StateView
            icon="cloud-offline-outline"
            title="Couldn't load campaign"
            message={error}
            actionLabel="Retry"
            onAction={load}
            testID="campaign-detail-error"
          />
        </>
      ) : !campaign ? (
        <>
          <View style={styles.hPad}>{backLink}</View>
          <StateView
            icon="mail-outline"
            title="Campaign not found"
            message="This campaign is no longer available."
            testID="campaign-detail-empty"
          />
        </>
      ) : (
        <>
          <ScrollView
            testID="campaign-detail-scroll"
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: barAction ? spacing.xl : insets.bottom + spacing.xl,
            }}
            showsVerticalScrollIndicator={false}
          >
            {backLink}
            <Text style={styles.name} testID="campaign-title">
              {campaign.name}
            </Text>
            <Text style={styles.meta}>
              {[campaign.sender?.name || campaign.sender?.email, `#${campaign.id}`].filter(Boolean).join(" · ")}
            </Text>
            <View style={styles.statusRow}>
              <StatusBadge status={campaign.status} />
              {dateText ? <Text style={styles.dateText}>{dateText}</Text> : null}
            </View>

            {isSuspended ? (
              <Banner
                tone="info"
                text={`Sending is paused.${
                  campaign.scheduledAt ? ` Scheduled for ${fmtDateTime(campaign.scheduledAt)}.` : ""
                } Nothing goes out until you resume.`}
                testID="campaign-paused"
              />
            ) : null}

            {isDraft ? renderDraft(campaign) : hasResults ? renderResults() : renderNotSent(campaign)}
          </ScrollView>

          {barAction ? (
            <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]} testID="campaign-bottom-bar">
              <Button
                fullWidth
                title={barAction.title}
                variant={barAction.variant}
                icon={barAction.icon}
                iconRight={barAction.iconRight}
                onPress={barAction.onPress}
                loading={barAction.testID === "campaign-status-action" && busy}
                testID={barAction.testID}
              />
            </View>
          ) : null}
        </>
      )}

      {/* Schedule sheet (drafts) */}
      <Modal visible={scheduleOpen} transparent animationType="slide" onRequestClose={() => setScheduleOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setScheduleOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Schedule</Text>
              <Pressable onPress={() => setScheduleOpen(false)} hitSlop={12} testID="schedule-close">
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 440 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetQuestion}>When would you like to send the campaign?</Text>

              <Pressable style={styles.radioRow} onPress={() => setSendMode("now")} testID="schedule-mode-now">
                <Ionicons
                  name={sendMode === "now" ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={sendMode === "now" ? colors.brandPrimary : colors.onSurfaceTertiary}
                />
                <Text style={styles.radioLabel}>Send now</Text>
              </Pressable>

              <Pressable style={styles.radioRow} onPress={() => setSendMode("later")} testID="schedule-mode-later">
                <Ionicons
                  name={sendMode === "later" ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={sendMode === "later" ? colors.brandPrimary : colors.onSurfaceTertiary}
                />
                <Text style={styles.radioLabel}>Schedule for later</Text>
              </Pressable>

              {sendMode === "later" ? (
                <View style={styles.laterWrap}>
                  <Text style={styles.fieldLabel}>Date</Text>
                  <Pressable
                    style={styles.select}
                    onPress={() => setOpenPicker(openPicker === "date" ? null : "date")}
                    testID="schedule-date"
                  >
                    <Text style={styles.selectText}>{dayLabel(scheduledDate)}</Text>
                    <Ionicons name="chevron-down" size={18} color={colors.onSurface} />
                  </Pressable>
                  {openPicker === "date" ? (
                    <ScrollView style={styles.pickerList} nestedScrollEnabled>
                      {dateOptions.map((o) => (
                        <Pressable
                          key={o.offset}
                          style={styles.pickerItem}
                          onPress={() => {
                            setDayOffset(o.offset);
                            setOpenPicker(null);
                          }}
                        >
                          <Text style={styles.pickerItemText}>{o.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}

                  <Text style={styles.fieldLabel}>Time</Text>
                  <View style={styles.timeRow}>
                    <Pressable
                      style={[styles.select, styles.timeSelect]}
                      onPress={() => setOpenPicker(openPicker === "hour" ? null : "hour")}
                      testID="schedule-hour"
                    >
                      <Text style={styles.selectText}>{pad(hour)}</Text>
                      <Ionicons name="chevron-down" size={18} color={colors.onSurface} />
                    </Pressable>
                    <Pressable
                      style={[styles.select, styles.timeSelect]}
                      onPress={() => setOpenPicker(openPicker === "minute" ? null : "minute")}
                      testID="schedule-minute"
                    >
                      <Text style={styles.selectText}>{pad(minute)}</Text>
                      <Ionicons name="chevron-down" size={18} color={colors.onSurface} />
                    </Pressable>
                  </View>
                  {openPicker === "hour" ? (
                    <ScrollView style={styles.pickerList} nestedScrollEnabled>
                      {[...Array(24)].map((_, h) => (
                        <Pressable
                          key={h}
                          style={styles.pickerItem}
                          onPress={() => {
                            setHour(h);
                            setOpenPicker(null);
                          }}
                        >
                          <Text style={styles.pickerItemText}>{pad(h)}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                  {openPicker === "minute" ? (
                    <ScrollView style={styles.pickerList} nestedScrollEnabled>
                      {[...Array(12)].map((_, i) => (
                        <Pressable
                          key={i}
                          style={styles.pickerItem}
                          onPress={() => {
                            setMinute(i * 5);
                            setOpenPicker(null);
                          }}
                        >
                          <Text style={styles.pickerItemText}>{pad(i * 5)}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}

                  <Text style={styles.tzText}>{tzLabel()}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Button
                testID="schedule-submit"
                variant="primary"
                title={sendMode === "now" ? "Send now" : "Schedule"}
                onPress={() => {
                  setSheetError(null);
                  setOpenPicker(null);
                  // iOS can't show two sibling Modals at once — close the sheet
                  // first, keeping the chosen date/time, then open the confirm.
                  setScheduleOpen(false);
                  setConfirmMode(sendMode === "now" ? "now" : "later");
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Send/schedule confirmation */}
      <ConfirmDialog
        visible={confirmMode !== null}
        icon={confirmMode === "now" ? "send-outline" : "calendar-outline"}
        title={confirmMode === "now" ? "Send this campaign now?" : "Schedule this campaign?"}
        body={
          confirmMode === "now"
            ? `It will go to ${recipientLine}. This can't be undone.`
            : `It will go to ${recipientLine} on ${whenText}.`
        }
        confirmLabel={confirmMode === "now" ? "Send campaign" : "Schedule campaign"}
        cancelLabel="Keep as draft"
        busy={sending}
        errorText={sheetError || undefined}
        onConfirm={runSend}
        onCancel={() => {
          if (sending) return;
          setConfirmMode(null);
          setSheetError(null);
        }}
        testID="campaign-send-confirm"
      />

      {/* Suspend / resume confirmation */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="campaign-confirm-modal">
            <Text style={styles.modalTitle}>{action?.question}</Text>
            <Text style={styles.modalBody}>{action?.body}</Text>
            <View style={styles.modalActions}>
              <View style={styles.modalBtnWrap}>
                <Button
                  variant="secondary"
                  title={action?.cancel || "Cancel"}
                  fullWidth
                  onPress={() => setConfirmOpen(false)}
                  disabled={busy}
                  testID="campaign-confirm-cancel"
                />
              </View>
              <View style={styles.modalBtnWrap}>
                <Button
                  variant={destructive ? "destructive" : "primary"}
                  title={action?.confirm || "Confirm"}
                  fullWidth
                  loading={busy}
                  onPress={applyStatus}
                  testID="campaign-confirm-confirm"
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const BANNER_TONES = {
  info: { bg: colors.infoBg, icon: "information-circle" as const, color: colors.accent },
  success: { bg: colors.successBg, icon: "checkmark-circle" as const, color: colors.success },
  warning: { bg: colors.warningBg, icon: "warning" as const, color: colors.warning },
};

function Banner({
  tone,
  text,
  linkLabel,
  onLink,
  testID,
}: {
  tone: keyof typeof BANNER_TONES;
  text: string;
  linkLabel?: string;
  onLink?: () => void;
  testID?: string;
}) {
  const t = BANNER_TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} testID={testID}>
      <Ionicons name={t.icon} size={18} color={t.color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerText}>{text}</Text>
        {linkLabel && onLink ? (
          <Pressable onPress={onLink} hitSlop={8} testID={testID ? `${testID}-link` : undefined}>
            <Text style={styles.bannerLink}>{linkLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function DetailRow({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View style={[styles.detailRow, divider && styles.rowDivider]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function CompactStat({
  label,
  value,
  sub,
  testID,
  rate,
  barColor,
}: {
  label: string;
  value: string;
  sub: string;
  testID?: string;
  rate: number;
  barColor: string;
}) {
  // Fill width: 0% -> none; non-zero under 1% -> 2px sliver; else the %.
  const fillStyle =
    rate <= 0 ? null : rate < 1 ? { width: 2 as const } : { width: `${Math.min(rate, 100)}%` as const };
  return (
    <View style={styles.stat} testID={testID} accessibilityLabel={`${label} ${value}, ${sub}`}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statSub} numberOfLines={1}>
        {sub}
      </Text>
      <View style={styles.barTrack}>
        {fillStyle ? <View style={[styles.barFill, { backgroundColor: barColor }, fillStyle]} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hPad: { paddingHorizontal: spacing.lg },
  backLink: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minHeight: 44, marginLeft: -6 },
  backText: { fontSize: font.lg, color: colors.accent, fontFamily: fonts.medium },
  name: { fontSize: font.xxl + 4, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.5, marginTop: spacing.xs },
  meta: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  statusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  dateText: { fontSize: font.base, color: colors.onSurfaceSecondary },

  banner: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  bannerText: { fontSize: font.base, color: colors.onSurface, lineHeight: 21 },
  bannerLink: {
    fontSize: font.base,
    color: colors.onSurface,
    textDecorationLine: "underline",
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
  },

  section: {
    fontSize: font.lg + 2,
    fontFamily: fonts.bold,
    color: colors.onSurface,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },

  // Bordered list card (checklist, details)
  listCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 56 },
  stepBody: { flex: 1 },
  stepLabel: { fontSize: font.lg, color: colors.onSurface, fontFamily: fonts.medium },
  stepHint: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  todoTag: { backgroundColor: colors.warningBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  todoText: { fontSize: font.sm, color: colors.warningText, fontFamily: fonts.semibold },
  addedText: { fontSize: font.base, color: colors.onSurfaceSecondary },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  detailLabel: { fontSize: font.base, color: colors.onSurfaceSecondary },
  detailValue: { flexShrink: 1, fontSize: font.base, color: colors.onSurface, textAlign: "right" },

  // Dashed "no results" card
  dashedCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  dashedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  dashedTitle: { fontSize: font.lg, fontFamily: fonts.bold, color: colors.onSurface },
  dashedSub: { fontSize: font.sm + 1, color: colors.onSurfaceSecondary, marginTop: spacing.xs, textAlign: "center" },

  // Sticky bottom action bar
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  // Schedule sheet
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: font.xl, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.3 },
  sheetQuestion: { fontSize: font.lg, fontFamily: fonts.semibold, color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.sm },
  radioRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  radioLabel: { fontSize: font.lg, color: colors.onSurface },
  laterWrap: { paddingLeft: 28, paddingTop: spacing.xs },
  fieldLabel: { fontSize: font.base, fontFamily: fonts.semibold, color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.xs },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    backgroundColor: colors.surface,
  },
  selectText: { fontSize: font.lg, color: colors.onSurface },
  timeRow: { flexDirection: "row", gap: spacing.md },
  timeSelect: { flex: 1 },
  pickerList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
  },
  pickerItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pickerItemText: { fontSize: font.lg, color: colors.onSurface },
  tzText: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: spacing.sm },
  sheetFooter: { marginTop: spacing.lg },

  // Compact 2-column stat grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stat: {
    width: "47.8%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  statFull: { width: "100%" },
  statLabel: { fontSize: font.base, color: colors.onSurfaceSecondary },
  statValue: { fontSize: font.xxl + 4, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.5, marginTop: spacing.xs },
  statSub: { fontSize: font.sm + 1, color: colors.onSurfaceSecondary, marginTop: 2 },
  bounceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bounceTotal: { fontSize: font.xxl + 4, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.5 },
  pillRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: font.sm + 1, fontFamily: fonts.semibold },

  // Rate bar
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSecondary,
    marginTop: spacing.sm,
    width: "100%",
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3 },

  // Confirmation modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  modalTitle: { fontSize: font.xl, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.3 },
  modalBody: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.sm, lineHeight: 20 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  modalBtnWrap: { flex: 1 },
});
