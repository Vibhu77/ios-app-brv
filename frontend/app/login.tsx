import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, font, fonts } from "@/src/theme";
import { PrimaryButton, IconChip } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";

const BREVO_LOGO = require("@/assets/brevo-logo-white.png");

const FEATURES = [
  { icon: "bar-chart-outline", text: "Track every campaign's performance" },
  { icon: "people-outline", text: "Browse and manage your contacts" },
  { icon: "shield-checkmark-outline", text: "Secure sign in — no API key to copy" },
] as const;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
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

  return (
    <View style={styles.container} testID="login-screen">
      <LinearGradient
        colors={[colors.heroGradientFrom, colors.heroGradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
          <Image source={BREVO_LOGO} style={styles.logo} contentFit="contain" />
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
  hero: { flex: 1, justifyContent: "flex-end" },
  heroContent: { padding: spacing.xl, justifyContent: "space-between", flex: 1 },
  logo: { width: 108, height: 32 },
  heroCopy: { marginTop: "auto" },
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
