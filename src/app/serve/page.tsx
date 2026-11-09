import type { Metadata } from "next";
import Link from "next/link";
import { requirePageLeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { OpsFrame, SERVE_TABS } from "@/components/ops/OpsFrame";
import { RosterBoard, type BoardGathering } from "@/components/ops/RosterBoard";
import { today as todayIso } from "@/lib/dates";
import { gatheringsOn } from "@/lib/ops/gatherings";
import { coverageFor, selfVolunteer } from "@/lib/serve/service";
import { rosterFor, serveFor, upcomingDates } from "@/lib/serve/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Serve · Barnabas" };

const chipDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function ServePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await serveFor(leader);
  const today = todayIso();
  const dates = upcomingDates(today, 8);
  const q = await searchParams;
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) && gatheringsOn(q.date).length ? q.date : dates[0];
  const me = selfVolunteer(book, leader);
  const roster = rosterFor(book, actor, date);
  const gatherings: BoardGathering[] = roster.map((g) => ({
    ...g,
    teams: g.teams.map((t) => {
      const c = coverageFor(book, { date, gathering: g.key, teamId: t.teamId });
      return { ...t, available: c.available.map((x) => ({ id: x.volunteer.id, name: x.volunteer.name, recent: x.servedRecently })), unavailable: c.unavailable.map((x) => ({ id: x.volunteer.id, name: x.volunteer.name, reason: x.reason ?? "" })) };
    }),
  }));
  const open = roster.reduce((n, g) => n + g.teams.reduce((m, t) => m + t.open, 0), 0);
  const filled = roster.reduce((n, g) => n + g.teams.reduce((m, t) => m + t.filled, 0), 0);
  const leads = book.teams.filter((t) => actor.scheduler || t.lead?.toLowerCase() === leader.name.toLowerCase() || t.leadLeaderIds?.includes(leader.leaderId)).map((t) => t.name);

  return (
    <OpsFrame
      profile={profile}
      eyebrow="Serve"
      title="Serving rosters"
      intro={actor.scheduler ? "Every team's roster. You can schedule anyone, fill open slots and draft reminders." : leads.length ? `You lead ${leads.join(" and ")}: you can schedule that team. Anyone can sign up for an open slot.` : "Who's serving when. Sign up for an open slot, or ask a teammate to cover yours."}
      tabs={SERVE_TABS}
      demo={book.meta.demo ? { text: <>Only MGBC&apos;s real leaders are on these rosters, in their real roles: Aaron leads worship, Travis greets and Micah parks. <strong>Every other slot is open</strong>; no volunteer is made up.</>, clear: actor.scheduler ? { path: "/api/serve/demo", label: "Clear the demo rosters" } : undefined } : undefined}
    >
      <nav className="care-chips ops-dates" aria-label="Date">
        {dates.map((d) => (
          <Link key={d} className="care-chip" href={`/serve?date=${d}`} aria-current={d === date ? "page" : undefined}>
            {chipDate(d)}
          </Link>
        ))}
      </nav>
      <div className="fin-grid ops-stats">
        <section className="fin-card">
          <span className="label">Serving {chipDate(date)}</span>
          <div className="fin-stat">{filled}</div>
          <span className="muted small">{open} open slot{open === 1 ? "" : "s"} across {roster.reduce((n, g) => n + g.teams.length, 0)} team rosters</span>
          <p className="fin-source">Rosters in Barnabas for each gathering that day.</p>
        </section>
        <section className="fin-card">
          <span className="label">You</span>
          <div className="fin-stat fin-stat-sm">{me ? `${roster.reduce((n, g) => n + g.teams.reduce((m, t) => m + t.positions.reduce((k, p) => k + p.slots.filter((s) => s.mine).length, 0), 0), 0)} slot(s) this day` : "Not on a team yet"}</div>
          <span className="muted small">{me ? <Link href="/serve/mine">Your schedule, swaps and away dates</Link> : "Sign up for any open slot below to join that team."}</span>
        </section>
      </div>
      {book.teams.length === 0 ? (
        <EmptyState title="No teams yet" actions={[{ label: "Add your first team", href: "/serve/teams", primary: true }]}>
          Teams, their positions and the gatherings they serve make up the roster. Start with one, like Greeters or Worship.
        </EmptyState>
      ) : (
        <RosterBoard date={date} gatherings={gatherings} myVolunteerId={me?.id ?? null} scheduler={actor.scheduler} />
      )}
      <p className="fin-source" style={{ marginTop: 14 }}>
        Rosters, away dates and monthly limits in Barnabas. The burnout radar on Talk reads these rosters.
      </p>
    </OpsFrame>
  );
}
