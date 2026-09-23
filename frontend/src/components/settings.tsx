import React from "react";
import { StyleSheet, Text, View, Pressable, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";

// Shared building blocks for the Settings screen. Every settings row uses
// these two components — no per-setting bespoke cards.

// ---------- SettingsGroup ----------
// Rounded card with an uppercase group header above it; hairline separators
// between rows, inset from the left text edge.
export function SettingsGroup({
  title,
  children,
  testID,
}: {
  title?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={groupStyles.wrap} testID={testID}>
      {title ? (
        <Text style={groupStyles.header} accessibilityRole="header">
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={groupStyles.card}>{children}</View>
    </View>
  );
}

const groupStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  header: {
    fontSize: font.sm,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
});

// ---------- SettingsRow ----------
// label + optional sublabel + right slot (value text / Switch / chevron /
// custom). Min 44pt touch target; VoiceOver labels on switches & actionable
// rows. `isLast` suppresses the bottom hairline.
export function SettingsRow({
  label,
  sublabel,
  value,
  switchValue,
  onSwitchChange,
  switchAccessibilityLabel,
  chevron,
  externalLink,
  segment,
  onPress,
  destructive,
  left,
  right,
  isLast,
  testID,
  accessibilityLabel,
}: {
  label: string;
  sublabel?: string;
  value?: string;
  switchValue?: boolean;
  onSwitchChange?: (v: boolean) => void;
  switchAccessibilityLabel?: string;
  chevron?: boolean;
  externalLink?: boolean;
  segment?: { options: (string | number)[]; selected: string | number; onSelect: (v: any) => void; testIDPrefix?: string };
  onPress?: () => void;
  destructive?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
  isLast?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const interactive = !!onPress || switchValue !== undefined || !!segment;

  const content = (
    <>
      {left ? <View style={rowStyles.left}>{left}</View> : null}
      <View style={rowStyles.body}>
        <Text style={[rowStyles.label, destructive && rowStyles.destructiveLabel]}>{label}</Text>
        {sublabel ? <Text style={rowStyles.sublabel}>{sublabel}</Text> : null}
      </View>
      {right !== undefined ? (
        right
      ) : switchValue !== undefined ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: colors.borderStrong, true: colors.success }}
          thumbColor="#FFFFFF"
          accessibilityLabel={switchAccessibilityLabel || label}
          accessibilityRole="switch"
          accessibilityState={{ checked: switchValue }}
          testID={testID ? `${testID}-switch` : undefined}
        />
      ) : segment ? (
        <View style={rowStyles.segment} testID={segment.testIDPrefix ? `${segment.testIDPrefix}-segment` : undefined}>
          {segment.options.map((opt) => {
            const active = segment.selected === opt;
            return (
              <Pressable
                key={String(opt)}
                onPress={() => segment.onSelect(opt)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label}: ${opt}`}
                style={[rowStyles.segmentItem, active && rowStyles.segmentItemActive]}
                testID={segment.testIDPrefix ? `${segment.testIDPrefix}-${opt}` : undefined}
              >
                <Text style={[rowStyles.segmentText, active && rowStyles.segmentTextActive]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : value !== undefined ? (
        <Text style={rowStyles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {chevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
      ) : null}
      {externalLink ? (
        <Ionicons name="open-outline" size={18} color={colors.onSurfaceTertiary} />
      ) : null}
    </>
  );

  const base = [rowStyles.row, !isLast && rowStyles.separator];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole={externalLink ? "link" : "button"}
        accessibilityLabel={accessibilityLabel || label}
        testID={testID}
        style={({ pressed }) => [...base, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View
      style={base}
      testID={testID}
      accessible={!interactive}
      accessibilityLabel={interactive ? accessibilityLabel : `${label}${value ? `, ${value}` : ""}`}
    >
      {content}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  left: { flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: font.base, fontWeight: "600", color: colors.onSurface },
  destructiveLabel: { color: colors.errorText },
  sublabel: { fontSize: font.sm, color: colors.onSurfaceSecondary, marginTop: 1 },
  // flexShrink + minWidth: 0 let long values truncate ("…") instead of
  // squeezing the label into a vertical letter-stack.
  value: {
    fontSize: font.base,
    color: colors.onSurfaceSecondary,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    minWidth: 0,
    textAlign: "right",
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: 2,
  },
  segmentItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentItemActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: font.sm, fontWeight: "700", color: colors.onSurfaceSecondary },
  segmentTextActive: { color: colors.onSurface },
});
