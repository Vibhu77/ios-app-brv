import React, { useState } from "react";
import { StyleSheet, Text, View, TextInput, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import Constants from "expo-constants";
import { colors, spacing, radius, font } from "@/src/theme";
import { PrimaryButton } from "@/src/components/common";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";

const HERO =
  "https://images.unsplash.com/photo-1497215842964-222b430dc094?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwb2ZmaWNlJTIwd29ya3NwYWNlJTIwY2xlYW58ZW58MHx8fHwxNzgxOTE4MjYwfDA&ixlib=rb-4.1.0&q=85";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { apiKey, account, isConnected, saveKey, clearKey } = useBrevo();
  const toast = useToast();
  const [value, setValue] = useState(apiKey);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!value.trim()) {
      toast.show("Enter your Brevo API key", "error");
      return;
    }
    setSaving(true);
    const res = await saveKey(value);
    setSaving(false);
    if (res.ok) {
      toast.show("Connected to Brevo", "success");
    } else {
      toast.show(res.error || "Invalid API key", "error");
    }
  };

  const onDisconnect = async () => {
    await clearKey();
    setValue("");
    toast.show("Disconnected", "info");
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        bottomOffset={90}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          <LinearGradient
            colors={["transparent", "rgba(26,26,26,0.85)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.lg }]}>
            <Text style={styles.heroKicker}>BREVO CRM & ANALYTICS</Text>
            <Text style={styles.heroTitle}>Settings</Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Status banner */}
          <View
            style={[
              styles.banner,
              { backgroundColor: isConnected ? "#E6F0EC" : colors.surfaceSecondary },
            ]}
            testID="settings-status-banner"
          >
            <Ionicons
              name={isConnected ? "checkmark-circle" : "alert-circle-outline"}
              size={20}
              color={isConnected ? colors.success : colors.onSurfaceSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, isConnected && { color: colors.success }]}>
                {isConnected ? "Connected" : "Not connected"}
              </Text>
              {isConnected ? (
                <Text style={styles.bannerSub} numberOfLines={1}>
                  {account?.companyName || account?.email || "Account linked"}
                </Text>
              ) : (
                <Text style={styles.bannerSub}>Add your API key below to connect.</Text>
              )}
            </View>
          </View>

          <Text style={styles.label}>Brevo API Key</Text>
          <View style={styles.inputWrap}>
            <TextInput
              testID="api-key-input"
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder="xkeysib-..."
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              multiline={false}
            />
            <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} testID="toggle-key-visibility">
              <Ionicons
                name={show ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.onSurfaceTertiary}
              />
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Find it in Brevo: Settings → SMTP & API → API Keys. Stored securely on this device only.
          </Text>

          {isConnected ? (
            <View style={{ marginTop: spacing.lg }}>
              <PrimaryButton
                title="Disconnect"
                variant="danger"
                icon="log-out-outline"
                onPress={onDisconnect}
                testID="disconnect-button"
              />
            </View>
          ) : null}

          <Text style={styles.version}>
            Version {Constants.expoConfig?.version || "1.0.0"}
          </Text>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 76 }]}>
          <PrimaryButton
            title={isConnected ? "Update Key" : "Save Key"}
            icon="key-outline"
            onPress={onSave}
            loading={saving}
            testID="save-key-button"
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 200, backgroundColor: colors.surfaceInverse, justifyContent: "flex-end" },
  heroContent: { padding: spacing.lg },
  heroKicker: { color: "rgba(255,255,255,0.8)", fontSize: font.sm, fontWeight: "700", letterSpacing: 1 },
  heroTitle: { color: "#FFF", fontSize: font.display, fontWeight: "800", marginTop: spacing.xs },
  body: { padding: spacing.lg },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.xl,
  },
  bannerTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  bannerSub: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  label: { fontSize: font.base, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontSize: font.lg, color: colors.onSurface },
  hint: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 18 },
  version: { fontSize: font.sm, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.xxl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
