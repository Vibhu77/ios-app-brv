import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { StateView, Loader, StatusBadge, KpiCard } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";
import { brevo, Campaign } from "@/src/lib/brevo";
import { nf, pctStr, fmtDateTime } from "@/src/lib/format";

// States from which a campaign can be paused.
const SUSPENDABLE = ["queued", "inProcess", "running", "scheduled"];

type StatusAction = {
  label: string;
  target: string; // status to set
  icon: keyof typeof Ionicons.glyphMap;
  question: string;
  confirm: string;
};

function actionFor(status?: string): StatusAction | null {
  if (status === "suspended") {
    return {
      label: "Resume campaign",
      target: "queued",
      icon: "play-outline",
      question: "Resume this campaign?",
      confirm: "Resume",
    };
  }
  if (status && SUSPENDABLE.includes(status)) {
    return {
      label: "Suspend campaign",
      target: "suspended",
      icon: "pause-outline",
      question: "Suspend this campaign?",
      confirm: "Suspend",
    };
  }
  return null; // draft / sent / archive etc — no status action
}

export default function CampaignDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useBrevo();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await brevo.getCampaign(token, id);
      setCampaign(res);
    } catch (e: any) {
      setError(e?.message || "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    setMenuOpen(false);
  }, [loading, error]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/campaigns");
  };

  const g = campaign?.statistics?.globalStats || {};
  const action = actionFor(campaign?.status);
  const senderText = campaign?.sender
    ? [campaign.sender.name, campaign.sender.email].filter(Boolean).join(" · ")
    : null;

  const applyStatus = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await brevo.updateCampaignStatus(token, id, action.target);
      setConfirmOpen(false);
      toast.show(
        action.target === "suspended" ? "Campaign suspended" : "Campaign resumed",
        "success"
      );
      await load(); // refetch so the status badge updates
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
      <GlassHeader
        title={campaign?.name || "Campaign"}
        onBack={goBack}
        right={
          action ? (
            <Pressable
              testID="campaign-menu-button"
              onPress={() => setMenuOpen((o) => !o)}
              hitSlop={12}
              style={styles.menuBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.onSurface} />
            </Pressable>
          ) : null
        }
      />

      {/* Overflow menu */}
      {menuOpen && action ? (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} testID="campaign-menu-backdrop" />
          <View style={[styles.menu, { top: insets.top + 50 }]} testID="campaign-menu">
            <Pressable
              style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
              testID="campaign-status-action"
              onPress={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
            >
              <Ionicons name={action.icon} size={18} color={colors.onSurface} />
              <Text style={styles.menuItemLabel}>{action.label}</Text>
            </Pressable>
          </View>
        </>
      ) : null}

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

          {/* KPI cards */}
          <Text style={styles.section}>Performance</Text>
          <View style={styles.kpiRow}>
            <KpiCard
              icon="checkmark-done-outline"
              label="Delivered"
              value={nf(g.delivered)}
              sub={`${pctStr(g.delivered, g.sent)} delivery rate`}
              testID="kpi-delivered"
            />
            <KpiCard
              icon="mail-open-outline"
              label="Opens"
              value={nf(g.uniqueViews)}
              sub={`${pctStr(g.uniqueViews, g.delivered)} open rate`}
              testID="kpi-opens"
            />
          </View>
          <View style={[styles.kpiRow, { marginTop: spacing.md }]}>
            <KpiCard
              icon="link-outline"
              label="Clicks"
              value={nf(g.uniqueClicks)}
              sub={`${pctStr(g.uniqueClicks, g.delivered)} click-through`}
              testID="kpi-clicks"
            />
            <KpiCard
              icon="person-remove-outline"
              label="Unsubscribes"
              value={nf(g.unsubscriptions)}
              sub={`${pctStr(g.unsubscriptions, g.delivered)} of delivered`}
              testID="kpi-unsubscribes"
            />
          </View>
          <View style={[styles.kpiRow, { marginTop: spacing.md }]}>
            <KpiCard
              icon="warning-outline"
              label="Bounces"
              value={nf((g.softBounces || 0) + (g.hardBounces || 0))}
              sub={`${nf(g.softBounces)} soft · ${nf(g.hardBounces)} hard`}
              testID="kpi-bounces"
            />
            <View style={styles.kpiSpacer} />
          </View>
        </ScrollView>
      )}

      {/* Confirmation modal */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="campaign-confirm-modal">
            <Text style={styles.modalTitle}>{action?.question}</Text>
            <Text style={styles.modalBody}>
              {action?.target === "suspended"
                ? "The campaign will stop sending until you resume it."
                : "The campaign will be re-queued and may resume sending."}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalCancel, { opacity: pressed ? 0.85 : 1 }]}
                onPress={() => setConfirmOpen(false)}
                disabled={busy}
                testID="campaign-confirm-cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalConfirm, { opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
                onPress={applyStatus}
                disabled={busy}
                testID="campaign-confirm-confirm"
              >
                {busy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.modalConfirmText}>{action?.confirm}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  menuBtn: { padding: spacing.xs },
  menuBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 150 },
  menu: {
    position: "absolute",
    right: spacing.md,
    zIndex: 200,
    elevation: 200,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    minWidth: 210,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuItemLabel: { fontSize: font.base, color: colors.onSurface, fontFamily: fonts.semibold },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  name: { flex: 1, fontSize: font.xxl, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.5 },
  subject: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  meta: { fontSize: font.sm, color: colors.onSurfaceTertiary },
  section: {
    fontSize: font.lg,
    fontFamily: fonts.bold,
    color: colors.onSurface,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  kpiRow: { flexDirection: "row", gap: spacing.md },
  kpiSpacer: { flex: 1 },
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
  modalBtn: { flex: 1, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  modalCancel: { backgroundColor: colors.surfaceSecondary },
  modalCancelText: { fontSize: font.lg, fontFamily: fonts.semibold, color: colors.onSurface },
  modalConfirm: { backgroundColor: colors.brandPrimary },
  modalConfirmText: { fontSize: font.lg, fontFamily: fonts.bold, color: colors.onBrandPrimary },
});
