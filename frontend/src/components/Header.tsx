import React from "react";
import { StyleSheet, Text, View, Pressable, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, font } from "@/src/theme";

// Sticky glass header. Sits absolutely at the top; call useHeaderHeight-equivalent
// by adding paddingTop to the scroll content = insets.top + 56 (+ large title if used).
export function GlassHeader({
  title,
  large,
  onBack,
  right,
  subtitle,
  onHeight,
}: {
  title: string;
  large?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  subtitle?: string;
  onHeight?: (h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  // For a large title with no back button / actions, don't reserve the empty
  // compact nav bar — otherwise the big title sits far below the status bar.
  const showBar = !large || !!onBack || !!right;
  return (
    <BlurView
      intensity={Platform.OS === "ios" ? 60 : 90}
      tint="light"
      style={[styles.wrap, { paddingTop: insets.top }]}
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
    >
      {showBar ? (
        <View style={styles.bar}>
          <View style={styles.side}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn} testID="header-back-button">
                <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.center}>
            {!large ? (
              <Text style={styles.compactTitle} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
          <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
        </View>
      ) : null}
      {large ? (
        <View style={[styles.largeWrap, !showBar && { paddingTop: spacing.sm }]}>
          <Text style={styles.largeTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      <View style={styles.hairline} />
    </BlurView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  bar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  side: { width: 60, justifyContent: "center" },
  center: { flex: 1, alignItems: "center" },
  backBtn: { flexDirection: "row", alignItems: "center" },
  compactTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  largeWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.xs },
  largeTitle: { fontSize: font.display, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
