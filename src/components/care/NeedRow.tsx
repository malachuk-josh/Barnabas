import Link from "next/link";
import { CASE_STATUS_LABELS, CONTACT_LABELS, type ContactKind } from "@/lib/care/types";
import type { CaseRow } from "@/lib/care/views";
import { TypePill } from "./CaseCard";
import { dueText, shortDate } from "./client";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** One need as a row: who, what kind, the next step and when, who holds it, and the last contact. */
export function NeedRow({ c, today }: { c: CaseRow; today: string }) {
  const due = c.nextStep ? dueText(c.nextStep.due, today) : null;
  return (
    <Link href={`/shepherding/cases/${c.id}`} className={`need-line${c.overdue ? " is-overdue" : ""}`}>
      <span className={`ppl-avatar${c.overdue ? " is-missed" : ""}`} aria-hidden="true">
        {initials(c.name)}
      </span>
      <span className="need-line-main">
        <span className="need-line-head">
          <strong>{c.name}</strong>
          <TypePill type={c.type} label={c.typeLabel} />
          {c.confidential && <span className="care-conf">Pastors only</span>}
        </span>
        <span className="need-line-next">{c.nextStep ? c.nextStep.text : <span className="muted">No next step set</span>}</span>
        <span className="care-meta">
          {due && <span className={c.overdue ? "care-overdue" : undefined}>{due}</span>}
          <span>{c.mine ? "You" : c.assigneeName}</span>
          <span>{CASE_STATUS_LABELS[c.status]}</span>
          <span>{c.lastContact ? `Last: ${CONTACT_LABELS[c.lastContact.kind as ContactKind].toLowerCase()} ${shortDate(c.lastContact.date)}` : "No contact yet"}</span>
        </span>
      </span>
      <svg className="need-line-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
