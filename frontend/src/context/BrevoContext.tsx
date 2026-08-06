import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { storage } from "@/src/utils/storage";
import { brevo, LOGIN_URL, Account, setUnauthorizedHandler } from "@/src/lib/brevo";
import { cache } from "@/src/lib/cache";

WebBrowser.maybeCompleteAuthSession();

const KEY = "brevo_session_token";

type Ctx = {
  token: string;
  account: Account | null;
  loading: boolean;
  isConnected: boolean;
  login: () => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  setSession: (token: string) => Promise<void>;
};

const BrevoContext = createContext<Ctx>({} as Ctx);

export function BrevoProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  // Guards the expired-session redirect so a burst of parallel 401s only
  // clears the session + navigates to /login once (no loop, no thrash).
  const expiredRef = useRef(false);

  const hydrate = useCallback(async (t: string) => {
    if (!t) {
      setAccount(null);
      return;
    }
    try {
      const res = await brevo.me(t);
      setAccount(res?.account || null);
    } catch (e: any) {
      // Invalid/expired session
      if (e?.status === 401) {
        await storage.secureRemove(KEY);
        setToken("");
        setAccount(null);
      }
    }
  }, []);

  // Single, clean handler for a surfaced 401 (backend refresh already failed).
  // Clears the local session and redirects to /login exactly once — works from
  // any screen, including the contact detail stack route.
  const handleUnauthorized = useCallback(async () => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    cache.clear();
    await storage.secureRemove(KEY);
    setToken("");
    setAccount(null);
    router.replace("/login");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  useEffect(() => {
    (async () => {
      const stored = (await storage.secureGet<string>(KEY, "")) || "";
      setToken(stored);
      await hydrate(stored);
      setLoading(false);
    })();
  }, [hydrate]);

  const setSession = useCallback(
    async (t: string) => {
      expiredRef.current = false; // fresh session — re-arm the 401 guard
      await storage.secureSet(KEY, t);
      setToken(t);
      await hydrate(t);
    },
    [hydrate]
  );

  // Catch-all deep-link handler. In Expo Go the browser bounces back to the
  // dynamic `exp://.../oauth-complete?token=...` link; openAuthSessionAsync may
  // resolve as `dismiss` (not `success`) so the token isn't returned inline.
  // This listener captures the token from the incoming URL regardless.
  const handleIncomingUrl = useCallback(
    async (url: string | null) => {
      if (!url) return;
      let parsed;
      try {
        parsed = Linking.parse(url);
      } catch {
        return;
      }
      if (!(parsed.path || "").includes("oauth-complete")) return;
      const t = parsed.queryParams?.token as string | undefined;
      if (t) await setSession(String(t));
    },
    [setSession]
  );

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      handleIncomingUrl(url);
    });
    Linking.getInitialURL().then(handleIncomingUrl);
    return () => sub.remove();
  }, [handleIncomingUrl]);

  const login = useCallback(async () => {
    const redirect = Linking.createURL("oauth-complete");
    try {
      const result = await WebBrowser.openAuthSessionAsync(LOGIN_URL(redirect), redirect);
      if (result.type === "success" && result.url) {
        const parsed = Linking.parse(result.url);
        const err = parsed.queryParams?.error as string | undefined;
        const t = parsed.queryParams?.token as string | undefined;
        if (err) return { ok: false, error: decodeURIComponent(err) };
        if (t) {
          await setSession(t);
          return { ok: true };
        }
        return { ok: false, error: "No session returned" };
      }
      // On some platforms (notably Expo Go) the session completes via the
      // deep-link listener above rather than the returned result — treat
      // dismiss/cancel as a silent no-op so we don't flash an error.
      if (result.type === "cancel" || result.type === "dismiss") {
        return { ok: false, error: "Sign in cancelled" };
      }
      return { ok: false, error: "Sign in failed" };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Sign in failed" };
    }
  }, [setSession]);

  const logout = useCallback(async () => {
    try {
      if (token) await brevo.logout(token);
    } catch {
      // ignore
    }
    cache.clear();
    await storage.secureRemove(KEY);
    setToken("");
    setAccount(null);
  }, [token]);

  return (
    <BrevoContext.Provider
      value={{ token, account, loading, isConnected: !!token, login, logout, setSession }}
    >
      {children}
    </BrevoContext.Provider>
  );
}

export const useBrevo = () => useContext(BrevoContext);
