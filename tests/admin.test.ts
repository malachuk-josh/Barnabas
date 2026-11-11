import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

const session = vi.hoisted(() => ({ current: null as Leader | null, path: "" }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-barnabas-path": session.path }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/admin/users/route";
import { GET as INVITE_LOOKUP } from "@/app/api/auth/invite/route";
import { getLeaderRecord } from "@/lib/team";
import { POST as SIGNIN } from "@/app/api/auth/signin/route";
import { leaderIdFor } from "@/lib/auth/session";
import { can, levelMayUse } from "@/lib/auth/roles";
import { requireLeader, isResponse } from "@/lib/auth/require";
import { accessFor, recordSignIn, setLeaderRole } from "@/lib/team";
import { aiForLeader, turnParams } from "@/lib/engine/claude";
import { executeTool } from "@/lib/engine/tools";
import { freshStore } from "./helpers";

const person = async (name: string, email: string): Promise<Leader> => ({ churchId: "demo", leaderId: await leaderIdFor("demo", email), name, email, role: "" });
const req = (method: string, body: unknown) => new Request("http://x/api/admin/users", { method, body: JSON.stringify(body) });

let admin: Leader;
beforeEach(async () => {
  freshStore();
  vi.stubEnv("BARNABAS_ADMIN_EMAILS", "admin@example.org");
  vi.stubEnv("BARNABAS_ACCESS_CODE", "code");
  vi.stubEnv("BARNABAS_CHURCH_ID", "demo");
  admin = await person("Pastor Admin", "admin@example.org");
  await recordSignIn(admin);
  session.current = admin;
  session.path = "";
});
afterEach(() => vi.unstubAllEnvs());

describe("Admin page: people and access", () => {
  it("adds people at a level, changes their level, and removes them", async () => {
    let r = await POST(req("POST", { name: "Maria", email: "Maria@Example.org", level: "member" }));
    expect(r.status).toBe(200);
    let people = (await r.json()).people;
    const maria = people.find((p: { email: string }) => p.email === "maria@example.org");
    expect(maria).toMatchObject({ name: "Maria", level: "member", levelChosen: true, lastSignedInAt: 0 });

    // Adding the same person twice is refused.
    expect((await POST(req("POST", { name: "Maria", email: "maria@example.org", level: "member" }))).status).toBe(409);

    r = await PATCH(req("PATCH", { leaderId: maria.leaderId, level: "leader", finance: true }));
    people = (await r.json()).people;
    expect(people.find((p: { leaderId: string }) => p.leaderId === maria.leaderId)).toMatchObject({ level: "leader", finance: true });
    expect(await accessFor({ churchId: "demo", leaderId: maria.leaderId, email: "maria@example.org" })).toMatchObject({ level: "leader", finance: true, role: "pastor" });

    r = await DELETE(req("DELETE", { leaderId: maria.leaderId }));
    expect((await r.json()).people.some((p: { leaderId: string }) => p.leaderId === maria.leaderId)).toBe(false);
  });

  it("protects admins from the server settings and the admin's own access, and is admin-only", async () => {
    expect((await PATCH(req("PATCH", { leaderId: admin.leaderId, level: "member" }))).status).toBe(400);
    expect((await DELETE(req("DELETE", { leaderId: admin.leaderId }))).status).toBe(400);
    expect((await POST(req("POST", { name: "x", email: "admin@example.org", level: "member" }))).status).toBe(400);

    const lee = await person("Lee", "lee@example.org");
    await recordSignIn(lee);
    session.current = lee;
    expect((await GET()).status).toBe(403);
    expect((await POST(req("POST", { name: "Sam", email: "sam@example.org", level: "admin" }))).status).toBe(403);
  });

  it("lets only people on the list sign in, and signs out someone removed", async () => {
    const signin = (email: string) => SIGNIN(new Request("http://x/api/auth/signin", { method: "POST", body: JSON.stringify({ email, code: "code" }) }));
    expect((await signin("stranger@example.org")).status).toBe(403);
    expect((await signin("admin@example.org")).status).toBe(200);

    await POST(req("POST", { name: "Ruth", email: "ruth@example.org", level: "team", teamRole: "kids" }));
    expect((await signin("ruth@example.org")).status).toBe(200);

    const ruth = await person("Ruth", "ruth@example.org");
    session.current = ruth;
    expect(isResponse(await requireLeader())).toBe(false);

    session.current = admin;
    await DELETE(req("DELETE", { leaderId: ruth.leaderId }));
    session.current = ruth;
    const res = await requireLeader();
    expect(isResponse(res) && res.status).toBe(401);
    expect((await signin("ruth@example.org")).status).toBe(403);
  });

  it("keeps someone's older role until an admin chooses a level", async () => {
    const dee = await person("Dee", "dee@example.org");
    await recordSignIn(dee);
    await setLeaderRole("demo", dee.leaderId, "deacon", "test");
    const before = await accessFor(dee);
    expect(before.level).toBeUndefined();
    expect(can(before, "finance.view")).toBe(true);
    expect(((await (await GET()).json()).people as { leaderId: string; levelChosen: boolean; olderRole?: string }[]).find((p) => p.leaderId === dee.leaderId)).toMatchObject({ levelChosen: false, olderRole: "Deacon" });

    await PATCH(req("PATCH", { leaderId: dee.leaderId, level: "team", teamRole: "care" }));
    const after = await accessFor(dee);
    expect(after).toMatchObject({ level: "team", teamRole: "care", role: "deacon" });
    expect(can(after, "finance.view")).toBe(false);
  });
});

describe("what each level can use", () => {
  const access = (level: "leader" | "team" | "member", extra: object = {}) => ({ role: "leader" as const, admin: false, level, ...extra });

  it("Leaders get every feature, and finance only when it's on", () => {
    expect(can(access("leader"), "ops.schedule")).toBe(true);
    expect(can(access("leader"), "site.edit")).toBe(true);
    expect(can(access("leader"), "finance.view")).toBe(false);
    expect(can(access("leader", { finance: true }), "giving.donors")).toBe(true);
    expect(can(access("leader", { finance: true }), "team.manage")).toBe(false);
    expect(levelMayUse(access("leader"), "/people")).toBe(true);
  });

  it("Team gets their role's features; Members get The Word, Calendar, Services, Child care and Messages", () => {
    const kids = access("team", { teamRole: "kids" });
    expect(can(kids, "kids.checkin")).toBe(true);
    expect(can(kids, "ops.schedule")).toBe(false);
    expect(levelMayUse(kids, "/serve")).toBe(true);
    expect(levelMayUse(kids, "/people")).toBe(false);
    expect(levelMayUse(access("team", { teamRole: "care" }), "/shepherding")).toBe(true);
    expect(levelMayUse(access("team", { teamRole: "serving" }), "/shepherding")).toBe(false);

    const member = access("member");
    for (const p of ["/", "/word", "/calendar", "/services", "/kids", "/inbox", "/settings", "/api/chat"]) expect(levelMayUse(member, p), p).toBe(true);
    for (const p of ["/people", "/serve", "/journal", "/finance", "/admin", "/kids/families", "/api/people", "/api/voice/tts", "/api/briefing"]) expect(levelMayUse(member, p), p).toBe(false);
    expect(can(member, "kids.checkin")).toBe(false);
  });

  it("refuses a Team or Member page or API outside their features", async () => {
    await POST(req("POST", { name: "Maria", email: "maria@example.org", level: "member" }));
    session.current = await person("Maria", "maria@example.org");
    session.path = "/api/people";
    const res = await requireLeader();
    expect(isResponse(res) && res.status).toBe(403);
    session.path = "/api/inbox";
    expect(isResponse(await requireLeader())).toBe(false);
  });
});

describe("Barnabas for Team and Member", () => {
  it("uses Claude Haiku, typing only, with only their own tools", async () => {
    await POST(req("POST", { name: "Maria", email: "maria@example.org", level: "member" }));
    const maria = await person("Maria", "maria@example.org");
    const ai = await aiForLeader(maria);
    expect(ai.textModel).toBe("claude-haiku-5-5");
    const params = turnParams({ context: "ctx" } as Parameters<typeof turnParams>[0], [], "voice", ai);
    expect(params.model).toBe("claude-haiku-5-5");
    const names = (params.tools ?? []).map((t) => (t as { name: string }).name);
    expect(names).toContain("recall_memory");
    expect(names).not.toContain("find_person");
    expect(names).not.toContain("finance_overview");

    // Even if asked, a tool outside their level is refused.
    const r = await executeTool("find_person", { query: "Sam" }, { leader: maria, meta: {} as never, turnStartedAt: 0, lastUserText: "", toolNames: ai.tools });
    expect(r.isError).toBe(true);

    // Leaders keep the church's models and every tool.
    const leaderAi = await aiForLeader(admin);
    expect(leaderAi.tools).toBeUndefined();
  });
});

describe("invites and sign-in", () => {
  const signin = (body: object) => SIGNIN(new Request("http://x/api/auth/signin", { method: "POST", body: JSON.stringify(body) }));
  const linkToken = (link: string) => new URL(link).searchParams.get("invite")!;

  it("signs in with just email and access code, and uses the name from the Admin page", async () => {
    await POST(req("POST", { name: "Ruth Miller", email: "ruth@example.org", level: "member" }));
    expect((await signin({ email: "ruth@example.org", code: "code" })).status).toBe(200);
    const ruth = await person("x", "ruth@example.org");
    expect((await getLeaderRecord("demo", ruth.leaderId))?.name).toBe("Ruth Miller");
    expect((await signin({ email: "ruth@example.org" })).status).toBe(400);
  });

  it("sends an invite by email and text, and its link signs them in once without the code", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "Barnabas <hello@example.org>");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+14135550100");
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      return String(url).includes("twilio") ? new Response(JSON.stringify({ sid: "SM1", status: "queued" }), { status: 201 }) : new Response(JSON.stringify({ id: "em1" }), { status: 200 });
    }));
    try {
      const r = await POST(req("POST", { name: "Ruth Miller", email: "ruth@example.org", phone: "(413) 555-0142", level: "member", inviteEmail: true, inviteText: true }));
      const json = await r.json();
      expect(json.invite.sends.map((x: { via: string; ok: boolean }) => [x.via, x.ok])).toEqual([["email", true], ["text", true]]);
      expect(calls.some((c) => c.url.includes("resend") && c.body.includes("Accept your invitation"))).toBe(true);
      expect(calls.some((c) => c.url.includes("twilio") && (new URLSearchParams(c.body).get("Body") ?? "").includes("invited you to Barnabas"))).toBe(true);
      const pending = json.people.find((p: { email: string }) => p.email === "ruth@example.org");
      expect(pending).toMatchObject({ lastSignedInAt: 0, phone: "+14135550142", invite: { expired: false } });

      const token = linkToken(json.invite.link);
      const lookup = await (await INVITE_LOOKUP(new Request(`http://x/api/auth/invite?token=${token}`))).json();
      expect(lookup).toMatchObject({ valid: true, firstName: "Ruth", email: "ruth@example.org" });
      expect((await signin({ email: "someone@example.org", invite: token })).status).toBe(401);
      expect((await signin({ email: "ruth@example.org", invite: token })).status).toBe(200);
      // Used once.
      expect((await signin({ email: "ruth@example.org", invite: token })).status).toBe(401);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a newer invite replaces the old link; without email or text set up, it gives a link to copy", async () => {
    await POST(req("POST", { name: "Sam", email: "sam@example.org", level: "team", teamRole: "serving" }));
    const sam = await person("Sam", "sam@example.org");
    const first = await (await PUT(req("PUT", { leaderId: sam.leaderId, email: true }))).json();
    expect(first.invite.sends[0]).toMatchObject({ via: "email", ok: false });
    expect(first.invite.link).toContain("/signin?invite=");
    const second = await (await PUT(req("PUT", { leaderId: sam.leaderId }))).json();
    expect((await signin({ email: "sam@example.org", invite: linkToken(first.invite.link) })).status).toBe(401);
    expect((await signin({ email: "sam@example.org", invite: linkToken(second.invite.link) })).status).toBe(200);
  });

  it("saving a mobile number for an invite doesn't choose a level for someone who has none", async () => {
    const dee = await person("Dee", "dee@example.org");
    await recordSignIn(dee);
    await setLeaderRole("demo", dee.leaderId, "deacon", "test");
    await PUT(req("PUT", { leaderId: dee.leaderId, phone: "413-555-0199" }));
    const rec = await getLeaderRecord("demo", dee.leaderId);
    expect(rec?.phone).toBe("+14135550199");
    expect(rec?.level).toBeUndefined();
    expect((await PUT(req("PUT", { leaderId: dee.leaderId, phone: "12" }))).status).toBe(400);
  });

  it("invites are admin-only", async () => {
    const lee = await person("Lee", "lee@example.org");
    await recordSignIn(lee);
    session.current = lee;
    expect((await PUT(req("PUT", { leaderId: lee.leaderId }))).status).toBe(403);
  });
});

