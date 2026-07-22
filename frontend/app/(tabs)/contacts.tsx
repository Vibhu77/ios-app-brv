import React, { useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
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

  const headerTop = insets.top + 108;

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
      {/* Sticky glass header with search */}
      <BlurView
        intensity={Platform.OS === "ios" ? 60 : 90}
        tint="light"
        style={[styles.header, { paddingTop: insets.top }]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Contacts</Text>
          <Text style={styles.count}>{contacts.length}</Text>
        </View>
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
        <View style={styles.hairline} />
      </BlurView>

      {!isConnected ? (
        <View style={[styles.fill, { paddingTop: insets.top + 52 }]}>
          <StateView
            icon="key-outline"
            title="Connect your Brevo account"
            message="Add your Brevo API key in Settings to browse contacts."
            actionLabel="Go to Settings"
            onAction={() => router.push("/settings")}
            testID="contacts-not-connected"
          />
        </View>
      ) : loading ? (
        <View style={{ paddingTop: headerTop, paddingHorizontal: spacing.lg }}>
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
        <View style={[styles.fill, { paddingTop: insets.top + 52 }]}>
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
        <FlatList
          testID="contacts-list"
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xxl }}>
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
            paddingTop: headerTop,
            paddingBottom: tabBarHeight + spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        />
      )}

      {/* FAB */}
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
  fill: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.72)",
    paddingHorizontal: spacing.lg,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  title: { fontSize: font.display, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  count: { fontSize: font.base, fontWeight: "700", color: colors.onSurfaceTertiary, paddingBottom: 4 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: font.base, color: colors.onSurface, paddingVertical: 0 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: -spacing.lg },
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
