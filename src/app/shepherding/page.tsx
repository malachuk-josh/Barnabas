import { EmptyState } from "@/components/EmptyState";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CaseCard } from "@/components/care/CaseCard";
import { CaseFilters } from "@/components/care/CaseFilters";
import { CareFrame, carePage, directory } from "@/components/care/CareFrame";
import { NewCase } from "@/components/care/NewCase";
import { CASE_STATUSES, CASE_STATUS_LABELS, CASE_TYPES, type CaseType } from "@/lib/care/types";
import { caseRows, recentGuests, teamView } from "@/lib/care/views";
import { today as todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shepherding · Barnabas" };

type Search = { scope?: string; type?: string; overdue?: string; view?: string; opened?: string };

export default async function CarePage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const ctx = await carePage();
  const today = todayIso();
  const scope = q.scope === "all" ? "all" : "mine";
  const type = (CASE_TYPES as readonly string[]).includes(q.type ?? "") ? (q.type as CaseType) : undefined;
  const rows = caseRows(ctx.book, ctx.actor, { scope, type, overdue: q.overdue === "1" }, today);
  const mine = caseRows(ctx.book, ctx.actor, { scope: "mine" }, today);
  const team = teamView(ctx.book);
  const waiting = recentGuests(ctx.book, ctx.actor, { uncontactedOnly: true }, today);
  const role = ctx.actor.viewer.access.role;
  const sees = ctx.isPastor ? "every need, including confidential ones" : role === "deacon" ? "your needs and every need that isn't confidential" : "the needs assigned to you";
  const people = await directory();
  const members = ctx.actor.members.map((m) => ({ id: m.id, name: m.name, title: m.title, role: m.role }));

  return (
    <CareFrame
      ctx={ctx}
      title="Shepherding needs"
      verse="shepherding"
      verseShort
      intro={`Who needs care, who's caring for them, and what's next. You see ${sees}.`}
      actions={<NewCase people={people} members={members} selfId={ctx.actor.self.id} canAssign={ctx.canAssign} isPastor={ctx.isPastor} />}
    >
      {q.opened === "confidential" && (
        <div className="notice success" role="status" style={{ marginBottom: 16 }}>
          The confidential need is with the pastors now.
        </div>
      )}
      <div className="fin-grid care-stats">
        <section className="fin-card">
          <span className="label">Your open needs</span>
          <div className="fin-stat">{mine.length}</div>
          <span className="muted small">{mine.filter((c) => c.overdue).length} with a next step past due</span>
          <p className="fin-source">Needs assigned to you that haven&apos;t been met yet.</p>
        </section>
        <section className="fin-card">
          <span className="label">Across the church</span>
          <div className="fin-stat">{team.totalOpen}</div>
          <span className="muted small">
            open needs, {team.unassigned} waiting in the pastors&apos; queue
          </span>
          <p className="fin-source">Every open need, counted without names. <Link href="/shepherding/load#team">How they&apos;re spread</Link></p>
        </section>
        <section className="fin-card">
          <span className="label">Guests not reached yet</span>
          <div className="fin-stat">{waiting.length}</div>
          <span className="muted small">{waiting.filter((g) => g.mine).length} of them are yours to follow up</span>
          <p className="fin-source">
            Guest cards from the last three weeks with no thank-you or call marked done. <Link href="/shepherding/guests">Guests</Link>
          </p>
        </section>
      </div>

      <Suspense>
        <CaseFilters canSeeOthers={role === "pastor" || role === "deacon"} />
      </Suspense>

      {rows.length === 0 ? (
        team.totalOpen === 0 ? (
          <EmptyState title="No one is on the shepherding list yet" actions={[{ label: "Record a guest", href: "/shepherding/guests" }, { label: "Add a prayer request", href: "/shepherding/prayer#add-prayer" }]}>
            When someone needs a visit, a call or a meal, tap Note a need above, or just tell Barnabas (&ldquo;I visited Jamie in the hospital today&rdquo;). Needs are private to the people caring for them.
          </EmptyState>
        ) : (
          <div className="card">
            <p className="muted">{scope === "mine" ? "No open needs are assigned to you with these filters." : "No open needs match these filters."}</p>
          </div>
        )
      ) : q.view === "list" ? (
        <div className="care-list">
          {rows.map((c) => (
            <CaseCard key={c.id} c={c} today={today} showStatus />
          ))}
        </div>
      ) : (
        <div className="care-board">
          {CASE_STATUSES.filter((s) => s !== "closed").map((s) => {
            const col = rows.filter((r) => r.status === s);
            return (
              <section key={s} className="care-col" aria-label={CASE_STATUS_LABELS[s]}>
                <h2>
                  {CASE_STATUS_LABELS[s]} <span className="care-count">{col.length}</span>
                </h2>
                {col.map((c) => (
                  <CaseCard key={c.id} c={c} today={today} />
                ))}
                {!col.length && <p className="small muted">None</p>}
              </section>
            );
          })}
        </div>
      )}
      <p className="fin-source" style={{ marginTop: 14 }}>
        Shepherding needs in Barnabas, sorted with overdue next steps first. Needs that have been met stay on their own pages.
      </p>
    </CareFrame>
  );
}
