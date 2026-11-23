import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import Animated, { useSharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { StickyHeader, LargeTitle } from "@/src/components/ScrollHeader";
import { Avatar } from "@/src/components/common";
import { SettingsGroup, SettingsRow } from "@/src/components/settings";
import { ConfirmDialog } from "@/src/components/ConfirmDialog";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";
import { brevo, Account } from "@/src/lib/brevo";
import { cache, cacheKeys } from "@/src/lib/cache";
import { usePrefs } from "@/src/hooks/use-prefs";
import { useFocusRefetch } from "@/src/hooks/use-focus-refetch";
import { prefs } from "@/src/lib/prefs";
import {
  openWeb,
  WEB_ACCOUNT_URL,
  WEB_LANGUAGE_TZ_URL,
  WEB_DATE_FORMAT_URL,
  WEB_ATTRIBUTES_URL,
  HELP_CENTER_URL,
} from "@/src/lib/open-web";
import { fmtDate } from "@/src/lib/format";

const WEB_ROWS = [
  { label: "Account settings", url: WEB_ACCOUNT_URL, testID: "web-account" },
  { label: "Language and time zone", url: WEB_LANGUAGE_TZ_URL, testID: "web-language" },
  { label: "Date and time format", url: WEB_DATE_FORMAT_URL, testID: "web-date-format" },
  { label: "Contact attributes", url: WEB_ATTRIBUTES_URL, testID: "web-attributes" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { token, account: cachedAccount, logout } = useBrevo();
  const toast = useToast();
  const myPrefs = usePrefs();

  const [account, setAccount] = useState<Account | null>(cachedAccount);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Full /v3/account (has plan + planVerticals). Falls back to the login-cached
  // subset. Inline retry on failure — the rest of the screen still renders.
  const loadAccount = useCallback(async () => {
    if (!token) return;
    setAccountError(null);
    try {
      const res = await brevo.getAccount(token);
      setAccount(res);
      cache.set(cacheKeys.account, res);
    } catch (e: any) {
      setAccountError(e?.message || "Failed to load account");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  // Show cached account instantly, refetch full /v3/account on focus.
  useFocusRefetch(loadAccount);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAccount();
  }, [loadAccount]);

  const onLogout = async () => {
    setBusy(true);
    await logout();
    setBusy(false);
    setConfirmOpen(false);
    toast.show("Signed out", "info");
    router.replace("/login");
  };

  const displayName =
    [account?.firstName, account?.lastName].filter(Boolean).join(" ").trim() ||
    account?.companyName ||
    account?.email ||
    "Brevo account";

  // Plan row. Prefer the real plan name from the Marketing vertical
  // ("Business plan · renews <date>"); fall back to plan.type otherwise.
  const plan = account?.plan;
  const renews = plan?.endDate ? ` · renews ${fmtDate(plan.endDate)}` : "";
  const planLabel = account?.planName
    ? `${account.planName} plan${renews}`
    : plan?.type
    ? `${plan.type.charAt(0).toUpperCase() + plan.type.slice(1)} plan${renews}`
    : undefined;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        testID="settings-scroll"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingHorizontal: spacing.lg,
          paddingBottom: tabBarHeight + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl progressViewOffset={insets.top} refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <LargeTitle title="Settings" />

        {/* ===== ACCOUNT ===== */}
        <SettingsGroup testID="settings-account">
          {accountError ? (
            <SettingsRow
              label="Couldn't load account"
              sublabel={accountError}
              right={
                <View style={styles.retryChip}>
                  <Ionicons name="refresh" size={16} color={colors.onSurface} />
                  <Text style={styles.retryText}>Retry</Text>
                </View>
              }
              onPress={() => {
                setAccountError(null);
                loadAccount();
              }}
              accessibilityLabel="Retry loading account"
              isLast
              testID="account-retry-row"
            />
          ) : !account ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : (
            <>
              <SettingsRow
                label={displayName}
                sublabel={account.email}
                left={<Avatar label={displayName} size={52} />}
                chevron
                onPress={() => router.push("/settings/profile")}
                accessibilityLabel={`Account: ${displayName}. View profile`}
                isLast={!account.companyName && !planLabel}
                testID="profile-row"
              />
              {account.companyName ? (
                <SettingsRow label="Organization" value={account.companyName} isLast={!planLabel} />
              ) : null}
              {planLabel ? <SettingsRow label="Plan" value={planLabel} isLast testID="plan-row" /> : null}
            </>
          )}
        </SettingsGroup>

        {/* ===== MANAGE ON BREVO WEB ===== */}
        <SettingsGroup title="Manage on Brevo web" testID="settings-web">
          {WEB_ROWS.map((r, i) => (
            <SettingsRow
              key={r.label}
              label={r.label}
              externalLink
              onPress={() => openWeb(r.url)}
              accessibilityLabel={`Open ${r.label.toLowerCase()} on Brevo web`}
              isLast={i === WEB_ROWS.length - 1}
              testID={r.testID}
            />
          ))}
        </SettingsGroup>

        {/* ===== APP ===== */}
        <SettingsGroup title="App" testID="settings-app">
          <SettingsRow
            label="Refresh when app opens"
            sublabel="Always show the latest results"
            switchValue={myPrefs.refreshOnFocus}
            onSwitchChange={(v) => prefs.set("refreshOnFocus", v)}
            switchAccessibilityLabel="Refresh when app opens"
            isLast
            testID="refresh-pref"
          />
        </SettingsGroup>

        {/* ===== SUPPORT ===== */}
        <SettingsGroup title="Support" testID="settings-support">
          <SettingsRow
            label="Help center"
            externalLink
            onPress={() => openWeb(HELP_CENTER_URL)}
            accessibilityLabel="Open the Brevo help center"
            isLast
            testID="help-center-row"
          />
        </SettingsGroup>

        <SettingsGroup testID="settings-signout">
          <SettingsRow
            label="Sign out"
            destructive
            onPress={() => setConfirmOpen(true)}
            accessibilityLabel="Sign out"
            isLast
            testID="signout-row"
          />
        </SettingsGroup>
      </Animated.ScrollView>

      <StickyHeader scrollY={scrollY} title="Settings" />

      <ConfirmDialog
        visible={confirmOpen}
        icon="log-out-outline"
        title="Sign out?"
        body="You'll need to sign in with Brevo again to use the app."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        destructive
        busy={busy}
        onConfirm={onLogout}
        onCancel={() => setConfirmOpen(false)}
        testID="signout-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingRow: { padding: spacing.lg, alignItems: "center" },
  retryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  retryText: { fontSize: font.sm, fontWeight: "700", color: colors.onSurface },
});
