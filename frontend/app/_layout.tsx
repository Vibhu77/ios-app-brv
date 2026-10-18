import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StyleSheet, Text, TextInput } from "react-native";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { BrevoProvider } from "@/src/context/BrevoContext";
import { ToastProvider } from "@/src/context/ToastContext";
import { prefs } from "@/src/lib/prefs";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Deep links with no path (e.g. the Expo Go share link) must resolve to index
// first, so any modal route always has a screen underneath it to go back to.
// Without this, Android falls back to the first declared screen (the modal).
export const unstable_settings = { initialRouteName: "index" };

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [interLoaded, interError] = useFonts({
    Inter_400Regular: require("../assets/fonts/Inter_400Regular.ttf"),
    Inter_500Medium: require("../assets/fonts/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("../assets/fonts/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("../assets/fonts/Inter_700Bold.ttf"),
  });

  const loaded = iconsLoaded && interLoaded;
  const error = iconsError || interError;

  useEffect(() => {
    if (loaded || error) {
      // Hydrate persisted user preferences before first render of data screens.
      prefs.load();
      // Make Inter the app-wide default font for all Text / TextInput.
      const withInter = { style: { fontFamily: "Inter_400Regular" } };
      // @ts-expect-error defaultProps is still supported for RN Text/TextInput
      Text.defaultProps = { ...(Text.defaultProps || {}), ...withInter };
      // @ts-expect-error defaultProps is still supported for RN Text/TextInput
      TextInput.defaultProps = { ...(TextInput.defaultProps || {}), ...withInter };
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // If a font CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <BrevoProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="contact/form" options={{ presentation: "modal" }} />
              </Stack>
            </ToastProvider>
          </BrevoProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
