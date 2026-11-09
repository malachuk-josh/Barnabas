import { AppShell, requirePageLeader } from "@/components/AppShell";
import { can, ROLE_LABELS, type Access } from "@/lib/auth/roles";
import type { Leader } from "@/lib/auth/session";
import { loadBooks } from "@/lib/finance/store";
import type { Books } from "@/lib/finance/types";
import type { Profile } from "@/lib/profile";
import { accessFor } from "@/lib/team";
import { DemoBanner } from "./DemoBanner";
import { FinanceTabs } from "./FinanceTabs";

export type FinancePageContext = { leader: Leader; profile: Profile; access: Access; books: Books; canEdit: boolean; canSeeDonors: boolean };
type Denied = { leader: Leader; profile: Profile; access: Access; books: null };

/** Loads the leader and checks they may see finance; only then loads the books. */
export async function financePage(): Promise<FinancePageContext | Denied> {
  const { leader, profile } = await requirePageLeader();
  const access = await accessFor(leader);
  if (!can(access, "finance.view")) return { leader, profile, access, books: null };
  const books = await loadBooks(leader.churchId);
  return { leader, profile, access, books, canEdit: can(access, "finance.edit"), canSeeDonors: can(access, "giving.donors") };
}

export function NoFinance({ profile, access }: { profile: Profile; access: Access }) {
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>Finance isn&apos;t part of your role</h1>
          <p className="muted">
            You&apos;re signed in as {ROLE_LABELS[access.role].toLowerCase()}. Church finances are open to the pastor, treasurer and deacons. If you need access, ask your church administrator to change your role in
            Settings → Team.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

export function FinanceFrame({
  ctx,
  eyebrow,
  title,
  intro,
  actions,
  children,
}: {
  ctx: FinancePageContext;
  eyebrow: string;
  title: string;
  intro?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AppShell profile={ctx.profile}>
      <div className="page-head no-print">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {intro && <p className="muted">{intro}</p>}
        </div>
        {actions}
      </div>
      <FinanceTabs />
      {ctx.books.meta.demo && <DemoBanner canClear={ctx.canEdit} />}
      {children}
    </AppShell>
  );
}
