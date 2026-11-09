import { EmptyState } from "@/components/EmptyState";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CaseCard } from "@/components/care/CaseCard";
import { CaseFilters } from "@/components/care/CaseFilters";
import { CareFrame, carePage, directory } from "@/components/care/CareFrame";
import { NeedRow } from "@/components/care/NeedRow";
import { NewCase } from "@/components/care/NewCase";
import { CASE_STATUSES, CASE_STATUS_LABELS, CASE_TYPES, type CaseType } from "@/lib/care/types";
import { caseRows, recentGuests, teamView } from "@/lib/care/views";
import { addDays, today as todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shepherding · Barnabas" };

type Search = { scope?: string; type?: string; overdue?: string; view?: string; opened?: string };

export default async function CarePage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const ctx = await carePage();
  const today = todayIso();
  // Everything the leader may see by default; "Mine" narrows it.
  const scope = q.scope === "mine" ? "mine" : "all";
  const type = (CASE_TYPES as readonly string[]).includes(q.type ?? "") ? (q.type as CaseType) : undefined;
  const rows = caseRows(ctx.book, ctx.actor, { scope, type, overdue: q.overdue === "1" }, today);
  const mine = caseRows(ctx.book, ctx.actor, { scope: "mine" }, today);
  const team = teamView(ctx.book);
  const waiting = recentGuests(ctx.book, ctx.actor, { uncontactedOnly: true }, today);
  const role = ctx.actor.viewer.access.role;
  const sees = ctx.isPastor ? "every need, including confidential ones" : role === "deacon" ? "your needs and every need that isn't confidential" : "the needs assigned to you";
  const people = await directory();
  const members = ctx.actor.members.map((m) => ({ id: m.id, name: m.name, title: m.title, role: m.role }));
  // "By due date" (the default) groups needs by when their next step falls; "By stage" is the board.
  const view = q.view === "board" ? "board" : "due";
  const week = addDays(today, 7);
  const groups = [
    { key: "overdue", label: "Overdue", rows: rows.filter((r) => r.overdue) },
    { key: "week", label: "This week", rows: rows.filter((r) => !r.overdue && r.nextStep?.due && r.nextStep.due <= week) },
    { key: "later", label: "Later", rows: rows.filter((r) => !r.overdue && r.nextStep?.due && r.nextStep.due > week) },
    { key: "none", label: "No date set", rows: rows.filter((r) => !r.nextStep?.due) },
  ].filter((g) => g.rows.length > 0);
  const mineOverdue = mine.filter((c) => c.overdue).length;

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
      <dl className="fact-strip care-summary">
        <div>
          <dt>Yours</dt>
          <dd>
            <Link href="/shepherding?scope=mine">
              {mine.length} open{mineOverdue ? <span className="care-overdue"> · {mineOverdue} overdue</span> : null}
            </Link>
          </dd>
        </div>
        <div>
          <dt>Across the church</dt>
          <dd>
            <Link href="/shepherding/load#team">
              {team.totalOpen} open{team.unassigned ? ` · ${team.unassigned} unassigned` : ""}
            </Link>
          </dd>
        </div>
        <div>
          <dt>Guests to reach</dt>
          <dd>
            <Link href="/shepherding/guests">
              {waiting.length}
              {waiting.length ? ` · ${waiting.filter((g) => g.mine).length} yours` : ""}
            </Link>
          </dd>
        </div>
      </dl>

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
      ) : view === "due" ? (
        <div className="need-groups">
          {groups.map((g) => (
            <section key={g.key} className="need-group" aria-labelledby={`need-${g.key}`}>
              <h2 id={`need-${g.key}`} className={g.key === "overdue" ? "is-overdue" : undefined}>
                {g.label} <span className="care-count">{g.rows.length}</span>
              </h2>
              <div className="list-card">
                {g.rows.map((c) => (
                  <NeedRow key={c.id} c={c} today={today} />
                ))}
              </div>
            </section>
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
        Shepherding needs in Barnabas, overdue next steps first. &ldquo;Across the church&rdquo; counts every open need without names; &ldquo;Guests to reach&rdquo; counts guest cards from the last three weeks with no thank-you or call marked done. Needs that have been met stay on their own pages.
      </p>
    </CareFrame>
  );
}
