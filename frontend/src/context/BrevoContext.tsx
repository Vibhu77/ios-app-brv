import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { storage } from "@/src/utils/storage";
import { brevo, LOGIN_URL, Account } from "@/src/lib/brevo";

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
      await storage.secureSet(KEY, t);
      setToken(t);
      await hydrate(t);
    },
    [hydrate]
  );

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
