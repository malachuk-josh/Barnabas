import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret } from "../config";

export const SESSION_COOKIE = "barnabas_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Leader = {
  churchId: string;
  leaderId: string;
  name: string;
  email: string;
  role: string;
};

export async function signSession(leader: Leader): Promise<string> {
  return new SignJWT({ ...leader })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .setSubject(`${leader.churchId}:${leader.leaderId}`)
    .sign(sessionSecret());
}

export async function verifySession(token: string | undefined): Promise<Leader | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    const { churchId, leaderId, name, email, role } = payload as Record<string, unknown>;
    if (typeof churchId !== "string" || typeof leaderId !== "string") return null;
    return {
      churchId,
      leaderId,
      name: String(name ?? ""),
      email: String(email ?? ""),
      role: String(role ?? ""),
    };
  } catch {
    return null;
  }
}

/** The signed-in leader for this request, or null. */
export async function currentLeader(): Promise<Leader | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
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
