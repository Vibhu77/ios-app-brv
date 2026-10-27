// Client for our FastAPI backend. Auth is via a session token issued after Brevo OAuth.
// The session token is sent as `Authorization: Bearer <token>` on every request.
import { diagnostics } from "@/src/lib/diagnostics";
import { DEMO_MODE, DEMO_TOKEN } from "@/src/lib/demo-mode";
import { demoBrevo } from "@/src/demo/client";

const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

// A single global handler invoked when the backend surfaces a 401 (i.e. the
// server already tried to refresh the Brevo token and failed → session is truly
// expired). BrevoContext registers it to clear the session and redirect to
// /login exactly once. Kept out of `req` state so there's never a retry loop.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export const LOGIN_URL = (redirect: string, codeChallenge: string) =>
  `${API}/auth/brevo/login?redirect=${encodeURIComponent(redirect)}&code_challenge=${encodeURIComponent(codeChallenge)}`;

// Exchange a one-time OAuth code (+ PKCE verifier) for a session token. This is
// unauthenticated and bypasses `req()` since there's no bearer token yet.
export async function exchangeOAuthCode(code: string, codeVerifier: string): Promise<string> {
  const res = await fetch(`${API}/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: codeVerifier }),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail;
    const msg =
      (detail && (detail.message || (typeof detail === "string" ? detail : null))) ||
      "Sign in failed";
    throw new Error(typeof msg === "string" ? msg : "Sign in failed");
  }
  return data?.token || "";
}

async function req(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const detail = data?.detail;
    let msg =
      (detail && (detail.message || (typeof detail === "string" ? detail : null))) ||
      data?.message ||
      `Request failed (${res.status})`;
    if (typeof msg !== "string") msg = "Request failed";
    const upstream = detail && typeof detail === "object" ? detail.upstream_status : undefined;
    if (upstream && upstream !== res.status) msg = `${msg} (Brevo HTTP ${upstream})`;
    const requestId = detail && typeof detail === "object" ? detail.sib_request_id ?? null : null;
    diagnostics.recordError({ status: res.status, message: msg, requestId, at: Date.now() });
    const err: any = new Error(msg);
    err.status = res.status;
    err.upstreamStatus = upstream;
    err.brevoCode = detail && typeof detail === "object" ? detail.brevo_code : undefined;
    err.field = detail && typeof detail === "object" ? detail.field : undefined;
    err.requestId = requestId;
    err.upstreamBody = detail && typeof detail === "object" ? detail.upstream_body : undefined;
    throw err;
  }
  diagnostics.recordSuccess();
  return data;
}

export type Account = {
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  address?: string;
  plan?: { type?: string; creditsType?: string; credits?: number; startDate?: string; endDate?: string };
  planName?: string;
  planVerticals?: {
    email?: { credits?: number };
    sms?: { credits?: number };
    [k: string]: any;
  };
  [k: string]: any;
};

export type GlobalStats = {
  sent?: number;
  delivered?: number;
  uniqueViews?: number;
  viewed?: number;
  uniqueClicks?: number;
  clickers?: number;
  softBounces?: number;
  hardBounces?: number;
  unsubscriptions?: number;
  complaints?: number;
};

export type Campaign = {
  id: number;
  name: string;
  subject?: string;
  type?: string;
  status?: string;
  sentDate?: string;
  scheduledAt?: string;
  createdAt?: string;
  modifiedAt?: string;
  sender?: { name?: string; email?: string; id?: number };
  statistics?: { globalStats?: GlobalStats };
};

export type Readiness = {
  status?: string;
  sender?: { name?: string; email?: string } | null;
  subject?: string | null;
  recipients: {
    lists: { id: number; name: string; count: number }[];
    segments: { id: number; name: string }[];
  };
  hasDesign: boolean;
  ready: boolean;
  missing: string[];
};

export type Contact = {
  id: number;
  email: string;
  emailBlacklisted?: boolean;
  smsBlacklisted?: boolean;
  createdAt?: string;
  modifiedAt?: string;
  listIds?: number[];
  attributes?: Record<string, any>;
};

const realBrevo = {
  // auth
  me: (token: string) => req("/auth/me", token),
  getAccount: (token: string) => req("/brevo/account", token),
  logout: (token: string) => req("/auth/logout", token, { method: "POST" }),
  // data (backend paginates internally at 50/page to dodge Brevo's limit=100 bug)
  listCampaigns: (token: string, pageSize?: number) =>
    req(`/brevo/campaigns${pageSize ? `?page_size=${pageSize}` : ""}`, token),
  getCampaign: (token: string, id: number | string) => req(`/brevo/campaigns/${id}`, token),
  updateCampaignStatus: (token: string, id: number | string, status: string) =>
    req(`/brevo/campaigns/${id}/status`, token, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  listContacts: (token: string, offset = 0, limit = 20) =>
    req(`/brevo/contacts?limit=${limit}&offset=${offset}`, token),
  getContact: (token: string, id: number | string, identifierType?: string) =>
    req(
      `/brevo/contacts/${encodeURIComponent(String(id))}${identifierType ? `?identifierType=${identifierType}` : ""}`,
      token
    ),
  getContactStats: (token: string, id: number | string) =>
    req(`/brevo/contacts/${encodeURIComponent(String(id))}/stats`, token),
  getAttributes: (token: string) => req("/brevo/attributes", token),
  createContact: (token: string, body: any) =>
    req("/brevo/contacts", token, { method: "POST", body: JSON.stringify(body) }),
  updateContact: (token: string, id: number | string, body: any) =>
    req(`/brevo/contacts/${encodeURIComponent(String(id))}`, token, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteContact: (token: string, id: number | string) =>
    req(`/brevo/contacts/${encodeURIComponent(String(id))}`, token, { method: "DELETE" }),
  searchContactsByName: (token: string, name: string) =>
    req(`/brevo/contacts-search?name=${encodeURIComponent(name)}`, token),
  getCampaignReadiness: (token: string, id: number | string) =>
    req(`/brevo/campaigns/${id}/readiness`, token),
  sendCampaignNow: (token: string, id: number | string) =>
    req(`/brevo/campaigns/${id}/send-now`, token, { method: "POST" }),
  scheduleCampaign: (token: string, id: number | string, scheduledAt: string) =>
    req(`/brevo/campaigns/${id}/schedule`, token, {
      method: "POST",
      body: JSON.stringify({ scheduledAt }),
    }),
};

// DEMO DATA mode: choose the client PER CALL based on the session token, so a
// real Brevo sign-in always hits the real backend even while the dev flag is on.
// Only the sample session (token === DEMO_TOKEN) is served the in-memory fake.
const isDemoToken = (t?: string) => DEMO_MODE && t === DEMO_TOKEN;
export const brevo = Object.fromEntries(
  Object.entries(realBrevo).map(([name, fn]) => [
    name,
    (token: string, ...args: any[]) =>
      isDemoToken(token)
        ? (demoBrevo as any)[name](token, ...args)
        : (fn as any)(token, ...args),
  ])
) as typeof realBrevo;
