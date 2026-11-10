import type { Metadata } from "next";
import Link from "next/link";
import { CareFrame, carePage } from "@/components/care/CareFrame";
import { DayOff } from "@/components/care/DayOff";
import { CASE_WEIGHTS, LOAD_THRESHOLDS, SIGNAL_LABELS } from "@/lib/care/load";
import { myCareLoad, teamView } from "@/lib/care/views";
import { friendlyDate, today as todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My care load · Shepherding · Barnabas" };

const LEVEL = ["Light", "Full", "Heavy"] as const;

export default async function LoadPage() {
  const ctx = await carePage();
  const today = todayIso();
  const load = await myCareLoad(ctx.leader, ctx.book, ctx.actor, today);
  const team = teamView(ctx.book);
  const factor = (key: string) => load.factors.find((f) => f.key === key)!;

  return (
    <CareFrame ctx={ctx} title="My care load" intro="A private look at what you're carrying. Only you can see this page's details; the team sees totals, never yours.">
      <div className="fin-stack">
        <section className={`fin-card care-signal care-signal-${load.signal}`}>
          <span className="label">This week</span>
          <div className="care-signal-head">
            <span className="care-signal-pill">{SIGNAL_LABELS[load.signal]}</span>
            <span className="muted small">
              {load.signal === "steady" ? "A sustainable pace." : load.signal === "full" ? "A full week. Worth watching." : "More than one heavy thing at once. Be kind to yourself."}
            </span>
          </div>
          <ul className="care-reasons">
            {load.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {load.signal !== "steady" && (
            <p className="small">
              Barnabas can suggest a day off on your calendar. <Link href="/calendar">Open the calendar</Link> to see it, or ask Barnabas to block one.
            </p>
          )}
          <details className="care-how">
            <summary>How this is worked out</summary>
            <p className="fin-source">
            Steady unless something is full; full when one thing is; stretched when one thing is heavy or two are full. Full and heavy: weighted load {LOAD_THRESHOLDS.weighted.full} and {LOAD_THRESHOLDS.weighted.stretched}; days without a day off {LOAD_THRESHOLDS.noDayOff.full} and {LOAD_THRESHOLDS.noDayOff.stretched}; contacts in 7 days {LOAD_THRESHOLDS.contacts.full} and {LOAD_THRESHOLDS.contacts.stretched}; open crisis needs {LOAD_THRESHOLDS.crisis.full} and {LOAD_THRESHOLDS.crisis.stretched}; overdue next steps {LOAD_THRESHOLDS.overdue.full} and {LOAD_THRESHOLDS.overdue.stretched}.
            </p>
          </details>
        </section>

        <div className="fin-grid">
          <section className="fin-card">
            <span className="label">Open needs</span>
            <div className="fin-stat">{load.openCases}</div>
            <span className="muted small">
              weighted load {load.weighted} · {LEVEL[factor("weighted").level]}
            </span>
            {load.byType.map((t) => (
              <div className="fin-sub" key={t.type}>
                <span>
                  {t.count} {t.label.toLowerCase()} × {CASE_WEIGHTS[t.type]}
                </span>
                <span>{t.weight}</span>
              </div>
            ))}
            <p className="fin-source">{load.sources[0]}</p>
          </section>
          <section className="fin-card">
            <span className="label">Contacts, last 7 days</span>
            <div className="fin-stat">{load.contactsThisWeek}</div>
            <span className="muted small">
              visits, calls, texts, cards and meals · {LEVEL[factor("contacts").level]}
            </span>
            <div className="fin-sub">
              <span>Overdue next steps</span>
              <span>{load.overdue}</span>
            </div>
            <p className="fin-source">{load.sources[1]}</p>
          </section>
          <section className="fin-card">
            <span className="label">Days without a day off</span>
            <div className="fin-stat">{load.daysWithoutDayOff}</div>
            <span className="muted small">
              {load.lastDayOff ? `last day off ${friendlyDate(load.lastDayOff)}` : `counting since ${friendlyDate(load.countingSince ?? today)}`} · {LEVEL[factor("noDayOff").level]}
            </span>
            <div className="fin-sub">
              <span>Rest days in the last 30</span>
              <span>{load.restDaysLast30.length}</span>
            </div>
            {load.calendarRest.length > 0 && (
              <div className="small muted">
                On your calendar: {load.calendarRest.map((e) => `${e.title} (${friendlyDate(e.date)})`).join(", ")}
              </div>
            )}
            <p className="fin-source">{load.sources[2]}</p>
          </section>
        </div>

        <div className="fin-grid-2">
          <DayOff logged={load.logged} />
          <section className="fin-card" id="team">
            <h2>The team</h2>
            <div className="fin-sub">
              <span>Open needs across the church</span>
              <span>{team.totalOpen}</span>
            </div>
            <div className="fin-sub">
              <span>In the pastors&apos; queue (unassigned)</span>
              <span>{team.unassigned}</span>
            </div>
            <div className="fin-sub">
              <span>People carrying needs</span>
              <span>{team.carers}</span>
            </div>
            <p>{team.text}</p>
            <div className="care-spread" role="img" aria-label={`Share of assigned needs per carer: ${team.shares.map((s) => `${Math.round(s * 100)}%`).join(", ")}`}>
              {team.shares.map((s, i) => (
                <span key={i} style={{ height: `${Math.max(6, Math.round(s * 100))}%` }} />
              ))}
            </div>
            <div className="small muted">{team.byType.map((t) => `${t.count} ${t.label.toLowerCase()}`).join(" · ")}</div>
            <p className="fin-source">Every open need, counted by holder without names. Each bar is one person&apos;s share; no one&apos;s wellbeing details are shown here.</p>
          </section>
        </div>
      </div>
    </CareFrame>
  );
}
