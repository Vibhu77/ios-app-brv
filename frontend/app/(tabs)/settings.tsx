import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, RefreshControl, Linking, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import Animated, { useSharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
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
import { openWeb } from "@/src/lib/open-web";
import { diagnostics } from "@/src/lib/diagnostics";
import { fmtDate, nf } from "@/src/lib/format";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [cacheBytes, setCacheBytes] = useState(() => cache.sizeBytes());

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
    setCacheBytes(cache.sizeBytes());
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

  const onClearCache = () => {
    cache.clear();
    setCacheBytes(0);
    toast.show("Cached data cleared", "success");
  };

  const onFeedback = () => {
    const version = Constants.expoConfig?.version || "1.0.0";
    const err = diagnostics.getLastError();
    const subject = encodeURIComponent("Brevo mobile app feedback");
    const body = encodeURIComponent(
      [
        "",
        "-----",
        `App version: ${version}`,
        `Backend URL: ${diagnostics.backendUrl || "(not set)"}`,
        `Last error: ${err ? `${err.status} — ${err.message}` : "None"}`,
      ].join("\n")
    );
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  };

  const displayName =
    [account?.firstName, account?.lastName].filter(Boolean).join(" ").trim() ||
    account?.companyName ||
    account?.email ||
    "Brevo account";

  // Plan row: type + renewal date (plan is an object in /v3/account).
  const plan = account?.plan;
  const planLabel = plan?.type
    ? plan.type.charAt(0).toUpperCase() + plan.type.slice(1) + (plan.endDate ? ` · renews ${fmtDate(plan.endDate)}` : "")
    : undefined;

  // Credits tile (only rendered when planVerticals is present).
  const verticals = account?.planVerticals;
  const emailCredits = verticals?.email?.credits;
  const smsCredits = verticals?.sms?.credits;
  const showCredits = !!verticals && (emailCredits != null || smsCredits != null);

  const version = Constants.expoConfig?.version || "1.0.0";
  const build =
    (Constants.expoConfig as any)?.ios?.buildNumber ||
    (Constants.expoConfig as any)?.android?.versionCode ||
    "1";

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

        {/* ===== GROUP 1: ACCOUNT ===== */}
        <SettingsGroup title="Account" testID="settings-account">
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
              isLast={!showCredits}
              testID="account-retry-row"
            />
          ) : !account ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : (
            <>
              {/* Profile row */}
              <SettingsRow
                label={displayName}
                sublabel={[account.email, "Connected via Brevo OAuth"].filter(Boolean).join(" · ")}
                left={
                  <View>
                    <Avatar label={displayName} size={44} />
                    <View style={styles.statusDot} />
                  </View>
                }
                accessibilityLabel={`Account: ${displayName}`}
                isLast={!account.companyName && !planLabel && !showCredits}
              />
              {account.companyName ? (
                <SettingsRow label="Organization" value={account.companyName} isLast={!planLabel && !showCredits} />
              ) : null}
              {planLabel ? <SettingsRow label="Plan" value={planLabel} isLast={!showCredits} /> : null}
            </>
          )}
        </SettingsGroup>

        {/* Credits tile — the ONE stat tile allowed; hidden if planVerticals absent */}
        {showCredits ? (
          <SettingsGroup testID="settings-credits">
            <View style={styles.creditsRow}>
              <View style={styles.credit}>
                <Text style={styles.creditValue}>{nf(emailCredits)}</Text>
                <Text style={styles.creditLabel}>Email credits</Text>
              </View>
              <View style={styles.creditDivider} />
              <View style={styles.credit}>
                <Text style={styles.creditValue}>{nf(smsCredits)}</Text>
                <Text style={styles.creditLabel}>SMS credits</Text>
              </View>
            </View>
          </SettingsGroup>
        ) : null}

        {/* ===== GROUP 2: PROFILE (read-only) ===== */}
        <SettingsGroup title="Profile" testID="settings-profile">
          <SettingsRow
            label="Profile"
            sublabel="Name, email, company, address"
            chevron
            onPress={() => router.push("/settings/profile")}
            accessibilityLabel="View profile"
            isLast
            testID="profile-row"
          />
        </SettingsGroup>

        {/* ===== GROUP 3: MANAGE ON THE WEB ===== */}
        <SettingsGroup title="Manage on the web" testID="settings-web">
          <SettingsRow
            label="Account settings"
            externalLink
            onPress={() => openWeb("https://app.brevo.com/settings/advanced")}
            accessibilityLabel="Open account settings on Brevo web"
          />
          <SettingsRow
            label="Language & timezone"
            externalLink
            onPress={() => openWeb("https://app.brevo.com/settings/localization")}
            accessibilityLabel="Open language and timezone on Brevo web"
          />
          <SettingsRow
            label="Contact attributes"
            externalLink
            onPress={() => openWeb("https://app.brevo.com/contact/settings")}
            accessibilityLabel="Open contact attributes on Brevo web"
            isLast
          />
        </SettingsGroup>

        {/* ===== GROUP 4: DISPLAY ===== */}
        {/* Brevo has no date/time format API — one fixed format app-wide;
            localization settings live on Brevo web only. */}
        <SettingsGroup title="Display" testID="settings-display">
          <SettingsRow
            label="Date & time format"
            sublabel="Managed on Brevo web"
            externalLink
            onPress={() => openWeb("https://app.brevo.com/settings/localization")}
            accessibilityLabel="Edit date and time format on Brevo web"
            isLast
            testID="display-web-row"
          />
        </SettingsGroup>

        {/* ===== GROUP 5: BEHAVIOUR ===== */}
        <SettingsGroup title="Behaviour" testID="settings-behaviour">
          <SettingsRow
            label="Refresh on app focus"
            switchValue={myPrefs.refreshOnFocus}
            onSwitchChange={(v) => prefs.set("refreshOnFocus", v)}
            switchAccessibilityLabel="Refresh on app focus"
          />
          <SettingsRow
            label="Items per page"
            segment={{
              options: [25, 50],
              selected: myPrefs.pageSize,
              onSelect: (v) => prefs.set("pageSize", v),
              testIDPrefix: "page-size",
            }}
          />
          <SettingsRow
            label="Cached data"
            value={formatBytes(cacheBytes)}
            right={
              <View style={styles.rowEnd}>
                <Text style={styles.value}>{formatBytes(cacheBytes)}</Text>
                <Text onPress={onClearCache} style={styles.clearLink} testID="clear-cache-button" accessibilityRole="button">
                  Clear
                </Text>
              </View>
            }
            isLast
          />
        </SettingsGroup>

        {/* ===== GROUP 6: SECURITY ===== */}
        <SettingsGroup title="Security" testID="settings-security">
          <SettingsRow
            label="Permissions granted"
            chevron
            onPress={() => router.push("/settings/permissions")}
            accessibilityLabel="View permissions granted"
            isLast
            testID="permissions-row"
          />
        </SettingsGroup>
        <Text style={styles.footnote}>No API key is stored on this device.</Text>

        {/* ===== GROUP 7: ABOUT & SUPPORT ===== */}
        <SettingsGroup title="About & Support" testID="settings-about">
          <SettingsRow label="Version" value={`${version} (build ${build})`} />
          <SettingsRow
            label="Diagnostics"
            chevron
            onPress={() => router.push("/settings/diagnostics")}
            accessibilityLabel="View diagnostics"
            testID="diagnostics-row"
          />
          <SettingsRow
            label="Send feedback"
            chevron
            onPress={onFeedback}
            accessibilityLabel="Send feedback"
            isLast
            testID="feedback-row"
          />
        </SettingsGroup>

        {/* ===== GROUP 8: SIGN OUT ===== */}
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
  statusDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  creditsRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.lg },
  credit: { flex: 1, alignItems: "center" },
  creditValue: { fontSize: font.display, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  creditLabel: { fontSize: font.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  creditDivider: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: colors.border },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  value: { fontSize: font.base, color: colors.onSurfaceSecondary, fontVariant: ["tabular-nums"] },
  clearLink: { fontSize: font.base, fontWeight: "700", color: colors.brandPrimary },
  footnote: {
    fontSize: font.sm,
    color: colors.onSurfaceTertiary,
    marginTop: -spacing.md,
    marginBottom: spacing.xl,
    marginLeft: spacing.sm,
  },
});
