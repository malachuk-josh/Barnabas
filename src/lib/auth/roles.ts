/**
 * Roles and permissions. A leader's role lives on their leader record (`leader:{church}:{leaderId}`),
 * which an admin manages on the Admin page (Church office → Admin). Admins are bootstrapped with BARNABAS_ADMIN_EMAILS.
 * Everything here is checked on the server; the app only hides what a leader can't use.
 */

export const ROLES = ["pastor", "treasurer", "deacon", "staff", "leader", "checkin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  pastor: "Pastor",
  treasurer: "Treasurer",
  deacon: "Deacon",
  staff: "Staff",
  leader: "Leader",
  checkin: "Kids check-in",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  pastor: "Full access, including finance, individual giving, every shepherding need, scheduling, service planning, events, kids check-in and sending messages",
  treasurer: "Full finance access, including individual giving; can sign up to serve",
  deacon: "Finance summaries without donor names; sees shepherding needs assigned to them and non-confidential ones; manages events; sends shepherding follow-ups; leads their own serving team",
  staff: "Everything except finance; schedules every team, plans services, manages events, runs kids check-in, keeps family records and sends messages",
  leader: "Everything except finance and kids check-in; sees the shepherding needs assigned to them; signs up to serve and leads their own team",
  checkin: "Only the kids check-in station: find families, check children in and out, print labels and see room counts. No other part of Barnabas",
};

export const DEFAULT_ROLE: Role = "leader";

export type Permission =
  /** See finance summaries, budgets, fund balances, missions and reports (aggregates only). */
  | "finance.view"
  /** Change budgets, transactions, gifts, missions records; import and reconcile. */
  | "finance.edit"
  /** See who gave what: individual gifts, donor history, pledges by name, statements. */
  | "giving.donors"
  /** Set other leaders' roles. */
  | "team.manage"
  /** See every shepherding need, including confidential ones. */
  | "care.view_all"
  /** Assign shepherding needs to someone else, and keep the discipleship pathway and classes. */
  | "care.assign"
  /** Edit any team's roster, positions and co-laborers (team leads may always edit their own team). */
  | "ops.schedule"
  /** Plan sermon series, the preaching rotation and orders of service. */
  | "services.plan"
  /** Create events, see registrants, export them and check people in. */
  | "events.manage"
  /** Run the kids check-in station: find families, check children in and out, print labels, see room counts. */
  | "kids.checkin"
  /** Add and edit families and children, including allergies, medical notes and authorized pickups. */
  | "kids.admin"
  /**
   * Send an approved draft by text or email from the Drafts screen. Deacons may send care follow-ups
   * (guest thank-yous and care drafts) without this; see `canSendDraft` in `src/lib/messages/permissions.ts`.
   */
  | "messages.send"
  /** Download the church directory (names, emails, phones, households) as CSV. */
  | "people.export"
  /** Add, edit, merge and archive people, households, groups and custom fields; run the migration tool. */
  | "people.edit"
  /** Share resources with connected churches in the Mesa network (connections themselves need an admin). */
  | "network.share"
  /** Edit and publish the church website and member app, read its inbox, post announcements. */
  | "site.edit";

const MATRIX: Record<Exclude<Permission, "team.manage">, readonly Role[]> = {
  "finance.view": ["pastor", "treasurer", "deacon"],
  "finance.edit": ["pastor", "treasurer"],
  "giving.donors": ["pastor", "treasurer"],
  "care.view_all": ["pastor"],
  "care.assign": ["pastor", "deacon", "staff"],
  "ops.schedule": ["pastor", "staff"],
  "services.plan": ["pastor", "staff"],
  "events.manage": ["pastor", "deacon", "staff"],
  "kids.checkin": ["pastor", "staff", "checkin"],
  "kids.admin": ["pastor", "staff"],
  "messages.send": ["pastor", "staff"],
  "people.export": ["pastor", "staff"],
  "people.edit": ["pastor", "staff"],
  "network.share": ["pastor", "staff"],
  "site.edit": ["pastor", "staff"],
};

/**
 * Access levels, set by an admin on the Admin page (Church office → Admin).
 * - admin: everything, including managing people and Barnabas's settings.
 * - leader: every feature; finance only when an admin turns it on for them.
 * - team: the features their team role needs, and Barnabas by typing only (Claude Haiku).
 * - member: The Word, Calendar, Services, Child care and Messages, and Barnabas by typing only (Claude Haiku).
 */
export const LEVELS = ["admin", "leader", "team", "member"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = { admin: "Admin", leader: "Leader", team: "Team", member: "Member" };

export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  admin: "Everything, including adding and removing people, their access, and Barnabas's settings",
  leader: "Every feature, and Barnabas by voice or typing. Finance only when an admin turns it on",
  team: "The features their team role needs, and Barnabas by typing (lighter model)",
  member: "The Word, Calendar, Services, Child care and Messages, and Barnabas by typing (lighter model)",
};

/** What a Team member works on; it decides which features they see. */
export const TEAM_ROLES = ["serving", "kids", "care", "checkin"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  serving: "Serving team",
  kids: "Kids ministry",
  care: "Care team",
  checkin: "Kids check-in only",
};

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  serving: "Today, Calendar, Serve, Services, The Word, Journal and Messages",
  kids: "Serving team features plus the kids check-in station",
  care: "Serving team features plus the shepherding needs assigned to them",
  checkin: "Only the kids check-in station and Messages",
};

const FINANCE_PERMISSIONS: readonly Permission[] = ["finance.view", "finance.edit", "giving.donors"];
const TEAM_PERMISSIONS: Record<TeamRole, readonly Permission[]> = {
  serving: [],
  kids: ["kids.checkin"],
  care: [],
  checkin: ["kids.checkin"],
};

export function isLevel(value: unknown): value is Level {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}
export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

/** The permission role older code reads (shepherding visibility and the like), derived from the level. */
export function roleForLevel(level: Level, finance: boolean, teamRole?: TeamRole): Role {
  if (level === "admin" || level === "leader") return "pastor";
  if (level === "team") return teamRole === "care" ? "deacon" : teamRole === "checkin" ? "checkin" : "leader";
  return "leader";
}

/** A role set before levels existed, as a level. */
export function levelForRole(role: Role): { level: Level; finance: boolean; teamRole?: TeamRole } {
  switch (role) {
    case "pastor":
    case "treasurer":
      return { level: "leader", finance: true };
    case "staff":
    case "leader":
      return { level: "leader", finance: false };
    case "deacon":
      return { level: "team", finance: false, teamRole: "care" };
    case "checkin":
      return { level: "team", finance: false, teamRole: "checkin" };
  }
}

/**
 * What a signed-in leader may do: their level (with the finance switch and team role), whether they
 * administer the church, and the older permission role derived from those.
 */
export type Access = { role: Role; admin: boolean; level?: Level; finance?: boolean; teamRole?: TeamRole; removed?: boolean };

/** Team and Member levels talk with Barnabas by typing only, on the lighter model. */
export function isLimited(access: Access | null | undefined): boolean {
  return Boolean(access && !access.admin && (access.level === "team" || access.level === "member"));
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(access: Access | null | undefined, permission: Permission): boolean {
  if (!access) return false;
  // An Admin level has everything; before levels, the admin flag only added team management.
  if (access.level === "admin") return true;
  if (permission === "team.manage") return access.admin;
  switch (access.level) {
    case "leader":
      return FINANCE_PERMISSIONS.includes(permission) ? Boolean(access.finance) : true;
    case "team":
      return (TEAM_PERMISSIONS[access.teamRole ?? "serving"] ?? []).includes(permission);
    case "member":
      return false;
    default:
      // Before levels: the role's own permissions.
      return MATRIX[permission].includes(access.role);
  }
}

/** Emails listed in BARNABAS_ADMIN_EMAILS (comma-separated), lowercased. */
export function adminEmails(env: string | undefined = process.env.BARNABAS_ADMIN_EMAILS): string[] {
  return (env ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string, env?: string): boolean {
  return adminEmails(env).includes(email.trim().toLowerCase());
}

/**
 * A kids check-in volunteer (and not an administrator) may use only the check-in station and their own
 * settings. Enforced for pages in AppShell and for APIs in requireLeader, using the path the middleware
 * passes along.
 */
export function isCheckinOnly(access: Access | null | undefined): boolean {
  if (!access || access.admin) return false;
  if (access.level) return access.level === "team" && access.teamRole === "checkin";
  return access.role === "checkin";
}

const CHECKIN_PAGES = ["/kids", "/settings", "/inbox"];
const CHECKIN_APIS = ["/api/kids", "/api/profile", "/api/auth", "/api/account", "/api/push", "/api/inbox"];

/** Whether a check-in-only volunteer may open this path. Family records stay behind kids.admin. */
export function checkinMayUse(pathname: string): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (under("/kids/families")) return false;
  // A leader's journal is their own writing; check-in has none (and no leader's shared entries either).
  if (under("/journal") || under("/api/journal")) return false;
  return [...CHECKIN_PAGES, ...CHECKIN_APIS].some(under);
}

/** Pages and APIs every signed-in person may use (their own settings, account, Barnabas, messages). */
const BASE_PATHS = [
  "/settings",
  "/inbox",
  "/api/profile",
  "/api/auth",
  "/api/account",
  "/api/push",
  "/api/inbox",
  "/api/chat",
  "/api/conversations",
  "/api/memory",
];
const MEMBER_PATHS = [
  ...BASE_PATHS,
  "/word",
  "/calendar",
  "/services",
  "/kids",
  "/api/bible",
  "/api/bookmarks",
  "/api/study",
  "/api/search",
  "/api/calendar",
  "/api/services",
  "/api/kids",
  "/api/notes",
];
const TEAM_PATHS = [...MEMBER_PATHS, "/serve", "/journal", "/memory", "/api/serve", "/api/journal"];

/**
 * Whether someone at the Team or Member level may open this path (Leaders and Admins may open
 * everything; the features themselves still check permissions). Today ("/") is everyone's home.
 */
export function levelMayUse(access: Access, pathname: string): boolean {
  if (!isLimited(access)) return true;
  if (isCheckinOnly(access)) return checkinMayUse(pathname);
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (pathname === "" || pathname === "/") return true;
  // Family records, the kids rooms and labels are for the kids team; members see their own children.
  if (access.level === "member" && (under("/kids/families") || under("/kids/rooms") || under("/kids/labels"))) return false;
  if (access.level === "team" && access.teamRole !== "kids" && under("/kids/families")) return false;
  const extra = access.level === "team" && access.teamRole === "care" ? ["/shepherding", "/api/care"] : [];
  const allowed = access.level === "team" ? [...TEAM_PATHS, ...extra] : MEMBER_PATHS;
  return allowed.some(under);
}

/** How someone's access reads in Settings: their level (or older role, before a level is chosen). */
export function accessSummary(access: Access): { label: string; description: string } {
  if (access.level === "admin") return { label: LEVEL_LABELS.admin, description: LEVEL_DESCRIPTIONS.admin };
  if (access.level === "leader")
    return { label: access.finance ? "Leader, with finance" : LEVEL_LABELS.leader, description: access.finance ? "Every feature, including finance, and Barnabas by voice or typing" : LEVEL_DESCRIPTIONS.leader };
  if (access.level === "team") {
    const r = access.teamRole ?? "serving";
    return { label: `Team: ${TEAM_ROLE_LABELS[r]}`, description: `${TEAM_ROLE_DESCRIPTIONS[r]}, and Barnabas by typing` };
  }
  if (access.level === "member") return { label: LEVEL_LABELS.member, description: LEVEL_DESCRIPTIONS.member };
  return { label: ROLE_LABELS[access.role], description: ROLE_DESCRIPTIONS[access.role] };
}
