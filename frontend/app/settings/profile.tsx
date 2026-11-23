import React from "react";
import { StyleSheet, Text, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { Button } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { openWeb, WEB_ACCOUNT_URL } from "@/src/lib/open-web";
import { cache, cacheKeys } from "@/src/lib/cache";
import { Account } from "@/src/lib/brevo";

type AccountAddress = {
  street?: string;
  city?: string;
  zipCode?: string;
  country?: string;
};

// Read-only profile. Brevo's public API has no endpoint to update account
// profile, password, language or timezone — so nothing here is editable.
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { account: ctxAccount } = useBrevo();
  // Prefer the full /v3/account payload cached by the Settings screen.
  const account = cache.get<Account>(cacheKeys.account) || ctxAccount;

  const dash = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string") return v.trim() || "—";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "—";
  };

  const formatAddress = (a?: AccountAddress | null): string => {
    if (!a || typeof a !== "object") return "—";
    const parts = [a.street, a.zipCode, a.city, a.country].filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0
    );
    return parts.length ? parts.join(", ") : "—";
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/settings");
  };

  return (
    <View style={styles.container}>
      {/* Simple back navigation matching the prototype */}
      <View style={[styles.backNav, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          style={styles.backBtn}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
          hitSlop={12}
          testID="profile-back-btn"
        >
          <Ionicons name="chevron-back" size={18} color={colors.accent} />
          <Text style={styles.backLabel}>Settings</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Page heading + note */}
        <View style={styles.pageHead}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Text style={styles.pageNote} testID="profile-note">
            Your profile can only be edited on Brevo web.
          </Text>
        </View>

        {/* Fields card */}
        <View style={styles.card} testID="profile-group">
          <ProfileField label="First name" value={dash(account?.firstName)} />
          <ProfileField label="Last name" value={dash(account?.lastName)} />
          <ProfileField label="Email" value={dash(account?.email)} />
          <ProfileField label="Company" value={dash(account?.companyName)} />
          <ProfileField label="Address" value={formatAddress(account?.address as AccountAddress)} isLast />
        </View>

        {/* Edit on Brevo web */}
        <View style={styles.editWrap} testID="profile-edit-web">
          <Button
            variant="secondary"
            title="Edit on Brevo web"
            icon="open-outline"
            onPress={() => openWeb(WEB_ACCOUNT_URL)}
            fullWidth
            testID="profile-edit-web-button"
          />
        </View>
      </ScrollView>
    </View>
  );
}

// ---------- ProfileField: small muted label above a full-width wrapping value ----------
function ProfileField({ label, value, isLast = false }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View
      style={[pfStyles.row, !isLast && pfStyles.sep]}
      accessible
      accessibilityLabel={`${label}, ${value}`}
    >
      <Text style={pfStyles.label}>{label}</Text>
      <Text style={pfStyles.value}>{value}</Text>
    </View>
  );
}

const pfStyles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  // Small, muted label (e.g. "First name")
  label: {
    fontSize: font.sm,
    fontFamily: fonts.semibold,
    color: colors.onSurfaceTertiary,
    marginBottom: 3,
  },
  // Full-width value that wraps for long text (e.g. addresses)
  value: {
    fontSize: font.base,
    color: colors.onSurface,
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  backNav: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
  },
  backLabel: {
    fontSize: font.base,
    fontFamily: fonts.semibold,
    color: colors.accent,
  },
  pageHead: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  pageTitle: {
    fontSize: font.display,
    fontFamily: fonts.bold,
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  pageNote: {
    fontSize: font.base,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.xl,
  },
  editWrap: {
    paddingHorizontal: spacing.lg,
  },
});
