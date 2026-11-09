import type { Leader } from "../auth/session";
import { kidsActor, searchFamilies, type KidsActor } from "./service";
import { loadKids } from "./store";
import type { Household, KidsBook } from "./types";

export async function kidsFor(leader: Leader) {
  const [actor, book] = await Promise.all([kidsActor(leader), loadKids(leader.churchId)]);
  return { actor, book };
}

const last4 = (phone?: string) => (phone ?? "").replace(/\D/g, "").slice(-4);

/**
 * A family as the station sees it: names, allergies (they're on the label), who may pick up, and which
 * children are checked in now. Never medical notes, full phone numbers or pickup codes.
 */
export function stationFamily(book: KidsBook, h: Household, date: string, gathering: string) {
  return {
    id: h.id,
    name: h.name,
    guardians: h.guardians.map((g) => ({ name: g.name, relationship: g.relationship, phoneLast4: last4(g.phone) || undefined })),
    pickups: h.pickups.map((p) => ({ name: p.name, relationship: p.relationship })),
    children: h.children.map((c) => {
      const active = book.checkins.find((x) => x.childId === c.id && x.date === date && x.gathering === gathering && !x.checkedOutAt);
      return { id: c.id, firstName: c.firstName, lastName: c.lastName, grade: c.grade, allergies: c.allergies, roomId: c.roomId, checkin: active ? { id: active.id, roomId: active.roomId, at: active.checkedInAt } : null };
    }),
  };
}

export function stationSearch(book: KidsBook, actor: KidsActor, q: string, date: string, gathering: string) {
  if (!actor.station) return [];
  return searchFamilies(book, q).slice(0, 12).map((h) => stationFamily(book, h, date, gathering));
}
