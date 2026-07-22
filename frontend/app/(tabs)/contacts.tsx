import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable, RefreshControl, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import Animated, { useSharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { StickyHeader, LargeTitle } from "@/src/components/ScrollHeader";
import { Avatar, StateView, Skeleton } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { brevo, Contact } from "@/src/lib/brevo";

function contactName(c: Contact) {
  const a = c.attributes || {};
  const full = [a.FIRSTNAME, a.LASTNAME].filter(Boolean).join(" ").trim();
  return full || a.NAME || "";
}

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { token, isConnected } = useBrevo();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
      const res = await brevo.listContacts(token, 100, 0);
      setContacts(res?.contacts || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load contacts");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.email?.toLowerCase().includes(q) || contactName(c).toLowerCase().includes(q)
    );
  }, [contacts, query]);

  const searchBox = (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
      <TextInput
        testID="contacts-search-input"
        style={styles.searchInput}
        placeholder="Search email or name"
        placeholderTextColor={colors.onSurfaceTertiary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
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
        right={<Text style={styles.count}>{contacts.length}</Text>}
      />
      {searchBox}
    </View>
  );

  const renderItem = ({ item }: { item: Contact }) => {
    const name = contactName(item);
    return (
      <Pressable
        testID={`contact-row-${item.id}`}
        onPress={() => router.push(`/contact/${item.id}`)}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
      >
        <Avatar label={name || item.email} />
        <View style={styles.rowText}>
          <Text style={styles.rowPrimary} numberOfLines={1}>
            {item.email}
          </Text>
          {name ? (
            <Text style={styles.rowSecondary} numberOfLines={1}>
              {name}
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
          data={filtered}
          keyExtractor={(c: Contact) => String(c.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xl, paddingHorizontal: spacing.lg }}>
              <StateView
                icon="people-outline"
                title={query ? "No matches" : "No contacts yet"}
                message={query ? "Try a different search." : "Add your first contact to get started."}
                actionLabel={query ? undefined : "Add Contact"}
                onAction={query ? undefined : () => router.push("/contact/form")}
                testID="contacts-empty"
              />
            </View>
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
