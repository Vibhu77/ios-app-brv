import React from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, font } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { SettingsGroup, SettingsRow } from "@/src/components/settings";
import { useBrevo } from "@/src/context/BrevoContext";
import { openWeb } from "@/src/lib/open-web";
import { cache, cacheKeys } from "@/src/lib/cache";
import { Account } from "@/src/lib/brevo";

// Read-only profile. Brevo's public API has no endpoint to update account
// profile, password, language or timezone — so nothing here is editable.
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { account: ctxAccount } = useBrevo();
  // Prefer the full /v3/account payload cached by the Settings screen.
  const account = cache.get<Account>(cacheKeys.account) || ctxAccount;

  const dash = (v?: string) => (v && v.trim() ? v : "—");

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Profile"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/settings"))}
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 64,
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup title="Profile" testID="profile-group">
          <SettingsRow label="First name" value={dash(account?.firstName)} />
          <SettingsRow label="Last name" value={dash(account?.lastName)} />
          <SettingsRow label="Email" value={dash(account?.email)} />
          <SettingsRow label="Company" value={dash(account?.companyName)} />
          <SettingsRow label="Address" value={dash(account?.address)} isLast />
        </SettingsGroup>

        <SettingsGroup testID="profile-edit-web">
          <SettingsRow
            label="Edit on Brevo web"
            externalLink
            onPress={() => openWeb("https://app.brevo.com/profile/information")}
            accessibilityLabel="Edit profile on Brevo web, opens in browser"
            isLast
            testID="profile-edit-web-row"
          />
        </SettingsGroup>

        <Text style={styles.note}>
          Your profile can only be edited on the Brevo website.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  note: {
    fontSize: font.sm,
    color: colors.onSurfaceTertiary,
    marginLeft: spacing.sm,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
});
