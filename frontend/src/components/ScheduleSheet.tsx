import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { Button } from "@/src/components/common";
import { ConfirmDialog } from "@/src/components/ConfirmDialog";
import { brevo, Campaign, Readiness } from "@/src/lib/brevo";
import { nf } from "@/src/lib/format";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_AHEAD = 60;
const MIN_LEAD_MS = 5 * 60000;

const MISSING_LABEL: Record<string, string> = {
  sender: "Sender",
  recipients: "Recipients",
  subject: "Subject",
  design: "Design",
};

// Device timezone offset in minutes (east of UTC positive).
const tzOffsetMin = (d: Date = new Date()) => -d.getTimezoneOffset();
function gmtLabel(d?: Date) {
  const off = tzOffsetMin(d);
  const abs = Math.abs(off);
  return `GMT${off >= 0 ? "+" : "-"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
function zoneLabel(d?: Date) {
  let name = "";
  try {
    name = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    name = "";
  }
  return name ? `${name} ${gmtLabel(d)}` : gmtLabel(d);
}
// Local Date -> ISO 8601 with the device's offset, e.g. 2026-11-09T11:00:00+05:30.
function toOffsetISO(d: Date) {
  const off = tzOffsetMin(d);
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${off >= 0 ? "+" : "-"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
const dayLabel = (d: Date) => `${WEEKDAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
const dayFromToday = (offset: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
};

// Default pick: ~15 minutes from now, rounded up to the next 5-minute step.
function defaultPick() {
  const t = new Date(Date.now() + 15 * 60000);
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5);
  const today = dayFromToday(0);
  const day = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const offset = Math.round((day.getTime() - today.getTime()) / 86400000);
  return { offset, hour: t.getHours(), minute: t.getMinutes() };
}

const HOURS = [...Array(24)].map((_, h) => pad(h));
const MINUTES = [...Array(12)].map((_, i) => pad(i * 5));

export function ScheduleSheet({
  visible,
  campaign,
  readiness,
  token,
  onClose,
  onDone,
}: {
  visible: boolean;
  campaign: Campaign;
  readiness: Readiness | null;
  token: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"now" | "later">("now");
  const [pick, setPick] = useState(defaultPick);
  const [openWheel, setOpenWheel] = useState<"date" | "time" | null>("time");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Date labels from "today", recomputed each time the sheet opens (app may stay open past midnight).
  const [dates, setDates] = useState<string[]>([]);

  // Fresh defaults every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setDates([...Array(DAYS_AHEAD)].map((_, d) => dayLabel(dayFromToday(d))));
      setMode("now");
      setPick(defaultPick());
      setOpenWheel("time");
      setError(null);
      setConfirmOpen(false);
    }
  }, [visible]);

  const day = dayFromToday(pick.offset);
  const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), pick.hour, pick.minute, 0, 0);
  const shortWhen = `${when.getDate()} ${MONTH[when.getMonth()]}, ${pad(pick.hour)}:${pad(pick.minute)}`;
  const fullWhen = `${dayLabel(when)}, ${pad(pick.hour)}:${pad(pick.minute)} (${zoneLabel(when)})`;

  // Recipient summary for the confirmation.
  const lists = readiness?.recipients?.lists || [];
  const segments = readiness?.recipients?.segments || [];
  const names = [...lists.map((l) => l.name), ...segments.map((s) => s.name)].join(", ");
  const count = lists.reduce((a, l) => a + (l.count || 0), 0);
  const recipientLine =
    count > 0 && !segments.length
      ? `${nf(count)} ${count === 1 ? "contact" : "contacts"} in ${names}`
      : names
      ? `contacts in ${names}`
      : "your recipients";

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

  const onMain = () => {
    setError(null);
    if (mode === "later" && when.getTime() < Date.now() + MIN_LEAD_MS) {
      setError("Pick a time at least 5 minutes from now.");
      return;
    }
    setConfirmOpen(true);
  };

  const runSend = async () => {
    if (sendingRef.current) return; // synchronous guard: one request per tap burst
    if (mode === "later" && when.getTime() < Date.now() + MIN_LEAD_MS) {
      setConfirmOpen(false);
      setError("Pick a time at least 5 minutes from now.");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      if (mode === "now") await brevo.sendCampaignNow(token, campaign.id);
      else await brevo.scheduleCampaign(token, campaign.id, toOffsetISO(when));
      setConfirmOpen(false);
      onDone(mode === "now" ? "Campaign sent" : `Campaign scheduled for ${shortWhen}`);
    } catch (e: any) {
      setConfirmOpen(false);
      setError(errText(e));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const close = () => {
    if (!sending) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} testID="schedule-sheet">
          <View style={styles.grabber} />
          <View style={styles.head}>
            <Text style={styles.title}>Send campaign</Text>
            <Pressable onPress={close} hitSlop={12} testID="schedule-close" style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <Text style={styles.campName} numberOfLines={2}>
              {campaign.name}
            </Text>
            {campaign.subject ? (
              <Text style={styles.campSubject} numberOfLines={2}>
                {campaign.subject}
              </Text>
            ) : null}

            <View style={styles.segment}>
              {(["now", "later"] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.segItem, mode === m && styles.segItemActive]}
                  onPress={() => {
                    setMode(m);
                    setError(null);
                  }}
                  testID={m === "now" ? "schedule-mode-now" : "schedule-mode-later"}
                >
                  <Text style={[styles.segText, mode === m && styles.segTextActive]}>
                    {m === "now" ? "Send now" : "Schedule"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode === "later" ? (
              <>
                <View style={styles.card}>
                  <Pressable
                    style={styles.row}
                    onPress={() => setOpenWheel(openWheel === "date" ? null : "date")}
                    testID="schedule-date"
                  >
                    <Ionicons name="calendar-outline" size={20} color={colors.onSurfaceSecondary} />
                    <Text style={styles.rowLabel}>Date</Text>
                    <View style={[styles.valuePill, openWheel === "date" && styles.valuePillActive]}>
                      <Text style={[styles.rowValue, openWheel === "date" && styles.rowValueActive]}>{dayLabel(when)}</Text>
                    </View>
                  </Pressable>
                  {openWheel === "date" ? (
                    <View style={styles.wheelWrap}>
                      <Wheel
                        items={dates}
                        index={pick.offset}
                        onChange={(i) => setPick((p) => ({ ...p, offset: i }))}
                        width={220}
                        testID="wheel-date"
                      />
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.row, styles.rowDivider]}
                    onPress={() => setOpenWheel(openWheel === "time" ? null : "time")}
                    testID="schedule-time"
                  >
                    <Ionicons name="time-outline" size={20} color={colors.onSurfaceSecondary} />
                    <Text style={styles.rowLabel}>Time</Text>
                    <View style={[styles.valuePill, openWheel === "time" && styles.valuePillActive]}>
                      <Text style={[styles.rowValue, openWheel === "time" && styles.rowValueActive]}>
                        {`${pad(pick.hour)}:${pad(pick.minute)}`}
                      </Text>
                    </View>
                  </Pressable>
                  {openWheel === "time" ? (
                    <View style={styles.wheelWrap}>
                      <Wheel
                        items={HOURS}
                        index={pick.hour}
                        onChange={(i) => setPick((p) => ({ ...p, hour: i }))}
                        width={80}
                        testID="wheel-hour"
                      />
                      <Wheel
                        items={MINUTES}
                        index={pick.minute / 5}
                        onChange={(i) => setPick((p) => ({ ...p, minute: i * 5 }))}
                        width={80}
                        testID="wheel-minute"
                      />
                    </View>
                  ) : null}
                </View>
                <View style={styles.noteRow}>
                  <Ionicons name="globe-outline" size={16} color={colors.onSurfaceSecondary} />
                  <Text style={styles.note} testID="schedule-tz-note">
                    {`Times are in your phone's time zone (${zoneLabel(when)}).`}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.noteRow}>
                <Ionicons name="send-outline" size={16} color={colors.onSurfaceSecondary} />
                <Text style={styles.note}>{`Sends immediately to ${recipientLine}.`}</Text>
              </View>
            )}

          </ScrollView>

          {error ? (
            <View style={[styles.errorBox, styles.errorOuter]} testID="schedule-error">
              <Ionicons name="alert-circle" size={18} color={colors.errorText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Button
              fullWidth
              variant="primary"
              icon={mode === "now" ? "send-outline" : "calendar-outline"}
              title={mode === "now" ? "Send now" : `Schedule for ${shortWhen}`}
              onPress={onMain}
              disabled={sending}
              testID="schedule-submit"
            />
          </View>
        </View>

        {/* Rendered inside the same Modal: iOS can't stack two Modals. */}
        <ConfirmDialog
          inline
          visible={confirmOpen}
          icon={mode === "now" ? "send-outline" : "calendar-outline"}
          title={mode === "now" ? "Send this campaign now?" : "Schedule this campaign?"}
          body={
            mode === "now"
              ? `It will go to ${recipientLine}. This can't be undone.`
              : `It will go to ${recipientLine} on ${fullWhen}.`
          }
          confirmLabel={mode === "now" ? "Send campaign" : "Schedule campaign"}
          cancelLabel="Keep as draft"
          busy={sending}
          onConfirm={runSend}
          onCancel={() => {
            if (!sending) setConfirmOpen(false);
          }}
          testID="campaign-send-confirm"
        />
      </View>
    </Modal>
  );
}

// ---------- Wheel picker (snap-scrolling column, tap a row to pick it) ----------
const ITEM_H = 44;
const VISIBLE = 5;

function Wheel({
  items,
  index,
  onChange,
  width,
  testID,
}: {
  items: string[];
  index: number;
  onChange: (i: number) => void;
  width: number;
  testID?: string;
}) {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [live, setLive] = useState(index);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const clamp = (i: number) => Math.max(0, Math.min(items.length - 1, i));
  const settle = (y: number) => {
    const i = clamp(Math.round(y / ITEM_H));
    ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
    onChange(i);
  };

  return (
    <View style={{ width, height: ITEM_H * VISIBLE }} testID={testID}>
      <View pointerEvents="none" style={styles.wheelBand} />
      <ScrollView
        ref={ref}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * ITEM_H }}
        onLayout={() => ref.current?.scrollTo({ y: index * ITEM_H, animated: false })}
        contentContainerStyle={{ paddingVertical: ITEM_H * Math.floor(VISIBLE / 2) }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          setLive(clamp(Math.round(y / ITEM_H)));
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => settle(y), 150);
        }}
      >
        {items.map((label, i) => {
          const dist = Math.abs(i - live);
          return (
            <Pressable
              key={label}
              style={styles.wheelItem}
              onPress={() => {
                ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
                setLive(i);
                onChange(i);
              }}
              testID={testID ? `${testID}-${i}` : undefined}
            >
              <Text
                style={[
                  styles.wheelText,
                  dist === 0 && styles.wheelTextActive,
                  { opacity: dist === 0 ? 1 : dist === 1 ? 0.55 : 0.3 },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "92%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: { fontSize: font.xl + 2, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.3 },
  closeBtn: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  body: { paddingHorizontal: spacing.lg },
  campName: { fontSize: font.lg, fontFamily: fonts.semibold, color: colors.onSurface },
  campSubject: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },

  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md + 4,
    padding: 4,
    marginTop: spacing.lg,
  },
  segItem: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md + 2 },
  segItemActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  segText: { fontSize: font.base + 1, color: colors.onSurfaceSecondary, fontFamily: fonts.medium },
  segTextActive: { color: colors.onSurface, fontFamily: fonts.semibold },

  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { flex: 1, fontSize: font.lg, color: colors.onSurface },
  valuePill: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 6 },
  valuePillActive: { backgroundColor: colors.successBg },
  rowValue: { fontSize: font.lg, fontFamily: fonts.semibold, color: colors.onSurface },
  rowValueActive: { color: colors.successText },

  wheelWrap: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xl,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  wheelBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ITEM_H * Math.floor(VISIBLE / 2),
    height: ITEM_H,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  wheelItem: { height: ITEM_H, alignItems: "center", justifyContent: "center" },
  wheelText: { fontSize: font.xl, color: colors.onSurface },
  wheelTextActive: { fontFamily: fonts.medium },

  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.md },
  note: { flex: 1, fontSize: font.sm + 1, color: colors.onSurfaceSecondary, lineHeight: 18 },
  errorBox: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorOuter: { marginHorizontal: spacing.lg },
  errorText: { flex: 1, fontSize: font.base, color: colors.errorText, lineHeight: 20 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    marginTop: spacing.lg,
  },
});
