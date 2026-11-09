import { createHash } from "node:crypto";
import { z } from "zod";
import { accessCode, config } from "../config";
import { kv } from "../store";
import { bumpSessionVersion, getLeaderRecord, writeLeaderRecord } from "../team";
import { setPassword } from "./credentials";
import { adminAudit } from "./adminLog";
import { revokeLinks } from "./links";
import { unlock } from "./lockout";
import { PASSWORD_MAX, burnPasswordCheck, checkPassword } from "./password";
import { isOwnerEmail } from "./roles";
import { leaderIdFor } from "./session";
import { sameSecret } from "./signin";

/**
 * Owner recovery at /recover, for an owner who has forgotten their password. Off unless
 * BARNABAS_RECOVERY_CODE is set to at least 24 characters. Needs an owner email, the recovery code and the
 * church access code; any mistake gets the same answer. At most 5 attempts per network address an hour,
 * and 10 failures in all lock recovery for an hour. The codes are never logged or stored.
 */
export const RECOVERY_MIN_LENGTH = 24;
export const RECOVERY_LIMITS = { perIp: 5, ipWindowSeconds: 60 * 60, failures: 10, failureWindowSeconds: 60 * 60, lockSeconds: 60 * 60 } as const;

export function recoveryCode(env: NodeJS.ProcessEnv = process.env): string | null {
  const code = env.BARNABAS_RECOVERY_CODE?.trim();
  return code && code.length >= RECOVERY_MIN_LENGTH ? code : null;
}

/** Whether BARNABAS_RECOVERY_CODE is set at all (the Admin console warns while it is). */
export function recoveryCodeIsSet(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.BARNABAS_RECOVERY_CODE?.trim());
}

export const RecoverBody = z.object({
  email: z.string().trim().email().max(200),
  recoveryCode: z.string().min(1).max(500),
  code: z.string().min(1).max(200),
  password: z.string().min(1).max(PASSWORD_MAX * 2),
});

export const RECOVERY_MESSAGES = {
  off: "Owner recovery isn't turned on for this Barnabas.",
  failed: "Those details didn't match. Check the owner email and both codes, and try again.",
  tooMany: "Too many recovery attempts. Please wait an hour and try again.",
};

const ipKey = (ip: string) => `rl:recover:ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
const failKey = `recover:failures`;
const lockKey = `recover:lock`;

export type RecoverResult = { ok: true } | { ok: false; status: 400 | 401 | 404 | 429; error: string };

export async function recoverOwner(input: z.infer<typeof RecoverBody>, ip: string, env: NodeJS.ProcessEnv = process.env): Promise<RecoverResult> {
  const recovery = recoveryCode(env);
  if (!recovery) return { ok: false, status: 404, error: RECOVERY_MESSAGES.off };
  if (await kv().get(lockKey)) return { ok: false, status: 429, error: RECOVERY_MESSAGES.tooMany };
  if ((await kv().incr(ipKey(ip), RECOVERY_LIMITS.ipWindowSeconds)) > RECOVERY_LIMITS.perIp) return { ok: false, status: 429, error: RECOVERY_MESSAGES.tooMany };

  const email = input.email.toLowerCase();
  const expectedAccess = accessCode();
  // Every check runs, so the time taken doesn't say which one failed.
  const recoveryOk = sameSecret(input.recoveryCode.trim(), recovery);
  const accessOk = Boolean(expectedAccess) && sameSecret(input.code.trim(), expectedAccess ?? "");
  const ownerOk = isOwnerEmail(email, env.BARNABAS_OWNER_EMAILS, env.BARNABAS_ADMIN_EMAILS);
  if (!(recoveryOk && accessOk && ownerOk)) {
    await burnPasswordCheck(input.password);
    const failures = await kv().incr(failKey, RECOVERY_LIMITS.failureWindowSeconds);
    if (failures >= RECOVERY_LIMITS.failures) {
      await kv().set(lockKey, "1", { ttlSeconds: RECOVERY_LIMITS.lockSeconds });
      await kv().del(failKey);
    }
    return { ok: false, status: 401, error: RECOVERY_MESSAGES.failed };
  }
  const policy = checkPassword(input.password, email);
  if (!policy.ok) return { ok: false, status: 400, error: policy.error };

  const churchId = config.churchId;
  const leaderId = await leaderIdFor(churchId, email);
  const record = await getLeaderRecord(churchId, leaderId);
  if (record && record.status !== "active" && record.status !== undefined) {
    // An owner can't be removed in the console; if their record says otherwise, recovery restores it.
    await writeLeaderRecord({ ...record, status: "active" });
  }
  await setPassword(churchId, leaderId, input.password);
  await revokeLinks(churchId, leaderId);
  await unlock(churchId, email);
  await bumpSessionVersion(churchId, leaderId);
  await kv().del(failKey);
  await adminAudit(
    { churchId, leaderId, name: record?.name ?? email, email, role: record?.role ?? "" },
    { action: "owner_recovery", targetId: leaderId, targetEmail: email, detail: "Owner password set with the recovery code" },
  );
  return { ok: true };
}
