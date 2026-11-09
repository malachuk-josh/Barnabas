import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret } from "../config";
import { getLeaderRecordCached } from "../team";

export const SESSION_COOKIE = "barnabas_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Leader = {
  churchId: string;
  leaderId: string;
  name: string;
  email: string;
  role: string;
  /**
   * The leader record's session version when this session was signed. When the record's version moves on
   * (password change or reset, removal, "Sign out everywhere"), sessions signed earlier stop working.
   * Sessions from before versions existed carry none, which counts as 0.
   */
  sv?: number;
};

export async function signSession(leader: Leader): Promise<string> {
  const { churchId, leaderId, name, email, role, sv } = leader;
  return new SignJWT({ churchId, leaderId, name, email, role, sv: sv ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .setSubject(`${leader.churchId}:${leader.leaderId}`)
    .sign(sessionSecret());
}

/** Checks the signature and expiry only. Use `validSession` (or `currentLeader`) to also check revocation. */
export async function verifySession(token: string | undefined): Promise<Leader | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    const { churchId, leaderId, name, email, role, sv } = payload as Record<string, unknown>;
    if (typeof churchId !== "string" || typeof leaderId !== "string") return null;
    return {
      churchId,
      leaderId,
      name: String(name ?? ""),
      email: String(email ?? ""),
      role: String(role ?? ""),
      sv: typeof sv === "number" && Number.isInteger(sv) && sv >= 0 ? sv : 0,
    };
  } catch {
    return null;
  }
}

/**
 * A signed session that's still good: the leader's record exists, they haven't been removed and haven't set
 * up yet as an invite, and the session's version matches the record's. One (briefly cached) Redis read.
 */
export async function validSession(token: string | undefined): Promise<Leader | null> {
  const leader = await verifySession(token);
  if (!leader) return null;
  const record = await getLeaderRecordCached(leader.churchId, leader.leaderId);
  if (!record || record.status === "removed" || record.status === "invited") return null;
  if ((record.sessionVersion ?? 0) !== (leader.sv ?? 0)) return null;
  return leader;
}

/** The signed-in leader for this request, or null. Every page and API reaches the session through here. */
export async function currentLeader(): Promise<Leader | null> {
  const store = await cookies();
  return validSession(store.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

/** Stable, non-reversible leader id from the email address. */
export async function leaderIdFor(churchId: string, email: string): Promise<string> {
  const data = new TextEncoder().encode(`${churchId}:${email.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
