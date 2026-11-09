import { bookStore } from "../store/book";
import type { KidsBook, Room } from "./types";

/**
 * Redis layout, per church (children's data: kids.checkin and kids.admin only, never sent to Claude
 * beyond counts and first names, never in memory):
 *   kids:{church}:meta        demo flag
 *   kids:{church}:rooms       rooms and classes, ratios and the gatherings they meet at
 *   kids:{church}:households  families: guardians, children (allergies, medical notes), authorized pickups
 *   kids:{church}:checkins    check-ins and check-outs with pickup codes
 *   kids:{church}:staffing    adults serving per room per gathering
 *   kids:{church}:log         every check-in, check-out and refused checkout
 */
export const PARTS = ["meta", "rooms", "households", "checkins", "staffing", "log"] as const;

/** The rooms every church starts with. No families or children are seeded. */
export function defaultRooms(): Room[] {
  return [
    { id: "nursery", name: "Nursery", ages: "Birth to 2", ratio: 3, capacity: 12, gatherings: ["sun-0830", "sun-0945", "sun-1045"] },
    { id: "preschool", name: "Preschool", ages: "Ages 3 to 5", ratio: 5, capacity: 20, gatherings: ["sun-0945", "sun-1045"] },
    { id: "elementary", name: "Elementary Growth Group", ages: "K to 5th grade", ratio: 8, capacity: 30, gatherings: ["sun-0945"] },
    { id: "kids-church", name: "Kids Church", ages: "K to 3rd grade", ratio: 8, capacity: 30, gatherings: ["sun-1045"] },
    { id: "kids-club", name: "Kids Club", ages: "K to 5th grade", ratio: 8, capacity: 40, gatherings: ["wed-1800"] },
  ];
}

export const emptyKids = (): KidsBook => ({ meta: { demo: false, createdAt: Date.now() }, rooms: defaultRooms(), households: [], checkins: [], staffing: {}, log: [] });

const store = bookStore<KidsBook>({ prefix: "kids", parts: PARTS, empty: emptyKids });

export const loadKids = store.load;
export const updateKids = store.update;
