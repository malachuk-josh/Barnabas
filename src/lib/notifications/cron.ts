function sameText(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** True when the request carries `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends). Fails closed. */
export function cronAuthorized(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 16) return false;
  return sameText(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
