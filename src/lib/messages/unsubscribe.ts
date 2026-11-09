import { sessionSecret } from "../config";
import { hmacToken, safeEqual } from "./signatures";

/** Stateless unsubscribe tokens: the church and address, signed with a key derived from SESSION_SECRET. */
const purpose = "barnabas-unsubscribe-v1:";

export function unsubscribeToken(churchId: string, email: string): string {
  const payload = Buffer.from(JSON.stringify({ c: churchId, e: email.toLowerCase() })).toString("base64url");
  return `${payload}.${hmacToken(sessionSecret(), purpose + payload)}`;
}

export function readUnsubscribeToken(token: string | null | undefined): { churchId: string; email: string } | null {
  if (!token || token.length > 600) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, hmacToken(sessionSecret(), purpose + payload))) return null;
  try {
    const { c, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { c?: unknown; e?: unknown };
    return typeof c === "string" && typeof e === "string" ? { churchId: c, email: e } : null;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(base: string, churchId: string, email: string) {
  return `${base}/api/messages/unsubscribe?t=${encodeURIComponent(unsubscribeToken(churchId, email))}`;
}
