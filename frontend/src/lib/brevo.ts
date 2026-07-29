// Client for our FastAPI backend. Auth is via a session token issued after Brevo OAuth.
// The session token is sent as `Authorization: Bearer <token>` on every request.
const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

// A single global handler invoked when the backend surfaces a 401 (i.e. the
// server already tried to refresh the Brevo token and failed → session is truly
// expired). BrevoContext registers it to clear the session and redirect to
// /login exactly once. Kept out of `req` state so there's never a retry loop.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export const LOGIN_URL = (redirect: string) =>
  `${API}/auth/brevo/login?redirect=${encodeURIComponent(redirect)}`;

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
    const err: any = new Error(msg);
    err.status = res.status;
    err.upstreamStatus = upstream;
    err.brevoCode = detail && typeof detail === "object" ? detail.brevo_code : undefined;
    err.upstreamBody = detail && typeof detail === "object" ? detail.upstream_body : undefined;
    throw err;
  }
  return data;
}

export type Account = {
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
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
  createdAt?: string;
  sender?: { name?: string; email?: string; id?: number };
  statistics?: { globalStats?: GlobalStats };
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

export const brevo = {
  // auth
  me: (token: string) => req("/auth/me", token),
  logout: (token: string) => req("/auth/logout", token, { method: "POST" }),
  // data (backend paginates internally at 50/page to dodge Brevo's limit=100 bug)
  listCampaigns: (token: string) => req("/brevo/campaigns", token),
  getCampaign: (token: string, id: number | string) => req(`/brevo/campaigns/${id}`, token),
  listContacts: (token: string, offset = 0, limit = 50) =>
    req(`/brevo/contacts?limit=${limit}&offset=${offset}`, token),
  getContact: (token: string, id: number | string) =>
    req(`/brevo/contacts/${encodeURIComponent(String(id))}`, token),
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
};
