import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { StateView, Loader, StatusBadge, Button, statusVisual } from "@/src/components/common";
import { ConfirmDialog } from "@/src/components/ConfirmDialog";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";
import { brevo, Campaign, Readiness } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";
import { useFocusRefetch } from "@/src/hooks/use-focus-refetch";
import { nf, fmtDateTime } from "@/src/lib/format";

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

// Rate 0–100 for a numerator/denominator, never NaN/Infinity.
const ratePct = (num?: number, den?: number) => {
  if (!den || !num) return 0;
  const v = (num / den) * 100;
  return isFinite(v) ? v : 0;
};
// Web-style label: "0%" when zero, otherwise 2 decimals ("2.04%").
const rateLabel = (v: number) => (v === 0 ? "0%" : `${v.toFixed(2)}%`);

const GREEN = "#0B9A6F"; // Naos positive
const RED = "#CF1A3B"; // Naos negative ink

// Normalize Brevo status: case-insensitive + underscore/camelCase tolerant.
// "in_process" | "inProcess" -> "inprocess", "Queued" -> "queued".
const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

type StatusAction = {
  target: string; // status to set
  icon: keyof typeof Ionicons.glyphMap;
  confirm: string;
  question: string;
  body: string;
  tone: "warning" | "primary";
};

// STRICT rules:
//   queued (scheduled) OR inprocess (running) -> Suspend
//   suspended -> Resume
//   everything else (draft, sent, archive, ...) -> no action
function actionFor(status?: string): StatusAction | null {
  const n = norm(status);
  if (n === "suspended") {
    return {
      target: "queued",
      icon: "play",
      confirm: "Resume",
      question: "Resume this campaign?",
      body: "The campaign will be re-queued and may resume sending.",
      tone: "primary",
    };
  }
  if (n === "queued" || n === "inprocess") {
    return {
      target: "suspended",
      icon: "pause",
      confirm: "Suspend",
      question: "Suspend this campaign?",
      body: "The campaign will stop sending until you resume it.",
      tone: "warning",
    };
  }
  return null;
}

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

  // --- Draft send/schedule ---
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

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/campaigns");
  };

  const g = campaign?.statistics?.globalStats || {};
  const action = actionFor(campaign?.status);
  const destructive = action?.target === "suspended";
  const senderText = campaign?.sender
    ? [campaign.sender.name, campaign.sender.email].filter(Boolean).join(" · ")
    : null;

  const nStatus = norm(campaign?.status);
  // Date line (web parity).
  let dateText = "—";
  if (campaign?.sentDate) dateText = `Sent ${fmtDateTime(campaign.sentDate)}`;
  else if (campaign?.scheduledAt) dateText = `Scheduled for ${fmtDateTime(campaign.scheduledAt)}`;
  else if (nStatus === "cancelled" || nStatus === "suspended")
    dateText = `Updated ${fmtDateTime(campaign?.modifiedAt)}`;
  else dateText = `Created ${fmtDateTime(campaign?.createdAt)}`;

  // Rates (0–100).
  const deliveryRate = ratePct(g.delivered, g.sent);
  const openRate = ratePct(g.uniqueViews, g.delivered);
  const clickRate = ratePct(g.uniqueClicks, g.delivered);
  const unsubRate = ratePct(g.unsubscriptions, g.delivered);
  // Conversions only if the response actually carries one.
  const convRaw = (g as any).conversions;
  const hasConversions = typeof convRaw === "number";
  const convRate = ratePct(convRaw, g.delivered);
  // Bars only for actually-sent campaigns.
  const showBars =
    (g.sent || 0) > 0 && !["draft", "queued", "inreview"].includes(nStatus);

  const isDraft = nStatus === "draft";
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

  return (
    <View style={styles.container}>
      <GlassHeader title={campaign?.name || "Campaign"} onBack={goBack} />

      {loading ? (
        <Loader />
      ) : error ? (
        <View style={{ flex: 1, paddingTop: insets.top + 52 }}>
          <StateView
            icon="cloud-offline-outline"
            title="Couldn't load campaign"
            message={error}
            actionLabel="Retry"
            onAction={load}
            testID="campaign-detail-error"
          />
        </View>
      ) : !campaign ? (
        <View style={{ flex: 1, paddingTop: insets.top + 52 }}>
          <StateView
            icon="mail-outline"
            title="Campaign not found"
            message="This campaign is no longer available."
            testID="campaign-detail-empty"
          />
        </View>
      ) : (
        <ScrollView
          testID="campaign-detail-scroll"
          contentContainerStyle={{
            paddingTop: insets.top + 64,
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header block */}
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={3}>
              {campaign.name}
            </Text>
            <StatusBadge status={campaign.status} />
          </View>
          {campaign.subject ? <Text style={styles.subject}>{campaign.subject}</Text> : null}
          <View style={styles.metaRow}>
            <Ionicons name="pricetag-outline" size={13} color={colors.onSurfaceTertiary} />
            <Text style={styles.meta}>
              {`#${campaign.id} · ${statusVisual(campaign.status).label}`}
            </Text>
          </View>
          {senderText ? (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={13} color={colors.onSurfaceTertiary} />
              <Text style={styles.meta}>{senderText}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={colors.onSurfaceTertiary} />
            <Text style={styles.meta}>{dateText}</Text>
          </View>

          {/* Draft: Schedule (ready) or an info box listing missing steps. */}
          {isDraft && readiness ? (
            readiness.ready ? (
              <View style={styles.actionWrap}>
                <Button
                  testID="campaign-schedule-button"
                  variant="primary"
                  title="Schedule"
                  icon="calendar-outline"
                  onPress={() => {
                    setSheetError(null);
                    setScheduleOpen(true);
                  }}
                />
              </View>
            ) : (
              <View style={styles.infoBox} testID="campaign-not-ready">
                <View style={styles.infoHead}>
                  <Ionicons name="information-circle" size={18} color={colors.infoText} />
                  <Text style={styles.infoText}>Complete all required steps on Brevo web to send this campaign.</Text>
                </View>
                <View style={styles.infoList}>
                  {readiness.missing.map((m) => (
                    <Text key={m} style={styles.infoItem}>
                      {"•  " + (MISSING_LABEL[m] || m)}
                    </Text>
                  ))}
                </View>
              </View>
            )
          ) : null}

          {/* Visible, labeled Suspend/Resume action (only for applicable states) */}
          {action ? (
            <View style={styles.actionWrap}>
              <Button
                testID="campaign-status-action"
                variant={destructive ? "destructive" : "primary"}
                title={action.confirm}
                icon={action.icon}
                onPress={() => setConfirmOpen(true)}
                loading={busy}
              />
            </View>
          ) : null}

          {/* KPI tiles — compact */}
          <Text style={styles.section}>Performance</Text>
          <View style={styles.grid}>
            <CompactStat
              icon="checkmark-done-outline"
              label="Delivered"
              value={nf(g.delivered)}
              sub={`${rateLabel(deliveryRate)} delivery rate`}
              rate={showBars ? deliveryRate : undefined}
              barColor={GREEN}
              testID="kpi-delivered"
            />
            <CompactStat
              icon="mail-open-outline"
              label="Opens"
              value={nf(g.uniqueViews)}
              sub={`${rateLabel(openRate)} open rate`}
              rate={showBars ? openRate : undefined}
              barColor={GREEN}
              testID="kpi-opens"
            />
            <CompactStat
              icon="link-outline"
              label="Clicks"
              value={nf(g.uniqueClicks)}
              sub={`${rateLabel(clickRate)} click-through rate`}
              rate={showBars ? clickRate : undefined}
              barColor={GREEN}
              testID="kpi-clicks"
            />
            <CompactStat
              icon="person-remove-outline"
              label="Unsubscribes"
              value={nf(g.unsubscriptions)}
              sub={`${rateLabel(unsubRate)} unsubscribe rate`}
              rate={showBars ? unsubRate : undefined}
              barColor={RED}
              testID="kpi-unsubscribes"
            />
            {hasConversions ? (
              <CompactStat
                icon="trending-up-outline"
                label="Conversions"
                value={nf(convRaw)}
                sub={`${rateLabel(convRate)} conversion rate`}
                rate={showBars ? convRate : undefined}
                barColor={GREEN}
                testID="kpi-conversions"
              />
            ) : null}
            <CompactStat
              icon="warning-outline"
              label="Bounces"
              value={nf((g.softBounces || 0) + (g.hardBounces || 0))}
              sub={`${nf(g.softBounces)} soft · ${nf(g.hardBounces)} hard`}
              testID="kpi-bounces"
              full
            />
          </View>
        </ScrollView>
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

      {/* Confirmation modal */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="campaign-confirm-modal">
            <Text style={styles.modalTitle}>{action?.question}</Text>
            <Text style={styles.modalBody}>{action?.body}</Text>
            <View style={styles.modalActions}>
              <View style={styles.modalBtnWrap}>
                <Button
                  variant="secondary"
                  title="Cancel"
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

function CompactStat({
  icon,
  label,
  value,
  sub,
  testID,
  full,
  rate,
  barColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub: string;
  testID?: string;
  full?: boolean;
  rate?: number;
  barColor?: string;
}) {
  // Fill width: 0% -> none; non-zero under 1% -> 2px sliver; else the %.
  const showBar = rate !== undefined;
  const fillStyle =
    rate === undefined || rate <= 0
      ? null
      : rate < 1
      ? { width: 2 as const }
      : { width: `${Math.min(rate, 100)}%` as const };
  return (
    <View
      style={[styles.stat, full && styles.statFull]}
      testID={testID}
      accessibilityLabel={`${label} ${value}, ${sub}`}
    >
      <View style={styles.statHead}>
        <Ionicons name={icon} size={16} color={colors.onSurfaceSecondary} />
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statSub} numberOfLines={1}>
        {sub}
      </Text>
      {showBar ? (
        <View style={styles.barTrack}>
          {fillStyle ? <View style={[styles.barFill, { backgroundColor: barColor }, fillStyle]} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  name: { flex: 1, fontSize: font.xxl, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.5 },
  subject: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  meta: { fontSize: font.sm, color: colors.onSurfaceTertiary },

  // Naos primary button — charcoal rounded rectangle (not a pill)
  actionWrap: { alignItems: "flex-start", marginTop: spacing.lg },

  // Not-ready info box
  infoBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.infoBg,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  infoHead: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: font.base, color: colors.infoText, lineHeight: 20, fontFamily: fonts.semibold },
  infoList: { marginTop: spacing.sm, paddingLeft: 26, gap: 2 },
  infoItem: { fontSize: font.base, color: colors.infoText },

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

  section: {
    fontSize: font.lg,
    fontFamily: fonts.bold,
    color: colors.onSurface,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },

  // Compact 2-column stat grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stat: {
    width: "47.8%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  statFull: { width: "100%" },
  statHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statLabel: { flex: 1, fontSize: font.sm, color: colors.onSurfaceSecondary, fontFamily: fonts.semibold },
  statValue: { fontSize: 22, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.5, marginTop: spacing.sm },
  statSub: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: 1 },

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
