import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// Routes read the signed-in leader from the session cookie and the path from the middleware's header.
const session = vi.hoisted(() => ({ current: null as Leader | null, path: "" }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-barnabas-path": session.path }),
  cookies: async () => ({ get: () => undefined }),
}));

// The push service: every send is recorded; a test can make an endpoint answer 410 Gone.
const push = vi.hoisted(() => ({ sent: [] as { endpoint: string; payload: Record<string, string> }[], gone: new Set<string>() }));
vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (push.gone.has(sub.endpoint)) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      push.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      return { statusCode: 201 };
    }),
  },
}));

import { POST as subscribeRoute, DELETE as unsubscribeRoute } from "@/app/api/push/subscription/route";
import { POST as testRoute } from "@/app/api/push/test/route";
import { GET as cronRoute } from "@/app/api/cron/notify/route";
import { PATCH as profilePatch, PUT as profilePut } from "@/app/api/profile/route";
import { checkinMayUse } from "@/lib/auth/roles";
import { careActor, openCase } from "@/lib/care/service";
import { leaderMemberId } from "@/lib/care/team";
import { listAudit } from "@/lib/data/records";
import { addDays, lastSunday, today } from "@/lib/dates";
import { briefingPayload, leadersAtHour, localTime, runMorningBriefing } from "@/lib/notifications/briefing";
import { checkedInPayload, checkedOutPayload, firstName, needAssignedPayload } from "@/lib/notifications/notify";
import { checkInChildren, checkOutChildren, kidsActor, saveHousehold } from "@/lib/kids/service";
import { notifyLeaders } from "@/lib/notifications/send";
import { listSubscriptions, MAX_DEVICES } from "@/lib/notifications/subscriptions";
import { defaultNotifications, typesFor } from "@/lib/notifications/types";
import { ensureProfile, getProfile, saveProfile } from "@/lib/profile";
import { addVolunteer, requestSwap, serveActor, signUp } from "@/lib/serve/service";
import { submitContact, submitPrayer } from "@/lib/site/public";
import { recordSignIn, setLeaderRole } from "@/lib/team";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import { freshStore } from "./helpers";

const pastor: Leader = { churchId: "demo", leaderId: "nt000001", name: "Pastor Dana", email: "dana@example.org", role: "Associate pastor" };
const pastor2: Leader = { churchId: "demo", leaderId: "nt000002", name: "Pastor Ruth Imani", email: "ruth@example.org", role: "Pastor" };
const staff: Leader = { churchId: "demo", leaderId: "nt000003", name: "Kim Staff", email: "kim@example.org", role: "Office" };
const member: Leader = { churchId: "demo", leaderId: "nt000004", name: "Lee Leader", email: "lee@example.org", role: "Small group leader" };
const checkin: Leader = { churchId: "demo", leaderId: "nt000005", name: "Cam Checkin", email: "cam@example.org", role: "Check-in" };
const member2: Leader = { churchId: "demo", leaderId: "nt000006", name: "Casey Volunteer", email: "casey@example.org", role: "Tech" };

const ENV = { VAPID_PUBLIC_KEY: "BN4-i-wzKBXKcmr3U4GpIbS5X06bzorlt3kpz6kJSNqJduv61uyfERKCrnIb6ueDYx2yi9mDVyCodlXvabVuyY0", VAPID_PRIVATE_KEY: "NhG43LLimaWyjPnjHTql3GjylhybXsi-h_Co4wZ8lA0", VAPID_SUBJECT: "mailto:office@example.org", CRON_SECRET: "cron-secret-for-tests-0123456789" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterAll(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function setupTeam() {
  freshStore();
  push.sent = [];
  push.gone = new Set();
  for (const l of [pastor, pastor2, staff, member, checkin, member2]) await recordSignIn(l);
  await setLeaderRole("demo", pastor.leaderId, "pastor", "test");
  await setLeaderRole("demo", pastor2.leaderId, "pastor", "test");
  await setLeaderRole("demo", staff.leaderId, "staff", "test");
  await setLeaderRole("demo", checkin.leaderId, "checkin", "test");
}

let n = 0;
const sub = (i = n++) => ({ endpoint: `https://push.example.com/send/device-${i}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });
const json = (method: string, body: unknown) => new Request("http://localhost/api/push/subscription", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const as = (l: Leader, path = "/api/push/subscription") => {
  session.current = l;
  session.path = path;
};
/** Notifications are sent after the response; wait for the background work. */
const settle = () => new Promise((r) => setTimeout(r, 30));
const sentTo = (endpointPart: string) => push.sent.filter((s) => s.endpoint.includes(endpointPart));

async function subscribe(l: Leader, s = sub()) {
  as(l);
  const res = await subscribeRoute(json("POST", { subscription: s }));
  expect(res.status).toBe(200);
  return s;
}

/* ---------- Profile defaults ---------- */

describe("notification settings in the profile", () => {
  beforeEach(() => setupTeam());

  it("are on by default, every type included", async () => {
    const p = await ensureProfile(pastor);
    expect(p.notifications.enabled).toBe(true);
    expect(Object.values(p.notifications.types).every(Boolean)).toBe(true);
  });

  it("give profiles saved before the setting existed the defaults, and new types start on", async () => {
    const p = await ensureProfile(pastor);
    const { notifications: _drop, ...old } = p;
    await saveProfile(pastor, old as typeof p);
    expect((await getProfile(pastor)).notifications).toEqual(defaultNotifications());
    await saveProfile(pastor, { ...p, notifications: { enabled: false, types: { serving: false } } as never });
    const merged = (await getProfile(pastor)).notifications;
    expect(merged.enabled).toBe(false);
    expect(merged.types.serving).toBe(false);
    expect(merged.types.briefing).toBe(true);
  });

  it("are changed with PATCH /api/profile, validated, and kept when the rest of the profile is saved", async () => {
    as(pastor, "/api/profile");
    const patch = (body: unknown) => profilePatch(new Request("http://localhost/api/profile", { method: "PATCH", body: JSON.stringify(body) }));
    expect((await patch({ notifications: { types: { nonsense: true } } })).status).toBe(400);
    expect((await patch({ notifications: { enabled: "yes" } })).status).toBe(400);
    const res = await patch({ notifications: { types: { events: false } } });
    expect(res.status).toBe(200);
    expect((await res.json()).notifications.types.events).toBe(false);
    const p = await getProfile(pastor);
    const put = await profilePut(new Request("http://localhost/api/profile", { method: "PUT", body: JSON.stringify({ name: p.name, preferredName: p.preferredName, role: p.role, ministries: [], timezone: p.timezone, replyLanguage: "en", voice: p.voice, pronunciations: [], about: "" }) }));
    expect(put.status).toBe(200);
    expect((await getProfile(pastor)).notifications.types.events).toBe(false);
  });
});

/* ---------- Subscriptions API ---------- */

describe("push subscription API", () => {
  beforeEach(() => setupTeam());

  it("validates the subscription", async () => {
    as(pastor);
    expect((await subscribeRoute(json("POST", { subscription: { endpoint: "http://insecure.example.com/x", keys: sub().keys } }))).status).toBe(400);
    expect((await subscribeRoute(json("POST", { subscription: { endpoint: "https://push.example.com/x" } }))).status).toBe(400);
    expect((await subscribeRoute(json("POST", { nothing: true }))).status).toBe(400);
    session.current = null;
    expect((await subscribeRoute(json("POST", { subscription: sub() }))).status).toBe(401);
  });

  it("stores one entry per device, keeps at most 10 per leader, and removes a device", async () => {
    const first = await subscribe(pastor);
    await subscribe(pastor, first);
    expect(await listSubscriptions(pastor)).toHaveLength(1);
    for (let i = 0; i < 12; i++) await subscribe(pastor);
    const subs = await listSubscriptions(pastor);
    expect(subs).toHaveLength(MAX_DEVICES);
    expect(subs.some((s) => s.endpoint === first.endpoint)).toBe(false);
    as(pastor);
    const res = await unsubscribeRoute(json("DELETE", { endpoint: subs[0]!.endpoint }));
    expect((await res.json()).devices).toBe(MAX_DEVICES - 1);
    // Leaders' subscriptions are their own.
    expect(await listSubscriptions(staff)).toHaveLength(0);
  });

  it("sends a test, audits it, and prunes a subscription the push service says is gone (410)", async () => {
    const live = await subscribe(pastor);
    const dead = await subscribe(pastor);
    push.gone.add(dead.endpoint);
    as(pastor, "/api/push/test");
    const res = await testRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1, pruned: 1 });
    expect((await listSubscriptions(pastor)).map((s) => s.endpoint)).toEqual([live.endpoint]);
    expect((await listAudit(pastor)).some((a) => a.action === "push.test")).toBe(true);
  });

  it("says push isn't set up without the VAPID keys", async () => {
    const key = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    try {
      as(pastor);
      expect((await subscribeRoute(json("POST", { subscription: sub() }))).status).toBe(503);
      expect((await notifyLeaders("demo", [pastor.leaderId], "briefing", { title: "x", body: "y", url: "/", tag: "t" })).sent).toBe(0);
    } finally {
      process.env.VAPID_PRIVATE_KEY = key;
    }
  });
});

/* ---------- notifyLeaders ---------- */

describe("notifyLeaders", () => {
  beforeEach(() => setupTeam());
  const payload = { title: "Barnabas", body: "Hello", url: "/", tag: "t" };

  it("respects the master switch and each type's toggle, and keeps subscriptions when off", async () => {
    const d = await subscribe(pastor);
    expect((await notifyLeaders("demo", [pastor.leaderId], "serving", payload)).sent).toBe(1);
    const p = await getProfile(pastor);
    await saveProfile(pastor, { ...p, notifications: { ...p.notifications, types: { ...p.notifications.types, serving: false } } });
    expect((await notifyLeaders("demo", [pastor.leaderId], "serving", payload)).sent).toBe(0);
    expect((await notifyLeaders("demo", [pastor.leaderId], "inbox", payload)).sent).toBe(1);
    await saveProfile(pastor, { ...p, notifications: { ...p.notifications, enabled: false } });
    expect((await notifyLeaders("demo", [pastor.leaderId], "inbox", payload)).sent).toBe(0);
    expect((await notifyLeaders("demo", [pastor.leaderId], "inbox", payload, { test: true })).sent).toBe(0);
    expect((await listSubscriptions(pastor)).map((s) => s.endpoint)).toEqual([d.endpoint]);
    await saveProfile(pastor, { ...p, notifications: { ...p.notifications, enabled: true } });
    expect((await notifyLeaders("demo", [pastor.leaderId], "inbox", payload)).sent).toBe(1);
  });

  it("only sends a type to roles that get it, and never throws", async () => {
    await subscribe(member);
    expect((await notifyLeaders("demo", [member.leaderId], "events", payload)).sent).toBe(0);
    expect((await notifyLeaders("demo", [member.leaderId], "shepherding", payload)).sent).toBe(1);
    await expect(notifyLeaders("demo", ["nobody", member.leaderId], "shepherding", payload)).resolves.toMatchObject({ sent: 1 });
  });

  it("sends a website message to the leaders who edit the site, with a first name only", async () => {
    await subscribe(pastor, sub(9001));
    await subscribe(member, sub(9002));
    await submitContact("demo", { name: "Maria Lopez", email: "maria@example.org", message: "Hello, what time is service?" }, null);
    await settle();
    expect(sentTo("device-9001")).toHaveLength(1);
    expect(sentTo("device-9001")[0]!.payload.body).toBe("New message from Maria.");
    expect(sentTo("device-9002")).toHaveLength(0);
  });

  it("tells a teammate they've been asked to cover a slot", async () => {
    await subscribe(member2, sub(9101));
    const p = await serveActor(pastor);
    const casey = await addVolunteer(p, { name: "Casey Volunteer", teamIds: ["tech"] });
    const m = await serveActor(member);
    const sun = addDays(lastSunday(today()), 14);
    const mine = await signUp(m, { date: sun, gathering: "sun-0830", teamId: "tech", positionId: "slides" });
    await requestSwap(m, { assignmentId: mine.assignment.id, toVolunteerId: casey.id });
    await settle();
    expect(sentTo("device-9101")).toHaveLength(1);
    expect(sentTo("device-9101")[0]!.payload.body).toMatch(/^Lee asked you to cover Tech .* on \w{3}, \w{3} \d+\.$/);
  });
});

/* ---------- Privacy ---------- */

describe("notification privacy", () => {
  beforeEach(() => setupTeam());

  it("a confidential need carries no name or detail", () => {
    const p = needAssignedPayload({ id: "c1", confidential: true, subject: { kind: "person", name: "Jordan Secret" } });
    expect(p.body).toBe("A confidential need was assigned to you.");
    expect(JSON.stringify(p)).not.toMatch(/Jordan|Secret/);
    expect(needAssignedPayload({ id: "c2", confidential: false, subject: { kind: "person", name: "Maria Lopez" } }).body).toBe("A need for Maria was assigned to you.");
    expect(firstName("The Delgado family")).toBe("the Delgado family");
  });

  it("assigning a confidential need sends nothing about who it's for, and never the need's type", async () => {
    await subscribe(pastor2, sub(9201));
    const a = await careActor(pastor);
    await openCase(a, { name: "Jordan Secret", type: "counseling_referral", confidential: true, summary: "private", assignee: leaderMemberId(pastor2.leaderId) });
    await openCase(a, { name: "Maria Lopez", type: "hospital", confidential: false, assignee: leaderMemberId(pastor2.leaderId) });
    await settle();
    const bodies = sentTo("device-9201").map((s) => JSON.stringify(s.payload));
    expect(bodies).toHaveLength(2);
    expect(bodies.join(" ")).not.toMatch(/Jordan|Secret|counsel|hospital|Lopez/i);
    expect(bodies.some((b) => b.includes("A confidential need was assigned to you."))).toBe(true);
    // Nothing to the pastor who assigned it.
    await subscribe(pastor, sub(9202));
    await openCase(a, { name: "Self Assigned", type: "other", confidential: false, assignee: "me" });
    await settle();
    expect(sentTo("device-9202")).toHaveLength(0);
  });

  it("a website prayer request goes to whoever can see it, without its words", async () => {
    await subscribe(pastor, sub(9301));
    await subscribe(member, sub(9302));
    await submitPrayer("demo", { name: "Sam Rivera", request: "for my new job", shareable: false });
    await settle();
    expect(sentTo("device-9301")).toHaveLength(1);
    expect(sentTo("device-9302")).toHaveLength(0);
    expect(JSON.stringify(sentTo("device-9301")[0]!.payload)).not.toMatch(/Sam|Rivera|job/);
    await submitPrayer("demo", { name: "Sam Rivera", request: "for my new job", shareable: true });
    await settle();
    expect(sentTo("device-9302")).toHaveLength(1);
    expect(sentTo("device-9302")[0]!.payload.body).toBe("Sam asked for prayer on the website.");
  });
});

/* ---------- The check-in role ---------- */

describe("the kids check-in role", () => {
  beforeEach(() => setupTeam());

  it("gets only Messages, can manage its own devices, and gets nothing else", async () => {
    expect(typesFor({ role: "checkin", admin: false })).toEqual(["messages", "childcare"]);
    expect(typesFor({ role: "leader", admin: false })).toEqual(["briefing", "messages", "childcare", "shepherding", "serving"]);
    expect(typesFor({ role: "leader", admin: false, level: "member" })).toEqual(["messages", "childcare"]);
    expect(typesFor({ role: "pastor", admin: false })).toContain("kids");
    expect(checkinMayUse("/api/push/subscription")).toBe(true);
    await subscribe(checkin);
    as(checkin, "/api/push/test");
    expect((await testRoute()).status).toBe(200);
    for (const t of ["briefing", "shepherding", "serving", "events", "inbox", "kids"] as const) {
      expect((await notifyLeaders("demo", [checkin.leaderId], t, { title: "x", body: "y", url: "/", tag: "t" })).sent).toBe(0);
    }
  });
});

/* ---------- Cron and the morning briefing ---------- */

describe("the hourly cron job and the morning briefing", () => {
  beforeEach(() => setupTeam());
  const cron = (auth?: string) => cronRoute(new Request("http://localhost/api/cron/notify", { headers: auth ? { authorization: auth } : {} }));

  it("needs CRON_SECRET as a bearer token, and is public in the middleware", async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer wrong")).status).toBe(401);
    expect((await cron(`Bearer ${ENV.CRON_SECRET}`)).status).toBe(200);
    delete process.env.CRON_SECRET;
    try {
      expect((await cron(`Bearer ${ENV.CRON_SECRET}`)).status).toBe(503);
    } finally {
      process.env.CRON_SECRET = ENV.CRON_SECRET;
    }
    const res = await middleware(new NextRequest("http://localhost/api/cron/notify"));
    expect(res.status).not.toBe(401);
    expect((await middleware(new NextRequest("http://localhost/sw.js"))).headers.get("location")).toBeNull();
  });

  it("picks leaders whose local hour is 7", async () => {
    const now = new Date("2026-11-09T12:00:00Z"); // 7 AM in New York, 9 PM in Tokyo, 4 AM in Los Angeles
    expect(localTime("America/New_York", now)).toEqual({ hour: 7, date: "2026-11-09" });
    expect(localTime("Asia/Tokyo", now)).toEqual({ hour: 21, date: "2026-11-09" });
    for (const [l, tz] of [[pastor, "America/New_York"], [staff, "Asia/Tokyo"], [member, "America/Los_Angeles"]] as const) {
      const p = await ensureProfile(l);
      await saveProfile(l, { ...p, timezone: tz });
    }
    const due = (await leadersAtHour("demo", now)).map((d) => d.record.leaderId);
    expect(due).toContain(pastor.leaderId);
    expect(due).not.toContain(staff.leaderId);
    expect(due).not.toContain(member.leaderId);
    expect((await leadersAtHour("demo", new Date("2026-11-09T15:00:00Z"))).map((d) => d.record.leaderId)).toContain(member.leaderId);
  });

  it("sends counts only, skips leaders with nothing due, and sends once a day", async () => {
    const now = new Date("2026-11-09T12:00:00Z");
    for (const l of [pastor, pastor2]) {
      const p = await ensureProfile(l);
      await saveProfile(l, { ...p, timezone: "America/New_York" });
    }
    await subscribe(pastor, sub(9401));
    await subscribe(pastor2, sub(9402));
    const a = await careActor(pastor2);
    await openCase(a, { name: "Jordan Secret", type: "crisis", confidential: true, assignee: leaderMemberId(pastor.leaderId), nextStep: "Call", due: "2026-11-08" });
    await settle();
    push.sent = [];
    const first = await runMorningBriefing(now);
    expect(first.sent).toBe(1);
    expect(sentTo("device-9401")).toHaveLength(1);
    expect(sentTo("device-9401")[0]!.payload.body).toBe("Good morning. 1 need is waiting on you today.");
    expect(JSON.stringify(sentTo("device-9401")[0]!.payload)).not.toMatch(/Jordan|crisis/i);
    expect(sentTo("device-9402")).toHaveLength(0);
    const again = await runMorningBriefing(now);
    expect(again.sent).toBe(0);
    expect(sentTo("device-9401")).toHaveLength(1);
    expect(briefingPayload({ needs: 2, guests: 1, swaps: 0 })!.body).toBe("Good morning. 2 needs and 1 guest to welcome are waiting on you today.");
    expect(briefingPayload({ needs: 0, guests: 0, swaps: 0 })).toBeNull();
  });
});

describe("VAPID key pasting slips", () => {
  it("forgives the name pasted in front, quotes and spaces; rejects keys that aren't keys", async () => {
    const { cleanEnvValue, vapidProblem } = await import("@/lib/push/vapid");
    // Test-only keys (generated once for this test; never used anywhere else).
    const k = { publicKey: "BN4-i-wzKBXKcmr3U4GpIbS5X06bzorlt3kpz6kJSNqJduv61uyfERKCrnIb6ueDYx2yi9mDVyCodlXvabVuyY0", privateKey: "NhG43LLimaWyjPnjHTql3GjylhybXsi-h_Co4wZ8lA0" };
    expect(cleanEnvValue(`VAPID_PUBLIC_KEY=${k.publicKey}`, "VAPID_PUBLIC_KEY")).toBe(k.publicKey);
    expect(cleanEnvValue(`"${k.publicKey}"`, "VAPID_PUBLIC_KEY")).toBe(k.publicKey);
    expect(vapidProblem(k.publicKey, k.privateKey, "mailto:office@example.org")).toBeNull();
    expect(vapidProblem("not a key!", k.privateKey, "mailto:office@example.org")).toMatch(/VAPID_PUBLIC_KEY/);
    expect(vapidProblem(k.publicKey, k.publicKey, "mailto:office@example.org")).toMatch(/VAPID_PRIVATE_KEY/);
    expect(vapidProblem(k.publicKey, k.privateKey, "office@example.org")).toMatch(/VAPID_SUBJECT/);
  });
});

/* ---------- Child care: parents hear when their children are checked in and out ---------- */

describe("child care notifications to parents", () => {
  beforeEach(() => setupTeam());

  it("word the notification with first names and the room, never the pickup code", () => {
    expect(checkedInPayload([{ firstName: "Emma", room: "Preschool" }]).body).toBe("Emma is checked in to Preschool.");
    expect(checkedInPayload([{ firstName: "Emma", room: "Preschool" }, { firstName: "Leo", room: "Nursery" }]).body).toBe("Emma and Leo are checked in.");
    expect(checkedOutPayload([{ firstName: "Emma" }], "Ruth Lopez").body).toBe("Emma was checked out to Ruth.");
  });

  it("go to the family's parents on Barnabas when a child is checked in and checked out", async () => {
    const parent = await subscribe(member);
    const other = await subscribe(member2);
    const actor = await kidsActor(staff);
    const h = await saveHousehold(actor, { name: "Lopez", guardians: [{ name: "Parent", email: member.email.toUpperCase() }], children: [{ firstName: "Emma", lastName: "Lopez" }] });
    const date = lastSunday(today());
    const { checkins, code } = await checkInChildren(actor, { date, gathering: "sun-0945", householdId: h.id, children: [{ childId: h.children[0].id, roomId: "preschool" }] });
    await settle();
    const got = sentTo(parent.endpoint.split("/").pop()!);
    expect(got).toHaveLength(1);
    expect(got[0]!.payload.body).toMatch(/^Emma is checked in to /);
    expect(JSON.stringify(got[0]!.payload)).not.toContain(code);
    expect(sentTo(other.endpoint.split("/").pop()!)).toHaveLength(0);

    await checkOutChildren(actor, { checkinIds: checkins.map((c) => c.id), code });
    await settle();
    expect(sentTo(parent.endpoint.split("/").pop()!).map((s) => s.payload.body)).toContain("Emma was checked out.");
  });
});

