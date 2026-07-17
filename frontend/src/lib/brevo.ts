// Client for our FastAPI backend. Auth is via a session token issued after Brevo OAuth.
// The session token is sent as `Authorization: Bearer <token>` on every request.
const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

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
    const detail = data?.detail;
    const msg =
      (detail && (detail.message || (typeof detail === "string" ? detail : null))) ||
      data?.message ||
      `Request failed (${res.status})`;
    const err: any = new Error(typeof msg === "string" ? msg : "Request failed");
    err.status = res.status;
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
  // data
  listCampaigns: (token: string) => req("/brevo/campaigns?limit=100", token),
  getCampaign: (token: string, id: number | string) => req(`/brevo/campaigns/${id}`, token),
  listContacts: (token: string, limit = 100, offset = 0) =>
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
