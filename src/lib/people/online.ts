import type { Leader } from "../auth/session";
import { invalidateChurchData } from "../chms";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { normalizeEmail } from "../messages/phone";
import { displayName, isActive } from "./native";
import { loadPeople, updatePeople } from "./store";
import type { PersonRecord } from "./types";

/**
 * Who gave online, matched to People by email only:
 *
 *   - exactly one active person has the giver's email: the gift links to them;
 *   - several people share it: the gift keeps the giver's name, links to no one, and is flagged for review;
 *   - no one has it: a minimal person (name and email) is added, flagged "from online giving" for a leader
 *     to review. If someone in People has the same name, that's noted as a possible match, never merged.
 *
 * Names alone never link or merge anyone.
 */

export type GiverMatch = { personId?: string; donorName: string; created: boolean; ambiguous: boolean };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** A tidy display name from what Stripe collected; falls back to the part of the email before the @. */
export function giverName(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name ?? "").replace(/[^\p{L}\p{M}' .-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (n) return n;
  const local = (email ?? "").split("@")[0]?.replace(/[._+-]+/g, " ").trim();
  return local ? local.slice(0, 60) : "Online giver";
}

export async function matchGiver(actor: Leader, raw: { email?: string | null; name?: string | null }): Promise<GiverMatch> {
  const email = normalizeEmail(raw.email);
  const name = giverName(raw.name, raw.email);
  if (!email) return { donorName: name, created: false, ambiguous: false };
  const sameEmail = (p: PersonRecord) => isActive(p) && normalizeEmail(p.email) === email;
  const book0 = await loadPeople(actor.churchId);
  const found0 = book0.people.filter(sameEmail);
  if (found0.length === 1) return { personId: found0[0].id, donorName: displayName(found0[0]), created: false, ambiguous: false };
  if (found0.length > 1) return { donorName: name, created: false, ambiguous: true };
  const result = await updatePeople(actor.churchId, ["people"], (book) => {
    const found = book.people.filter(sameEmail);
    if (found.length === 1) return { person: found[0], created: false, ambiguous: false };
    if (found.length > 1) return { person: null, created: false, ambiguous: true };
    const { firstName, lastName } = splitName(name);
    const possible = book.people.filter((p) => isActive(p) && norm(displayName(p)) === norm(name)).map((p) => p.id);
    const now = Date.now();
    const person: PersonRecord = {
      id: newId("per"),
      firstName,
      lastName,
      email,
      status: "visitor",
      language: "en",
      custom: {},
      createdAt: now,
      updatedAt: now,
      review: { reason: "online_giving", at: now, possibleMatchIds: possible.length ? possible : undefined },
    };
    book.people.push(person);
    return { person, created: true, ambiguous: false };
  });
  if (result.created && result.person) {
    invalidateChurchData();
    await audit(actor, { action: "people.add", detail: `${result.person.id} from online giving (for review)` });
  }
  if (!result.person) return { donorName: name, created: false, ambiguous: result.ambiguous };
  return { personId: result.person.id, donorName: displayName(result.person), created: result.created, ambiguous: false };
}

/** People added by online giving that no leader has reviewed yet. */
export async function peopleToReview(churchId: string) {
  const book = await loadPeople(churchId);
  return book.people
    .filter((p) => isActive(p) && p.review?.reason === "online_giving" && !p.review.reviewedAt)
    .map((p) => ({ id: p.id, name: displayName(p), email: p.email, at: p.review!.at, possibleMatches: (p.review!.possibleMatchIds ?? []).map((id) => ({ id, name: displayName(book.people.find((x) => x.id === id) ?? { firstName: "?", lastName: "" }) })) }));
}

/** A leader looked at the person and kept them as they are (merging goes through People's merge). */
export async function markReviewed(leader: Leader, personId: string) {
  const ok = await updatePeople(leader.churchId, ["people"], (book) => {
    const p = book.people.find((x) => x.id === personId);
    if (!p?.review) return false;
    p.review.reviewedAt = Date.now();
    p.review.reviewedBy = leader.name;
    return true;
  });
  if (ok) await audit(leader, { action: "people.review", detail: `${personId} reviewed (from online giving)` });
  return ok;
}
