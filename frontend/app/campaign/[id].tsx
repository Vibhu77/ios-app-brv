import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, spacing, radius, font } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { StatRow, StateView, Loader, Card, StatusBadge } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Campaign } from "@/src/lib/brevo";
import { nf, pctStr, pctVal, fmtDateTime } from "@/src/lib/format";

export default function CampaignDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useBrevo();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await brevo.getCampaign(apiKey, id);
      setCampaign(res);
    } catch (e: any) {
      setError(e?.message || "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const g = campaign?.statistics?.globalStats || {};
  const openRate = pctVal(g.uniqueViews, g.delivered);
  const clickRate = pctVal(g.uniqueClicks, g.delivered);
  const deliveryRate = pctVal(g.delivered, g.sent);

  return (
    <View style={styles.container}>
      <GlassHeader title={campaign?.name || "Campaign"} onBack={() => router.back()} />
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
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={3}>
              {campaign?.name}
            </Text>
            <StatusBadge status={campaign?.status} />
          </View>
          {campaign?.subject ? <Text style={styles.subject}>{campaign.subject}</Text> : null}
          <Text style={styles.date}>{fmtDateTime(campaign?.sentDate || campaign?.createdAt)}</Text>

          {/* Hero metric */}
          <View style={styles.hero} testID="campaign-hero-metric">
            <Text style={styles.heroValue}>{pctStr(g.uniqueViews, g.delivered)}</Text>
            <Text style={styles.heroLabel}>Unique open rate</Text>
            <View style={styles.heroSplit}>
              <View style={styles.heroSplitItem}>
                <Text style={styles.heroSplitValue}>{pctStr(g.uniqueClicks, g.delivered)}</Text>
                <Text style={styles.heroSplitLabel}>Click rate</Text>
              </View>
              <View style={styles.heroVDivider} />
              <View style={styles.heroSplitItem}>
                <Text style={styles.heroSplitValue}>{nf(g.sent)}</Text>
                <Text style={styles.heroSplitLabel}>Emails sent</Text>
              </View>
            </View>
          </View>

          <Text style={styles.section}>Performance</Text>
          <Card>
            <StatRow label="Delivered" value={`${nf(g.delivered)}`} pct={deliveryRate} />
            <Divider />
            <StatRow label="Unique opens" value={nf(g.uniqueViews)} pct={openRate} />
            <Divider />
            <StatRow label="Total opens" value={nf(g.viewed)} />
            <Divider />
            <StatRow label="Unique clicks" value={nf(g.uniqueClicks)} pct={clickRate} />
            <Divider />
            <StatRow label="Total clickers" value={nf(g.clickers)} />
          </Card>

          <Text style={styles.section}>Deliverability</Text>
          <Card>
            <StatRow label="Soft bounces" value={nf(g.softBounces)} color={colors.warning} />
            <Divider />
            <StatRow label="Hard bounces" value={nf(g.hardBounces)} color={colors.error} />
            <Divider />
            <StatRow label="Unsubscriptions" value={nf(g.unsubscriptions)} color={colors.warning} />
            <Divider />
            <StatRow label="Complaints" value={nf(g.complaints)} color={colors.error} />
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  name: { flex: 1, fontSize: font.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  subject: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  date: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
  hero: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.lg,
    alignItems: "center",
  },
  heroValue: { fontSize: 44, fontWeight: "800", color: colors.onSurface, letterSpacing: -1 },
  heroLabel: { fontSize: font.base, color: colors.onSurfaceSecondary, fontWeight: "600", marginTop: 2 },
  heroSplit: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg, alignSelf: "stretch" },
  heroSplitItem: { flex: 1, alignItems: "center" },
  heroSplitValue: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
  heroSplitLabel: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  heroVDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: colors.borderStrong },
  section: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
});
