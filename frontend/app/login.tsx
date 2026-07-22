import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, font } from "@/src/theme";
import { PrimaryButton } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";

const HERO =
  "https://images.unsplash.com/photo-1497215842964-222b430dc094?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwb2ZmaWNlJTIwd29ya3NwYWNlJTIwY2xlYW58ZW58MHx8fHwxNzgxOTE4MjYwfDA&ixlib=rb-4.1.0&q=85";

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
      <View style={styles.hero}>
        <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
        <LinearGradient colors={["rgba(26,26,26,0.15)", "rgba(26,26,26,0.95)"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.logo}>
            <Ionicons name="mail-open" size={22} color={colors.onSurface} />
          </View>
          <Text style={styles.kicker}>BREVO CRM & ANALYTICS</Text>
          <Text style={styles.title}>Your campaigns and{"\n"}contacts, on the go.</Text>
        </View>
      </View>

      <View style={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.text} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={18} color={colors.onSurface} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <PrimaryButton
          title="Continue with Brevo"
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
  hero: { flex: 1, backgroundColor: colors.surfaceInverse, justifyContent: "flex-end" },
  heroContent: { padding: spacing.xl },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  kicker: { color: "rgba(255,255,255,0.8)", fontSize: font.sm, fontWeight: "700", letterSpacing: 1 },
  title: { color: "#FFF", fontSize: 30, fontWeight: "800", marginTop: spacing.sm, lineHeight: 36, letterSpacing: -0.5 },
  body: { padding: spacing.xl, gap: spacing.lg },
  features: { gap: spacing.md, marginBottom: spacing.sm },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontSize: font.base, color: colors.onSurfaceSecondary, fontWeight: "600", flex: 1 },
  legal: { fontSize: font.sm, color: colors.onSurfaceTertiary, textAlign: "center", lineHeight: 18 },
});
