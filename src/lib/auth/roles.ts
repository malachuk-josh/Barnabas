/**
 * Roles and permissions. A leader's role lives on their leader record (`leader:{church}:{leaderId}`),
 * which an admin manages in Settings → Team. Admins are bootstrapped with BARNABAS_ADMIN_EMAILS.
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

/** What a signed-in leader may do: their role, and whether they administer the team. */
export type Access = { role: Role; admin: boolean };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(access: Access | null | undefined, permission: Permission): boolean {
  if (!access) return false;
  if (permission === "team.manage") return access.admin;
  return MATRIX[permission].includes(access.role);
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
  return Boolean(access && access.role === "checkin" && !access.admin);
}

const CHECKIN_PAGES = ["/kids", "/settings"];
const CHECKIN_APIS = ["/api/kids", "/api/profile", "/api/auth", "/api/account", "/api/push"];

/** Whether a check-in-only volunteer may open this path. Family records stay behind kids.admin. */
export function checkinMayUse(pathname: string): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (under("/kids/families")) return false;
  // A leader's journal is their own writing; check-in has none (and no leader's shared entries either).
  if (under("/journal") || under("/api/journal")) return false;
  return [...CHECKIN_PAGES, ...CHECKIN_APIS].some(under);
}
