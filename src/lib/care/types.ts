import type { Role } from "../auth/roles";

/* ---------- Team members (who care is assigned to) ---------- */

/**
 * Someone a case can be assigned to. Leaders who have signed in are `l:{leaderId}`. Until they do,
 * the church's published leadership appear as placeholders (`demo:{slug}`): they are only assignees,
 * never the subject of a case, and they have no private dashboard.
 */
export type TeamMember = {
  id: string;
  name: string;
  title: string;
  role: Role;
  placeholder: boolean;
  /** Deacons and connections staff share guest follow-up in rotation. */
  connections: boolean;
  /** In a busy season (from the church's leadership notes): half as many guest follow-ups in rotation. */
  lighterLoad?: boolean;
  leaderId?: string;
};

/* ---------- Pastoral care cases ---------- */

export const CASE_TYPES = ["hospital", "grief", "illness", "crisis", "new_baby", "homebound", "prayer", "counseling_referral", "other"] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  hospital: "Hospital",
  grief: "Grief",
  illness: "Illness",
  crisis: "Crisis",
  new_baby: "New baby",
  homebound: "Homebound",
  prayer: "Prayer",
  counseling_referral: "Counseling referral",
  other: "Other",
};

export const CASE_STATUSES = ["new", "assigned", "active", "follow_up", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  assigned: "Assigned",
  active: "Active",
  follow_up: "Follow-up",
  closed: "Closed",
};

export const CONTACT_KINDS = ["visit", "call", "text", "card", "meal", "other"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_LABELS: Record<ContactKind, string> = {
  visit: "Visit",
  call: "Call",
  text: "Text",
  card: "Card",
  meal: "Meal",
  other: "Other contact",
};

export type CareContact = {
  id: string;
  kind: ContactKind;
  /** yyyy-mm-dd */
  date: string;
  /** Team member id of whoever made the contact. */
  byId: string;
  byName: string;
  /** A minimal note, checked against the church's memory policy. */
  note?: string;
  at: number;
};

export type CareSubject = {
  kind: "person" | "household";
  personId?: string;
  name: string;
};

export type CareCase = {
  id: string;
  subject: CareSubject;
  type: CaseType;
  status: CaseStatus;
  /** Only pastors see a confidential case, whoever it's assigned to. */
  confidential: boolean;
  assigneeId?: string;
  /** A one-line summary, policy-checked like every note. */
  summary?: string;
  nextStep?: { text: string; due?: string };
  contacts: CareContact[];
  openedById: string;
  openedByName: string;
  openedAt: number;
  updatedAt: number;
  closedAt?: number;
  closedNote?: string;
  source: "app" | "barnabas" | "legacy" | "guest";
  /** The `log_care_event` record this case was made from. */
  legacyId?: string;
  demo?: boolean;
};

/* ---------- Prayer requests ---------- */

export type PrayerRequest = {
  id: string;
  personId?: string;
  name: string;
  request: string;
  /** Shareable requests are visible to the whole team; private ones to pastors and whoever recorded it. */
  shareable: boolean;
  prayedCount: number;
  prayedBy: string[];
  answered?: { date: string; note?: string };
  createdById: string;
  createdByName: string;
  createdAt: number;
  guestId?: string;
  demo?: boolean;
};

/* ---------- Membership and discipleship ---------- */

export const PATHWAY_STEPS = ["first_visit", "discover_faith", "salvation", "baptism", "membership_class", "membership", "group", "serving", "giving"] as const;
export type PathwayStep = (typeof PATHWAY_STEPS)[number];

export const PATHWAY_LABELS: Record<PathwayStep, string> = {
  first_visit: "First visit",
  discover_faith: "Discover Faith class",
  salvation: "Salvation decision",
  baptism: "Baptism",
  membership_class: "Membership class",
  membership: "Membership",
  group: "Growth Group or Life Group",
  serving: "Serving",
  giving: "Giving",
};

export type Pathway = {
  /** A directory person_id, or a guest card id for someone not in the directory yet. */
  key: string;
  personId?: string;
  guestId?: string;
  name: string;
  /** The date of each step reached (yyyy-mm-dd). */
  steps: Partial<Record<PathwayStep, string>>;
  /** Sunday visits recorded on a guest card. */
  visits?: number;
  updatedAt: number;
  demo?: boolean;
};

export const CLASS_KINDS = ["discover_faith", "membership"] as const;
export type ClassKind = (typeof CLASS_KINDS)[number];
export const CLASS_LABELS: Record<ClassKind, string> = { discover_faith: "Discover Faith", membership: "Membership class" };
/** The pathway step a class completes. */
export const CLASS_STEP: Record<ClassKind, PathwayStep> = { discover_faith: "discover_faith", membership: "membership_class" };

export type ClassSession = { id: string; date: string; time?: string; topic: string };

export type CareClass = {
  id: string;
  kind: ClassKind;
  name: string;
  sessions: ClassSession[];
  /** Who teaches it (a team member). */
  teacherId?: string;
  teacherName?: string;
  /** Pathway keys. */
  enrollees: { key: string; name: string; enrolledAt: string; completedAt?: string }[];
  /** session id -> pathway keys who were there */
  attendance: Record<string, string[]>;
  createdAt: number;
  demo?: boolean;
};

/* ---------- Visitor follow-up ---------- */

export const GUEST_INTERESTS = ["kids", "teens", "young_adults", "growth_groups", "serving", "baptism", "membership", "discover_faith", "talk_to_pastor"] as const;
export type GuestInterest = (typeof GUEST_INTERESTS)[number];
export const INTEREST_LABELS: Record<GuestInterest, string> = {
  kids: "Kids ministry",
  teens: "Teens",
  young_adults: "Young adults",
  growth_groups: "Growth Groups and Life Groups",
  serving: "Serving",
  baptism: "Baptism",
  membership: "Membership",
  discover_faith: "Discover Faith class",
  talk_to_pastor: "Talking with a pastor",
};

export const TASK_KINDS = ["thank_you", "call", "discover_faith_invite"] as const;
export type GuestTaskKind = (typeof TASK_KINDS)[number];
export const TASK_LABELS: Record<GuestTaskKind, string> = {
  thank_you: "Thank-you message",
  call: "Welcome call",
  discover_faith_invite: "Invite to Discover Faith",
};

export type GuestTask = {
  id: string;
  kind: GuestTaskKind;
  /** When it should be done by (ms since epoch). */
  dueAt: number;
  assigneeId: string;
  /** The Barnabas draft in the review queue, for the thank-you. */
  draftId?: string;
  draftOwnerId?: string;
  /** The suggested message, kept so a draft can be made later if no signed-in leader could own it. */
  draftText?: string;
  doneAt?: number;
  doneById?: string;
};

export type GuestCard = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  howHeard?: string;
  kidsAges?: string;
  interests: GuestInterest[];
  /** Dates of Sunday visits, first one first. */
  visits: string[];
  /** The prayer request goes to the prayer list (private unless they said it could be shared). */
  prayerRequestId?: string;
  assigneeId: string;
  tasks: GuestTask[];
  source: "leader" | "self";
  createdById?: string;
  createdAt: number;
  /** Set once anyone on the team has reached them (call or thank-you done). */
  contactedAt?: number;
  personId?: string;
  demo?: boolean;
};

/** A public guest-card link. The token is stored here for leaders to copy, and looked up by its hash. */
export type WelcomeLink = { id: string; token: string; label: string; createdById: string; createdAt: number; revokedAt?: number };

/* ---------- Rest (private to each leader) ---------- */

export type RestDay = { date: string; note?: string; at: number; demo?: boolean };

/* ---------- The church's care records ---------- */

export type CareMeta = { demo: boolean; createdAt: number; clearedAt?: number };

export type CareBook = {
  meta: CareMeta;
  cases: CareCase[];
  prayers: PrayerRequest[];
  pathways: Pathway[];
  classes: CareClass[];
  guests: GuestCard[];
  links: WelcomeLink[];
  /** Index into the guest follow-up rotation. */
  rotation: number;
};
