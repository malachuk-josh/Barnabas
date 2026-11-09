import { churchData } from "../chms";
import type { DraftRecipient } from "../data/records";
import { loadCare } from "../care/store";
import { loadServe } from "../serve/store";
import { getLeaderRecord } from "../team";
import { normalizeEmail, normalizePhone } from "./phone";

/**
 * Where a recipient's number or address comes from, first match wins: what the draft carried, the guest
 * card (care follow-ups), the volunteer record (serving reminders), the church directory, and for drafts a
 * leader writes to themselves (the monthly report), their sign-in email.
 */
export async function resolveContact(churchId: string, r: DraftRecipient, channel: "sms" | "email"): Promise<string | null> {
  const pick = (phone?: string | null, email?: string | null) => (channel === "sms" ? normalizePhone(phone) : normalizeEmail(email));
  const direct = pick(r.phone, r.email);
  if (direct) return direct;
  if (r.personId.startsWith("leader:")) {
    const rec = await getLeaderRecord(churchId, r.personId.slice(7));
    return channel === "email" ? normalizeEmail(rec?.email) : null;
  }
  const [care, serve] = await Promise.all([loadCare(churchId).catch(() => null), loadServe(churchId).catch(() => null)]);
  const guest = care?.guests.find((g) => g.id === r.personId);
  if (guest) return pick(guest.phone, guest.email);
  const vol = serve?.volunteers.find((v) => v.id === r.personId || (v.personId && v.personId === r.personId));
  const volContact = vol ? pick(vol.phone, vol.email) : null;
  if (volContact) return volContact;
  const person = await churchData().getPerson(vol?.personId ?? r.personId);
  return person ? pick(person.phone, person.email) : null;
}
