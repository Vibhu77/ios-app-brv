import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { colors } from "@/src/theme";
import { useBrevo } from "@/src/context/BrevoContext";
import { useToast } from "@/src/context/ToastContext";

// Web fallback: the OAuth callback lands here full-page with ?code=... or ?error=...
export default function OAuthComplete() {
  const router = useRouter();
  const toast = useToast();
  const { exchangeCode, isConnected, loading } = useBrevo();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();

  const navigatedRef = useRef(false); // navigate exactly once
  const exchangedRef = useRef(false); // redeem the code at most once
  const connectedRef = useRef(isConnected); // live value for the safety-net timer
  connectedRef.current = isConnected;

  const go = (path: "/campaigns" | "/login") => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace(path);
  };

  // On web, this screen can load inside the popup opened by openAuthSessionAsync.
  // The popup shares the code with its OPENER, which redeems it in login(). If we
  // also redeem here (a separate JS context, so the single-flight Map can't
  // dedupe), the loser shows a false error. Detect the popup and bow out.
  useEffect(() => {
    if (Platform.OS === "web") {
      const w = typeof window !== "undefined" ? (window as any) : undefined;
      if (w && w.opener && !w.opener.closed) {
        WebBrowser.maybeCompleteAuthSession();
        navigatedRef.current = true; // popup: let the opener finish; never navigate here
      }
    }
  }, []);

  // Decide once the stored session has finished loading. Re-runs when the
  // session appears (isConnected) or loading flips, so a session that restores
  // asynchronously still redirects to Campaigns.
  useEffect(() => {
    if (navigatedRef.current) return;
    if (loading) return; // wait for the persisted session to load first

    // A session exists (restored or just redeemed) — leave quietly, no toast.
    if (isConnected) {
      go("/campaigns");
      return;
    }

    if (params.error) {
      toast.show(decodeURIComponent(String(params.error)), "error");
      go("/login");
      return;
    }

    if (params.code) {
      if (exchangedRef.current) return; // exchange already attempted; wait for session/timeout
      exchangedRef.current = true;
      (async () => {
        const ok = await exchangeCode(String(params.code));
        if (navigatedRef.current) return;
        if (ok) {
          go("/campaigns");
        } else {
          // Exchange finished, loading done, still no session -> real failure.
          toast.show("Sign in failed. Please try again.", "error");
          go("/login");
        }
      })();
      return;
    }

    go("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code, params.error, isConnected, loading]);

  // Safety net: never leave the user stuck on the spinner.
  useEffect(() => {
    const t = setTimeout(() => {
      if (navigatedRef.current) return;
      go(connectedRef.current ? "/campaigns" : "/login");
    }, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
