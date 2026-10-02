import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { colors } from "@/src/theme";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";

// Web fallback: the OAuth callback lands here full-page with ?code=... or ?error=...
export default function OAuthComplete() {
  const router = useRouter();
  const toast = useToast();
  const { exchangeCode } = useBrevo();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();

  useEffect(() => {
    (async () => {
      if (params.code) {
        const ok = await exchangeCode(String(params.code));
        if (ok) {
          router.replace("/campaigns");
        } else {
          toast.show("Sign in failed. Please try again.", "error");
          router.replace("/login");
        }
      } else if (params.error) {
        toast.show(decodeURIComponent(String(params.error)), "error");
        router.replace("/login");
      } else {
        router.replace("/login");
      }
    })();
  }, [params.code, params.error]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
