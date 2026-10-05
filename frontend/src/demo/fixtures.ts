// In-memory fixtures for DEMO DATA mode. These mirror the shapes our backend
// returns from Brevo so screens behave exactly as with live data. Deliberately
// covers the edge cases our tasks exercise (see comments inline).
import type { Account, Campaign, Contact, GlobalStats } from "@/src/lib/brevo";

const DAY = 86400000;
const BASE = Date.UTC(2026, 5, 1, 9, 0, 0); // 2026-06-01

export const demoAccount: Account = {
  email: "owner@acme-demo.com",
  firstName: "Avery",
  lastName: "Nguyen",
  companyName: "Acme Demo Co.",
  address: { street: "#SE-50, ACL Colony", zipCode: "171102", city: "Darlaghat, Distt. Solan", country: "India" },
  plan: { type: "subscription", creditsType: "sendLimit", credits: 20000, startDate: "2026-01-01", endDate: "2026-12-31" },
  planVerticals: { email: { credits: 20000 }, sms: { credits: 500 } },
};

export const demoAttributes = {
  attributes: [
    { name: "FIRSTNAME", category: "normal", type: "text" },
    { name: "LASTNAME", category: "normal", type: "text" },
    { name: "SMS", category: "normal", type: "text" },
    { name: "WHATSAPP", category: "normal", type: "text" },
    { name: "LANDLINE_NUMBER", category: "normal", type: "text" },
  ],
};

function mkStats(seed: number, zero = false): GlobalStats {
  if (zero) {
    return { sent: 0, delivered: 0, uniqueViews: 0, viewed: 0, uniqueClicks: 0, clickers: 0, softBounces: 0, hardBounces: 0, unsubscriptions: 0, complaints: 0 };
  }
  const sent = 800 + ((seed * 137) % 9000);
  const delivered = Math.round(sent * 0.96);
  const uniqueViews = Math.round(delivered * (0.18 + (seed % 35) / 100));
  const uniqueClicks = Math.round(uniqueViews * (0.1 + (seed % 20) / 100));
  const softBounces = sent - delivered;
  const hardBounces = Math.round(sent * 0.01);
  return {
    sent,
    delivered,
    uniqueViews,
    viewed: Math.round(uniqueViews * 1.4),
    uniqueClicks,
    clickers: Math.round(uniqueClicks * 1.2),
    softBounces,
    hardBounces,
    unsubscriptions: Math.round(delivered * 0.004),
    complaints: Math.round(delivered * 0.0005),
  };
}

const SENT_STATUSES = new Set(["sent", "archive"]);
const LONG_NAME =
  "Q3 Mega Launch — Multi-segment lifecycle re-engagement, win-back & loyalty nurture across every region and language (A/B/C)";

export function makeCampaigns(): Campaign[] {
  // Statuses chosen so every chip (All/Draft/Sent/Scheduled/Running/Suspended/
  // Archived/Cancelled/Other) has at least one campaign. "Other" = inReview +
  // cancelling.
  const statusCycle = [
    "sent", "draft", "queued", "inProcess", "suspended", "archive", "cancelled",
    "inReview", "cancelling", "sent", "sent", "draft", "queued", "sent",
  ];
  const ids = [...Array(39)].map((_, i) => i + 1); // 1..39 (includes 25)
  ids.push(250);

  return ids.map((id, i) => {
    let status = statusCycle[i % statusCycle.length];
    let subject: string | undefined = `Your ${["weekly", "monthly", "flash", "seasonal"][i % 4]} update is here 🎉`;
    let name = `Campaign ${id} · ${["Newsletter", "Promo", "Product", "Event", "Survey"][i % 5]}`;
    let zeroDelivered = false;

    if (id === 7) {
      status = "draft";
      subject = undefined; // edge: no subject
      name = "Draft with no subject";
    }
    if (id === 12) {
      status = "sent";
      zeroDelivered = true; // edge: 0 delivered
      name = "Campaign 12 · Zero delivered";
    }
    if (id === 3) {
      name = LONG_NAME; // edge: very long name
    }
    if (id === 25 || id === 250) {
      status = "sent";
      subject = `Big news for campaign ${id}!`;
      name = `Campaign ${id} · Headline feature`;
    }

    const createdAt = new Date(BASE - i * DAY).toISOString();
    const isSent = SENT_STATUSES.has(status);
    return {
      id,
      name,
      subject,
      type: "classic",
      status,
      createdAt,
      sentDate: isSent ? new Date(BASE - i * DAY + 3 * 3600000).toISOString() : undefined,
      sender: { name: "Acme Demo", email: "hello@acme-demo.com", id: 1 },
      statistics: { globalStats: isSent ? mkStats(id, zeroDelivered) : mkStats(id, true) },
    };
  });
}

function contactStatsSeed(contactId: number): any {
  // Only the "activity" contact (id 1001) gets a populated timeline.
  if (contactId !== 1001) {
    return { messagesSent: [], delivered: [], opened: [], clicked: [], softBounces: [], hardBounces: [], unsubscriptions: {} };
  }
  const ev = (campaignId: number, dayOffset: number) => ({ campaignId, eventTime: new Date(BASE - dayOffset * DAY).toISOString() });
  return {
    messagesSent: [ev(25, 2), ev(250, 5), ev(5, 9)],
    delivered: [ev(25, 2), ev(250, 5), ev(5, 9)],
    opened: [ev(25, 2), ev(250, 4)],
    clicked: [ev(25, 1)],
    softBounces: [],
    hardBounces: [],
    unsubscriptions: {},
  };
}
export { contactStatsSeed };

function mkContact(
  id: number,
  email: string,
  attrs: Record<string, any>,
  extId?: string,
  dayOffset = id % 50
): Contact & { ext_id?: string } {
  return {
    id,
    email,
    emailBlacklisted: false,
    smsBlacklisted: false,
    createdAt: new Date(BASE - dayOffset * DAY).toISOString(),
    modifiedAt: new Date(BASE - dayOffset * DAY + 3600000).toISOString(),
    listIds: [1],
    attributes: attrs,
    ...(extId ? { ext_id: extId } : {}),
  };
}

const FIRST = ["Olivia", "Liam", "Emma", "Noah", "Ava", "Ethan", "Sophia", "Mason", "Isabella", "Lucas", "Mia", "Leo", "Amelia", "Arjun", "Priya", "Chen", "Sofia", "Omar", "Nina", "Hugo"];
const LAST = ["Smith", "Johnson", "Brown", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Patel", "Kim", "Nguyen", "Santos", "Haan", "Tan", "Khan", "Rossi", "Dubois", "Müller", "Silva", "Costa"];

export function makeContacts(): (Contact & { ext_id?: string })[] {
  // --- Edge-case contacts first (stable ids) ---
  const edge: (Contact & { ext_id?: string })[] = [
    mkContact(1001, "active.user@acme-demo.com", { FIRSTNAME: "Active", LASTNAME: "User", SMS: "+919788824675" }), // has campaign activity
    mkContact(1002, "email.only@acme-demo.com", { FIRSTNAME: "Email", LASTNAME: "Only" }), // email only
    mkContact(1003, "", { FIRSTNAME: "Sms", LASTNAME: "Only", SMS: "+919788824675" }), // SMS only (+91)
    mkContact(1004, "", { FIRSTNAME: "Whats", LASTNAME: "App", WHATSAPP: "4512345678" }), // WhatsApp only (Denmark)
    mkContact(1005, "", { FIRSTNAME: "Land", LASTNAME: "Line", LANDLINE_NUMBER: "+6581234567" }), // landline only (Singapore)
    mkContact(1006, "", { FIRSTNAME: "Ext", LASTNAME: "Id" }, "crm-ext-9001"), // ext_id only
    mkContact(1007, "legacy.phone@acme-demo.com", { FIRSTNAME: "Legacy", LASTNAME: "Phone", SMS: "0049-177-legacy" }), // unparseable legacy phone
  ];

  // --- ~53 generated contacts ---
  const gen: (Contact & { ext_id?: string })[] = [];
  for (let i = 0; i < 53; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const id = 1 + i;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@acme-demo.com`;
    const attrs: Record<string, any> = { FIRSTNAME: first, LASTNAME: last };
    if (i % 3 === 0) attrs.SMS = `+1415555${String(1000 + i).slice(-4)}`;
    gen.push(mkContact(id, email, attrs));
  }

  return [...edge, ...gen];
}
