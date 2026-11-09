import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseActions } from "@/components/care/CaseActions";
import { TypePill } from "@/components/care/CaseCard";
import { CareFrame, carePage } from "@/components/care/CareFrame";
import { can } from "@/lib/auth/roles";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, CONTACT_LABELS } from "@/lib/care/types";
import { caseDetail, isOverdue } from "@/lib/care/views";
import { churchData, churchSource } from "@/lib/chms";
import { today as todayIso, friendlyDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shepherding need · Barnabas" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

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
  const heldByMe = ctx.actor.viewer.memberIds.includes(c.assigneeId ?? "");
  const last = c.contacts[c.contacts.length - 1];
  // Link to their People page only when they're in the church's own directory.
  const inDirectory = c.subject.personId && (await churchSource()) !== "demo" ? Boolean(await churchData().getPerson(c.subject.personId).catch(() => null)) : false;
  const forName = c.subject.kind === "household" ? `${c.subject.name} (household)` : c.subject.name;

  return (
    <CareFrame
      ctx={ctx}
      eyebrow={<Link href="/shepherding">All needs</Link>}
      lead={
        <span className="person-avatar" aria-hidden="true">
          {initials(c.subject.name)}
        </span>
      }
      title={c.subject.name}
      intro={
        <span className="person-meta">
          <TypePill type={c.type} label={CASE_TYPE_LABELS[c.type]} />
          <span className="status-tag">{CASE_STATUS_LABELS[c.status]}</span>
          {c.confidential && <span className="care-conf">Confidential: pastors only</span>}
          {c.summary && <span>{c.summary}</span>}
        </span>
      }
    >
      {!c.closedAt && (
        <section className={`next-banner${overdue ? " is-overdue" : ""}`} aria-labelledby="next-head">
          <div className="next-banner-text">
            <p className="next-banner-label" id="next-head">
              Next step
            </p>
            <p className="next-banner-step">{c.nextStep ? c.nextStep.text : "None set yet"}</p>
            {c.nextStep && <p className={overdue ? "care-overdue" : "muted small"}>{!c.nextStep.due ? "No date set" : overdue ? `Overdue since ${friendlyDate(c.nextStep.due)}` : c.nextStep.due === today ? "Due today" : `Due ${friendlyDate(c.nextStep.due)}`}</p>}
          </div>
          <div className="next-banner-actions">
            <a className="btn btn-primary" href="#log-contact">
              Log a contact
            </a>
            {inDirectory && (
              <Link className="btn" href={`/people/${c.subject.personId}`}>
                Their People page
              </Link>
            )}
          </div>
        </section>
      )}

      <dl className="fact-strip">
        <div>
          <dt>For</dt>
          <dd>{forName}</dd>
        </div>
        <div>
          <dt>Held by</dt>
          <dd>{heldByMe ? "You" : c.assigneeName}</dd>
        </div>
        <div>
          <dt>Last contact</dt>
          <dd>{last ? `${CONTACT_LABELS[last.kind]}, ${short(last.date)}` : "None yet"}</dd>
        </div>
        <div>
          <dt>Noted</dt>
          <dd>
            {short(isoOf(c.openedAt))} by {c.openedByName}
          </dd>
        </div>
      </dl>

      <div className="need-detail-grid">
        <section className="fin-card need-detail-timeline" aria-labelledby="tl-head">
          <h2 id="tl-head">Timeline</h2>
          {c.contacts.length === 0 ? (
            <p className="muted">No contacts logged yet. When you visit, call, text or bring a meal, log it here.</p>
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
              <li>
                <span className="care-dot is-start" aria-hidden="true" />
                <div>
                  <strong>Need noted</strong> <span className="muted small">{friendlyDate(isoOf(c.openedAt))} · {c.openedByName}</span>
                </div>
              </li>
            </ol>
          )}
          {c.closedAt && <p className="small muted">Met on {friendlyDate(isoOf(c.closedAt))}{c.closedNote ? `: ${c.closedNote}` : ""}.</p>}
          <p className="fin-source">
            Every contact logged on this need, newest first.{" "}
            {c.source === "legacy" ? "It was made from an earlier shepherding log." : c.source === "barnabas" ? "Barnabas noted it when you asked." : ""}
          </p>
        </section>
        <div className="need-detail-actions">
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
      </div>
    </CareFrame>
  );
}
