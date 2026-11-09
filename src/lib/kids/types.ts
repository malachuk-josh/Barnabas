import type { GatheringKey } from "../ops/gatherings";

/** `email` links a guardian to their Barnabas sign-in, for Messages and their own Child care page. */
export type Guardian = { name: string; phone?: string; email?: string; relationship?: string };
export type Pickup = { name: string; relationship?: string };

export type Child = {
  id: string;
  firstName: string;
  lastName: string;
  /** yyyy-mm-dd, optional. */
  birthdate?: string;
  grade?: string;
  /** Shown on the station and printed on the child's label, for safety. */
  allergies?: string;
  /** Kids admins only: never on labels, the station or anywhere outside the family record. */
  medical?: string;
  /** The room this child usually goes to. */
  roomId?: string;
};

export type Household = {
  id: string;
  /** e.g. "Rivera" (the station searches it). */
  name: string;
  guardians: Guardian[];
  children: Child[];
  /** Besides the guardians, who may pick the children up. */
  pickups: Pickup[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type Room = {
  id: string;
  name: string;
  ages: string;
  /** Children per adult; a room over this gets a ratio warning. */
  ratio: number;
  capacity?: number;
  gatherings: GatheringKey[];
};

export type CheckIn = {
  id: string;
  date: string;
  gathering: GatheringKey;
  roomId: string;
  childId: string;
  householdId: string;
  /** Matches the parent's pickup tag. Shown to the station only while the child is checked in. */
  pickupCode: string;
  checkedInAt: number;
  checkedInBy: string;
  checkedOutAt?: number;
  checkedOutBy?: string;
  pickedUpBy?: string;
};

/** Every check-in, check-out and refused checkout, kept for the church's safety records. */
export type KidsLogEntry = { at: number; action: "checkin" | "checkout" | "checkout_refused" | "staff" | "family"; by: string; detail: string };

export type KidsMeta = { demo: boolean; createdAt: number; clearedAt?: number };

export type KidsBook = {
  meta: KidsMeta;
  rooms: Room[];
  households: Household[];
  checkins: CheckIn[];
  /** Adults serving in a room: `${date}|${gathering}|${roomId}` -> count. */
  staffing: Record<string, number>;
  log: KidsLogEntry[];
};
