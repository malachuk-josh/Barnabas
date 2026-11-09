import { EmptyState } from "@/components/EmptyState";
import type { Metadata } from "next";
import Link from "next/link";
import { CareFrame, carePage, directory } from "@/components/care/CareFrame";
import { ClassCard, NewClass, StepForm } from "@/components/care/Discipleship";
import { furthestStep } from "@/lib/care/pathway";
import { PATHWAY_LABELS, PATHWAY_STEPS, type PathwayStep } from "@/lib/care/types";
import { discipleship } from "@/lib/care/views";
import { today as todayIso } from "@/lib/dates";
import { shortDate } from "@/components/care/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Next steps · Care · Barnabas" };

const SHORT: Record<PathwayStep, string> = {
  first_visit: "Visit",
  discover_faith: "Discover Faith",
  salvation: "Salvation",
  baptism: "Baptism",
  membership_class: "Class",
  membership: "Member",
  group: "Group",
  serving: "Serving",
  giving: "Giving",
};

export default async function DiscipleshipPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step: stepParam } = await searchParams;
  const ctx = await carePage();
  const today = todayIso();
  const step = (PATHWAY_STEPS as readonly string[]).includes(stepParam ?? "") ? (stepParam as PathwayStep) : undefined;
  const d = discipleship(ctx.book, today, step);
  const all = discipleship(ctx.book, today).nextSteps;
  const people = await directory();
  const everyone = [
    ...people.map((p) => ({ key: p.id, name: p.name })),
    ...ctx.book.guests.filter((g) => !people.some((p) => p.id === g.personId)).map((g) => ({ key: g.id, name: `${g.name} (guest)` })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const counts = new Map<PathwayStep, number>();
  for (const n of all) counts.set(n.step, (counts.get(n.step) ?? 0) + 1);
  const teachers = ctx.actor.members.filter((m) => m.role === "pastor").map((m) => ({ id: m.id, name: m.name }));

  return (
    <CareFrame ctx={ctx} title="Membership and discipleship" intro="Who's ready for their next step: from a first visit to Discover Faith, baptism, membership, a group and serving.">
      <div className="fin-stack">
        <section className="fin-card">
          <div className="fin-card-head">
            <h2>Ready for a next step</h2>
            <span className="muted small">{all.length} people</span>
          </div>
          <div className="care-chips" role="group" aria-label="Filter by step">
            <Link className="care-chip" href="/care/discipleship" aria-current={!step ? "page" : undefined}>
              All
            </Link>
            {PATHWAY_STEPS.filter((s) => counts.get(s)).map((s) => (
              <Link key={s} className="care-chip" href={`/care/discipleship?step=${s}`} aria-current={step === s ? "page" : undefined}>
                {PATHWAY_LABELS[s]} <span className="care-count">{counts.get(s)}</span>
              </Link>
            ))}
          </div>
          {d.nextSteps.length ? (
            <ul className="care-steps">
              {d.nextSteps.map((n) => (
                <li key={`${n.key}-${n.step}`}>
                  <strong>{n.name}</strong>
                  <span className="care-type">{n.label}</span>
                  <span className="small muted">{n.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            ctx.book.pathways.length === 0 ? (
              <EmptyState compact title="No pathways recorded yet" actions={[{ label: "Record a step", href: "#record-step" }]}>
                As people take steps (a first visit, a class, baptism, membership), record them here and Barnabas will show who&apos;s ready for what&apos;s next. Guest cards start a pathway on their own.
              </EmptyState>
            ) : (
              <p className="muted">No one is waiting on this step.</p>
            )
          )}
          <p className="fin-source">
            Each person&apos;s pathway dates. Discover Faith: came back a second time, or first visited 4+ weeks ago. Baptism: a salvation decision without baptism. Membership class: baptized, not a member. Membership: finished the class. Group: attending 3+ months, not in a Growth Group or Life Group. Serving: a member or in a group for 6+ months, not serving.
          </p>
        </section>

        <div className="fin-card-head">
          <h2>Classes</h2>
          {ctx.canAssign && <NewClass teachers={teachers} />}
        </div>
        <div className="fin-grid-2">
          {d.classes
            .slice()
            .sort((a, b) => (b.sessions[0]?.date ?? "").localeCompare(a.sessions[0]?.date ?? ""))
            .map((c) => (
              <ClassCard key={c.id} cls={c} everyone={everyone} canEdit={ctx.canAssign} today={today} />
            ))}
        </div>

        <div className={ctx.canAssign ? "fin-grid-2" : undefined}>
          <section className="fin-card">
            <h2>Pathways</h2>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    {PATHWAY_STEPS.map((s) => (
                      <th key={s} scope="col" title={PATHWAY_LABELS[s]}>
                        {SHORT[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.pathways.map((p) => (
                    <tr key={p.key}>
                      <td className="nowrap">
                        {p.name}
                        {p.guestId && <span className="badge">guest</span>}
                      </td>
                      {PATHWAY_STEPS.map((s) => (
                        <td key={s} className={`nowrap small${furthestStep(p) === s ? " care-furthest" : ""}`}>
                          {p.steps[s] ? shortDate(p.steps[s]!) : <span className="muted">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fin-source">Pathway dates recorded in Barnabas, by step. Classes record their step when someone finishes; guest cards record a first visit.</p>
          </section>
          {ctx.canAssign && <StepForm everyone={everyone} />}
        </div>
      </div>
    </CareFrame>
  );
}
