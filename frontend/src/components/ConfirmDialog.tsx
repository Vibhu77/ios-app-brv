import React from "react";
import { StyleSheet, Text, View, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts } from "@/src/theme";
import { Button } from "@/src/components/common";

// Shared confirmation sheet (the pattern used by Suspend campaign). Neutral
// variant defaults to primary confirm; pass `destructive` for danger actions.
export function ConfirmDialog({
  visible,
  icon,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  busy,
  onConfirm,
  onCancel,
  testID,
}: {
  visible: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID={testID}>
          {icon ? (
            <View style={[styles.iconCircle, destructive && styles.iconCircleDestructive]}>
              <Ionicons name={icon} size={24} color={destructive ? colors.errorText : colors.onSurface} />
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <View style={styles.actions}>
            <Button
              variant={destructive ? "destructive" : "primary"}
              title={confirmLabel}
              fullWidth
              loading={busy}
              onPress={onConfirm}
              testID="confirm-dialog-confirm"
            />
            <Button
              variant="secondary"
              title={cancelLabel}
              fullWidth
              onPress={onCancel}
              disabled={busy}
              testID="confirm-dialog-cancel"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.md,
  },
  iconCircleDestructive: { backgroundColor: colors.errorBg },
  title: {
    fontSize: font.xl,
    fontFamily: fonts.bold,
    color: colors.onSurface,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  body: {
    fontSize: font.base,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  actions: { gap: spacing.sm, marginTop: spacing.xl, alignSelf: "stretch" },
});
