import { AppShell, requirePageLeader } from "@/components/AppShell";
import type { Leader } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { churchData } from "@/lib/chms";
import type { CareActor } from "@/lib/care/service";
import type { CareBook } from "@/lib/care/types";
import { careFor } from "@/lib/care/views";
import type { Profile } from "@/lib/profile";
import { CareDemoBanner } from "./CareDemoBanner";
import { CareTabs } from "./CareTabs";

export type CarePageContext = { leader: Leader; profile: Profile; actor: CareActor; book: CareBook; canAssign: boolean; isPastor: boolean };

/** Loads the leader, what they may see, and the church's care records. Every view filters through `actor`. */
export async function carePage(): Promise<CarePageContext> {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await careFor(leader);
  return { leader, profile, actor, book, canAssign: can(actor.viewer.access, "care.assign"), isPastor: can(actor.viewer.access, "care.view_all") };
}

/** People in the directory for pickers. The church's leadership are left out of the demo's pickers. */
export async function directory() {
  return (await churchData().listPeople()).filter((p) => !p.leadership).map((p) => ({ id: p.id, name: p.name, household: p.household ?? null }));
}

export function CareFrame({ ctx, eyebrow = "Care", title, intro, actions, children }: { ctx: CarePageContext; eyebrow?: string; title: string; intro?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <AppShell profile={ctx.profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {intro && <p className="muted">{intro}</p>}
        </div>
        {actions}
      </div>
      <CareTabs />
      {ctx.book.meta.demo && <CareDemoBanner canClear={ctx.isPastor} />}
      {children}
    </AppShell>
  );
}
