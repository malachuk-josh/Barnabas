import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseActions } from "@/components/care/CaseActions";
import { TypePill } from "@/components/care/CaseCard";
import { CareFrame, carePage } from "@/components/care/CareFrame";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, CONTACT_LABELS } from "@/lib/care/types";
import { caseDetail, isOverdue } from "@/lib/care/views";
import { can } from "@/lib/auth/roles";
import { today as todayIso, friendlyDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shepherding need · Barnabas" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await carePage();
  // A case this leader can't see reads exactly like one that doesn't exist.
  const c = caseDetail(ctx.book, ctx.actor, id);
  if (!c) notFound();
  const today = todayIso();
  const overdue = isOverdue(c, today);
  const members = ctx.actor.members.map((m) => ({ id: m.id, name: m.name, title: m.title, role: m.role }));
  const canAssign = can(ctx.actor.viewer.access, "care.assign");

  return (
    <CareFrame ctx={ctx} eyebrow={`${CASE_TYPE_LABELS[c.type]} · ${CASE_STATUS_LABELS[c.status]}`} title={c.subject.name} intro={c.summary}>
      <p className="small" style={{ marginBottom: 14 }}>
        <Link href="/shepherding">← All needs</Link>
      </p>
      <div className="fin-grid-2">
        <div className="fin-stack">
          <section className="fin-card">
            <div className="fin-card-head">
              <h2>About this need</h2>
              <TypePill type={c.type} label={CASE_TYPE_LABELS[c.type]} />
            </div>
            {c.confidential && <span className="care-conf">Confidential: only pastors can see this need</span>}
            <div className="fin-sub">
              <span>For</span>
              <span>{c.subject.kind === "household" ? `${c.subject.name} (household)` : c.subject.name}</span>
            </div>
            <div className="fin-sub">
              <span>Held by</span>
              <span>{ctx.actor.viewer.memberIds.includes(c.assigneeId ?? "") ? "You" : c.assigneeName}</span>
            </div>
            <div className="fin-sub">
              <span>Noted</span>
              <span>
                {friendlyDate(new Date(c.openedAt).toISOString().slice(0, 10))} by {c.openedByName}
              </span>
            </div>
            <div className="fin-sub">
              <span>Next step</span>
              <span className={overdue ? "care-overdue" : undefined}>
                {c.nextStep ? `${c.nextStep.text}${c.nextStep.due ? `, by ${friendlyDate(c.nextStep.due)}` : ""}` : "None set"}
              </span>
            </div>
            <p className="fin-source">This need&apos;s record in Barnabas. {c.source === "legacy" ? "It was made from an earlier shepherding log." : c.source === "barnabas" ? "Barnabas noted it when you asked." : ""}</p>
          </section>

          <section className="fin-card">
            <h2>Timeline</h2>
            {c.contacts.length === 0 ? (
              <p className="muted">No contacts logged yet.</p>
            ) : (
              <ol className="care-timeline">
                {[...c.contacts].reverse().map((ct) => (
                  <li key={ct.id}>
                    <span className="care-dot" aria-hidden="true" />
                    <div>
                      <strong>{CONTACT_LABELS[ct.kind]}</strong> <span className="muted small">{friendlyDate(ct.date)} · {ct.byName}</span>
                      {ct.note && <p className="small">{ct.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {c.closedAt && <p className="small muted">Met on {friendlyDate(new Date(c.closedAt).toISOString().slice(0, 10))}{c.closedNote ? `: ${c.closedNote}` : ""}.</p>}
            <p className="fin-source">Every contact logged on this need, newest first.</p>
          </section>
        </div>
        <CaseActions
          id={c.id}
          status={c.status}
          confidential={c.confidential}
          assigneeId={c.assigneeId}
          nextStep={c.nextStep}
          members={members}
          selfIds={ctx.actor.viewer.memberIds}
          canAssign={canAssign}
          canClose={c.canClose}
          isPastor={ctx.isPastor}
        />
      </div>
    </CareFrame>
  );
}
