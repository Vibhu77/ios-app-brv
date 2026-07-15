import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { brevo } from "@/src/lib/brevo";

const KEY = "brevo_api_key";

type Account = {
  email?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
} | null;

type Ctx = {
  apiKey: string;
  account: Account;
  loading: boolean; // still loading key from storage
  isConnected: boolean;
  saveKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
  clearKey: () => Promise<void>;
  refreshAccount: () => Promise<void>;
};

const BrevoContext = createContext<Ctx>({} as Ctx);

export function BrevoProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState("");
  const [account, setAccount] = useState<Account>(null);
  const [loading, setLoading] = useState(true);

  const loadAccount = useCallback(async (key: string) => {
    if (!key) {
      setAccount(null);
      return;
    }
    try {
      const acc = await brevo.getAccount(key);
      setAccount(acc);
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await storage.secureGet<string>(KEY, "");
      const key = stored || "";
      setApiKey(key);
      await loadAccount(key);
      setLoading(false);
    })();
  }, [loadAccount]);

  const saveKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    try {
      const acc = await brevo.getAccount(trimmed);
      await storage.secureSet(KEY, trimmed);
      setApiKey(trimmed);
      setAccount(acc);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Invalid API key" };
    }
  }, []);

  const clearKey = useCallback(async () => {
    await storage.secureRemove(KEY);
    setApiKey("");
    setAccount(null);
  }, []);

  const refreshAccount = useCallback(() => loadAccount(apiKey), [apiKey, loadAccount]);

  return (
    <BrevoContext.Provider
      value={{
        apiKey,
        account,
        loading,
        isConnected: !!apiKey,
        saveKey,
        clearKey,
        refreshAccount,
      }}
    >
      {children}
    </BrevoContext.Provider>
  );
}

export const useBrevo = () => useContext(BrevoContext);
