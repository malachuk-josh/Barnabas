import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// API routes read the signed-in leader from the session cookie; tests choose who is signed in.
const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { POST as webhookRoute } from "@/app/api/stripe/webhook/route";
import { POST as giveRoute } from "@/app/api/s/give/route";
import { GET as onlineGet, POST as onlinePost } from "@/app/api/finance/online/route";
import { POST as registerRoute } from "@/app/api/register/[token]/route";
import { POST as importRoute } from "@/app/api/finance/import/route";
import { listAudit, listDrafts } from "@/lib/data/records";
import { addDays, today } from "@/lib/dates";
import { createEvent, eventsActor, HOLD_MINUTES, releaseExpired, setPayment } from "@/lib/events/service";
import { loadEvents } from "@/lib/events/store";
import { contributionStatement, donorKey } from "@/lib/finance/giving";
import { accountBalance } from "@/lib/finance/ledger";
import { setFundOnline, STRIPE_ACCOUNT_ID } from "@/lib/finance/online";
import { deleteGift } from "@/lib/finance/service";
import { loadBooks } from "@/lib/finance/store";
import { executeTool, type ToolContext } from "@/lib/engine/tools";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { loadPeople, updatePeople } from "@/lib/people/store";
import { giveTarget } from "@/lib/site/give";
import { coverFee, stripeStatus } from "@/lib/stripe/config";
import { giftSessionParams, returnOrigin } from "@/lib/stripe/checkout";
import { setStripePort, type PaymentFacts, type PayoutFacts, type StripePort } from "@/lib/stripe/client";
import { saveOnlineSettings } from "@/lib/stripe/store";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { useFixtureChurch } from "./fixtures";
import { freshStore } from "./helpers";

const SECRET = "whsec_testsecret0123456789abcdef";
const KEY = "sk_test_51FakeKeyForTestsOnly0000000000";

const pastor: Leader = { churchId: "demo", leaderId: "bbbb0001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const treasurer: Leader = { churchId: "demo", leaderId: "bbbb0002", name: "Sam", email: "sam@example.org", role: "Treasurer" };
const deacon: Leader = { churchId: "demo", leaderId: "bbbb0003", name: "Travis", email: "travis@example.org", role: "Deacon" };
const member: Leader = { churchId: "demo", leaderId: "bbbb0004", name: "Kim", email: "kim@example.org", role: "Kids director" };
const checkin: Leader = { churchId: "demo", leaderId: "bbbb0005", name: "Pat", email: "pat@example.org", role: "Check-in" };

/* ---------- A fake Stripe ---------- */

type Fake = StripePort & { sessions: { params: Parameters<StripePort["createCheckout"]>[0]; key: string }[]; payments: Map<string, PaymentFacts>; invoices: Map<string, string>; payouts: Map<string, PayoutFacts> };

function fakeStripe(): Fake {
  const sessions: Fake["sessions"] = [];
  const payments = new Map<string, PaymentFacts>();
  const invoices = new Map<string, string>();
  const payouts = new Map<string, PayoutFacts>();
  let n = 0;
  return {
    sessions,
    payments,
    invoices,
    payouts,
    async createCheckout(params, key) {
      sessions.push({ params, key });
      const id = `cs_test_${String(++n).padStart(12, "0")}`;
      return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
    },
    async paymentFacts(id) {
      return payments.get(id) ?? null;
    },
    async invoicePaymentIntent(id) {
      return invoices.get(id) ?? null;
    },
    async checkoutCustomer() {
      return "cus_test_1";
    },
    async portalSession() {
      return "https://billing.stripe.com/p/session/test_1";
    },
    async payoutFacts(id) {
      return payouts.get(id)!;
    },
    async recentPayouts() {
      return [...payouts.values()];
    },
  };
}

function payment(id: string, gross: number, extra: Partial<PaymentFacts> = {}): PaymentFacts {
  const fee = Math.round(gross * 0.022) + 30;
  return { paymentIntentId: id, chargeId: `ch_${id.slice(3)}`, gross, fee, net: gross - fee, method: "card", email: "giver@example.org", name: "Jordan Giver", created: Math.floor(Date.now() / 1000), ...extra };
}

/* ---------- Signed webhook deliveries ---------- */

let seq = 0;
function event(type: string, object: Record<string, unknown>, id = `evt_test_${++seq}`) {
  return { id, object: "event", api_version: "2026-09-30.endive", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null }, type, data: { object } };
}

/** Stripe's scheme: HMAC-SHA256 over "{timestamp}.{raw body}" with the endpoint secret, sent as t=...,v1=... */
function signature(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

function deliver(evt: object, opts: { secret?: string; tamper?: boolean; noSig?: boolean; t?: number } = {}) {
  const body = JSON.stringify(evt);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!opts.noSig) headers["stripe-signature"] = signature(body, opts.secret, opts.t);
  return webhookRoute(new Request("https://barnabas-three.vercel.app/api/stripe/webhook", { method: "POST", headers, body: opts.tamper ? body.replace("giver", "thief") : body }));
}

const giftSession = (pi: string, extra: Record<string, unknown> = {}) => ({
  id: `cs_test_${pi}`,
  object: "checkout.session",
  mode: "payment",
  payment_status: "paid",
  payment_intent: pi,
  customer_details: { email: "giver@example.org", name: "Jordan Giver" },
  metadata: { barnabas: "gift", church: "demo", fundId: "missions", frequency: "once", coveredFee: "0", intended: "10000" },
  ...extra,
});

let fake: Fake;

async function setup() {
  freshStore();
  useFixtureChurch();
  vi.stubEnv("STRIPE_SECRET_KEY", KEY);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  fake = fakeStripe();
  setStripePort(fake);
  for (const l of [pastor, treasurer, deacon, member, checkin]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
  await setLeaderRole("demo", treasurer.leaderId, "treasurer", "test");
  await setLeaderRole("demo", deacon.leaderId, "deacon", "test");
  await setLeaderRole("demo", checkin.leaderId, "checkin", "test");
  session.current = null;
}

afterEach(() => {
  vi.unstubAllEnvs();
  setStripePort(null);
  session.current = null;
});

const onlineGifts = async () => (await loadBooks("demo")).gifts.filter((g) => g.online);

/* ---------- Tests ---------- */

describe("Stripe connection and giveTarget", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports not connected, test mode or live, and never the key", () => {
    const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
    expect(stripeStatus(env({}))).toMatchObject({ connected: false, testMode: false, webhook: false });
    expect(stripeStatus(env({ STRIPE_SECRET_KEY: "pk_test_abcdefghijklmnop" }))).toMatchObject({ connected: false, keyLooksWrong: true });
    const test = stripeStatus(env({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: SECRET }));
    expect(test).toMatchObject({ connected: true, testMode: true, webhook: true });
    expect(JSON.stringify(test)).not.toContain("sk_test");
    expect(stripeStatus(env({ STRIPE_SECRET_KEY: "sk_live_51abcdefghijklmnopqrst" }))).toMatchObject({ connected: true, testMode: false });
  });

  it("switches the Give block from link or 'soon' to checkout when Stripe is connected", () => {
    expect(giveTarget({ give: { url: "", note: "" } }, false)).toEqual({ kind: "soon", note: undefined });
    expect(giveTarget({ give: { url: "https://give.example.org", note: "" } }, false)).toEqual({ kind: "link", href: "https://give.example.org", note: undefined });
    expect(giveTarget({ give: { url: "https://give.example.org", note: "Thank you" } }, true)).toEqual({ kind: "checkout", href: "/api/s/give", note: "Thank you" });
    vi.stubEnv("STRIPE_SECRET_KEY", KEY);
    expect(giveTarget({ give: { url: "", note: "" } }).kind).toBe("checkout");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(giveTarget({ give: { url: "", note: "" } }).kind).toBe("soon");
  });

  it("builds one-time and recurring Checkout sessions with the fee covered", () => {
    const ctx = { churchId: "demo", churchName: "MGBC", origin: "https://www.example.org", cfg: { feePercent: 2.9, feeFixedCents: 30 } };
    const once = giftSessionParams({ fundId: "missions", amount: 100_00, frequency: "once", coverFee: true, returnPath: "/give" }, { id: "missions", name: "Missions" }, ctx);
    const fee = coverFee(100_00, ctx.cfg);
    expect(fee).toBe(330); // (10000 + 30) / 0.971 = 10329.55 → 10330
    expect(once.mode).toBe("payment");
    expect(once.line_items![0].price_data!.unit_amount).toBe(100_00 + fee);
    expect(once.allowed_payment_method_types).toEqual(["card", "us_bank_account"]);
    expect(once.metadata).toMatchObject({ barnabas: "gift", fundId: "missions", coveredFee: String(fee) });
    expect(once.success_url).toBe("https://www.example.org/give?gift=thanks&session_id={CHECKOUT_SESSION_ID}");
    const biweekly = giftSessionParams({ fundId: "general", amount: 50_00, frequency: "biweekly", coverFee: false, returnPath: "/m/give" }, { id: "general", name: "General fund" }, ctx);
    expect(biweekly.mode).toBe("subscription");
    expect(biweekly.line_items![0].price_data!.recurring).toEqual({ interval: "week", interval_count: 2 });
    expect(biweekly.subscription_data!.metadata).toMatchObject({ barnabas: "gift", fundId: "general", frequency: "biweekly" });
    const monthly = giftSessionParams({ fundId: "general", amount: 50_00, frequency: "monthly", coverFee: false, returnPath: "/" }, { id: "general", name: "General fund" }, ctx);
    expect(monthly.line_items![0].price_data!.recurring).toEqual({ interval: "month", interval_count: 1 });
  });

  it("sends people back only to this app, the church's domain or localhost in development", () => {
    const req = (host: string) => new Request("https://x/api/s/give", { headers: { host } });
    const env = { APP_URL: "https://barnabas-three.vercel.app", CHURCH_SITE_HOST: "www.mgbc.org", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    expect(returnOrigin(req("www.mgbc.org"), env)).toBe("https://www.mgbc.org");
    expect(returnOrigin(req("barnabas-three.vercel.app"), env)).toBe("https://barnabas-three.vercel.app");
    expect(returnOrigin(req("evil.example.com"), env)).toBe("https://barnabas-three.vercel.app");
    expect(returnOrigin(req("localhost:3555"), { ...env, NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("http://localhost:3555");
  });
});

describe("the public give endpoint", () => {
  beforeEach(setup);

  const give = (body: Record<string, unknown>, ip = "203.0.113.5") => giveRoute(new Request("http://localhost:3555/api/s/give", { method: "POST", headers: { "content-type": "application/json", host: "localhost:3555", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

  it("only offers funds a treasurer opened, validates amounts, and returns Stripe's Checkout address", async () => {
    session.current = pastor; // the site isn't published in tests; a signed-in leader may try the draft
    let res = await give({ fundId: "missions", amount: 5000, frequency: "once" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/isn't open for online giving/);
    await setFundOnline(treasurer, "missions", true);
    res = await give({ fundId: "missions", amount: 50, frequency: "once" });
    expect((await res.json()).error).toMatch(/smallest online gift is \$1/);
    res = await give({ fundId: "missions", amount: 30_000_00, frequency: "once" });
    expect((await res.json()).error).toMatch(/up to \$25,000/);
    res = await give({ fundId: "missions", amount: 5000, frequency: "fortnightly" });
    expect(res.status).toBe(400);
    res = await give({ fundId: "missions", amount: 5000, frequency: "monthly", coverFee: true, returnPath: "//evil.example.com" });
    expect(res.status).toBe(400);
    res = await give({ fundId: "missions", amount: 5000, frequency: "monthly", coverFee: true, returnPath: "/m/give" });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(fake.sessions).toHaveLength(1);
    expect(fake.sessions[0].params.mode).toBe("subscription");
    expect(fake.sessions[0].params.success_url).toContain("http://localhost:3555/m/give?gift=thanks");
  });

  it("is closed while the site is unpublished (for the public), rate-limited, and quiet for bots", async () => {
    await setFundOnline(treasurer, "general", true);
    expect((await give({ fundId: "general", amount: 2000 })).status).toBe(404);
    session.current = pastor;
    expect((await give({ fundId: "general", amount: 2000, website: "spam" })).status).toBe(200);
    expect(fake.sessions).toHaveLength(0);
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await give({ fundId: "general", amount: 2000 }, "198.51.100.9")).status;
    expect(last).toBe(429);
  });

  it("says online giving isn't set up when Stripe isn't connected", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    setStripePort(null);
    session.current = pastor;
    expect((await give({ fundId: "general", amount: 2000 })).status).toBe(404);
  });
});

describe("the Stripe webhook", () => {
  beforeEach(setup);

  it("verifies the signature over the raw body and rejects anything else", async () => {
    fake.payments.set("pi_sig1", payment("pi_sig1", 100_00));
    const evt = event("checkout.session.completed", giftSession("pi_sig1"));
    expect((await deliver(evt, { noSig: true })).status).toBe(400);
    expect((await deliver(evt, { secret: "whsec_wrongsecret000000000000" })).status).toBe(400);
    expect((await deliver(evt, { tamper: true })).status).toBe(400);
    expect((await deliver(evt, { t: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400);
    expect(await onlineGifts()).toHaveLength(0);
    const ok = await deliver(evt);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ received: true, replay: false, outcome: "gift recorded; new person added for review" });
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await deliver(event("checkout.session.completed", giftSession("pi_sig1")))).status).toBe(503);
  });

  it("records a gift into Finance with its fee, and a replay never duplicates it", async () => {
    fake.payments.set("pi_g1", payment("pi_g1", 103_30, { fee: 257 }));
    const evt = event("checkout.session.completed", giftSession("pi_g1", { metadata: { barnabas: "gift", fundId: "missions", frequency: "once", coveredFee: "330" } }));
    await deliver(evt);
    const again = await deliver(evt);
    expect(await again.json()).toMatchObject({ replay: true });
    // The same payment under a new event id (Stripe resends, or async_payment_succeeded) is still one gift.
    await deliver(event("checkout.session.async_payment_succeeded", giftSession("pi_g1")));
    const gifts = await onlineGifts();
    expect(gifts).toHaveLength(1);
    const g = gifts[0];
    expect(g).toMatchObject({ amount: 103_30, fee: 257, net: 103_30 - 257, coveredFee: 330, fundId: "missions", method: "online", importKey: "stripe:pi_g1" });
    expect(g.online).toMatchObject({ provider: "stripe", paymentIntentId: "pi_g1", chargeId: "ch_g1", frequency: "once", testMode: true });
    const books = await loadBooks("demo");
    const stripe = books.chart.accounts.find((a) => a.id === STRIPE_ACCOUNT_ID)!;
    expect(stripe.bank).toBe(true);
    expect(accountBalance(stripe, books.transactions)).toBe(103_30 - 257);
    const feeTxn = books.transactions.find((t) => t.importKey === "stripe:pi_g1:fee")!;
    expect(feeTxn).toMatchObject({ direction: "out", source: "stripe", bankAccountId: STRIPE_ACCOUNT_ID });
    expect(feeTxn.lines[0]).toMatchObject({ accountId: "acct_5620", fundId: "missions", amount: 257 });
    // On the giver's statement, through the existing statement code.
    const statement = contributionStatement(books.gifts, books.chart.funds, donorKey(g), Number(g.date.slice(0, 4)))!;
    expect(statement.total).toBe(103_30);
    // Audited, and the audit names no giver.
    const audit = await listAudit({ ...pastor, leaderId: "stripe-webhook" });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["finance.online.gift"]));
    expect(JSON.stringify(audit)).not.toContain("Jordan");
    // Online gifts are changed in Stripe, not deleted by hand.
    await expect(deleteGift(treasurer, g.id)).rejects.toThrow(/Stripe dashboard/);
  });

  it("matches givers by email, adds a reviewed-later person otherwise, and never merges on a name", async () => {
    await updatePeople("demo", ["people"], (b) => {
      const base = { status: "member" as const, language: "en" as const, custom: {}, createdAt: 1, updatedAt: 1 };
      b.people.push({ id: "per_ruth", firstName: "Ruth", lastName: "Adeyemi", email: "Ruth@Example.org", ...base });
      b.people.push({ id: "per_jordan", firstName: "Jordan", lastName: "Giver", email: "jordan.old@example.org", ...base });
      b.people.push({ id: "per_s1", firstName: "Sam", lastName: "One", email: "shared@example.org", ...base });
      b.people.push({ id: "per_s2", firstName: "Sue", lastName: "One", email: "shared@example.org", ...base });
    });
    fake.payments.set("pi_m1", payment("pi_m1", 20_00, { email: "ruth@example.org", name: "R Adeyemi" }));
    fake.payments.set("pi_m2", payment("pi_m2", 30_00));
    fake.payments.set("pi_m3", payment("pi_m3", 40_00, { email: "shared@example.org", name: "S One" }));
    await deliver(event("checkout.session.completed", giftSession("pi_m1", { customer_details: { email: "ruth@example.org", name: "R Adeyemi" } })));
    await deliver(event("checkout.session.completed", giftSession("pi_m2")));
    await deliver(event("checkout.session.completed", giftSession("pi_m3", { customer_details: { email: "shared@example.org", name: "S One" } })));
    const gifts = await onlineGifts();
    expect(gifts.find((g) => g.importKey === "stripe:pi_m1")).toMatchObject({ personId: "per_ruth", donorName: "Ruth Adeyemi" });
    const jordan = gifts.find((g) => g.importKey === "stripe:pi_m2")!;
    expect(jordan.personId).toBeTruthy();
    expect(jordan.personId).not.toBe("per_jordan"); // same name, different email: not merged
    const shared = gifts.find((g) => g.importKey === "stripe:pi_m3")!;
    expect(shared.personId).toBeUndefined();
    expect(shared.donorName).toBe("S One");
    const people = (await loadPeople("demo")).people;
    const added = people.find((p) => p.id === jordan.personId)!;
    expect(added).toMatchObject({ firstName: "Jordan", lastName: "Giver", email: "giver@example.org", review: { reason: "online_giving", possibleMatchIds: ["per_jordan"] } });
    expect(people).toHaveLength(5);
    // A second gift from the new giver links to the person made the first time.
    fake.payments.set("pi_m4", payment("pi_m4", 10_00));
    await deliver(event("checkout.session.completed", giftSession("pi_m4")));
    expect((await onlineGifts()).find((g) => g.importKey === "stripe:pi_m4")!.personId).toBe(jordan.personId);
    expect((await loadPeople("demo")).people).toHaveLength(5);
  });

  it("waits for ACH to clear: records on async success, nothing on failure", async () => {
    fake.payments.set("pi_ach1", payment("pi_ach1", 250_00, { method: "us_bank_account", fee: 200 }));
    const pending = giftSession("pi_ach1", { payment_status: "unpaid" });
    const r = await deliver(event("checkout.session.completed", pending));
    expect((await r.json()).outcome).toMatch(/pending/);
    expect(await onlineGifts()).toHaveLength(0);
    await deliver(event("checkout.session.async_payment_succeeded", { ...pending, payment_status: "paid" }));
    const [g] = await onlineGifts();
    expect(g).toMatchObject({ method: "ach", amount: 250_00, fee: 200 });

    fake.payments.set("pi_ach2", payment("pi_ach2", 75_00, { method: "us_bank_account" }));
    await deliver(event("checkout.session.completed", giftSession("pi_ach2", { payment_status: "unpaid" })));
    const failed = await deliver(event("checkout.session.async_payment_failed", giftSession("pi_ach2", { payment_status: "unpaid" })));
    expect((await failed.json()).outcome).toMatch(/failed; nothing recorded/);
    expect(await onlineGifts()).toHaveLength(1);
  });

  it("records each recurring payment from invoice.paid, and skips the subscription's checkout", async () => {
    const sub = giftSession("pi_unused", { mode: "subscription", payment_intent: null, subscription: "sub_1", metadata: { barnabas: "gift", fundId: "general", frequency: "monthly", coveredFee: "0" } });
    expect((await (await deliver(event("checkout.session.completed", sub))).json()).outcome).toMatch(/recurring gift set up/);
    const invoice = (id: string) => ({ id, object: "invoice", amount_paid: 50_00, customer_email: "giver@example.org", customer_name: "Jordan Giver", parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: { barnabas: "gift", fundId: "general", frequency: "monthly", coveredFee: "0" } } } });
    for (const [inv, pi] of [["in_1", "pi_r1"], ["in_2", "pi_r2"]]) {
      fake.invoices.set(inv, pi);
      fake.payments.set(pi, payment(pi, 50_00));
      await deliver(event("invoice.paid", invoice(inv)));
    }
    await deliver(event("invoice.paid", invoice("in_2"))); // a resend under a new event id
    const gifts = await onlineGifts();
    expect(gifts).toHaveLength(2);
    expect(gifts.every((g) => g.online?.subscriptionId === "sub_1" && g.online.frequency === "monthly" && g.fundId === "general")).toBe(true);
    expect(gifts.map((g) => g.online?.invoiceId).sort()).toEqual(["in_1", "in_2"]);
    // Invoices that aren't Barnabas gifts are left alone.
    expect((await (await deliver(event("invoice.paid", { ...invoice("in_x"), parent: null }))).json()).outcome).toBe("ignored");
  });

  it("posts refunds as reversing entries, partial then full, without double-counting", async () => {
    fake.payments.set("pi_rf", payment("pi_rf", 100_00, { fee: 250 }));
    await deliver(event("checkout.session.completed", giftSession("pi_rf")));
    const charge = (refunded: number) => ({ id: "ch_rf", object: "charge", amount: 100_00, amount_refunded: refunded, refunded: refunded === 100_00, payment_intent: "pi_rf", created: Math.floor(Date.now() / 1000) });
    await deliver(event("charge.refunded", charge(40_00)));
    await deliver(event("charge.refunded", charge(40_00))); // resend
    let gifts = await onlineGifts();
    expect(gifts.filter((g) => g.reversalOf).map((g) => g.amount)).toEqual([-40_00]);
    await deliver(event("charge.refunded", charge(100_00)));
    gifts = await onlineGifts();
    const original = gifts.find((g) => !g.reversalOf)!;
    expect(gifts.filter((g) => g.reversalOf === original.id).map((g) => g.amount)).toEqual([-40_00, -60_00]);
    const books = await loadBooks("demo");
    const refunds = books.transactions.filter((t) => t.importKey?.startsWith("stripe-refund:"));
    expect(refunds.map((t) => [t.direction, t.lines[0].accountId, t.lines[0].amount])).toEqual([["out", "acct_4100", 40_00], ["out", "acct_4100", 60_00]]);
    const statement = contributionStatement(books.gifts, books.chart.funds, donorKey(original), Number(original.date.slice(0, 4)))!;
    expect(statement.total).toBe(0);
    const stripe = books.chart.accounts.find((a) => a.id === STRIPE_ACCOUNT_ID)!;
    expect(accountBalance(stripe, books.transactions)).toBe(-250); // Stripe keeps its fee on a refund
  });

  it("flags disputes, and reverses the gift only if the dispute is lost", async () => {
    fake.payments.set("pi_dp", payment("pi_dp", 80_00));
    await deliver(event("checkout.session.completed", giftSession("pi_dp")));
    const dispute = (status: string) => ({ id: "dp_1", object: "dispute", amount: 80_00, charge: "ch_dp", payment_intent: "pi_dp", status });
    await deliver(event("charge.dispute.created", dispute("needs_response")));
    expect((await onlineGifts())[0].disputed).toBe(true);
    await deliver(event("charge.dispute.closed", dispute("lost")));
    expect((await onlineGifts()).filter((g) => g.reversalOf).map((g) => g.amount)).toEqual([-80_00]);
  });

  it("records payouts with gross and fees, and flags the matching bank deposit so it isn't counted twice", async () => {
    fake.payouts.set("po_1", { id: "po_1", amount: 195_43, arrivalDate: today(), status: "paid", gross: 200_00, fees: 4_57, refunds: 0, count: 2, automatic: true });
    const r = await deliver(event("payout.paid", { id: "po_1", object: "payout", amount: 195_43 }));
    expect((await r.json()).outcome).toBe("payout recorded");
    await deliver(event("payout.paid", { id: "po_1", object: "payout", amount: 195_43 }));
    const books = await loadBooks("demo");
    const payouts = books.transactions.filter((t) => t.importKey === "stripe-payout:po_1");
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ bankAccountId: "acct_1000", direction: "in", lines: [expect.objectContaining({ accountId: STRIPE_ACCOUNT_ID, amount: 195_43 })] });
    session.current = treasurer;
    const csv = `Date,Description,Amount\n${addDays(today(), 1).slice(5, 7)}/${addDays(today(), 1).slice(8, 10)}/${addDays(today(), 1).slice(0, 4)},STRIPE TRANSFER,195.43\n`;
    const res = await importRoute(new Request("http://x/api/finance/import", { method: "POST", body: JSON.stringify({ action: "preview", csv, bankAccountId: "acct_1000" }) }));
    const preview = await res.json();
    expect(preview.rows[0]).toMatchObject({ payoutDeposit: true, giftDeposit: false, duplicate: true });
    const view = await (await onlineGet()).json();
    expect(view.online.payouts[0]).toMatchObject({ id: "po_1", gross: 200_00, fees: 4_57, amount: 195_43, inBooks: true });
  });

  it("drafts a thank-you for a leader to approve when turned on, and never sends it", async () => {
    await saveOnlineSettings("demo", { thankYou: { on: true, leaderId: treasurer.leaderId, leaderName: treasurer.name } });
    fake.payments.set("pi_ty", payment("pi_ty", 60_00));
    await deliver(event("checkout.session.completed", giftSession("pi_ty")));
    const drafts = await listDrafts(treasurer);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ status: "needs_review", channel: "email" });
    expect(drafts[0].baseText).toContain("$60.00");
    expect(drafts[0].baseText).toContain("“Every man according as he purposeth in his heart, so let him give; not grudgingly, or of necessity: for God loveth a cheerful giver.” (2 Corinthians 9:7, KJV)");
    expect(drafts[0].recipients[0].email).toBe("giver@example.org");
  });
});

describe("paid event registration", () => {
  beforeEach(setup);

  async function paidEvent(capacity = 2) {
    return createEvent(await eventsActor(pastor), { title: "Reverb retreat", date: addDays(today(), 14), location: "Camp", capacity, waitlist: true, maxParty: 3, priceCents: 67_00, fields: [] });
  }
  const reg = (token: string, body: Record<string, unknown>) =>
    registerRoute(new Request(`http://localhost:3555/api/register/${token}`, { method: "POST", headers: { host: "localhost:3555", "x-forwarded-for": `192.0.2.${++seq % 250}` }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) });

  it("sends the registrant to Checkout for price x party size; the webhook marks it paid and books the income", async () => {
    const ev = await paidEvent(5);
    const res = await reg(ev.token, { name: "Avery Test", email: "avery@example.org", partySize: 2 });
    const json = await res.json();
    expect(json).toMatchObject({ status: "registered", paymentDue: 134_00, holdMinutes: HOLD_MINUTES });
    expect(json.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const params = fake.sessions[0].params;
    expect(params.line_items![0]).toMatchObject({ quantity: 2, price_data: { unit_amount: 67_00 } });
    expect(params.customer_email).toBe("avery@example.org");
    expect(params.expires_at! - Math.floor(Date.now() / 1000)).toBeGreaterThan(59 * 60);
    const r0 = (await loadEvents("demo")).registrations[0];
    expect(r0.payment.checkout).toMatchObject({ state: "open", sessionId: "cs_test_000000000001" });

    fake.payments.set("pi_ev1", payment("pi_ev1", 134_00, { fee: 324 }));
    await deliver(event("checkout.session.completed", { id: "cs_test_000000000001", object: "checkout.session", mode: "payment", payment_status: "paid", payment_intent: "pi_ev1", metadata: params.metadata }));
    const r1 = (await loadEvents("demo")).registrations[0];
    expect(r1.payment).toMatchObject({ status: "paid", paymentIntentId: "pi_ev1", checkout: { state: "paid" } });
    const books = await loadBooks("demo");
    expect(books.transactions.find((t) => t.importKey === "stripe:pi_ev1")).toMatchObject({ direction: "in", lines: [expect.objectContaining({ accountId: "acct_4600", amount: 134_00 })] });
    expect(books.gifts.some((g) => g.importKey === "stripe:pi_ev1")).toBe(false); // not a gift, not on a statement
  });

  it("releases an unpaid spot after 60 minutes and moves the waitlist up; bank payments in progress keep theirs", async () => {
    const ev = await paidEvent(2);
    await reg(ev.token, { name: "Avery Test", email: "a@example.org", partySize: 1 });
    await reg(ev.token, { name: "Blake Test", email: "b@example.org", partySize: 1 });
    const waiting = await (await reg(ev.token, { name: "Cam Test", email: "c@example.org", partySize: 1 })).json();
    expect(waiting.status).toBe("waitlisted");
    expect(waiting.checkoutUrl).toBeUndefined();
    const [a, b] = (await loadEvents("demo")).registrations;
    // Blake's bank payment is processing: the spot is kept.
    await deliver(event("checkout.session.completed", { id: b.payment.checkout!.sessionId, object: "checkout.session", mode: "payment", payment_status: "unpaid", payment_intent: "pi_b", metadata: { barnabas: "event", registrationId: b.id } }));
    const later = Date.now() + (HOLD_MINUTES + 1) * 60_000;
    const released = await releaseExpired("demo", later);
    expect(released.map((r) => r.id)).toEqual([a.id]);
    const after = (await loadEvents("demo")).registrations;
    expect(after.find((r) => r.id === a.id)).toMatchObject({ status: "cancelled", releasedAt: expect.any(Number) });
    expect(after.find((r) => r.id === b.id)!.status).toBe("registered");
    expect(after.find((r) => r.name === "Cam Test")!.status).toBe("registered");
    // A failed bank payment releases too.
    await deliver(event("checkout.session.async_payment_failed", { id: b.payment.checkout!.sessionId, object: "checkout.session", metadata: { barnabas: "event", registrationId: b.id } }));
    expect((await loadEvents("demo")).registrations.find((r) => r.id === b.id)!.status).toBe("cancelled");
  });

  it("an expired Checkout session releases the hold, and 'mark paid at the door' still works", async () => {
    const ev = await paidEvent(3);
    await reg(ev.token, { name: "Avery Test", email: "a@example.org" });
    await reg(ev.token, { name: "Blake Test", email: "b@example.org" });
    const [a, b] = (await loadEvents("demo")).registrations;
    await deliver(event("checkout.session.expired", { id: a.payment.checkout!.sessionId, object: "checkout.session", metadata: { barnabas: "event", registrationId: a.id } }));
    expect((await loadEvents("demo")).registrations.find((r) => r.id === a.id)!.status).toBe("cancelled");
    const paid = await setPayment(await eventsActor(pastor), b.id, "paid");
    expect(paid.payment.status).toBe("paid");
    expect(await releaseExpired("demo", Date.now() + 2 * 60 * 60_000)).toEqual([]);
  });

  it("without Stripe, a paid registration is simply due at the door", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    setStripePort(null);
    const ev = await paidEvent(3);
    const json = await (await reg(ev.token, { name: "Avery Test", email: "a@example.org" })).json();
    expect(json).toEqual({ ok: true, status: "registered", paymentDue: 67_00 });
  });
});

describe("online giving permissions", () => {
  beforeEach(setup);

  const post = (body: unknown) => onlinePost(new Request("http://x/api/finance/online", { method: "POST", body: JSON.stringify(body) }));

  it("lets pastors and treasurers open funds; deacons see totals only; others and check-in get nothing", async () => {
    session.current = treasurer;
    expect((await post({ action: "fund-online", fundId: "missions", online: true })).status).toBe(200);
    expect((await loadBooks("demo")).chart.funds.find((f) => f.id === "missions")!.online).toBe(true);
    session.current = pastor;
    expect((await post({ action: "fund-online", fundId: "nope", online: true })).status).toBe(400);
    expect((await post({ action: "refund", id: "x" })).status).toBe(400); // there is no refund action

    session.current = deacon;
    expect((await post({ action: "fund-online", fundId: "general", online: true })).status).toBe(403);
    const view = await (await onlineGet()).json();
    expect(view.online.year).toBeDefined();
    expect(view.online.gifts).toBeNull();
    expect(view.online.review).toBeNull();

    for (const l of [member, checkin]) {
      session.current = l;
      expect((await onlineGet()).status).toBe(403);
      expect((await post({ action: "thank-you", on: true })).status).toBe(403);
    }
    expect((await listAudit(treasurer)).map((a) => a.action)).toContain("finance.fund.online");
  });

  it("gives Barnabas a read-only, aggregates-only online giving tool", async () => {
    fake.payments.set("pi_t1", payment("pi_t1", 100_00, { fee: 250 }));
    await deliver(event("checkout.session.completed", giftSession("pi_t1")));
    const ctx = async (leader: Leader): Promise<ToolContext> => {
      const m: ConversationMeta = { id: `conv_${leader.leaderId}`, title: "t", mode: "voice", offRecord: false, createdAt: 1, updatedAt: 1, context: "", turns: 0 };
      await createConversation(leader, m);
      return { leader, meta: m, turnStartedAt: Date.now(), lastUserText: "How much came in online?" };
    };
    const r = await executeTool("online_giving_summary", { period: "this_year" }, await ctx(deacon));
    expect(r.isError).toBeFalsy();
    const text = JSON.stringify(r);
    expect(text).toContain("$100");
    expect(text).toContain("$2.50");
    expect(text).not.toContain("Jordan");
    expect(text).toContain("test mode");
    const denied = await executeTool("online_giving_summary", {}, await ctx(member));
    expect(denied.isError).toBe(true);
  });
});
