import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { StateView, Loader, StatusBadge, Button } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";
import { brevo, Campaign } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";
import { useFocusRefetch } from "@/src/hooks/use-focus-refetch";
import { nf, pctStr, fmtDateTime } from "@/src/lib/format";

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

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await brevo.getCampaign(token, id);
      setCampaign(res);
      cache.set(cacheKeys.campaign(id), res);
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
          {senderText ? (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={13} color={colors.onSurfaceTertiary} />
              <Text style={styles.meta}>{senderText}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={colors.onSurfaceTertiary} />
            <Text style={styles.meta}>
              {campaign.sentDate ? "Sent " : "Created "}
              {fmtDateTime(campaign.sentDate || campaign.createdAt)}
            </Text>
          </View>

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
              sub={`${pctStr(g.delivered, g.sent)} delivery`}
              testID="kpi-delivered"
            />
            <CompactStat
              icon="mail-open-outline"
              label="Opens"
              value={nf(g.uniqueViews)}
              sub={`${pctStr(g.uniqueViews, g.delivered)} open rate`}
              testID="kpi-opens"
            />
            <CompactStat
              icon="link-outline"
              label="Clicks"
              value={nf(g.uniqueClicks)}
              sub={`${pctStr(g.uniqueClicks, g.delivered)} CTR`}
              testID="kpi-clicks"
            />
            <CompactStat
              icon="person-remove-outline"
              label="Unsubscribes"
              value={nf(g.unsubscriptions)}
              sub={`${pctStr(g.unsubscriptions, g.delivered)} of sent`}
              testID="kpi-unsubscribes"
            />
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub: string;
  testID?: string;
  full?: boolean;
}) {
  return (
    <View style={[styles.stat, full && styles.statFull]} testID={testID}>
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
