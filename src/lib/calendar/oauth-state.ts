import { SignJWT, jwtVerify } from "jose";
import { sessionSecret } from "../config";
import type { Leader } from "../auth/session";

/** Signed, short-lived OAuth state that ties the callback to the leader who started it. */
export async function makeState(leader: Leader, provider: string) {
  return new SignJWT({ c: leader.churchId, l: leader.leaderId, p: provider })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(sessionSecret());
}

export async function checkState(state: string | null, leader: Leader, provider: string) {
  if (!state) return false;
  try {
    const { payload } = await jwtVerify(state, sessionSecret(), { algorithms: ["HS256"] });
    return payload.c === leader.churchId && payload.l === leader.leaderId && payload.p === provider;
  } catch {
    return false;
  }
}

export function appUrl(request: Request) {
  return (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}
