import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View, Animated, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, fonts, shadow } from "@/src/theme";

type ToastType = "success" | "error" | "info" | "warning";
type Ctx = { show: (message: string, type?: ToastType) => void };

const ToastContext = createContext<Ctx>({ show: () => {} });

const TYPE_STYLES: Record<ToastType, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { bg: colors.successBg, fg: colors.successText, icon: "checkmark-circle" },
  error: { bg: colors.errorBg, fg: colors.errorText, icon: "alert-circle" },
  info: { bg: colors.infoBg, fg: colors.infoText, icon: "information-circle" },
  warning: { bg: colors.warningBg, fg: colors.warningText, icon: "warning" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [opacity]);

  const show = useCallback(
    (msg: string, t: ToastType = "info") => {
      setMessage(msg);
      setType(t);
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      // Errors linger longer so they aren't missed.
      const duration = t === "error" ? 6000 : 4000;
      timer.current = setTimeout(hide, duration);
    },
    [opacity, hide]
  );

  const s = TYPE_STYLES[type];

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {visible ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: insets.bottom + spacing.lg, opacity }]}
        >
          <View style={[styles.toast, { backgroundColor: s.bg }]} testID="app-toast">
            <Ionicons name={s.icon} size={20} color={s.fg} />
            <Text style={[styles.text, { color: s.fg }]} numberOfLines={3}>
              {message}
            </Text>
            <Pressable onPress={hide} hitSlop={10} testID="toast-close">
              <Ionicons name="close" size={18} color={s.fg} />
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    width: "100%",
    maxWidth: 480,
    ...shadow.card,
  },
  text: { flex: 1, fontSize: font.base, fontFamily: fonts.semibold },
});
