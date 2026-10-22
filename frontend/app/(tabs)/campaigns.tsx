import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable, RefreshControl, TextInput, ScrollView, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import Animated, { useSharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { StickyHeader, LargeTitle } from "@/src/components/ScrollHeader";
import { StateView, Skeleton, Card, StatusBadge, EmptyState, statusVisual } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Campaign } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";
import { useFocusRefetch } from "@/src/hooks/use-focus-refetch";
import { usePrefs } from "@/src/hooks/use-prefs";
import { nf, pct2, rate01, fmtDate } from "@/src/lib/format";

const BAR_GREEN = "#0B9A6F"; // Naos positive fill

// Status filter chips. `value` is the real Brevo API status; `null` = All.
// The transient states inReview + cancelling are folded into a single "Other"
// chip (value "__other__") rather than each getting their own slot.
const OTHER = "__other__";
const OTHER_STATUSES = ["inReview", "cancelling"];
type ChipDef = { label: string; value: string | null };
const CHIP_DEFS: ChipDef[] = [
  { label: "All", value: null },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Scheduled", value: "queued" },
  { label: "Running", value: "inProcess" },
  { label: "Suspended", value: "suspended" },
  { label: "Archived", value: "archive" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Other", value: OTHER },
];

// Client-side sort options (no new API calls).
type SortKey = "newest" | "oldest" | "name" | "open";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "name", label: "Name A–Z" },
  { key: "open", label: "Highest open rate" },
];

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { token } = useBrevo();
  const { pageSize } = usePrefs();
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => cache.get<Campaign[]>(cacheKeys.campaigns) || []);
  const [loading, setLoading] = useState(!cache.get<Campaign[]>(cacheKeys.campaigns));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("newest");
  const [sortOpen, setSortOpen] = useState(false);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Stale-while-revalidate: cached data paints instantly; we always refetch in
  // the background and only show the full skeleton when there's nothing cached.
  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await brevo.listCampaigns(token, pageSize);
      const list = res?.campaigns || [];
      setCampaigns(list);
      cache.set(cacheKeys.campaigns, list);
    } catch (e: any) {
      if (!cache.get<Campaign[]>(cacheKeys.campaigns)) setError(e?.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, pageSize]);

  useFocusRefetch(load);

  // --- Account summary (from the full list, not the filtered view) ---
  const sentCampaigns = campaigns.filter((c) => (c.statistics?.globalStats?.sent || 0) > 0);
  const totalSent = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.sent || 0), 0);
  const totalDelivered = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.delivered || 0), 0);
  const totalViews = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.uniqueViews || 0), 0);
  const totalClicks = sentCampaigns.reduce((a, c) => a + (c.statistics?.globalStats?.uniqueClicks || 0), 0);

  // --- Chip counts, computed client-side from the already-fetched list ---
  // No per-status API calls: the backend returns every campaign in one payload,
  // so these counts are exact for accounts whose campaigns fit the fetch window.
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of campaigns) {
      const s = c.status || "";
      m[s] = (m[s] || 0) + 1;
    }
    return m;
  }, [campaigns]);

  const chipCount = useCallback(
    (value: string | null) => {
      if (value === null) return campaigns.length;
      if (value === OTHER) return OTHER_STATUSES.reduce((a, s) => a + (counts[s] || 0), 0);
      return counts[value] || 0;
    },
    [campaigns.length, counts]
  );

  // All is always shown; other chips appear only when they have matches.
  const chips = CHIP_DEFS.filter((c) => c.value === null || chipCount(c.value) > 0);

  // --- Visible list = status chip + search (name/subject/ID) + sort ---
  // All client-side over the already-loaded list; no new API calls. The
  // summary card above is intentionally computed from the full `campaigns`
  // list, so searching/sorting never changes its numbers.
  const visibleCampaigns = useMemo(() => {
    const rawQ = query.trim().toLowerCase();
    const isHash = rawQ.startsWith("#");
    const q = isHash ? rawQ.slice(1) : rawQ;
    const filtered = campaigns.filter((c) => {
      if (activeStatus !== null) {
        if (activeStatus === OTHER) {
          if (!OTHER_STATUSES.includes(c.status || "")) return false;
        } else if ((c.status || "") !== activeStatus) {
          return false;
        }
      }
      if (q) {
        const id = String(c.id).toLowerCase();
        if (isHash) {
          // "#25" matches ID 25 exactly, not 250.
          if (id !== q) return false;
        } else {
          const name = (c.name || "").toLowerCase();
          const subject = (c.subject || "").toLowerCase();
          if (!(name.includes(q) || subject.includes(q) || id.includes(q))) return false;
        }
      }
      return true;
    });

    const ts = (c: Campaign) => {
      const d = c.sentDate || c.createdAt;
      const t = d ? Date.parse(d) : NaN;
      return isNaN(t) ? 0 : t;
    };
    const openRate = (c: Campaign) => {
      const g = c.statistics?.globalStats;
      const del = g?.delivered || 0;
      return del > 0 ? (g?.uniqueViews || 0) / del : -1;
    };
    const sorted = [...filtered];
    switch (sort) {
      case "oldest":
        sorted.sort((a, b) => ts(a) - ts(b));
        break;
      case "name":
        sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      case "open":
        sorted.sort((a, b) => openRate(b) - openRate(a));
        break;
      default: // newest
        sorted.sort((a, b) => ts(b) - ts(a));
    }
    return sorted;
  }, [campaigns, activeStatus, query, sort]);

  const searchBox = (
    <View style={styles.controlsRow}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
        <TextInput
          testID="campaigns-search-input"
          style={styles.searchInput}
          placeholder="Search name, subject or ID"
          placeholderTextColor={colors.onSurfaceTertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10} testID="campaigns-search-clear">
            <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        style={styles.sortBtn}
        onPress={() => setSortOpen(true)}
        testID="campaigns-sort-button"
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${SORTS.find((s) => s.key === sort)?.label}`}
      >
        <Ionicons name="swap-vertical" size={18} color={colors.onSurface} />
      </Pressable>
    </View>
  );

  const chipRow = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsContent}
      style={styles.chipsRow}
    >
      {chips.map((c) => {
        const active = activeStatus === c.value;
        const dot = !active && c.value !== null && c.value !== OTHER ? statusVisual(c.value).fg : null;
        return (
          <Pressable
            key={c.value ?? "all"}
            testID={`campaign-chip-${c.value ?? "all"}`}
            onPress={() => setActiveStatus(c.value)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${c.label}, ${chipCount(c.value)}`}
          >
            {dot ? <View style={[styles.chipDot, { backgroundColor: dot }]} /> : null}
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
            <Text style={[styles.chipCount, active && styles.chipCountActive]}>{chipCount(c.value)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const summaryCard = (
    <View style={styles.summary} testID="campaigns-summary">
      <Text style={styles.summaryEyebrow}>TOTAL SENT · ALL CAMPAIGNS</Text>
      <Text style={styles.summaryFigure}>{nf(totalSent)}</Text>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryStats}>
        <SummaryStat label="Campaigns" value={nf(campaigns.length)} />
        <SummaryStat label="Avg open" value={pct2(totalViews, totalDelivered)} />
        <SummaryStat label="Avg click" value={pct2(totalClicks, totalDelivered)} />
      </View>
    </View>
  );

  const filtering = activeStatus !== null || query.trim().length > 0;
  const hideHeading = filtering && visibleCampaigns.length === 0;

  const listHeader = (
    <View>
      <LargeTitle title="Campaigns" />
      {searchBox}
      {chipRow}
      {summaryCard}
      {hideHeading ? null : <Text style={styles.sectionTitle}>Recent campaigns</Text>}
    </View>
  );

  const renderItem = ({ item }: { item: Campaign }) => {
    const g = item.statistics?.globalStats || {};
    const isSent = (g.sent || 0) > 0;
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
            <MiniStat label="Opens" value={pct2(g.uniqueViews, g.delivered)} rate={isSent ? rate01(g.uniqueViews, g.delivered) : undefined} />
            <View style={styles.miniDivider} />
            <MiniStat label="Clicks" value={pct2(g.uniqueClicks, g.delivered)} rate={isSent ? rate01(g.uniqueClicks, g.delivered) : undefined} />
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
          <LargeTitle title="Campaigns" />
          <Skeleton style={{ height: 40, borderRadius: radius.md, marginBottom: spacing.md }} />
          <Skeleton style={{ height: 118, borderRadius: radius.lg, marginBottom: spacing.md }} />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 120, borderRadius: radius.md, marginTop: spacing.md }} />
          ))}
        </View>
      ) : error ? (
        <View style={{ flex: 1, paddingTop: insets.top, paddingHorizontal: spacing.lg }}>
          <LargeTitle title="Campaigns" />
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
          data={visibleCampaigns}
          extraData={sort}
          keyExtractor={(c: Campaign) => String(c.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.lg }}>
              {filtering ? (
                <EmptyState
                  illustration="noResults"
                  title="We couldn't find what you're looking for."
                  description="Try different keyword"
                  actionLabel="Clear keyword"
                  onAction={() => {
                    setQuery("");
                    setActiveStatus(null);
                  }}
                  testID="campaigns-empty-filtered"
                />
              ) : (
                <EmptyState
                  title="No campaigns yet"
                  description="Create a campaign in Brevo to see its report here."
                  testID="campaigns-empty"
                />
              )}
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

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.sortBackdrop} onPress={() => setSortOpen(false)}>
          <Pressable style={[styles.sortSheet, { paddingBottom: insets.bottom + spacing.md }]} onPress={() => {}}>
            <Text style={styles.sortTitle}>Sort by</Text>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                style={styles.sortOption}
                onPress={() => {
                  setSort(s.key);
                  setSortOpen(false);
                }}
                testID={`sort-option-${s.key}`}
              >
                <Text style={[styles.sortOptionText, sort === s.key && styles.sortOptionActive]}>{s.label}</Text>
                {sort === s.key ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryStatValue}>{value}</Text>
      <Text style={styles.summaryStatLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value, rate }: { label: string; value: string; rate?: number }) {
  const fill =
    rate === undefined || rate <= 0 ? null : rate < 1 ? { width: 2 as const } : { width: `${Math.min(rate, 100)}%` as const };
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
      {rate !== undefined ? (
        <View style={styles.miniBarTrack}>
          {fill ? <View style={[styles.miniBarFill, fill]} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  sectionTitle: {
    fontSize: font.lg,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  // --- Search + sort ---
  controlsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: font.base, color: colors.onSurface, paddingVertical: 0 },
  sortBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sortSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sortTitle: { fontSize: font.sm, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.5, marginBottom: spacing.sm },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  sortOptionText: { fontSize: font.lg, color: colors.onSurface },
  sortOptionActive: { fontWeight: "700", color: colors.brandPrimary },
  // --- Filter chips ---
  chipsRow: { marginBottom: spacing.md, marginHorizontal: -spacing.lg },
  chipsContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: font.base, fontWeight: "600", color: colors.onSurface },
  chipTextActive: { color: colors.onBrandPrimary },
  chipCount: { fontSize: font.sm, fontWeight: "700", color: colors.onSurfaceTertiary, fontVariant: ["tabular-nums"] },
  chipCountActive: { color: colors.onBrandPrimary },
  // --- Dark summary card ---
  summary: {
    backgroundColor: colors.heroGradientFrom,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  summaryEyebrow: {
    fontSize: font.sm,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: colors.mintEyebrow,
  },
  summaryFigure: {
    fontSize: font.display,
    fontWeight: "800",
    color: colors.onSurfaceInverse,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    marginVertical: spacing.md,
  },
  summaryStats: { flexDirection: "row" },
  summaryStat: { flex: 1 },
  summaryStatValue: { fontSize: font.lg, fontWeight: "800", color: colors.onSurfaceInverse },
  summaryStatLabel: { fontSize: font.sm, color: "rgba(255,255,255,0.75)", marginTop: 2, fontWeight: "600" },
  // --- Campaign card ---
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
  miniBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSecondary,
    width: "70%",
    marginTop: 6,
    overflow: "hidden",
  },
  miniBarFill: { height: 4, borderRadius: 2, backgroundColor: BAR_GREEN },
});
