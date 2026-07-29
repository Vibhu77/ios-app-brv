import React, { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, font, fonts, radius, chartColors } from "@/src/theme";
import { PrimaryButton, IconChip } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";

const BREVO_LOGO = require("@/assets/brevo-logo-white.png");

const FEATURES = [
  { icon: "bar-chart-outline", text: "Track every campaign's performance" },
  { icon: "people-outline", text: "Browse and manage your contacts" },
  { icon: "shield-checkmark-outline", text: "Secure sign in — no API key to copy" },
] as const;

// Decorative sample bars for the floating stat card (heights are illustrative).
const BARS = [0.45, 0.7, 0.55, 0.9, 0.65];

function ProductPreview() {
  return (
    <View style={styles.preview} pointerEvents="none">
      {/* Primary floating stat card */}
      <View style={[styles.statCard, styles.statCardTransform]}>
        <View style={styles.barsRow}>
          {BARS.map((h, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                { height: 44 * h, backgroundColor: chartColors[i % chartColors.length] },
              ]}
            />
          ))}
        </View>
        <Text style={styles.statLabel}>Open rate</Text>
        <Text style={styles.statValue}>42%</Text>
      </View>

      {/* Overlapping contacts chip card */}
      <View style={[styles.contactsCard, styles.contactsCardTransform]}>
        <IconChip icon="people" size={34} />
        <View>
          <Text style={styles.contactsValue}>5,200</Text>
          <Text style={styles.contactsLabel}>contacts</Text>
        </View>
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { login, isConnected } = useBrevo();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Once a session exists (inline success OR captured via the deep-link
  // listener after openAuthSessionAsync dismisses in Expo Go), leave login.
  if (isConnected) return <Redirect href="/campaigns" />;

  const onLogin = async () => {
    setBusy(true);
    const res = await login();
    setBusy(false);
    if (!res.ok && res.error && res.error !== "Sign in cancelled") {
      toast.show(res.error, "error");
    }
    // On success, the root gate redirects to the app automatically.
  };

  const heroHeight = Math.round(height * 0.52);

  return (
    <View style={styles.container} testID="login-screen">
      <LinearGradient
        colors={[colors.heroGradientFrom, colors.heroGradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { height: heroHeight }]}
      >
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.lg }]}>
          <Image source={BREVO_LOGO} style={styles.logo} contentFit="contain" />

          <ProductPreview />

          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>CRM & ANALYTICS</Text>
            <Text style={styles.title}>Your campaigns and{"\n"}contacts, on the go.</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.text} style={styles.feature}>
              <IconChip icon={f.icon as any} size={40} />
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <PrimaryButton
          title="Sign in with Brevo"
          icon="log-in-outline"
          onPress={onLogin}
          loading={busy}
          testID="login-brevo-button"
        />
        <Text style={styles.legal}>
          Sign in securely with Brevo — we never see your password.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: {
    justifyContent: "flex-end",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  heroContent: { padding: spacing.xl, flex: 1 },
  logo: { width: 108, height: 32 },

  // Decorative floating product preview (mid-hero).
  preview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.md,
  },
  statCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: 168,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  statCardTransform: { transform: [{ rotate: "-4deg" }, { translateX: -18 }] },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    height: 44,
    marginBottom: spacing.md,
  },
  bar: { flex: 1, borderRadius: 3 },
  statLabel: { fontSize: font.sm, color: colors.onSurfaceSecondary, fontFamily: fonts.semibold },
  statValue: {
    fontSize: 30,
    color: colors.onSurface,
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  contactsCard: {
    position: "absolute",
    right: 24,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 7,
  },
  contactsCardTransform: { transform: [{ rotate: "5deg" }] },
  contactsValue: {
    fontSize: font.lg,
    color: colors.onSurface,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  contactsLabel: { fontSize: font.sm, color: colors.onSurfaceSecondary, fontFamily: fonts.medium },

  heroCopy: {},
  kicker: {
    color: "rgba(255,255,255,0.85)",
    fontSize: font.sm,
    fontFamily: fonts.bold,
    letterSpacing: 1.5,
  },
  title: {
    color: "#FFF",
    fontSize: 30,
    fontFamily: fonts.bold,
    marginTop: spacing.sm,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  body: { padding: spacing.xl, gap: spacing.lg },
  features: { gap: spacing.lg, marginBottom: spacing.sm },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureText: {
    fontSize: font.base,
    color: colors.onSurfaceSecondary,
    fontFamily: fonts.semibold,
    flex: 1,
  },
  legal: {
    fontSize: font.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
});
