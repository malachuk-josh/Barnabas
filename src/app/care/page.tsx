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
export const metadata: Metadata = { title: "Care · Barnabas" };

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
  const sees = ctx.isPastor ? "every case, including confidential ones" : role === "deacon" ? "your cases and every case that isn't confidential" : "the cases assigned to you";
  const people = await directory();
  const members = ctx.actor.members.map((m) => ({ id: m.id, name: m.name, title: m.title, role: m.role }));

  return (
    <CareFrame
      ctx={ctx}
      title="Pastoral care"
      intro={`Who needs care, who's caring for them, and what's next. You see ${sees}.`}
      actions={<NewCase people={people} members={members} selfId={ctx.actor.self.id} canAssign={ctx.canAssign} isPastor={ctx.isPastor} />}
    >
      {q.opened === "confidential" && (
        <div className="notice success" role="status" style={{ marginBottom: 16 }}>
          The confidential case is with the pastors now.
        </div>
      )}
      <div className="fin-grid care-stats">
        <section className="fin-card">
          <span className="label">Your open cases</span>
          <div className="fin-stat">{mine.length}</div>
          <span className="muted small">{mine.filter((c) => c.overdue).length} with a next step past due</span>
          <p className="fin-source">Cases assigned to you that aren&apos;t closed.</p>
        </section>
        <section className="fin-card">
          <span className="label">Across the church</span>
          <div className="fin-stat">{team.totalOpen}</div>
          <span className="muted small">
            open cases, {team.unassigned} waiting in the pastors&apos; queue
          </span>
          <p className="fin-source">Every open case, counted without names. <Link href="/care/load#team">How they&apos;re spread</Link></p>
        </section>
        <section className="fin-card">
          <span className="label">Guests not reached yet</span>
          <div className="fin-stat">{waiting.length}</div>
          <span className="muted small">{waiting.filter((g) => g.mine).length} of them are yours to follow up</span>
          <p className="fin-source">
            Guest cards from the last three weeks with no thank-you or call marked done. <Link href="/care/guests">Guests</Link>
          </p>
        </section>
      </div>

      <Suspense>
        <CaseFilters canSeeOthers={role === "pastor" || role === "deacon"} />
      </Suspense>

      {rows.length === 0 ? (
        <div className="card">
          <p className="muted">{scope === "mine" ? "No open cases are assigned to you with these filters." : "No open cases match these filters."}</p>
        </div>
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
        Care cases in Barnabas, sorted with overdue next steps first. Closed cases stay on each case&apos;s page.
      </p>
    </CareFrame>
  );
}
