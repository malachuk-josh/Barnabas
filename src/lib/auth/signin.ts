import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { accessCode, config } from "../config";
import { ensureProfile, handsFreeOnSignIn } from "../profile";
import { getLeaderRecord, recordSignIn } from "../team";
import { checkStoredPassword, credentialState, setPassword } from "./credentials";
import { clearFailures, ipBlocked, isLocked, recordFailure } from "./lockout";
import { PASSWORD_MAX, burnPasswordCheck, checkPassword } from "./password";
import { isOwnerEmail } from "./roles";
import { leaderIdFor, signSession, type Leader } from "./session";
import { joinPolicy } from "./settings";

/** Constant-time text comparison (hashing first makes the lengths equal). */
export function sameSecret(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y) && a.length === b.length;
}

export const SignInBody = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().max(PASSWORD_MAX * 2).optional().default(""),
  code: z.string().min(1).max(200),
  /** The password chosen in the "Create your password" step (or when creating an account). */
  newPassword: z.string().max(PASSWORD_MAX * 2).optional(),
  /** Only when creating an account. */
  name: z.string().trim().min(1).max(80).optional(),
  role: z.string().trim().max(80).optional(),
  timezone: z.string().max(80).optional(),
});
export type SignInInput = z.infer<typeof SignInBody>;

export type SignInResult =
  | { kind: "session"; token: string; leader: Leader }
  /** The email and access code were right; choose a password before a session is given. */
  | { kind: "step"; step: "create-password"; reason: "first" | "temporary" }
  /** A new email where joining with the access code is allowed: name and password needed. */
  | { kind: "step"; step: "create-account" }
  | { kind: "error"; status: 400 | 401 | 429 | 503; error: string; field?: "newPassword" | "name" };

export const MESSAGES = {
  mismatch: "That email, password or access code didn't match. Check them and try again.",
  inviteOnly: "Ask your church administrator for an invite.",
  locked: "Too many tries for this email. For safety, sign-in is paused for 15 minutes. Your church administrator can unlock it sooner.",
  tooMany: "Too many sign-in attempts from this network. Please wait a few minutes and try again.",
  notSetUp: "Sign-in isn't set up yet. Ask your administrator to set BARNABAS_ACCESS_CODE.",
  sameAsTemporary: "Choose a new password of your own, not the temporary one.",
  needName: "Tell us your name to create your account.",
};

/**
 * One sign-in attempt. Every failure (wrong code, wrong password, unknown or removed email) gives the same
 * answer and counts toward the per-email lockout and the per-address limit. The only different answers come
 * after the email and the church access code are both right: an existing leader without a password (everyone
 * from before passwords) or with a temporary one is asked to create their password, and where the owner lets
 * anyone with the code join, a new email is asked for a name and password.
 */
export async function attemptSignIn(input: SignInInput, ip: string): Promise<SignInResult> {
  const churchId = config.churchId;
  const email = input.email.toLowerCase();
  if (await ipBlocked(ip)) return { kind: "error", status: 429, error: MESSAGES.tooMany };
  if (await isLocked(churchId, email)) return { kind: "error", status: 429, error: MESSAGES.locked };
  const expected = accessCode();
  if (!expected) return { kind: "error", status: 503, error: MESSAGES.notSetUp };

  const policy = await joinPolicy(churchId);
  const fail = async (): Promise<SignInResult> => {
    const locked = await recordFailure(churchId, email, ip);
    if (locked) return { kind: "error", status: 429, error: MESSAGES.locked };
    return { kind: "error", status: 401, error: policy === "invite" ? `${MESSAGES.mismatch} New to Barnabas? ${MESSAGES.inviteOnly}` : MESSAGES.mismatch };
  };

  const leaderId = await leaderIdFor(churchId, email);
  const [record, cred] = await Promise.all([getLeaderRecord(churchId, leaderId), credentialState(churchId, leaderId)]);
  const codeOk = sameSecret(input.code.trim(), expected);

  if (!codeOk || record?.status === "removed") {
    await burnPasswordCheck(input.password || "-");
    return fail();
  }

  const choose = (password: string | undefined) => {
    if (!password) return null;
    const check = checkPassword(password, email);
    return check.ok ? password : check;
  };

  if (cred.hasPassword) {
    const result = await checkStoredPassword(churchId, leaderId, input.password);
    if (result !== "match") return fail();
    await clearFailures(churchId, email);
    if (cred.mustChangePassword) {
      if (!input.newPassword) return { kind: "step", step: "create-password", reason: "temporary" };
      if (input.newPassword === input.password) return { kind: "error", status: 400, error: MESSAGES.sameAsTemporary, field: "newPassword" };
      const chosen = choose(input.newPassword);
      if (typeof chosen !== "string") return { kind: "error", status: 400, error: chosen?.ok === false ? chosen.error : MESSAGES.mismatch, field: "newPassword" };
      await setPassword(churchId, leaderId, chosen);
    }
    return complete(churchId, leaderId, email, input, record?.name);
  }

  // No password yet.
  await burnPasswordCheck(input.password || "-");
  if (record?.status === "invited") return fail(); // Invited leaders set their password from their link.
  if (!record && !(policy === "code" || isOwnerEmail(email))) return fail();
  await clearFailures(churchId, email);
  if (!record && (!input.newPassword || !input.name)) {
    if (input.newPassword && !input.name) return { kind: "error", status: 400, error: MESSAGES.needName, field: "name" };
    return { kind: "step", step: "create-account" };
  }
  if (!input.newPassword) return { kind: "step", step: "create-password", reason: "first" };
  const chosen = choose(input.newPassword);
  if (typeof chosen !== "string") return { kind: "error", status: 400, error: chosen?.ok === false ? chosen.error : MESSAGES.mismatch, field: "newPassword" };
  await setPassword(churchId, leaderId, chosen);
  return complete(churchId, leaderId, email, input, record?.name);
}

/** The sign-in work from before passwords: profile (with the leadership prefill), hands-free, the team record. */
async function complete(churchId: string, leaderId: string, email: string, input: SignInInput, knownName?: string): Promise<SignInResult> {
  const leader: Leader = { churchId, leaderId, name: knownName || input.name || email.split("@")[0]!, email, role: input.role ?? "" };
  const profile = await handsFreeOnSignIn(leader, await ensureProfile(leader, input.timezone));
  // A returning leader keeps the name and role they set in Settings.
  leader.name = profile.name;
  leader.role = profile.role;
  const record = await recordSignIn(leader);
  leader.sv = record.sessionVersion ?? 0;
  return { kind: "session", token: await signSession(leader), leader };
}
