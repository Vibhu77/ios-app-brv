import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { StateView, Loader, StatusBadge, KpiCard } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Campaign } from "@/src/lib/brevo";
import { nf, pctStr, fmtDateTime } from "@/src/lib/format";

export default function CampaignDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useBrevo();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
    // Close the overflow menu whenever a load finishes / errors.
    setMenuOpen(false);
  }, [loading, error]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/campaigns");
  };

  const g = campaign?.statistics?.globalStats || {};
  const isSuspended = campaign?.status === "suspended";
  const senderText = campaign?.sender
    ? [campaign.sender.name, campaign.sender.email].filter(Boolean).join(" · ")
    : null;

  return (
    <View style={styles.container}>
      <GlassHeader
        title={campaign?.name || "Campaign"}
        onBack={goBack}
        right={
          <Pressable
            testID="campaign-menu-button"
            onPress={() => setMenuOpen((o) => !o)}
            hitSlop={12}
            style={styles.menuBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.onSurface} />
          </Pressable>
        }
      />

      {/* Overflow menu overlay (UI only — actions are not wired yet). */}
      {menuOpen ? (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} testID="campaign-menu-backdrop" />
          <View style={[styles.menu, { top: insets.top + 50 }]} testID="campaign-menu">
            <Pressable disabled style={styles.menuItem} testID="campaign-suspend-item">
              <Ionicons
                name={isSuspended ? "play-outline" : "pause-outline"}
                size={18}
                color={colors.onSurfaceTertiary}
              />
              <View style={styles.menuItemText}>
                <Text style={styles.menuItemLabel}>
                  {isSuspended ? "Resume campaign" : "Suspend campaign"}
                </Text>
                <Text style={styles.menuItemHint}>Coming soon</Text>
              </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  menuBtn: { padding: spacing.xs },
  menuBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 150,
  },
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
    minWidth: 220,
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
    opacity: 0.55,
  },
  menuItemText: { flex: 1 },
  menuItemLabel: { fontSize: font.base, color: colors.onSurface, fontFamily: fonts.semibold },
  menuItemHint: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: 1 },
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
});
