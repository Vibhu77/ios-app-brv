import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { colors } from "@/src/theme";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";

// Web fallback: the OAuth callback lands here full-page with ?token=... or ?error=...
export default function OAuthComplete() {
  const router = useRouter();
  const toast = useToast();
  const { setSession } = useBrevo();
  const params = useLocalSearchParams<{ token?: string; error?: string }>();

  useEffect(() => {
    (async () => {
      if (params.token) {
        await setSession(String(params.token));
        router.replace("/campaigns");
      } else if (params.error) {
        toast.show(decodeURIComponent(String(params.error)), "error");
        router.replace("/login");
      } else {
        router.replace("/login");
      }
    })();
  }, [params.token, params.error]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
