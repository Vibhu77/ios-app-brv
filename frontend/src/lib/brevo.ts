// Thin client for our FastAPI Brevo proxy. The on-device API key is sent per request
// via the X-Brevo-Key header; the backend forwards it to api.brevo.com.
const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/brevo`;

async function req(path: string, apiKey: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Brevo-Key": apiKey,
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
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data;
}

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
  getAccount: (key: string) => req("/account", key),
  listCampaigns: (key: string) => req("/campaigns?limit=100", key),
  getCampaign: (key: string, id: number | string) => req(`/campaigns/${id}`, key),
  listContacts: (key: string, limit = 100, offset = 0) =>
    req(`/contacts?limit=${limit}&offset=${offset}`, key),
  getContact: (key: string, id: number | string) =>
    req(`/contacts/${encodeURIComponent(String(id))}`, key),
  getContactStats: (key: string, id: number | string) =>
    req(`/contacts/${encodeURIComponent(String(id))}/stats`, key),
  getAttributes: (key: string) => req("/attributes", key),
  createContact: (key: string, body: any) =>
    req("/contacts", key, { method: "POST", body: JSON.stringify(body) }),
  updateContact: (key: string, id: number | string, body: any) =>
    req(`/contacts/${encodeURIComponent(String(id))}`, key, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
