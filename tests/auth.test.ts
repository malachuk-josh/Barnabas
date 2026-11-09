import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real currentLeader runs here (it's what revocation is about): cookies() returns the test's cookie,
// headers() the path the middleware would pass along.
const req = vi.hoisted(() => ({ cookie: undefined as string | undefined, path: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "barnabas_session" && req.cookie ? { name, value: req.cookie } : undefined) }),
  headers: async () => new Headers({ "x-barnabas-path": req.path }),
}));

import { freshStore } from "./helpers";
import type { MemoryKV } from "@/lib/store/memory-kv";
import { POST as signinRoute } from "@/app/api/auth/signin/route";
import { POST as setPasswordRoute } from "@/app/api/auth/set-password/route";
import { GET as passwordState, POST as changePasswordRoute } from "@/app/api/auth/password/route";
import { DELETE as otherSessionsRoute } from "@/app/api/auth/sessions/route";
import { POST as recoverRoute } from "@/app/api/auth/recover/route";
import { GET as adminList, POST as adminCreate } from "@/app/api/admin/users/route";
import { DELETE as adminRemove, PATCH as adminPatch, POST as adminAction } from "@/app/api/admin/users/[leaderId]/route";
import { PUT as adminSettings } from "@/app/api/admin/settings/route";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { GET as profileGet } from "@/app/api/profile/route";
import { checkinMayUse } from "@/lib/auth/roles";
import { COMMON_PASSWORDS, checkPassword, generateTemporaryPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { credKey } from "@/lib/auth/credentials";
import { consumeLink, issueLink, linkHash, resolveLink } from "@/lib/auth/links";
import { LOCKOUT } from "@/lib/auth/lockout";
import { RECOVERY_LIMITS } from "@/lib/auth/recovery";
import { currentLeader, leaderIdFor } from "@/lib/auth/session";
import { MemoryFS } from "@/lib/memory/fs";
import { getProfile, profileKey } from "@/lib/profile";
import { kv } from "@/lib/store";
import { bumpSessionVersion, getLeaderRecord, recordSignIn, setLeaderRole } from "@/lib/team";

const CODE = "test";
const OWNER = "owner@example.org";
const ADMIN2 = "admin2@example.org";
const GOOD = "green pastures 23";
const GOOD2 = "still waters run deep";

let store: MemoryKV;
let ipCounter = 0;
let ip = "203.0.113.1";

beforeEach(() => {
  store = freshStore();
  req.cookie = undefined;
  req.path = "";
  ip = `203.0.113.${++ipCounter % 250}`;
  vi.stubEnv("BARNABAS_ACCESS_CODE", CODE);
  vi.stubEnv("BARNABAS_ADMIN_EMAILS", `${OWNER},${ADMIN2}`);
  vi.stubEnv("BARNABAS_OWNER_EMAILS", "");
  vi.stubEnv("BARNABAS_RECOVERY_CODE", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function post(url: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
}
const signin = (body: Record<string, unknown>) => signinRoute(post("/api/auth/signin", { code: CODE, ...body }));
const cookieOf = (res: Response) => (res as unknown as { cookies: { get(n: string): { value: string } | undefined } }).cookies.get("barnabas_session")?.value;
const ctx = (leaderId: string) => ({ params: Promise.resolve({ leaderId }) });

/** A leader as they are today: signed in before passwords, so a record and no credential. */
async function existingLeader(email: string, name = "Sam Rivera") {
  const leaderId = await leaderIdFor("demo", email);
  await recordSignIn({ churchId: "demo", leaderId, name, email, role: "" });
  return leaderId;
}

/** Signs `email` in with a password (creating it at first sign-in) and makes that the request's cookie. */
async function signedIn(email: string, password = GOOD) {
  let res = await signin({ email, password });
  let json = await res.json();
  if (json.step === "create-account") res = await signin({ email, password, newPassword: password, name: email.split("@")[0] });
  else if (json.step === "create-password") res = await signin({ email, password, newPassword: password });
  expect(res.status).toBe(200);
  req.cookie = cookieOf(res);
  expect(req.cookie).toBeTruthy();
  return req.cookie!;
}

/** Every string in the store, keys and values, for "nothing secret is stored" checks. */
function everything(): string {
  const data = (store as unknown as { data: Map<string, { value: string | Set<string> }> }).data;
  return [...data.entries()].map(([k, v]) => `${k}=${typeof v.value === "string" ? v.value : [...v.value].join(",")}`).join("\n");
}

describe("password hashing and policy", () => {
  it("hashes with a per-password salt and verifies in constant time", async () => {
    const a = await hashPassword(GOOD);
    const b = await hashPassword(GOOD);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(JSON.stringify(a)).not.toContain(GOOD);
    expect(await verifyPassword(GOOD, a)).toBe(true);
    expect(await verifyPassword(GOOD + "x", a)).toBe(false);
  });

  it("applies the policy with kind messages", () => {
    expect(checkPassword("short", "sam@example.org")).toMatchObject({ ok: false, error: expect.stringContaining("at least 10") });
    expect(checkPassword("x".repeat(201), "sam@example.org")).toMatchObject({ ok: false, error: expect.stringContaining("200") });
    expect(checkPassword("aaaaaaaaaaaa", "sam@example.org")).toMatchObject({ ok: false, error: expect.stringContaining("repeats") });
    expect(checkPassword("password123", "sam@example.org")).toMatchObject({ ok: false, error: expect.stringContaining("common") });
    expect(checkPassword("Jesussaves!!", "sam@example.org")).toMatchObject({ ok: false });
    expect(checkPassword("samrivera-is-here", "samrivera@example.org")).toMatchObject({ ok: false, error: expect.stringContaining("email") });
    expect(checkPassword(GOOD, "sam@example.org")).toEqual({ ok: true });
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(190);
  });

  it("generates strong temporary passwords that pass the policy", () => {
    const t = generateTemporaryPassword();
    expect(t).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    expect(generateTemporaryPassword()).not.toBe(t);
    expect(checkPassword(t, "sam@example.org").ok).toBe(true);
  });
});

describe("sign-in", () => {
  it("asks an existing leader with no password to create one, then signs in with it", async () => {
    const id = await existingLeader("sam@example.org");
    const first = await signin({ email: "Sam@Example.org", password: "" });
    expect(await first.json()).toEqual({ step: "create-password", reason: "first" });
    expect(cookieOf(first)).toBeUndefined();
    const weak = await signin({ email: "sam@example.org", newPassword: "password1" });
    expect(weak.status).toBe(400);
    const made = await signin({ email: "sam@example.org", newPassword: GOOD });
    expect(made.status).toBe(200);
    expect(cookieOf(made)).toBeTruthy();
    expect(everything()).not.toContain(GOOD);
    expect(await kv().get(credKey("demo", id))).toBeTruthy();
    // From now on the password is required.
    expect((await signin({ email: "sam@example.org", password: "" })).status).toBe(401);
    expect((await signin({ email: "sam@example.org", password: GOOD })).status).toBe(200);
    expect((await signin({ email: "sam@example.org", password: GOOD, code: "wrong" })).status).toBe(401);
  });

  it("refuses new emails when joining is invite only, and lets them join when the code is enough", async () => {
    const refused = await signin({ email: "new@example.org", password: GOOD });
    expect(refused.status).toBe(401);
    expect((await refused.json()).error).toContain("Ask your church administrator for an invite.");
    req.cookie = await signedIn(OWNER);
    expect((await adminSettings(post("/api/admin/settings", { join: "code" }, "PUT"))).status).toBe(200);
    const step = await signin({ email: "new@example.org", password: "" });
    expect(await step.json()).toEqual({ step: "create-account" });
    const joined = await signin({ email: "new@example.org", newPassword: GOOD, name: "New Person", role: "Greeter" });
    expect(joined.status).toBe(200);
    expect((await getLeaderRecord("demo", await leaderIdFor("demo", "new@example.org")))?.access).toBe("leader");
  });

  it("lets the owner create their account at first sign-in even when invite only", async () => {
    const step = await signin({ email: OWNER, password: "" });
    expect(await step.json()).toEqual({ step: "create-account" });
    expect((await signin({ email: OWNER, newPassword: GOOD, name: "Owner" })).status).toBe(200);
    // A second admin who isn't the owner needs an invite.
    expect((await signin({ email: ADMIN2, password: "" })).status).toBe(401);
  });

  it("doesn't reveal whether an email has an account", async () => {
    await existingLeader("sam@example.org");
    await signin({ email: "sam@example.org", newPassword: GOOD });
    const wrong = await signin({ email: "sam@example.org", password: "not the password" });
    const nobody = await signin({ email: "nobody@example.org", password: "not the password" });
    const badCode = await signin({ email: "sam@example.org", password: GOOD, code: "nope" });
    const bodies = await Promise.all([wrong, nobody, badCode].map((r) => r.json()));
    expect(new Set([wrong.status, nobody.status, badCode.status])).toEqual(new Set([401]));
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it("locks an email after 8 failures in 15 minutes, even with the right password, for 15 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await existingLeader("sam@example.org");
    await signin({ email: "sam@example.org", newPassword: GOOD });
    for (let i = 0; i < LOCKOUT.failures - 1; i++) expect((await signin({ email: "sam@example.org", password: `wrong ${i}` })).status).toBe(401);
    const last = await signin({ email: "sam@example.org", password: "wrong again" });
    expect(last.status).toBe(429);
    expect((await signin({ email: "sam@example.org", password: GOOD })).status).toBe(429);
    // An unknown email locks the same way, so a lock says nothing about whether the account exists.
    for (let i = 0; i < LOCKOUT.failures; i++) await signin({ email: "ghost@example.org", password: `wrong ${i}` });
    expect((await signin({ email: "ghost@example.org", password: "x" })).status).toBe(429);
    vi.setSystemTime(Date.now() + LOCKOUT.lockSeconds * 1000 + 1000);
    expect((await signin({ email: "sam@example.org", password: GOOD })).status).toBe(200);
  });

  it("limits failures per network address", async () => {
    for (let i = 0; i < 40; i++) await signin({ email: `p${i}@example.org`, password: "wrong password" });
    const blocked = await signin({ email: "fresh@example.org", password: "wrong password" });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toContain("network");
  });
});

describe("invite and reset links", () => {
  it("stores only a hash, works once, and expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const id = await existingLeader("sam@example.org");
    const { token } = await issueLink("demo", id, "reset", "owner");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(everything()).not.toContain(token);
    expect(everything()).toContain(linkHash(token));
    expect(await resolveLink(token)).toMatchObject({ leaderId: id, kind: "reset" });
    expect(await consumeLink(token)).toBeTruthy();
    expect(await consumeLink(token)).toBeNull();

    const invite = await issueLink("demo", id, "invite", "owner");
    vi.setSystemTime(Date.now() + 7 * 24 * 3600 * 1000 + 1000);
    expect(await resolveLink(invite.token)).toBeNull();
    const reset = await issueLink("demo", id, "reset", "owner");
    vi.setSystemTime(Date.now() + 24 * 3600 * 1000 - 60_000);
    expect(await resolveLink(reset.token)).toBeTruthy();
    vi.setSystemTime(Date.now() + 120_000);
    expect(await resolveLink(reset.token)).toBeNull();
  });

  it("a new link replaces the old one", async () => {
    const id = await existingLeader("sam@example.org");
    const a = await issueLink("demo", id, "reset", "owner");
    const b = await issueLink("demo", id, "reset", "owner");
    expect(await resolveLink(a.token)).toBeNull();
    expect(await resolveLink(b.token)).toBeTruthy();
  });
});

describe("sessions you can revoke", () => {
  it("a session version bump signs out old cookies", async () => {
    const cookie = await signedIn(OWNER);
    expect(await currentLeader()).toMatchObject({ email: OWNER });
    await bumpSessionVersion("demo", await leaderIdFor("demo", OWNER));
    req.cookie = cookie;
    expect(await currentLeader()).toBeNull();
    expect((await profileGet()).status).toBe(401);
  });

  it("changing your password signs out other devices and keeps this one", async () => {
    const id = await existingLeader("sam@example.org");
    const deviceA = await signedIn("sam@example.org");
    const deviceB = cookieOf(await signin({ email: "sam@example.org", password: GOOD }))!;
    req.cookie = deviceA;
    expect((await changePasswordRoute(post("/api/auth/password", { current: "wrong password!", password: GOOD2 }))).status).toBe(401);
    const changed = await changePasswordRoute(post("/api/auth/password", { current: GOOD, password: GOOD2 }));
    expect(changed.status).toBe(200);
    req.cookie = cookieOf(changed);
    expect(await currentLeader()).toMatchObject({ leaderId: id });
    req.cookie = deviceA;
    expect(await currentLeader()).toBeNull();
    req.cookie = deviceB;
    expect(await currentLeader()).toBeNull();
    expect((await signin({ email: "sam@example.org", password: GOOD2 })).status).toBe(200);
  });

  it("sign out of other devices keeps only this session", async () => {
    await existingLeader("sam@example.org");
    const a = await signedIn("sam@example.org");
    const b = cookieOf(await signin({ email: "sam@example.org", password: GOOD }))!;
    req.cookie = a;
    const res = await otherSessionsRoute();
    req.cookie = cookieOf(res);
    expect(await currentLeader()).toBeTruthy();
    req.cookie = b;
    expect(await currentLeader()).toBeNull();
  });

  it("a legacy session (no password yet) can set a password with the access code", async () => {
    await existingLeader("sam@example.org");
    const { sessionFor } = await import("./helpers");
    req.cookie = await sessionFor({ churchId: "demo", leaderId: await leaderIdFor("demo", "sam@example.org"), name: "Sam", email: "sam@example.org", role: "" });
    expect(await (await passwordState()).json()).toEqual({ hasPassword: false, mustChangePassword: false });
    expect((await changePasswordRoute(post("/api/auth/password", { code: "nope", password: GOOD }))).status).toBe(401);
    expect((await changePasswordRoute(post("/api/auth/password", { code: CODE, password: GOOD }))).status).toBe(200);
  });
});

describe("owner Admin console", () => {
  async function asOwner() {
    req.cookie = await signedIn(OWNER);
  }

  it("is owner only: an admin who isn't the owner gets 403 on every /api/admin route", async () => {
    await asOwner();
    const sam = await existingLeader("sam@example.org");
    // admin2 joins with an invite.
    const created = await (await adminCreate(post("/api/admin/users", { name: "Admin Two", email: ADMIN2, access: "pastor" }))).json();
    const token = created.link.split("/set-password/")[1];
    expect((await setPasswordRoute(post("/api/auth/set-password", { token, password: GOOD }))).status).toBe(200);
    req.cookie = undefined;
    req.cookie = await signedIn(ADMIN2);
    const access = await (await import("@/lib/team")).accessFor({ churchId: "demo", leaderId: created.leaderId, email: ADMIN2 });
    expect(access).toMatchObject({ admin: true, owner: false });
    const results = [
      await adminList(),
      await adminCreate(post("/api/admin/users", { name: "X", email: "x@example.org", access: "leader" })),
      await adminPatch(post(`/api/admin/users/${sam}`, { access: "staff" }, "PATCH"), ctx(sam)),
      ...(await Promise.all(
        ["invite-link", "reset-link", "temporary-password", "unlock", "sign-out-everywhere"].map((action) => adminAction(post(`/api/admin/users/${sam}`, { action }), ctx(sam))),
      )),
      await adminRemove(post(`/api/admin/users/${sam}`, { confirm: true, deleteData: true }, "DELETE"), ctx(sam)),
      await adminSettings(post("/api/admin/settings", { join: "code" }, "PUT")),
    ];
    expect(results.map((r) => r.status)).toEqual(results.map(() => 403));
    expect((await getLeaderRecord("demo", sam))?.status).toBe("active");
  });

  it("creates a user with an invite link that works once, then they sign in normally", async () => {
    await asOwner();
    const res = await adminCreate(post("/api/admin/users", { name: "Ethan", email: "ethan@example.org", access: "staff", admin: true }));
    const json = await res.json();
    expect(json.link).toMatch(/\/set-password\/[A-Za-z0-9_-]{43}$/);
    const row = json.users.find((u: { email: string }) => u.email === "ethan@example.org");
    expect(row).toMatchObject({ status: "invited", access: "staff", admin: true, owner: false });
    const token = json.link.split("/set-password/")[1];
    // An invited person can't skip the link at sign-in.
    expect((await signin({ email: "ethan@example.org", password: "" })).status).toBe(401);
    expect((await setPasswordRoute(post("/api/auth/set-password", { token, password: "short" }))).status).toBe(400);
    expect((await setPasswordRoute(post("/api/auth/set-password", { token, password: GOOD }))).status).toBe(200);
    expect((await setPasswordRoute(post("/api/auth/set-password", { token, password: GOOD2 }))).status).toBe(400);
    const ok = await signin({ email: "ethan@example.org", password: GOOD });
    expect(ok.status).toBe(200);
    const list = await (await adminList()).json();
    expect(list.users.find((u: { email: string }) => u.email === "ethan@example.org").status).toBe("active");
    expect(JSON.stringify(list)).not.toContain(token);
  });

  it("a reset link sets a new password and ends old sessions", async () => {
    await existingLeader("sam@example.org");
    const samCookie = await signedIn("sam@example.org");
    await asOwner();
    const sam = await leaderIdFor("demo", "sam@example.org");
    const { link } = await (await adminAction(post(`/api/admin/users/${sam}`, { action: "reset-link" }), ctx(sam))).json();
    expect((await setPasswordRoute(post("/api/auth/set-password", { token: link.split("/set-password/")[1], password: GOOD2 }))).status).toBe(200);
    req.cookie = samCookie;
    expect(await currentLeader()).toBeNull();
    expect((await signin({ email: "sam@example.org", password: GOOD })).status).toBe(401);
    expect((await signin({ email: "sam@example.org", password: GOOD2 })).status).toBe(200);
  });

  it("a temporary password is shown once, ends sessions, and must be replaced at next sign-in", async () => {
    await existingLeader("sam@example.org");
    const samCookie = await signedIn("sam@example.org");
    await asOwner();
    const sam = await leaderIdFor("demo", "sam@example.org");
    const res = await adminAction(post(`/api/admin/users/${sam}`, { action: "temporary-password" }), ctx(sam));
    const { temporaryPassword, users } = await res.json();
    expect(temporaryPassword).toMatch(/^[A-Za-z2-9-]{19}$/);
    expect(users.find((u: { leaderId: string }) => u.leaderId === sam).temporaryPassword).toBe(true);
    expect(everything()).not.toContain(temporaryPassword);
    expect(JSON.stringify(await (await adminList()).json())).not.toContain(temporaryPassword);
    req.cookie = samCookie;
    expect(await currentLeader()).toBeNull();
    const step = await signin({ email: "sam@example.org", password: temporaryPassword });
    expect(await step.json()).toEqual({ step: "create-password", reason: "temporary" });
    expect((await signin({ email: "sam@example.org", password: temporaryPassword, newPassword: temporaryPassword })).status).toBe(400);
    expect((await signin({ email: "sam@example.org", password: temporaryPassword, newPassword: GOOD2 })).status).toBe(200);
    expect((await signin({ email: "sam@example.org", password: temporaryPassword })).status).toBe(401);
    expect((await signin({ email: "sam@example.org", password: GOOD2 })).status).toBe(200);
  });

  it("changes role and admin flag, but not for env admins or yourself", async () => {
    await asOwner();
    const sam = await existingLeader("sam@example.org");
    const me = await leaderIdFor("demo", OWNER);
    await existingLeader(ADMIN2, "Admin Two");
    const a2 = await leaderIdFor("demo", ADMIN2);
    expect((await adminPatch(post(`/api/admin/users/${sam}`, { access: "deacon", admin: true }, "PATCH"), ctx(sam))).status).toBe(200);
    expect(await getLeaderRecord("demo", sam)).toMatchObject({ access: "deacon", admin: true });
    const env = await adminPatch(post(`/api/admin/users/${a2}`, { admin: false }, "PATCH"), ctx(a2));
    expect(env.status).toBe(400);
    expect((await env.json()).error).toContain("Vercel");
    expect((await adminPatch(post(`/api/admin/users/${me}`, { admin: false }, "PATCH"), ctx(me))).status).toBe(400);
    expect((await adminRemove(post(`/api/admin/users/${me}`, { confirm: true }, "DELETE"), ctx(me))).status).toBe(400);
  });

  it("unlocks a locked account", async () => {
    await existingLeader("sam@example.org");
    await signin({ email: "sam@example.org", newPassword: GOOD });
    for (let i = 0; i < LOCKOUT.failures; i++) await signin({ email: "sam@example.org", password: `nope ${i}` });
    await asOwner();
    const sam = await leaderIdFor("demo", "sam@example.org");
    const list = await (await adminList()).json();
    expect(list.users.find((u: { leaderId: string }) => u.leaderId === sam).status).toBe("locked");
    await adminAction(post(`/api/admin/users/${sam}`, { action: "unlock" }), ctx(sam));
    expect((await signin({ email: "sam@example.org", password: GOOD })).status).toBe(200);
  });

  it("removes a user at once, and with data deletion removes their data", async () => {
    await existingLeader("sam@example.org");
    const samCookie = await signedIn("sam@example.org");
    const sam = await leaderIdFor("demo", "sam@example.org");
    const samLeader = { churchId: "demo", leaderId: sam, name: "Sam", email: "sam@example.org", role: "" };
    const fs = new MemoryFS({ churchId: "demo", leaderId: sam });
    await fs.run({ command: "create", path: "/memories/people.md", file_text: "Private notes" });
    expect(await kv().get(profileKey(samLeader))).toBeTruthy();

    await asOwner();
    const res = await adminRemove(post(`/api/admin/users/${sam}`, { confirm: true, deleteData: true }, "DELETE"), ctx(sam));
    expect(res.status).toBe(200);
    expect((await res.json()).users.find((u: { leaderId: string }) => u.leaderId === sam).status).toBe("removed");
    expect(await kv().get(profileKey(samLeader))).toBeNull();
    expect(await kv().get(credKey("demo", sam))).toBeNull();
    expect(await fs.paths()).toEqual([]);
    expect(everything()).not.toContain("Private notes");
    req.cookie = samCookie;
    expect(await currentLeader()).toBeNull();
    expect((await signin({ email: "sam@example.org", password: GOOD })).status).toBe(401);
    // Even if anyone with the code may join, a removed email stays out until the owner creates them again.
    req.cookie = undefined;
    await asOwner();
    await adminSettings(post("/api/admin/settings", { join: "code" }, "PUT"));
    expect((await signin({ email: "sam@example.org", password: "", newPassword: GOOD, name: "Sam" })).status).toBe(401);
    const again = await (await adminCreate(post("/api/admin/users", { name: "Sam", email: "sam@example.org", access: "leader" }))).json();
    expect(again.link).toBeTruthy();
  });

  it("removing without deleting data keeps their data but ends access", async () => {
    await existingLeader("sam@example.org");
    const samCookie = await signedIn("sam@example.org");
    const sam = await leaderIdFor("demo", "sam@example.org");
    await asOwner();
    await adminRemove(post(`/api/admin/users/${sam}`, { confirm: true }, "DELETE"), ctx(sam));
    expect(await kv().get(profileKey({ churchId: "demo", leaderId: sam }))).toBeTruthy();
    req.cookie = samCookie;
    expect(await currentLeader()).toBeNull();
  });

  it("logs admin actions without passwords or tokens, and never exposes private content", async () => {
    await asOwner();
    const { link } = await (await adminCreate(post("/api/admin/users", { name: "Ethan", email: "ethan@example.org", access: "leader" }))).json();
    const ethan = await leaderIdFor("demo", "ethan@example.org");
    const { temporaryPassword } = await (await adminAction(post(`/api/admin/users/${ethan}`, { action: "temporary-password" }), ctx(ethan))).json();
    const list = await (await adminList()).json();
    expect(list.activity.map((a: { action: string }) => a.action)).toEqual(["user.temporary_password", "user.create"]);
    const text = JSON.stringify(list) + everything();
    expect(text).not.toContain(link.split("/set-password/")[1]);
    expect(text).not.toContain(temporaryPassword);
    expect(Object.keys(list.users[0]).sort()).toEqual(
      ["access", "admin", "adminFromEnv", "createdAt", "email", "inviteOpen", "lastSignedInAt", "leaderId", "name", "owner", "status", "temporaryPassword"].sort(),
    );
  });

  it("uses BARNABAS_OWNER_EMAILS when set", async () => {
    vi.stubEnv("BARNABAS_OWNER_EMAILS", ADMIN2);
    await existingLeader(OWNER, "Owner");
    req.cookie = await signedIn(OWNER);
    expect((await adminList()).status).toBe(403);
  });
});

describe("kids check-in role", () => {
  it("can use the password APIs and Settings, and nothing else new", async () => {
    expect(checkinMayUse("/api/auth/password")).toBe(true);
    expect(checkinMayUse("/api/auth/sessions")).toBe(true);
    expect(checkinMayUse("/settings")).toBe(true);
    expect(checkinMayUse("/api/admin/users")).toBe(false);
    const id = await existingLeader("kids@example.org", "Kim");
    await setLeaderRole("demo", id, "checkin", "x");
    req.cookie = await signedIn("kids@example.org");
    req.path = "/api/auth/password";
    const changed = await changePasswordRoute(post("/api/auth/password", { current: GOOD, password: GOOD2 }));
    expect(changed.status).toBe(200);
    req.cookie = cookieOf(changed);
    req.path = "/api/auth/sessions";
    const fresh = await otherSessionsRoute();
    expect(fresh.status).toBe(200);
    req.cookie = cookieOf(fresh);
    req.path = "/api/admin/users";
    expect((await adminList()).status).toBe(403);
  });
});

describe("owner recovery", () => {
  const RECOVERY = "r3cover-this-barnabas-0123456789";
  const recover = (body: Record<string, unknown>) => recoverRoute(post("/api/auth/recover", { email: OWNER, recoveryCode: RECOVERY, code: CODE, password: GOOD2, ...body }));

  it("is off when the recovery code is unset or shorter than 24 characters", async () => {
    expect((await recover({})).status).toBe(404);
    vi.stubEnv("BARNABAS_RECOVERY_CODE", "too-short-code");
    expect((await recover({ recoveryCode: "too-short-code" })).status).toBe(404);
  });

  it("works only for owners, with both codes, and bumps the session version", async () => {
    vi.stubEnv("BARNABAS_RECOVERY_CODE", RECOVERY);
    const oldCookie = await signedIn(OWNER);
    const failures = [await recover({ email: ADMIN2 }), await recover({ recoveryCode: RECOVERY + "x" }), await recover({ code: "nope" })];
    expect(failures.map((r) => r.status)).toEqual([401, 401, 401]);
    const bodies = new Set(await Promise.all(failures.map(async (r) => JSON.stringify(await r.json()))));
    expect(bodies.size).toBe(1);
    expect((await recover({ password: "password1" })).status).toBe(400);
    ip = "198.51.100.7";
    const ok = await recover({});
    expect(ok.status).toBe(200);
    req.cookie = oldCookie;
    expect(await currentLeader()).toBeNull();
    expect((await signin({ email: OWNER, password: GOOD2 })).status).toBe(200);
    const owner = await getLeaderRecord("demo", await leaderIdFor("demo", OWNER));
    expect(owner?.sessionVersion).toBe(1);
    expect(everything()).not.toContain(RECOVERY);
  });

  it("clears a lockout", async () => {
    vi.stubEnv("BARNABAS_RECOVERY_CODE", RECOVERY);
    await signedIn(OWNER);
    for (let i = 0; i < LOCKOUT.failures; i++) await signin({ email: OWNER, password: `nope ${i}` });
    expect((await signin({ email: OWNER, password: GOOD })).status).toBe(429);
    ip = "198.51.100.8";
    expect((await recover({})).status).toBe(200);
    expect((await signin({ email: OWNER, password: GOOD2 })).status).toBe(200);
  });

  it("allows 5 attempts per address an hour and locks for an hour after 10 failures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("BARNABAS_RECOVERY_CODE", RECOVERY);
    for (let i = 0; i < RECOVERY_LIMITS.perIp; i++) expect((await recover({ code: "nope" })).status).toBe(401);
    expect((await recover({})).status).toBe(429);
    // Five more failures from another address make ten: recovery locks for everyone, right codes included.
    ip = "198.51.100.9";
    for (let i = 0; i < 5; i++) await recover({ code: "nope" });
    ip = "198.51.100.10";
    expect((await recover({})).status).toBe(429);
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect((await recover({})).status).toBe(200);
  });
});

describe("account deletion still works", () => {
  it("deletes your own data and signs you out", async () => {
    await existingLeader("sam@example.org");
    await signedIn("sam@example.org");
    const id = await leaderIdFor("demo", "sam@example.org");
    expect(await getProfile({ churchId: "demo", leaderId: id, name: "Sam", email: "sam@example.org", role: "" })).toBeTruthy();
    const res = await deleteAccount(post("/api/account", { confirm: "DELETE" }, "DELETE"));
    expect(res.status).toBe(200);
    expect(await kv().get(credKey("demo", id))).toBeNull();
    expect(await currentLeader()).toBeNull();
  });
});
