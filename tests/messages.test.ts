import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Leader } from "@/lib/auth/session";

const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { getDraft, saveDraft, type Draft } from "@/lib/data/records";
import { messagingStatus } from "@/lib/messages/config";
import { canSendDraft } from "@/lib/messages/permissions";
import { maskAddress, normalizePhone } from "@/lib/messages/phone";
import { applyInboundSms, applyResendEvent, applyTwilioCallback, MessagingError, sendApprovedDraft, setMessagingFetch } from "@/lib/messages/service";
import { svixSignature, twilioSignature, validSvix, validTwilioSignature } from "@/lib/messages/signatures";
import { getDelivery, listDeliveries, optOuts, RATE_LIMITS } from "@/lib/messages/store";
import { readUnsubscribeToken, unsubscribeToken } from "@/lib/messages/unsubscribe";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { POST as twilioStatusRoute } from "@/app/api/messages/twilio/status/route";
import { POST as resendRoute } from "@/app/api/messages/resend/route";
import { POST as draftRoute } from "@/app/api/drafts/[id]/route";
import { GET as unsubscribeGet, POST as unsubscribePost } from "@/app/api/messages/unsubscribe/route";
import { useFixtureChurch } from "./fixtures";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "mmmm0001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const deacon: Leader = { churchId: "demo", leaderId: "mmmm0002", name: "Deacon Test", email: "deacon@example.org", role: "Deacon" };
const plain: Leader = { churchId: "demo", leaderId: "mmmm0003", name: "Lee Leader", email: "lee@example.org", role: "Group leader" };

const ENV = { TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tw-secret-token", TWILIO_FROM_NUMBER: "+14135550100", RESEND_API_KEY: "re_test", RESEND_FROM: "Church <office@example.org>", RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from("svix-test-secret").toString("base64")}`, APP_URL: "https://barnabas.example.org" };

type Call = { url: string; init: RequestInit };
function mockFetch(respond: (call: Call, n: number) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const r = respond(call, calls.length);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  setMessagingFetch(f as unknown as typeof fetch);
  return calls;
}

function draft(over: Partial<Draft> = {}): Draft {
  return {
    id: `draft_${Math.random().toString(36).slice(2)}`,
    leaderId: pastor.leaderId,
    conversationId: "test",
    channel: "sms",
    kind: "general",
    baseText: "See you Sunday!",
    recipients: [
      { personId: "p01", name: "Sarah Kim", language: "en", text: "See you Sunday!", phone: "(413) 555-0101" },
      { personId: "p02", name: "Marcus Bell", language: "en", text: "See you Sunday!", phone: "413.555.0102" },
    ],
    status: "needs_review",
    createdAt: Date.now(),
    ...over,
  };
}

beforeEach(async () => {
  freshStore();
  useFixtureChurch();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  for (const l of [pastor, deacon, plain]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
  await setLeaderRole("demo", deacon.leaderId, "deacon", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  setMessagingFetch(undefined);
  session.current = null;
});

describe("webhook signatures", () => {
  it("matches Twilio's documented example and rejects tampering", () => {
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    expect(twilioSignature("12345", url, params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(validTwilioSignature("12345", url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(true);
    expect(validTwilioSignature("12345", url, { ...params, Digits: "9999" }, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(false);
    expect(validTwilioSignature("wrong", url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(false);
    expect(validTwilioSignature("12345", url, params, null)).toBe(false);
  });

  it("verifies svix signatures, refusing a changed body, a wrong secret and an old timestamp", () => {
    const secret = ENV.RESEND_WEBHOOK_SECRET;
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1" } });
    const now = 1_800_000_000;
    const sig = svixSignature(secret, "msg_1", String(now), body);
    // Independent computation of the svix scheme.
    const expected = createHmac("sha256", Buffer.from("svix-test-secret")).update(`msg_1.${now}.${body}`).digest("base64");
    expect(sig).toBe(expected);
    const headers = { id: "msg_1", timestamp: String(now), signature: `v1,bogus v1,${sig}` };
    expect(validSvix(secret, headers, body, now)).toBe(true);
    expect(validSvix(secret, headers, body.replace("delivered", "bounced"), now)).toBe(false);
    expect(validSvix(`whsec_${Buffer.from("other").toString("base64")}`, headers, body, now)).toBe(false);
    expect(validSvix(secret, headers, body, now + 600)).toBe(false);
    expect(validSvix(undefined, headers, body, now)).toBe(false);
  });

  it("the Twilio status route refuses unsigned requests and accepts signed ones", async () => {
    const bad = await twilioStatusRoute(new Request("https://barnabas.example.org/api/messages/twilio/status?c=demo", { method: "POST", body: "MessageSid=SM1&MessageStatus=delivered", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": "nope" } }));
    expect(bad.status).toBe(403);
    const url = "https://barnabas.example.org/api/messages/twilio/status?c=demo";
    const params = { MessageSid: "SM_unknown", MessageStatus: "delivered" };
    const good = await twilioStatusRoute(new Request(url, { method: "POST", body: new URLSearchParams(params).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": twilioSignature(ENV.TWILIO_AUTH_TOKEN, url, params) } }));
    expect(good.status).toBe(204);
  });

  it("the Resend route refuses an unsigned event", async () => {
    const res = await resendRoute(new Request("https://x/api/messages/resend", { method: "POST", body: "{}", headers: { "svix-id": "a", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,abc" } }));
    expect(res.status).toBe(403);
  });
});

describe("sending approved drafts", () => {
  it("shows exactly what's missing when keys aren't set, and sends nothing", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const calls = mockFetch(() => ({ body: {} }));
    const d = draft();
    await saveDraft(pastor, d);
    const err = await sendApprovedDraft(pastor, d.id).catch((e) => e);
    expect(err).toBeInstanceOf(MessagingError);
    expect(err.code).toBe("not_configured");
    expect(err.missing).toEqual(["TWILIO_AUTH_TOKEN"]);
    expect(calls).toHaveLength(0);
    expect(messagingStatus().email.configured).toBe(true);
    expect(JSON.stringify(messagingStatus())).not.toContain("re_test");
  });

  it("sends each recipient once with a per-recipient idempotency key, and never twice", async () => {
    const calls = mockFetch((_c, n) => ({ status: 201, body: { sid: `SM${n}`, status: "queued" } }));
    const d = draft();
    await saveDraft(pastor, d);
    const r = await sendApprovedDraft(pastor, d.id);
    expect(r.sent).toBe(2);
    expect(calls).toHaveLength(2);
    const keys = calls.map((c) => (c.init.headers as Record<string, string>)["I-Twilio-Idempotency-Token"]);
    expect(new Set(keys).size).toBe(2);
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get("To")).toBe(normalizePhone("(413) 555-0101"));
    expect(form.get("From")).toBe("+14135550100");
    expect(form.get("StatusCallback")).toBe("https://barnabas.example.org/api/messages/twilio/status?c=demo");
    expect((await getDraft(pastor, d.id))?.status).toBe("sent");
    await expect(sendApprovedDraft(pastor, d.id)).rejects.toThrow(/already sent/);
    expect(calls).toHaveLength(2);
  });

  it("a retry after a failure only sends to the people who didn't get it", async () => {
    let fail = true;
    const calls = mockFetch((c) => {
      const to = new URLSearchParams(String(c.init.body)).get("To");
      if (fail && to?.endsWith("0102")) return { status: 503, body: { code: 20500, message: "down" } };
      return { status: 201, body: { sid: `SM_${to}`, status: "queued" } };
    });
    const d = draft();
    await saveDraft(pastor, d);
    const first = await sendApprovedDraft(pastor, d.id);
    expect(first.sent).toBe(1);
    expect(first.failed).toBe(1);
    expect(first.draft.status).toBe("partly_sent");
    fail = false;
    const second = await sendApprovedDraft(pastor, d.id);
    expect(second.sent).toBe(1);
    expect(second.skipped).toBe(1);
    expect(second.draft.status).toBe("sent");
    expect(calls).toHaveLength(3);
  });

  it("honors Twilio 21610 (STOP): records the opt-out and skips that number afterwards", async () => {
    const calls = mockFetch((c) => {
      const to = new URLSearchParams(String(c.init.body)).get("To");
      return to?.endsWith("0101") ? { status: 400, body: { code: 21610, message: "Attempt to send to unsubscribed recipient" } } : { status: 201, body: { sid: "SM9", status: "queued" } };
    });
    const d = draft();
    await saveDraft(pastor, d);
    const r = await sendApprovedDraft(pastor, d.id);
    expect(r.optedOut).toBe(1);
    expect((await optOuts("demo")).phones.has(normalizePhone("(413) 555-0101")!)).toBe(true);
    const again = draft();
    await saveDraft(pastor, again);
    const r2 = await sendApprovedDraft(pastor, again.id);
    expect(r2.optedOut).toBe(1);
    expect(r2.sent).toBe(1);
    expect(calls).toHaveLength(3); // the opted-out number wasn't tried again
  });

  it("inbound STOP and START keep the do-not-text list", async () => {
    expect(await applyInboundSms("demo", { Body: " Stop ", From: "+14135550199" })).toBe("opted_out");
    expect((await optOuts("demo")).phones.has("+14135550199")).toBe(true);
    expect(await applyInboundSms("demo", { Body: "START", From: "+14135550199" })).toBe("opted_in");
    expect((await optOuts("demo")).phones.has("+14135550199")).toBe(false);
    expect(await applyInboundSms("demo", { Body: "Thanks!", From: "+14135550199" })).toBe("ignored");
  });

  it("records people with no number on file without calling Twilio", async () => {
    const calls = mockFetch(() => ({ status: 201, body: { sid: "SM1" } }));
    const d = draft({ recipients: [{ personId: "p19", name: "Aaron Malachuk", language: "en", text: "Thank you" }] });
    await saveDraft(pastor, d);
    const r = await sendApprovedDraft(pastor, d.id);
    expect(r.noContact).toBe(1);
    expect(r.draft.status).toBe("failed");
    expect(calls).toHaveLength(0);
  });

  it("rate-limits a church's sending", async () => {
    mockFetch((_c, n) => ({ status: 201, body: { sid: `SM${n}` } }));
    const many = Array.from({ length: RATE_LIMITS.perMinute + 1 }, (_, i) => ({ personId: `x${i}`, name: `Test ${i}`, language: "en" as const, text: "hi", phone: `+1413555${String(1000 + i).padStart(4, "0")}` }));
    const d = draft({ recipients: many });
    await saveDraft(pastor, d);
    await expect(sendApprovedDraft(pastor, d.id)).rejects.toMatchObject({ code: "rate_limited" });
    expect((await getDraft(pastor, d.id))?.status).toBe("needs_review");
  });

  it("only pastors and staff send; deacons send care follow-ups; leaders can't", async () => {
    expect(canSendDraft({ role: "staff", admin: false }, { kind: "general" })).toBe(true);
    expect(canSendDraft({ role: "deacon", admin: false }, { kind: "care" })).toBe(true);
    expect(canSendDraft({ role: "deacon", admin: false }, { kind: "serve" })).toBe(false);
    expect(canSendDraft({ role: "treasurer", admin: false }, { kind: "care" })).toBe(false);
    expect(canSendDraft({ role: "leader", admin: true }, { kind: "general" })).toBe(false);
    const calls = mockFetch(() => ({ status: 201, body: { sid: "SM1" } }));
    const d = draft({ leaderId: plain.leaderId });
    await saveDraft(plain, d);
    await expect(sendApprovedDraft(plain, d.id)).rejects.toMatchObject({ code: "forbidden" });
    const general = draft({ leaderId: deacon.leaderId });
    await saveDraft(deacon, general);
    await expect(sendApprovedDraft(deacon, general.id)).rejects.toMatchObject({ code: "forbidden" });
    const care = draft({ leaderId: deacon.leaderId, kind: "care", recipients: [{ personId: "g1", name: "Guest Test", language: "en", text: "Thanks for visiting", phone: "413-555-0177" }] });
    await saveDraft(deacon, care);
    expect((await sendApprovedDraft(deacon, care.id)).sent).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("the Send route needs an explicit confirmation for that draft", async () => {
    mockFetch(() => ({ status: 201, body: { sid: "SM1" } }));
    const d = draft();
    await saveDraft(pastor, d);
    session.current = pastor;
    const params = { params: Promise.resolve({ id: d.id }) };
    const unconfirmed = await draftRoute(new Request("https://x/api/drafts/x", { method: "POST", body: JSON.stringify({ action: "send" }) }), params);
    expect(unconfirmed.status).toBe(400);
    expect((await getDraft(pastor, d.id))?.status).toBe("needs_review");
    const ok = await draftRoute(new Request("https://x/api/drafts/x", { method: "POST", body: JSON.stringify({ action: "send", confirm: true }) }), { params: Promise.resolve({ id: d.id }) });
    expect(ok.status).toBe(200);
    const json = await ok.json();
    expect(json.results[0].to).toMatch(/^•••\d{4}$/);
    expect(JSON.stringify(json)).not.toContain("tw-secret-token");
  });
});

describe("email", () => {
  it("adds an unsubscribe link and List-Unsubscribe headers", async () => {
    const calls = mockFetch(() => ({ body: { id: "em_1" } }));
    const d = draft({ channel: "email", subject: "Hello", recipients: [{ personId: "p01", name: "Sarah Kim", language: "en", text: "Hi Sarah" }] });
    await saveDraft(pastor, d);
    await sendApprovedDraft(pastor, d.id);
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^[0-9a-f]{40}$/);
    expect(body.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/barnabas\.example\.org\/api\/messages\/unsubscribe\?t=/);
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(body.html).toContain("Unsubscribe");
    expect(body.text).toContain("Unsubscribe:");
  });

  it("unsubscribe tokens are signed, and one-click unsubscribing stops further email", async () => {
    const token = unsubscribeToken("demo", "Sarah.p01@example.org");
    expect(readUnsubscribeToken(token)).toEqual({ churchId: "demo", email: "sarah.p01@example.org" });
    expect(readUnsubscribeToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    const page = await unsubscribeGet(new Request(`https://x/api/messages/unsubscribe?t=${encodeURIComponent(token)}`));
    expect(await page.text()).toContain("<form");
    expect((await optOuts("demo")).emails.size).toBe(0); // opening the link alone doesn't unsubscribe
    const res = await unsubscribePost(new Request(`https://x/api/messages/unsubscribe?t=${encodeURIComponent(token)}`, { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).toBe(200);
    expect((await optOuts("demo")).emails.has("sarah.p01@example.org")).toBe(true);
    const calls = mockFetch(() => ({ body: { id: "em_2" } }));
    const d = draft({ channel: "email", recipients: [{ personId: "p01", name: "Sarah Kim", language: "en", text: "Hi" }] });
    await saveDraft(pastor, d);
    expect((await sendApprovedDraft(pastor, d.id)).optedOut).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it("delivery webhooks update the send log and never move a status backwards; bounces stop email", async () => {
    mockFetch(() => ({ body: { id: "em_3" } }));
    const d = draft({ channel: "email", recipients: [{ personId: "p02", name: "Marcus Bell", language: "en", text: "Hi" }] });
    await saveDraft(pastor, d);
    const r = await sendApprovedDraft(pastor, d.id);
    const id = r.deliveries[0].id;
    await applyResendEvent({ type: "email.delivered", data: { email_id: "em_3" } });
    await applyResendEvent({ type: "email.sent", data: { email_id: "em_3" } });
    expect((await getDelivery("demo", id))?.status).toBe("delivered");
    await applyResendEvent({ type: "email.bounced", data: { email_id: "em_3", bounce: { type: "Permanent" } } });
    expect((await getDelivery("demo", id))?.status).toBe("bounced");
    expect((await optOuts("demo")).emails.has("marcus.p02@example.org")).toBe(true);
  });

  it("Twilio callbacks mark delivered, and an error 21610 adds the number to do-not-text", async () => {
    mockFetch((_c, n) => ({ status: 201, body: { sid: `SMcb${n}`, status: "queued" } }));
    const d = draft();
    await saveDraft(pastor, d);
    await sendApprovedDraft(pastor, d.id);
    await applyTwilioCallback({ MessageSid: "SMcb1", MessageStatus: "delivered" });
    await applyTwilioCallback({ MessageSid: "SMcb1", MessageStatus: "sent" });
    await applyTwilioCallback({ MessageSid: "SMcb2", MessageStatus: "failed", ErrorCode: "21610" });
    const log = await listDeliveries("demo");
    expect(log.map((x) => x.status).sort()).toEqual(["delivered", "opted_out"]);
    expect((await optOuts("demo")).phones.size).toBe(1);
    expect(maskAddress("+14135550142")).toBe("•••0142");
  });
});
