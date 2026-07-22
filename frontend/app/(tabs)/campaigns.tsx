import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import Animated, { useSharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius, font } from "@/src/theme";
import { StickyHeader, LargeTitle } from "@/src/components/ScrollHeader";
import { KpiCard, StateView, Skeleton, Card, StatusBadge } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Campaign } from "@/src/lib/brevo";
import { nf, pctStr, pctVal, fmtDate } from "@/src/lib/format";

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { token, account } = useBrevo();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await brevo.listCampaigns(token);
      setCampaigns(res?.campaigns || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const subtitle = account?.companyName ? account.companyName : account?.email;

  const sentCampaigns = campaigns.filter((c) => (c.statistics?.globalStats?.sent || 0) > 0);
  const totalSent = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.sent || 0), 0);
  const totalDelivered = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.delivered || 0), 0);
  const totalViews = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.uniqueViews || 0), 0);
  const totalClicks = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.uniqueClicks || 0), 0);

  const listHeader = (
    <View>
      <LargeTitle title="Campaigns" subtitle={subtitle} />
      <View style={styles.kpiRow}>
        <KpiCard label="Total Sent" value={nf(totalSent)} testID="kpi-total-sent" />
        <KpiCard label="Campaigns" value={nf(campaigns.length)} testID="kpi-campaigns" />
      </View>
      <View style={[styles.kpiRow, { marginTop: spacing.md }]}>
        <KpiCard label="Avg Open Rate" value={pctStr(totalViews, totalDelivered)} testID="kpi-open-rate" />
        <KpiCard label="Avg Click Rate" value={pctStr(totalClicks, totalDelivered)} testID="kpi-click-rate" />
      </View>
      <Text style={styles.sectionTitle}>Recent campaigns</Text>
    </View>
  );

  const renderItem = ({ item }: { item: Campaign }) => {
    const g = item.statistics?.globalStats || {};
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
            <MiniStat label="Opens" value={pctStr(g.uniqueViews, g.delivered)} />
            <View style={styles.miniDivider} />
            <MiniStat label="Clicks" value={pctStr(g.uniqueClicks, g.delivered)} />
            <View style={styles.miniDivider} />
            <MiniStat label="Delivered" value={nf(g.delivered)} />
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={{ flex: 1, paddingTop: insets.top, paddingHorizontal: spacing.lg }}>
          <LargeTitle title="Campaigns" subtitle={subtitle} />
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
      ) : error ? (
        <View style={{ flex: 1, paddingTop: insets.top, paddingHorizontal: spacing.lg }}>
          <LargeTitle title="Campaigns" subtitle={subtitle} />
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
        <Animated.FlatList
          testID="campaigns-list"
          data={campaigns}
          keyExtractor={(c: Campaign) => String(c.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xl }}>
              <StateView
                icon="mail-outline"
                title="No campaigns yet"
                message="Create a campaign in Brevo to see its report here."
                testID="campaigns-empty"
              />
            </View>
          }
          contentContainerStyle={{
            paddingTop: insets.top,
            paddingHorizontal: spacing.lg,
            paddingBottom: tabBarHeight + spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              progressViewOffset={insets.top}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        />
      )}
      <StickyHeader scrollY={scrollY} title="Campaigns" />
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  kpiRow: { flexDirection: "row", gap: spacing.md },
  sectionTitle: {
    fontSize: font.lg,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.lg,
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
});
