import React from "react";
import { StyleSheet, Text, View, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, font } from "@/src/theme";

// Standard iOS large-title pattern:
// - The large title lives INSIDE the scroll content (use <LargeTitle/> as the
//   first element) so it scrolls away naturally — no overlay, no overlap.
// - <StickyHeader/> is a compact glass bar pinned on top that fades in (on the
//   UI thread via reanimated) only once the large title has scrolled past.
// Render <StickyHeader/> as the LAST child of the screen container so it layers
// above the list. It never re-measures during scroll.

export const COMPACT_BAR = 44;
const FADE_START = 18;
const FADE_END = 58;

export function StickyHeader({
  scrollY,
  title,
  fadeStart = FADE_START,
  fadeEnd = FADE_END,
}: {
  scrollY: SharedValue<number>;
  title: string;
  fadeStart?: number;
  fadeEnd?: number;
}) {
  const insets = useSafeAreaInsets();
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, fadeEnd], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { paddingTop: insets.top, height: insets.top + COMPACT_BAR }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, fade]}>
        <BlurView
          intensity={Platform.OS === "ios" ? 70 : 100}
          tint="light"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.hairline} />
      </Animated.View>
      <Animated.View style={[styles.bar, fade]}>
        <Text style={styles.compactTitle} numberOfLines={1}>
          {title}
        </Text>
      </Animated.View>
    </View>
  );
}

export function LargeTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.large}>
      <View style={styles.largeRow}>
        <Text style={styles.largeTitle} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "transparent",
  },
  bar: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  compactTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  hairline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  large: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  largeRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  largeTitle: {
    fontSize: font.display,
    fontWeight: "800",
    color: colors.onSurface,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  subtitle: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: 2 },
});
