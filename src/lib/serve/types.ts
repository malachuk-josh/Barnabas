import type { GatheringKey } from "../ops/gatherings";

export type Position = { id: string; name: string; /** How many people the position needs at each gathering. */ needed: number };

export type ServeTeam = {
  id: string;
  name: string;
  /** The team lead, by name (a church leader). They can edit this team's roster. */
  lead?: string;
  /** Signed-in leaders who may also edit this team's roster. */
  leadLeaderIds?: string[];
  gatherings: GatheringKey[];
  positions: Position[];
};

export type Blackout = { id: string; from: string; to: string; note?: string };

export type Volunteer = {
  id: string;
  name: string;
  /** The ChMS person, when they're in the directory. */
  personId?: string;
  /** The signed-in leader this volunteer is, when they use Barnabas. */
  leaderId?: string;
  teamIds: string[];
  email?: string;
  phone?: string;
  /** Never scheduled more than this many Sundays (dates) in a calendar month. */
  maxPerMonth?: number;
  /** On the church's published leadership. */
  leadership?: boolean;
  blackouts: Blackout[];
  createdAt: number;
  demo?: boolean;
};

export const ASSIGNMENT_STATUSES = ["scheduled", "confirmed", "declined"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export type Assignment = {
  id: string;
  date: string;
  gathering: GatheringKey;
  teamId: string;
  positionId: string;
  volunteerId: string;
  status: AssignmentStatus;
  source: "scheduler" | "signup" | "swap" | "auto" | "demo";
  remindedAt?: number;
  createdAt: number;
  createdBy: string;
  demo?: boolean;
};

export type SwapRequest = {
  id: string;
  assignmentId: string;
  fromVolunteerId: string;
  toVolunteerId: string;
  note?: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: number;
  createdBy: string;
  resolvedAt?: number;
  resolvedBy?: string;
};

export type ServeMeta = { demo: boolean; createdAt: number; clearedAt?: number };

export type ServeBook = {
  meta: ServeMeta;
  teams: ServeTeam[];
  volunteers: Volunteer[];
  assignments: Assignment[];
  swaps: SwapRequest[];
};
