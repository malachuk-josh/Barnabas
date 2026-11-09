/**
 * Roles and permissions. A leader's role lives on their leader record (`leader:{church}:{leaderId}`),
 * which an admin manages in Settings → Team. Admins are bootstrapped with BARNABAS_ADMIN_EMAILS.
 * Everything here is checked on the server; the app only hides what a leader can't use.
 */

export const ROLES = ["pastor", "treasurer", "deacon", "staff", "leader"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  pastor: "Pastor",
  treasurer: "Treasurer",
  deacon: "Deacon",
  staff: "Staff",
  leader: "Leader",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  pastor: "Full access, including finance, individual giving, every care case, scheduling, service planning, events and kids check-in",
  treasurer: "Full finance access, including individual giving; can sign up to serve",
  deacon: "Finance summaries without donor names; sees care cases assigned to them and non-confidential ones; manages events; leads their own serving team",
  staff: "Everything except finance; schedules every team, plans services, manages events, runs kids check-in and keeps family records",
  leader: "Everything except finance and kids check-in; sees the care cases assigned to them; signs up to serve and leads their own team",
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
  /** See every pastoral care case, including confidential ones. */
  | "care.view_all"
  /** Assign care cases to someone else, and keep the discipleship pathway and classes. */
  | "care.assign"
  /** Edit any team's roster, positions and volunteers (team leads may always edit their own team). */
  | "ops.schedule"
  /** Plan sermon series, the preaching rotation and orders of service. */
  | "services.plan"
  /** Create events, see registrants, export them and check people in. */
  | "events.manage"
  /** Run the kids check-in station: find families, check children in and out, print labels, see room counts. */
  | "kids.checkin"
  /** Add and edit families and children, including allergies, medical notes and authorized pickups. */
  | "kids.admin";

const MATRIX: Record<Exclude<Permission, "team.manage">, readonly Role[]> = {
  "finance.view": ["pastor", "treasurer", "deacon"],
  "finance.edit": ["pastor", "treasurer"],
  "giving.donors": ["pastor", "treasurer"],
  "care.view_all": ["pastor"],
  "care.assign": ["pastor", "deacon", "staff"],
  "ops.schedule": ["pastor", "staff"],
  "services.plan": ["pastor", "staff"],
  "events.manage": ["pastor", "deacon", "staff"],
  "kids.checkin": ["pastor", "staff"],
  "kids.admin": ["pastor", "staff"],
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
