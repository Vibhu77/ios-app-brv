import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, Pressable, RefreshControl, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import Animated, { useSharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { StickyHeader, LargeTitle } from "@/src/components/ScrollHeader";
import { Avatar, StateView, Skeleton, EmptyState } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Contact } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";
import { useFocusRefetch } from "@/src/hooks/use-focus-refetch";
import { usePrefs } from "@/src/hooks/use-prefs";

function contactName(c: Contact) {
  const a = c.attributes || {};
  const full = [a.FIRSTNAME, a.LASTNAME].filter(Boolean).join(" ").trim();
  return full || a.NAME || "";
}

type ContactsCache = { list: Contact[]; total: number | null; hasMore: boolean };

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { token, isConnected } = useBrevo();
  const { pageSize } = usePrefs();
  const cached = cache.get<ContactsCache>(cacheKeys.contacts);
  const [contacts, setContacts] = useState<Contact[]>(cached?.list || []);
  const [total, setTotal] = useState<number | null>(cached?.total ?? null);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [query, setQuery] = useState("");

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Stale-while-revalidate: paint cached contacts instantly, refetch page 0 in
  // the background. Only show the skeleton when there's nothing cached.
  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await brevo.listContacts(token, 0, pageSize);
      const deleted = new Set(cache.get<(string | number)[]>(cacheKeys.contactsDeleted) || []);
      const list = (res?.contacts || []).filter((c: Contact) => !deleted.has(c.id));
      const nextTotal = res?.count ?? null;
      const more = (res?.contacts || []).length >= pageSize;
      setContacts(list);
      setTotal(nextTotal);
      setHasMore(more);
      cache.set<ContactsCache>(cacheKeys.contacts, { list, total: nextTotal, hasMore: more });
    } catch (e: any) {
      if (!cache.get<ContactsCache>(cacheKeys.contacts)) setError(e?.message || "Failed to load contacts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, pageSize]);

  // Append the next page as the user nears the bottom. Stops at end-of-data
  // (a page shorter than PAGE_SIZE). Disabled while searching to keep the
  // filtered list stable.
  const loadMore = useCallback(async () => {
    if (!token || loadingMore || !hasMore || query.trim()) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const res = await brevo.listContacts(token, contacts.length, pageSize);
      const list = res?.contacts || [];
      const more = list.length >= pageSize;
      const nextTotal = res?.count ?? total;
      const deleted = new Set(cache.get<(string | number)[]>(cacheKeys.contactsDeleted) || []);
      const merged = (() => {
        const seen = new Set(contacts.map((c) => c.id));
        return [...contacts, ...list.filter((c: Contact) => !seen.has(c.id) && !deleted.has(c.id))];
      })();
      setContacts(merged);
      setTotal(nextTotal);
      setHasMore(more);
      cache.set<ContactsCache>(cacheKeys.contacts, { list: merged, total: nextTotal, hasMore: more });
    } catch {
      // Keep the contacts already loaded (and their count) and let the user
      // retry the failed page from the list footer.
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, query, contacts, total, pageSize]);

  useFocusRefetch(load);

  // --- Search (search-as-you-type) ---
  // The public API has no fuzzy contact search, so we combine two sources:
  //  1) INSTANT (from 1 char): contains-match over contacts already loaded.
  //  2) BREVO (debounced 400ms, from 2 chars): exact lookup — full email,
  //     full phone, or exact first/last name via /brevo/contacts-search.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [brevoResults, setBrevoResults] = useState<Contact[]>([]);
  const [brevoLoading, setBrevoLoading] = useState(false);
  const [brevoError, setBrevoError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const reqIdRef = React.useRef(0);

  const deletedSet = () => new Set(cache.get<(string | number)[]>(cacheKeys.contactsDeleted) || []);

  const q = query.trim();
  const searching = q.length > 0;

  // Instant contains-match over loaded contacts (name / email / phone digits).
  const instant = React.useMemo<Contact[]>(() => {
    if (!searching) return [];
    const ql = q.toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const deleted = deletedSet();
    return contacts.filter((c) => {
      if (deleted.has(c.id)) return false;
      const a = c.attributes || {};
      const first = String(a.FIRSTNAME || "").toLowerCase();
      const last = String(a.LASTNAME || "").toLowerCase();
      const full = `${first} ${last}`.trim();
      const email = String(c.email || "").toLowerCase();
      if (first.includes(ql) || last.includes(ql) || full.includes(ql) || email.includes(ql)) return true;
      if (qDigits.length > 0) {
        const phones = [a.SMS, a.WHATSAPP, a.LANDLINE_NUMBER].map((v) => String(v || "").replace(/\D/g, ""));
        if (phones.some((p) => p && p.includes(qDigits))) return true;
      }
      return false;
    });
  }, [searching, q, contacts]);

  // Debounced Brevo lookup. A bumped request id discards responses for text
  // that has since changed. Not-found (400/404) clears results quietly; a real
  // failure keeps the loaded matches and flips brevoError (retry line shown).
  useEffect(() => {
    const digits = q.replace(/\D/g, "");
    const isEmail = q.includes("@") && EMAIL_RE.test(q);
    const isPhone = !q.includes("@") && digits.length >= 7;
    // Names hit Brevo only from 3 chars (instant local matching starts at 1).
    const isName = !q.includes("@") && digits.length < 7 && q.length >= 3;

    if (!isEmail && !isPhone && !isName) {
      setBrevoResults([]);
      setBrevoLoading(false);
      setBrevoError(false);
      return;
    }
    const myId = ++reqIdRef.current;
    setBrevoLoading(true);
    setBrevoError(false);
    const t = setTimeout(async () => {
      try {
        let results: Contact[] = [];
        if (isEmail) {
          const c = await brevo.getContact(token, q);
          results = c ? [c] : [];
        } else if (isPhone) {
          // Send the international form, keeping the "+" the user typed
          // (strip only spaces/dashes). If "+…" 404s, retry once without "+".
          const phone = q.replace(/[\s-]/g, "");
          try {
            const c = await brevo.getContact(token, phone, "phone_id");
            results = c ? [c] : [];
          } catch (e: any) {
            const st = e?.upstreamStatus || e?.status;
            if (st === 404 && phone.startsWith("+")) {
              const c = await brevo.getContact(token, phone.replace(/^\+/, ""), "phone_id");
              results = c ? [c] : [];
            } else {
              throw e;
            }
          }
        } else {
          const res = await brevo.searchContactsByName(token, q);
          results = res?.contacts || [];
        }
        if (reqIdRef.current === myId) setBrevoResults(results);
      } catch (e: any) {
        if (reqIdRef.current !== myId) return;
        const st = e?.upstreamStatus || e?.status;
        setBrevoResults([]);
        // 400/404 = genuinely no match; anything else = a failed lookup.
        setBrevoError(!(st === 404 || st === 400));
      } finally {
        if (reqIdRef.current === myId) setBrevoLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // EMAIL_RE is a stable literal; token/q/retryTick drive the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, token, retryTick]);

  // List rows: when searching, two labelled sections; otherwise plain contacts.
  // One merged, flat list: loaded matches first, then Brevo matches appended
  // at the END (deduped), so a row the user is about to tap never shifts up.
  // A single count header sits above the results; the spinner stays in that
  // header row while the Brevo lookup is still running.
  type Row =
    | { kind: "header"; label: string; loading?: boolean }
    | { kind: "contact"; contact: Contact }
    | { kind: "retry" };
  const rows = React.useMemo<Row[]>(() => {
    if (!searching) return contacts.map((c) => ({ kind: "contact", contact: c }));
    const deleted = deletedSet();
    const instantIds = new Set(instant.map((c) => c.id));
    const brevoDeduped = brevoResults.filter((c) => !instantIds.has(c.id) && !deleted.has(c.id));
    const merged = [...instant, ...brevoDeduped];
    // Empty state only when everything is done with 0 results AND no error.
    if (merged.length === 0 && !brevoLoading && !brevoError) return [];
    const out: Row[] = [];
    if (merged.length > 0 || brevoLoading) {
      const n = merged.length;
      const label = n === 0 && brevoLoading ? "Searching…" : `${n} result${n === 1 ? "" : "s"}`;
      out.push({ kind: "header", label, loading: brevoLoading });
    }
    merged.forEach((c) => out.push({ kind: "contact", contact: c }));
    // Failed Brevo lookup -> keep loaded matches + show a small retry line.
    if (brevoError && !brevoLoading) out.push({ kind: "retry" });
    return out;
  }, [searching, contacts, instant, brevoResults, brevoLoading, brevoError]);

  const searchBox = (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
      <TextInput
        testID="contacts-search-input"
        style={styles.searchInput}
        placeholder="Search by name, email or phone"
        placeholderTextColor={colors.onSurfaceTertiary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        returnKeyType="search"
      />
      {query.length > 0 ? (
        <Pressable onPress={() => setQuery("")} hitSlop={10} testID="contacts-search-clear">
          <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>
      ) : null}
    </View>
  );

  const listHeader = (
    <View style={styles.headerBlock}>
      <LargeTitle
        title="Contacts"
        right={<Text style={styles.count}>{total ?? contacts.length}</Text>}
      />
      {searchBox}
    </View>
  );

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "header") {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{item.label}</Text>
          {item.loading ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : null}
        </View>
      );
    }
    if (item.kind === "retry") {
      return (
        <Pressable
          style={styles.searchRetry}
          onPress={() => setRetryTick((n) => n + 1)}
          testID="contacts-search-retry"
        >
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={styles.footerRetryText}>Couldn&apos;t search all contacts. Tap to retry.</Text>
        </Pressable>
      );
    }
    const c = item.contact;
    const name = contactName(c);
    const a = c.attributes || {};
    const phone = a.SMS || a.WHATSAPP || a.LANDLINE_NUMBER || "";
    // First line: email, else name, else phone, else external/placeholder.
    const primary = c.email || name || String(phone) || "No email";
    // Only show the name on the second line when it isn't already the first.
    const secondary = c.email ? name : primary === name ? "" : name;
    return (
      <Pressable
        testID={`contact-row-${c.id}`}
        onPress={() => router.push(`/contact/${c.id}`)}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
      >
        <Avatar label={name || c.email || String(phone) || "?"} />
        <View style={styles.rowText}>
          <Text style={styles.rowPrimary} numberOfLines={1}>
            {primary}
          </Text>
          {secondary ? (
            <Text style={styles.rowSecondary} numberOfLines={1}>
              {secondary}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={{ flex: 1, paddingTop: insets.top, paddingHorizontal: spacing.lg }}>
          <LargeTitle title="Contacts" />
          {searchBox}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={styles.skRow}>
              <Skeleton style={{ width: 44, height: 44, borderRadius: 22 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton style={{ height: 14, width: "70%" }} />
                <Skeleton style={{ height: 12, width: "40%" }} />
              </View>
            </View>
          ))}
        </View>
      ) : error ? (
        <View style={{ flex: 1, paddingTop: insets.top, paddingHorizontal: spacing.lg }}>
          <LargeTitle title="Contacts" />
          <StateView
            icon="cloud-offline-outline"
            title="Couldn't load contacts"
            message={error}
            actionLabel="Retry"
            onAction={load}
            testID="contacts-error"
          />
        </View>
      ) : (
        <Animated.FlatList
          testID="contacts-list"
          data={rows}
          keyExtractor={(r: Row) =>
            r.kind === "header" ? `h:${r.label}` : r.kind === "retry" ? "retry" : `c:${r.contact.id}`
          }
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReached={() => {
            if (!loadMoreError) loadMore();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            searching ? null : loadMoreError ? (
              <Pressable style={styles.footerRetry} onPress={loadMore} testID="contacts-loadmore-retry">
                <Ionicons name="warning-outline" size={16} color={colors.error} />
                <Text style={styles.footerRetryText}>{"Couldn't load more contacts — Retry"}</Text>
              </Pressable>
            ) : loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            ) : null
          }
          ItemSeparatorComponent={({ leadingItem }: any) =>
            leadingItem?.kind === "contact" ? <View style={styles.separator} /> : null
          }
          ListEmptyComponent={
            searching ? (
              <EmptyState
                title="No contacts match"
                description="Brevo finds names by exact first or last name, and emails and phone numbers by the full value."
                actionLabel="Clear"
                onAction={() => setQuery("")}
                testID="contacts-empty"
              />
            ) : (
              <EmptyState
                title="No contacts yet"
                description="Add your first contact to get started."
                actionLabel="Add Contact"
                onAction={() => router.push("/contact/form")}
                testID="contacts-empty"
              />
            )
          }
          contentContainerStyle={{
            paddingTop: insets.top,
            paddingBottom: tabBarHeight + spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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

      <StickyHeader scrollY={scrollY} title="Contacts" />

      {isConnected ? (
        <Pressable
          testID="add-contact-fab"
          onPress={() => router.push("/contact/form")}
          style={({ pressed }) => [
            styles.fab,
            { bottom: tabBarHeight + spacing.md, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerBlock: { paddingHorizontal: spacing.lg },
  count: { fontSize: font.base, fontWeight: "700", color: colors.onSurfaceTertiary, paddingBottom: 6 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: font.base, color: colors.onSurface, paddingVertical: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  rowText: { flex: 1 },
  rowPrimary: { fontSize: font.lg, fontWeight: "600", color: colors.onSurface },
  rowSecondary: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: 72 },
  skRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  footer: { paddingVertical: spacing.lg, alignItems: "center" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  sectionLabel: {
    fontSize: font.sm,
    fontWeight: "700",
    color: colors.onSurfaceTertiary,
  },
  footerRetry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  footerRetryText: { fontSize: font.base, color: colors.error, fontWeight: "600" },
  searchRetry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  hintWrap: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl, alignItems: "center" },
  hint: { fontSize: font.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
    shadowOpacity: 0.2,
  },
});
