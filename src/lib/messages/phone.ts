/** US-first phone normalization to E.164 ("+14135550142"). Returns null for anything that can't be texted. */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizeEmail(raw: string | undefined | null): string | null {
  const e = raw?.trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** For the send log and screens: never show a full number or address. */
export function maskAddress(to: string): string {
  if (to.includes("@")) {
    const [user, domain] = to.split("@");
    return `${user.slice(0, 1)}•••@${domain}`;
  }
  return `•••${to.replace(/\D/g, "").slice(-4)}`;
}
