import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  ViewStyle,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow, fonts } from "@/src/theme";
import { titleCase } from "@/src/lib/format";

const EMPTY_ILLUSTRATION = require("@/assets/empty-state.png");
const NO_RESULTS_ILLUSTRATION = require("@/assets/no-results.webp");

// ---------- Naos Empty State (illustration + heading + description + action) ----------
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  testID,
  illustration = "empty",
  footnote,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  illustration?: "empty" | "noResults";
  footnote?: string;
}) {
  const isNoResults = illustration === "noResults";
  return (
    <View style={emptyStyles.wrap} testID={testID}>
      <ExpoImage
        source={isNoResults ? NO_RESULTS_ILLUSTRATION : EMPTY_ILLUSTRATION}
        style={isNoResults ? emptyStyles.imgWide : emptyStyles.img}
        contentFit="contain"
      />
      <Text style={emptyStyles.title}>{title}</Text>
      {description ? <Text style={emptyStyles.desc}>{description}</Text> : null}
      {footnote ? <Text style={emptyStyles.footnote}>{footnote}</Text> : null}
      {actionLabel && onAction ? (
        <View style={emptyStyles.action}>
          <Button variant="secondary" title={actionLabel} onPress={onAction} testID="empty-state-action" />
        </View>
      ) : null}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  img: { width: 200, height: 120, marginBottom: spacing.lg },
  imgWide: { width: 220, height: 124, marginBottom: spacing.lg },
  title: { fontSize: font.lg, fontFamily: fonts.bold, color: colors.onSurface, textAlign: "center" },
  desc: {
    fontSize: font.base,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
    maxWidth: 300,
  },
  footnote: {
    fontSize: font.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 18,
    maxWidth: 300,
  },
  action: { marginTop: spacing.lg },
});

// ---------- Signature mint-green icon chip ----------
export function IconChip({
  icon,
  size = 36,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
}) {
  return (
    <View style={[chipStyles.chip, { width: size, height: size }]}>
      <Ionicons name={icon} size={size * 0.5} color={colors.onMint} />
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 10,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ---------- Status badge (Naos Status: tinted pill + colored dot) ----------
const normStatus = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function statusStyle(status?: string): { bg: string; fg: string; dot: string; label: string } {
  switch (normStatus(status)) {
    case "sent":
      return { bg: colors.successBg, fg: colors.successText, dot: colors.success, label: "Sent" };
    case "suspended":
      return { bg: colors.errorBg, fg: colors.errorText, dot: colors.error, label: "Suspended" };
    case "inprocess":
    case "running":
      return { bg: colors.warningBg, fg: colors.warningText, dot: colors.warning, label: "Running" };
    case "queued":
    case "scheduled":
      return { bg: colors.infoBg, fg: colors.infoText, dot: colors.accent, label: "Scheduled" };
    case "draft":
      return { bg: colors.surfaceSecondary, fg: colors.onSurfaceSecondary, dot: colors.onSurfaceSecondary, label: "Draft" };
    default:
      return {
        bg: colors.surfaceSecondary,
        fg: colors.onSurfaceSecondary,
        dot: colors.onSurfaceSecondary,
        label: titleCase(status || "draft"),
      };
  }
}

export function StatusBadge({ status }: { status?: string }) {
  const s = statusStyle(status);
  return (
    <View style={[badgeStyles.badge, { backgroundColor: s.bg }]}>
      <View style={[badgeStyles.dot, { backgroundColor: s.dot }]} />
      <Text style={[badgeStyles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: font.sm, fontWeight: "700" },
});

// ---------- Avatar ----------
export function Avatar({ label, size = 44 }: { label: string; size?: number }) {
  const initials = getInitials(label);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export function getInitials(value: string) {
  if (!value) return "?";
  const clean = value.split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 0) return value[0]?.toUpperCase() || "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ---------- KPI scorecard ----------
export function KpiCard({
  label,
  value,
  sub,
  icon,
  testID,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}) {
  return (
    <View style={styles.kpi} testID={testID}>
      {icon ? (
        <View style={styles.kpiChip}>
          <IconChip icon={icon} size={32} />
        </View>
      ) : null}
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

// ---------- Stat row with percentage bar ----------
export function StatRow({
  label,
  value,
  pct,
  color = colors.brandPrimary,
}: {
  label: string;
  value: string;
  pct?: number; // 0..1
  color?: string;
}) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statRowHead}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      {pct !== undefined ? (
        <View style={styles.barTrack}>
          <View
            style={[styles.barFill, { width: `${Math.min(100, Math.max(0, pct * 100))}%`, backgroundColor: color }]}
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------- Naos NaosButton (single reusable button) ----------
type ButtonVariant = "primary" | "destructive" | "secondary" | "destructiveGhost";

const BUTTON_VARIANTS: Record<ButtonVariant, { bg: string; border: string; fg: string }> = {
  primary: { bg: colors.brandPrimary, border: colors.brandPrimary, fg: "#FFFFFF" },
  destructive: { bg: colors.negativePress, border: colors.negativePress, fg: "#FFFFFF" },
  secondary: { bg: colors.surfaceSecondary, border: colors.border, fg: colors.onSurface },
  // Secondary chrome with negative-red ink (Naos #CF1A3B) — used for Delete.
  destructiveGhost: { bg: colors.surfaceSecondary, border: colors.border, fg: colors.errorText },
};

export function Button({
  title,
  onPress,
  loading,
  disabled,
  icon,
  testID,
  variant = "primary",
  fullWidth,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
}) {
  const isDisabled = disabled || loading;
  const v = BUTTON_VARIANTS[variant];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        btnStyles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        fullWidth && btnStyles.fullWidth,
        { opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null}
          <Text style={[btnStyles.label, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const btnStyles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 7,
    paddingHorizontal: 15,
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
  },
  fullWidth: { alignSelf: "stretch" },
  label: { fontSize: 14, fontFamily: fonts.semibold },
});

// Back-compat wrapper: full-width CTA delegating to the canonical Button.
export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
  testID,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const mapped: ButtonVariant = variant === "danger" ? "destructive" : variant;
  return (
    <Button
      title={title}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      icon={icon}
      testID={testID}
      variant={mapped}
      fullWidth
    />
  );
}

// ---------- Empty / error / loading states ----------
export function StateView({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.state} testID={testID}>
      <View style={styles.stateIcon}>
        <Ionicons name={icon} size={30} color={colors.onSurfaceTertiary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateMsg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.lg, alignSelf: "stretch" }}>
          <PrimaryButton title={actionLabel} onPress={onAction} testID="state-action-button" />
        </View>
      ) : null}
    </View>
  );
}

export function Loader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

// ---------- Skeleton block ----------
export function Skeleton({ style }: { style?: ViewStyle }) {
  return <View style={[styles.skeleton, style]} />;
}

// ---------- Card container ----------
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandTertiary, fontWeight: "700" },
  kpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiChip: { marginBottom: spacing.md, alignSelf: "flex-start" },
  kpiValue: { fontSize: font.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  kpiLabel: { fontSize: font.sm, color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontWeight: "600" },
  kpiSub: { fontSize: font.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  statRow: { paddingVertical: spacing.md },
  statRowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLabel: { fontSize: font.base, color: colors.onSurfaceSecondary, fontWeight: "600" },
  statValue: { fontSize: font.lg, color: colors.onSurface, fontWeight: "700" },
  barTrack: {
    height: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: radius.pill },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  btnText: { fontSize: font.lg, fontWeight: "700" },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  stateTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  stateMsg: {
    fontSize: font.base,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  skeleton: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
});
