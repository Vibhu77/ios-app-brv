import React from "react";
import { Platform, StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { Tabs, Redirect } from "expo-router";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { useBrevo } from "@/src/context/BrevoContext";

export default function TabsLayout() {
  const { token, loading, isDemo } = useBrevo();
  const insets = useSafeAreaInsets();
  // Wait for the persisted session to load before mounting the tab screens.
  // Otherwise each screen's first focus-load runs with an empty token, exits
  // early, and never refetches when the token arrives (blank list on reload).
  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  if (!token) return <Redirect href="/login" />;

  return (
    <View style={styles.root}>
    <Tabs
      initialRouteName="campaigns"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarStyle: {
          position: "absolute",
          height: 56 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: Platform.OS === "ios" ? "transparent" : colors.surface,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="campaigns"
        options={{
          title: "Campaigns",
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
      {isDemo ? (
        <View
          pointerEvents="none"
          style={[styles.demoPill, { bottom: 56 + insets.bottom + 10 }]}
          testID="demo-data-pill"
        >
          <View style={styles.demoDot} />
          <Text style={styles.demoText}>Demo data</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  demoPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.onSurface,
  },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  demoText: { color: colors.surface, fontSize: 12, fontWeight: "700" },
});
