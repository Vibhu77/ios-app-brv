import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { KpiCard, StateView, Skeleton, Card, StatusBadge } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Campaign } from "@/src/lib/brevo";
import { nf, pctStr, pctVal, fmtDate } from "@/src/lib/format";

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiKey, isConnected, account } = useBrevo();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiKey) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await brevo.listCampaigns(apiKey);
      setCampaigns(res?.campaigns || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiKey]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const headerTop = insets.top + 130;

  // Aggregate KPIs across sent campaigns
  const sentCampaigns = campaigns.filter((c) => (c.statistics?.globalStats?.sent || 0) > 0);
  const totalSent = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.sent || 0), 0);
  const totalDelivered = sentCampaigns.reduce(
    (a, c) => a + (c.statistics?.globalStats?.delivered || 0),
    0
  );
  const totalViews = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.uniqueViews || 0), 0);
  const totalClicks = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.uniqueClicks || 0), 0);

  const renderHeader = () => (
    <View style={styles.kpiGrid} testID="campaigns-kpi-grid">
      <View style={styles.kpiRow}>
        <KpiCard label="Total Sent" value={nf(totalSent)} testID="kpi-total-sent" />
        <KpiCard label="Campaigns" value={nf(campaigns.length)} testID="kpi-campaigns" />
      </View>
      <View style={styles.kpiRow}>
        <KpiCard
          label="Avg Open Rate"
          value={pctStr(totalViews, totalDelivered)}
          testID="kpi-open-rate"
        />
        <KpiCard
          label="Avg Click Rate"
          value={pctStr(totalClicks, totalDelivered)}
          testID="kpi-click-rate"
        />
      </View>
      <Text style={styles.sectionTitle}>Recent campaigns</Text>
    </View>
  );

  const renderItem = ({ item }: { item: Campaign }) => {
    const g = item.statistics?.globalStats || {};
    const openRate = pctVal(g.uniqueViews, g.delivered);
    const clickRate = pctVal(g.uniqueClicks, g.delivered);
    return (
      <Pressable
        testID={`campaign-card-${item.id}`}
        onPress={() => router.push(`/campaign/${item.id}`)}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      >
        <Card style={styles.campaignCard}>
          <View style={styles.campaignHead}>
            <Text style={styles.campaignName} numberOfLines={1}>
              {item.name}
            </Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.campaignSub} numberOfLines={1}>
            {item.subject || "No subject"}
          </Text>
          <Text style={styles.campaignDate}>{fmtDate(item.sentDate || item.createdAt)}</Text>
          <View style={styles.miniStats}>
            <MiniStat label="Opens" value={pctStr(g.uniqueViews, g.delivered)} pct={openRate} />
            <View style={styles.miniDivider} />
            <MiniStat label="Clicks" value={pctStr(g.uniqueClicks, g.delivered)} pct={clickRate} />
            <View style={styles.miniDivider} />
            <MiniStat label="Delivered" value={nf(g.delivered)} />
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Campaigns"
        large
        subtitle={account?.companyName ? account.companyName : account?.email}
      />
      {!isConnected ? (
        <View style={[styles.fill, { paddingTop: insets.top + 52 }]}>
          <StateView
            icon="key-outline"
            title="Connect your Brevo account"
            message="Add your Brevo API key in Settings to see campaign reports."
            actionLabel="Go to Settings"
            onAction={() => router.push("/settings")}
            testID="campaigns-not-connected"
          />
        </View>
      ) : loading ? (
        <CampaignsSkeleton top={headerTop} />
      ) : error ? (
        <View style={[styles.fill, { paddingTop: insets.top + 52 }]}>
          <StateView
            icon="cloud-offline-outline"
            title="Couldn't load campaigns"
            message={error}
            actionLabel="Retry"
            onAction={load}
            testID="campaigns-error"
          />
        </View>
      ) : (
        <FlatList
          testID="campaigns-list"
          data={campaigns}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xxl }}>
              <StateView
                icon="mail-outline"
                title="No campaigns yet"
                message="Create a campaign in Brevo to see its report here."
                testID="campaigns-empty"
              />
            </View>
          }
          contentContainerStyle={{
            paddingTop: headerTop,
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + 90,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

function MiniStat({ label, value, pct }: { label: string; value: string; pct?: number }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function CampaignsSkeleton({ top }: { top: number }) {
  return (
    <View style={{ paddingTop: top, paddingHorizontal: spacing.lg }}>
      <View style={styles.kpiRow}>
        <Skeleton style={{ flex: 1, height: 84, borderRadius: radius.md }} />
        <Skeleton style={{ flex: 1, height: 84, borderRadius: radius.md }} />
      </View>
      <View style={[styles.kpiRow, { marginTop: spacing.md }]}>
        <Skeleton style={{ flex: 1, height: 84, borderRadius: radius.md }} />
        <Skeleton style={{ flex: 1, height: 84, borderRadius: radius.md }} />
      </View>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} style={{ height: 120, borderRadius: radius.md, marginTop: spacing.md }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  fill: { flex: 1 },
  kpiGrid: { marginBottom: spacing.sm },
  kpiRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sectionTitle: {
    fontSize: font.lg,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  campaignCard: { marginBottom: spacing.md },
  campaignHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  campaignName: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, flex: 1 },
  campaignSub: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  campaignDate: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
  miniStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  miniStat: { flex: 1, alignItems: "center" },
  miniValue: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  miniLabel: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  miniDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  badgeText: { fontSize: font.sm, fontWeight: "700" },
});
