// In-memory fake of the `brevo` client for DEMO DATA mode. Same function
// signatures as the real client in src/lib/brevo.ts, but all state lives in
// memory: creating/editing a contact and suspending/resuming a campaign mutate
// it, with no network calls.
import type { Account, Campaign, Contact } from "@/src/lib/brevo";
import { makeCampaigns, makeContacts, demoAccount, demoAttributes, contactStatsSeed } from "@/src/demo/fixtures";

type DemoContact = Contact & { ext_id?: string };

let campaigns: Campaign[] = makeCampaigns();
let contacts: DemoContact[] = makeContacts();
let nextContactId = 5000;

// Shape a thrown error like the one `req()` surfaces from the real backend so
// screens' catch blocks behave identically (status / upstreamStatus / detail).
function demoError(status: number, message: string, extra: Record<string, any> = {}) {
  const err: any = new Error(message);
  err.status = status;
  err.upstreamStatus = extra.upstreamStatus ?? status;
  err.brevoCode = extra.brevoCode;
  err.detail = { message, ...(extra.brevoCode ? { code: extra.brevoCode } : {}) };
  return err;
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const digits = (s: string) => (s || "").replace(/\D/g, "");

function findContact(identifier: string, identifierType?: string): DemoContact | undefined {
  const idNum = Number(identifier);
  if (!identifierType && !Number.isNaN(idNum)) {
    const byId = contacts.find((c) => c.id === idNum);
    if (byId) return byId;
  }
  const lower = String(identifier).toLowerCase();
  const byEmail = contacts.find((c) => (c.email || "").toLowerCase() === lower);
  if (byEmail) return byEmail;
  const d = digits(identifier);
  if (d) {
    return contacts.find((c) => {
      const a = c.attributes || {};
      return [a.SMS, a.WHATSAPP, a.LANDLINE_NUMBER].some((v) => v && digits(String(v)) === d);
    });
  }
  return undefined;
}

export const demoBrevo = {
  me: async (_token: string) => {
    await delay(60);
    return { account: demoAccount as Account };
  },
  getAccount: async (_token: string) => {
    await delay(60);
    return demoAccount;
  },
  logout: async (_token: string) => {
    // Reset in-memory state so a fresh demo session starts clean.
    campaigns = makeCampaigns();
    contacts = makeContacts();
    return {};
  },

  listCampaigns: async (_token: string, _pageSize?: number) => {
    await delay();
    return { count: campaigns.length, campaigns: campaigns.map((c) => ({ ...c })) };
  },
  getCampaign: async (_token: string, id: number | string) => {
    await delay(80);
    const c = campaigns.find((x) => String(x.id) === String(id));
    if (!c) throw demoError(404, "Campaign not found");
    return { ...c };
  },
  updateCampaignStatus: async (_token: string, id: number | string, status: string) => {
    await delay(150);
    const c = campaigns.find((x) => String(x.id) === String(id));
    if (!c) throw demoError(404, "Campaign not found");
    c.status = status; // mutate so the detail refetch flips the badge
    return { ...c };
  },

  listContacts: async (_token: string, offset = 0, limit = 20) => {
    await delay();
    const slice = contacts.slice(offset, offset + limit).map((c) => ({ ...c }));
    return { count: contacts.length, contacts: slice };
  },
  getContact: async (_token: string, id: number | string, identifierType?: string) => {
    await delay(80);
    const c = findContact(String(id), identifierType);
    if (!c) throw demoError(404, "Contact not found");
    return { ...c };
  },
  getContactStats: async (_token: string, id: number | string) => {
    await delay(80);
    return contactStatsSeed(Number(id));
  },
  getAttributes: async (_token: string) => {
    await delay(40);
    return demoAttributes;
  },

  createContact: async (_token: string, body: any) => {
    await delay(150);
    const email = (body?.email || "").trim().toLowerCase();
    if (email && contacts.some((c) => (c.email || "").toLowerCase() === email)) {
      // Same shape our backend returns for Brevo's duplicate error.
      throw demoError(400, "Contact already exist", { brevoCode: "duplicate_parameter" });
    }
    const id = nextContactId++;
    const now = new Date().toISOString();
    const created: DemoContact = {
      id,
      email: body?.email || "",
      attributes: { ...(body?.attributes || {}) },
      createdAt: now,
      modifiedAt: now,
      listIds: [1],
      ...(body?.ext_id ? { ext_id: body.ext_id } : {}),
    };
    contacts = [created, ...contacts];
    return { id };
  },
  updateContact: async (_token: string, id: number | string, body: any) => {
    await delay(150);
    const c = contacts.find((x) => String(x.id) === String(id));
    if (!c) throw demoError(404, "Contact not found");
    if (typeof body?.email === "string") c.email = body.email;
    if (body?.attributes && typeof body.attributes === "object") {
      const attrs = { ...(c.attributes || {}) };
      for (const [k, v] of Object.entries(body.attributes)) {
        if (v === "" || v == null) delete attrs[k]; // "" clears the field
        else attrs[k] = v;
      }
      c.attributes = attrs;
    }
    if (typeof body?.ext_id === "string") {
      if (body.ext_id === "") delete (c as any).ext_id;
      else (c as any).ext_id = body.ext_id;
    }
    c.modifiedAt = new Date().toISOString();
    return {};
  },
  deleteContact: async (_token: string, id: number | string) => {
    await delay(150);
    const before = contacts.length;
    contacts = contacts.filter((x) => String(x.id) !== String(id));
    if (contacts.length === before) throw demoError(404, "Contact not found");
    return { ok: true };
  },
  searchContactsByName: async (_token: string, name: string) => {
    await delay(200);
    const q = (name || "").replace(/"/g, "").trim().toLowerCase();
    if (!q) return { contacts: [] };
    const matches = contacts.filter((c) => {
      const a = c.attributes || {};
      return (
        String(a.FIRSTNAME || "").toLowerCase() === q ||
        String(a.LASTNAME || "").toLowerCase() === q
      );
    });
    return { contacts: matches.map((c) => ({ ...c })) };
  },

  // --- Draft send / schedule (mutate status in memory) ---
  getCampaignReadiness: async (_token: string, id: number | string) => {
    await delay(100);
    const c = campaigns.find((x) => String(x.id) === String(id));
    if (!c) throw demoError(404, "Campaign not found");
    return demoReadiness(c);
  },
  sendCampaignNow: async (_token: string, id: number | string) => {
    await delay(220);
    const c = campaigns.find((x) => String(x.id) === String(id));
    if (!c) throw demoError(404, "Campaign not found");
    const r = demoReadiness(c);
    if (!r.ready) throw demoError(400, "Campaign is not ready to send");
    c.status = "sent";
    c.sentDate = new Date().toISOString();
    return { ok: true };
  },
  scheduleCampaign: async (_token: string, id: number | string, scheduledAt: string) => {
    await delay(220);
    const c = campaigns.find((x) => String(x.id) === String(id));
    if (!c) throw demoError(404, "Campaign not found");
    const t = Date.parse(scheduledAt);
    if (!t || t <= Date.now() + 5 * 60000) throw demoError(400, "Pick a time at least 5 minutes from now");
    const r = demoReadiness(c);
    if (!r.ready) throw demoError(400, "Campaign is not ready to send");
    c.status = "queued";
    c.scheduledAt = scheduledAt;
    return { ok: true, scheduledAt };
  },
};

// Demo readiness: sender present for all fixtures; design assumed; one demo
// list; only the subject can be missing (fixture draft #7).
function demoReadiness(c: Campaign) {
  const sender = c.sender?.email ? { name: c.sender.name, email: c.sender.email } : null;
  const subject = c.subject || null;
  const hasDesign = true;
  const lists = [{ id: 1, name: "Demo list (just me)", count: 1 }];
  const missing: string[] = [];
  if (!sender?.email) missing.push("sender");
  if (!lists.length) missing.push("recipients");
  if (!subject) missing.push("subject");
  if (!hasDesign) missing.push("design");
  const ready = String(c.status || "").toLowerCase() === "draft" && missing.length === 0;
  return { status: c.status, sender, subject, recipients: { lists, segments: [] }, hasDesign, ready, missing };
}
