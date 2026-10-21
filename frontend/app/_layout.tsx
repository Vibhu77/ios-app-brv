import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StyleSheet, Text, TextInput, View, ScrollView, Linking, Pressable } from "react-native";
import { useFonts } from "expo-font";
import { Image as ExpoImage } from "expo-image";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { BrevoProvider } from "@/src/context/BrevoContext";
import { ToastProvider } from "@/src/context/ToastContext";
import { prefs } from "@/src/lib/prefs";
import { colors, spacing, fonts, font } from "@/src/theme";

const SUPPORT_URL = "https://help.brevo.com/";

// Root error boundary (Expo Router): render a friendly screen instead of a
// blank/red crash. Never surfaces the error text/stack to the user; logs it in
// dev only.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  if (__DEV__) console.error(error);
  return (
    <View style={ebStyles.container}>
      <ScrollView contentContainerStyle={ebStyles.content} showsVerticalScrollIndicator={false}>
        <ExpoImage
          source={require("@/assets/error-page.png")}
          style={ebStyles.img}
          contentFit="contain"
        />
        <Text style={ebStyles.title}>We could not show this page</Text>
        <View style={ebStyles.bullets}>
          <Text style={ebStyles.bullet}>{"\u2022  Try again."}</Text>
          <Text style={ebStyles.bullet}>
            {"\u2022  Go back to where you were and try again to access this page."}
          </Text>
        </View>
        <Text style={ebStyles.supportLine}>
          If it still does not work,{" "}
          <Text style={ebStyles.link} onPress={() => Linking.openURL(SUPPORT_URL)}>
            contact our Support team
          </Text>
          .
        </Text>
        <View style={ebStyles.actions}>
          <Pressable style={[ebStyles.btn, ebStyles.btnPrimary]} onPress={() => retry()} testID="error-retry">
            <Text style={ebStyles.btnPrimaryText}>Try again</Text>
          </Pressable>
          <Pressable
            style={[ebStyles.btn, ebStyles.btnSecondary]}
            onPress={() => router.replace("/(tabs)/campaigns")}
            testID="error-home"
          >
            <Text style={ebStyles.btnSecondaryText}>Go to Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const ebStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl, gap: spacing.lg },
  img: { width: 240, height: 180, alignSelf: "flex-start" },
  title: { fontSize: font.xxl, fontFamily: fonts.bold, color: colors.onSurface, letterSpacing: -0.5 },
  bullets: { gap: spacing.sm },
  bullet: { fontSize: font.base, color: colors.onSurfaceSecondary, lineHeight: 22 },
  supportLine: { fontSize: font.base, color: colors.onSurfaceSecondary, lineHeight: 22 },
  link: { color: colors.brandPrimary, textDecorationLine: "underline", fontFamily: fonts.semibold },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  btn: { minHeight: 48, borderRadius: 16, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: { color: "#FFFFFF", fontSize: 15, fontFamily: fonts.semibold },
  btnSecondary: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { color: colors.onSurface, fontSize: 15, fontFamily: fonts.semibold },
});

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
