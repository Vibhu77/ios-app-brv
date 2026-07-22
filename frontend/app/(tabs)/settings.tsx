import React, { useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { colors, spacing, radius, font } from "@/src/theme";
import { Avatar, PrimaryButton, Card } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";

const HERO =
  "https://images.unsplash.com/photo-1497215842964-222b430dc094?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwb2ZmaWNlJTIwd29ya3NwYWNlJTIwY2xlYW58ZW58MHx8fHwxNzgxOTE4MjYwfDA&ixlib=rb-4.1.0&q=85";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { account, logout } = useBrevo();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const displayName =
    [account?.firstName, account?.lastName].filter(Boolean).join(" ").trim() ||
    account?.companyName ||
    account?.email ||
    "Brevo account";

  const onLogout = async () => {
    setBusy(true);
    await logout();
    setBusy(false);
    toast.show("Signed out", "info");
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          <LinearGradient colors={["transparent", "rgba(26,26,26,0.85)"]} style={StyleSheet.absoluteFill} />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.lg }]}>
            <Text style={styles.heroKicker}>BREVO CRM & ANALYTICS</Text>
            <Text style={styles.heroTitle}>Settings</Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Account card */}
          <Card style={styles.accountCard}>
            <Avatar label={displayName} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName} numberOfLines={1}>
                {displayName}
              </Text>
              {account?.email ? (
                <Text style={styles.accountEmail} numberOfLines={1}>
                  {account.email}
                </Text>
              ) : null}
              <View style={styles.connectedRow}>
                <View style={styles.dot} />
                <Text style={styles.connectedText}>Connected via Brevo OAuth</Text>
              </View>
            </View>
          </Card>

          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.onSurfaceSecondary} />
            <Text style={styles.infoText}>
              You're signed in securely with Brevo. No API key is stored on this device.
            </Text>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <PrimaryButton
              title="Sign out"
              variant="danger"
              icon="log-out-outline"
              onPress={onLogout}
              loading={busy}
              testID="signout-button"
            />
          </View>

          <Text style={styles.version}>Version {Constants.expoConfig?.version || "1.0.0"}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 180, backgroundColor: colors.surfaceInverse, justifyContent: "flex-end" },
  heroContent: { padding: spacing.lg },
  heroKicker: { color: "rgba(255,255,255,0.8)", fontSize: font.sm, fontWeight: "700", letterSpacing: 1 },
  heroTitle: { color: "#FFF", fontSize: font.display, fontWeight: "800", marginTop: spacing.xs },
  body: { padding: spacing.lg },
  accountCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  accountName: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  accountEmail: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  connectedRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  connectedText: { fontSize: font.sm, color: colors.success, fontWeight: "600" },
  infoBox: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  infoText: { flex: 1, fontSize: font.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
  version: { fontSize: font.sm, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.xxl },
});
