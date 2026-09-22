import React, { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Clipboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { colors, spacing, radius, font } from "@/src/theme";
import { GlassHeader } from "@/src/components/Header";
import { SettingsGroup, SettingsRow } from "@/src/components/settings";
import { Button } from "@/src/components/common";
import { useToast } from "@/src/context/ToastContext";
import { diagnostics } from "@/src/lib/diagnostics";
import { fmtDateTime } from "@/src/lib/format";

function Row({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[styles.kv, !isLast && styles.kvSep]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue} numberOfLines={2} selectable>
        {value}
      </Text>
    </View>
  );
}

export default function DiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const version = Constants.expoConfig?.version || "1.0.0";
  const build =
    (Constants.expoConfig as any)?.ios?.buildNumber ||
    (Constants.expoConfig as any)?.android?.versionCode ||
    "1";
  const backendUrl = diagnostics.backendUrl || "(not set)";
  const lastSync = diagnostics.getLastSyncAt();
  const lastError = diagnostics.getLastError();

  const errorText = lastError
    ? `${lastError.status} — ${lastError.message}${lastError.requestId ? ` (sib-request-id: ${lastError.requestId})` : ""}`
    : "None";

  const payload = [
    `App version: ${version} (build ${build})`,
    `Backend URL: ${backendUrl}`,
    `Last sync: ${lastSync ? new Date(lastSync).toISOString() : "—"}`,
    `Last error: ${errorText}${lastError ? ` at ${new Date(lastError.at).toISOString()}` : ""}`,
  ].join("\n");

  const onCopy = async () => {
    Clipboard.setString(payload);
    setCopied(true);
    toast.show("Diagnostics copied", "success");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Diagnostics"
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
        <SettingsGroup title="Connection" testID="diagnostics-connection">
          <Row label="App version" value={`${version} (build ${build})`} />
          <Row label="Backend URL" value={backendUrl} />
          <Row label="Last sync" value={lastSync ? fmtDateTime(new Date(lastSync).toISOString()) : "—"} isLast />
        </SettingsGroup>

        <SettingsGroup title="Last API error" testID="diagnostics-error">
          <Row label="Status" value={lastError ? String(lastError.status) : "—"} />
          <Row label="Message" value={lastError ? lastError.message : "None"} />
          <Row label="sib-request-id" value={lastError?.requestId || "—"} isLast />
        </SettingsGroup>

        <View style={styles.copyWrap}>
          <Button
            variant="secondary"
            fullWidth
            title={copied ? "Copied" : "Copy diagnostics"}
            icon={copied ? "checkmark" : "copy-outline"}
            onPress={onCopy}
            testID="copy-diagnostics-button"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  kv: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 2 },
  kvSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  kvLabel: { fontSize: font.sm, color: colors.onSurfaceSecondary },
  kvValue: { fontSize: font.base, color: colors.onSurface, fontWeight: "500", fontVariant: ["tabular-nums"] },
  copyWrap: { marginTop: spacing.lg },
});
