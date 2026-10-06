import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { storage } from "@/src/utils/storage";
import { brevo, LOGIN_URL, exchangeOAuthCode, Account, setUnauthorizedHandler } from "@/src/lib/brevo";
import { DEMO_MODE, DEMO_TOKEN } from "@/src/lib/demo-mode";
import { createPkce } from "@/src/lib/pkce";
import { cache } from "@/src/lib/cache";

WebBrowser.maybeCompleteAuthSession();

const KEY = "brevo_session_token";
// PKCE verifier persisted across the browser round-trip (survives a full-page
// redirect on web and the deep-link bounce in Expo Go). Deleted after exchange.
const PKCE_KEY = "brevo_pkce_verifier";

type Ctx = {
  token: string;
  account: Account | null;
  loading: boolean;
  isConnected: boolean;
  login: () => Promise<{ ok: boolean; error?: string }>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
  setSession: (token: string) => Promise<void>;
  exchangeCode: (code: string) => Promise<boolean>;
  isDemo: boolean;
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

  // Redeem a one-time OAuth code for a session token using the PKCE verifier
  // we stashed before opening the browser. Single-use: the verifier is removed
  // on the first successful exchange, so a duplicate callback is a silent no-op.
  const exchangeCode = useCallback(
    async (code: string): Promise<boolean> => {
      const verifier = (await storage.secureGet<string>(PKCE_KEY, "")) || "";
      if (!verifier) return false;
      try {
        const t = await exchangeOAuthCode(code, verifier);
        await storage.secureRemove(PKCE_KEY);
        if (t) {
          await setSession(t);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [setSession]
  );

  // Catch-all deep-link handler. In Expo Go the browser bounces back to the
  // dynamic `exp://.../oauth-complete?code=...` link; openAuthSessionAsync may
  // resolve as `dismiss` (not `success`) so the code isn't returned inline.
  // This listener captures the code from the incoming URL regardless.
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
      const code = parsed.queryParams?.code as string | undefined;
      if (code) await exchangeCode(String(code));
    },
    [exchangeCode]
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
    // Diagnostic (dev only): the exact deep-link the backend must allow-list.
    // In Expo Go this streams to the Metro dev-server logs.
    if (__DEV__) console.log("[oauth] Linking.createURL('oauth-complete') =", redirect);
    const { verifier, challenge } = await createPkce();
    // Persist the verifier BEFORE opening the browser so it survives the
    // round-trip (web full-page redirect / Expo Go deep-link bounce).
    await storage.secureSet(PKCE_KEY, verifier);
    try {
      const result = await WebBrowser.openAuthSessionAsync(LOGIN_URL(redirect, challenge), redirect);
      if (result.type === "success" && result.url) {
        const parsed = Linking.parse(result.url);
        const err = parsed.queryParams?.error as string | undefined;
        const code = parsed.queryParams?.code as string | undefined;
        if (err) return { ok: false, error: decodeURIComponent(err) };
        if (code) {
          const ok = await exchangeCode(String(code));
          return ok ? { ok: true } : { ok: false, error: "Sign in failed" };
        }
        return { ok: false, error: "No authorization code returned" };
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
  }, [exchangeCode]);

  // DEMO DATA mode: start a sample session with no backend/OAuth round-trip.
  const loginDemo = useCallback(async () => {
    await setSession(DEMO_TOKEN);
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
      value={{ token, account, loading, isConnected: !!token, login, loginDemo, logout, setSession, exchangeCode, isDemo: DEMO_MODE && token === DEMO_TOKEN }}
    >
      {children}
    </BrevoContext.Provider>
  );
}

export const useBrevo = () => useContext(BrevoContext);
