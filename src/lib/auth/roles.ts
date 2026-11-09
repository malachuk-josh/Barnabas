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
  pastor: "Full access, including finance, individual giving and every care case",
  treasurer: "Full finance access, including individual giving",
  deacon: "Finance summaries without donor names; sees care cases assigned to them and non-confidential ones",
  staff: "Everything except finance; sees the care cases assigned to them",
  leader: "Everything except finance; sees the care cases assigned to them",
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
  | "care.assign";

const MATRIX: Record<Exclude<Permission, "team.manage">, readonly Role[]> = {
  "finance.view": ["pastor", "treasurer", "deacon"],
  "finance.edit": ["pastor", "treasurer"],
  "giving.donors": ["pastor", "treasurer"],
  "care.view_all": ["pastor"],
  "care.assign": ["pastor", "deacon", "staff"],
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
