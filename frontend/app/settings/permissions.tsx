import React from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { SettingsGroup } from "@/src/components/settings";

const SCOPES: { label: string }[] = [
  { label: "Read your account and plan details" },
  { label: "Read your email campaigns" },
  { label: "Read your contacts" },
  { label: "Create and edit your contacts" },
  { label: "Read your CRM data" },
  { label: "Create and edit your CRM data" },
];

export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Permissions"
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
        <SettingsGroup title="Access granted">
          {SCOPES.map((s, i) => (
            <View key={s.label} style={[styles.row, i > 0 && styles.sep]}>
              <View style={styles.dot} />
              <Text style={styles.label}>{s.label}</Text>
            </View>
          ))}
        </SettingsGroup>

        <View style={styles.noteRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.onSurfaceSecondary} />
          <Text style={styles.note}>You can revoke access anytime from your Brevo account.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    paddingVertical: spacing.md,
  },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  label: { flex: 1, fontSize: font.base, color: colors.onSurface, lineHeight: 20 },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  note: { flex: 1, fontSize: font.sm, color: colors.onSurfaceSecondary, lineHeight: 18 },
});
