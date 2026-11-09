import type { Metadata } from "next";
import { requirePageLeader } from "@/components/AppShell";
import { OpsFrame, SERVE_TABS } from "@/components/ops/OpsFrame";
import { AwayDates, TeamsView } from "@/components/ops/ServeForms";
import { churchData } from "@/lib/chms";
import { today } from "@/lib/dates";
import { canEditTeam, selfVolunteer } from "@/lib/serve/service";
import { serveFor } from "@/lib/serve/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teams · Barnabas" };

export default async function TeamsPage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await serveFor(leader);
  const asOf = today();
  const me = selfVolunteer(book, leader);
  // The directory's real leaders are already volunteers in the demo; the picker lists anyone else.
  const directory = (await churchData().listPeople()).filter((p) => !book.volunteers.some((v) => v.personId === p.id)).map((p) => ({ id: p.id, name: p.name }));
  const teams = book.teams.map((t) => ({
    id: t.id,
    name: t.name,
    lead: t.lead,
    gatherings: t.gatherings,
    positions: t.positions,
    canEdit: canEditTeam(actor, t),
    volunteers: book.volunteers
      .filter((v) => v.teamIds.includes(t.id))
      .map((v) => ({ id: v.id, name: v.name, maxPerMonth: v.maxPerMonth, leadership: v.leadership, blackouts: v.blackouts, upcoming: book.assignments.filter((a) => a.volunteerId === v.id && a.teamId === t.id && a.date >= asOf && a.status !== "declined").length }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  return (
    <OpsFrame
      profile={profile}
      eyebrow="Serve"
      title="Teams and availability"
      intro="Each team's positions and co-laborers, how often they serve and when they're away. Team leads edit their own team; schedulers edit every team."
      tabs={SERVE_TABS}
    >
      <div className="fin-stack">
        <TeamsView teams={teams} scheduler={actor.scheduler} directory={directory} />
        <AwayDates volunteerId={me?.id ?? null} blackouts={me?.blackouts ?? []} cap={me?.maxPerMonth} />
      </div>
    </OpsFrame>
  );
}
