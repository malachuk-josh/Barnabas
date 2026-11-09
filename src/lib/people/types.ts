import type { Language } from "../chms/types";
import type { GatheringKey } from "../ops/gatherings";

/**
 * The church's own People database: Barnabas is the system of record. People move in once from ChurchTrac
 * or Planning Center (the migration tool) and are kept here from then on.
 */

export const MEMBER_STATUSES = ["member", "regular", "visitor", "child", "inactive", "deceased"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export const MEMBER_LABELS: Record<MemberStatus, string> = { member: "Member", regular: "Regular attender", visitor: "Visitor", child: "Child", inactive: "Inactive", deceased: "Deceased" };

export const HOUSEHOLD_ROLES = ["head", "spouse", "child", "other"] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];
export const ROLE_LABELS: Record<HouseholdRole, string> = { head: "Head of household", spouse: "Spouse", child: "Child", other: "Other" };

export type Address = { street?: string; city?: string; state?: string; zip?: string };

export type PersonRecord = {
  id: string;
  firstName: string;
  lastName: string;
  /** What they go by, if not their first name. */
  nickname?: string;
  email?: string;
  /** Mobile, E.164 when it could be read. */
  phone?: string;
  homePhone?: string;
  address?: Address;
  /** yyyy-mm-dd; a year of 1900 means "month and day only". */
  birthdate?: string;
  anniversary?: string;
  status: MemberStatus;
  membershipDate?: string;
  householdId?: string;
  householdRole?: HouseholdRole;
  language: Language;
  /** On the church's published leadership. */
  leadership?: boolean;
  /** Custom field id → value. */
  custom: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  /** Merged into another record: links that still point here follow it. */
  mergedInto?: string;
  /** The import batch and stable row key that created it (for undo and idempotent re-imports). */
  source?: { batchId: string; key: string; system: "churchtrac" | "planning_center" | "csv" };
  /**
   * Added by online giving (no one in People had the giver's email): a minimal record for a leader to review,
   * and merge into an existing person if it's someone the church knows. Never merged automatically.
   */
  review?: { reason: "online_giving"; at: number; possibleMatchIds?: string[]; reviewedAt?: number; reviewedBy?: string };
};

export type HouseholdRecord = { id: string; name: string; address?: Address; homePhone?: string; createdAt: number; source?: PersonRecord["source"]; archivedAt?: number };

export const GROUP_KINDS = ["small_group", "class", "ministry", "team", "other"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];
export const GROUP_LABELS: Record<GroupKind, string> = { small_group: "Small group", class: "Class", ministry: "Ministry", team: "Team", other: "Other" };

export type GroupRecord = {
  id: string;
  name: string;
  kind: GroupKind;
  /** e.g. "Tuesdays 7:00 PM". */
  meets?: string;
  description?: string;
  leaderIds: string[];
  memberIds: string[];
  createdAt: number;
  archivedAt?: number;
  source?: PersonRecord["source"];
};

export type AttendanceEntry = {
  id: string;
  personId: string;
  date: string;
  kind: "worship" | "group";
  gathering?: GatheringKey;
  groupId?: string;
  present: boolean;
  recordedBy: string;
  at: number;
  batchId?: string;
  key?: string;
};

export type PersonNote = { id: string; personId: string; text: string; byId: string; byName: string; at: number; /** Pastors only (care.view_all), like confidential care. */ private: boolean };

export const FIELD_KINDS = ["text", "date", "yesno", "choice"] as const;
export type CustomField = { id: string; label: string; kind: (typeof FIELD_KINDS)[number]; options?: string[]; createdAt: number };

/** One run of the migration tool: what it added and what it changed, so the whole batch can be undone. */
export type ImportBatch = {
  id: string;
  system: "churchtrac" | "planning_center" | "csv";
  file: "people" | "groups" | "attendance" | "giving";
  fileName?: string;
  at: number;
  byId: string;
  byName: string;
  counts: Record<string, number>;
  skipped: { reason: string; count: number }[];
  created: { people: string[]; households: string[]; groups: string[]; attendance: string[]; gifts: string[]; txns: string[]; funds: string[] };
  /** Records as they were before this batch updated them. */
  before: { people: PersonRecord[]; groups: GroupRecord[] };
  undoneAt?: number;
  undoneBy?: string;
};

export type PeopleMeta = { demo: boolean; createdAt: number; clearedAt?: number; /** When the church's published leaders were added to the directory (once). */ leadersAddedAt?: number };

export type PeopleBook = {
  meta: PeopleMeta;
  people: PersonRecord[];
  households: HouseholdRecord[];
  groups: GroupRecord[];
  attendance: AttendanceEntry[];
  notes: PersonNote[];
  fields: CustomField[];
  imports: ImportBatch[];
};
