import Link from "next/link";
import { CASE_STATUS_LABELS, CONTACT_LABELS, type ContactKind } from "@/lib/care/types";
import type { CaseRow } from "@/lib/care/views";
import { dueText, shortDate } from "./client";

const HEAVY = new Set(["crisis", "grief", "hospital"]);

export function TypePill({ type, label }: { type: string; label: string }) {
  return <span className={`care-type ${HEAVY.has(type) ? `care-type-${type}` : ""}`}>{label}</span>;
}

export function CaseCard({ c, today, showStatus = false }: { c: CaseRow; today: string; showStatus?: boolean }) {
  return (
    <Link href={`/shepherding/cases/${c.id}`} className={`care-card${c.overdue ? " overdue" : ""}`}>
      <span className="care-card-head">
        <strong>{c.name}</strong>
        <TypePill type={c.type} label={c.typeLabel} />
      </span>
      {c.confidential && <span className="care-conf">Confidential: pastors only</span>}
      {c.nextStep ? (
        <span className="care-next">
          {c.nextStep.text}
          <small className={c.overdue ? "care-overdue" : "muted"}>{dueText(c.nextStep.due, today)}</small>
        </span>
      ) : (
        <span className="small muted">No next step set</span>
      )}
      <span className="care-meta">
        <span>{c.mine ? "You" : c.assigneeName}</span>
        {showStatus && <span>{CASE_STATUS_LABELS[c.status]}</span>}
        <span>{c.lastContact ? `${CONTACT_LABELS[c.lastContact.kind as ContactKind]} ${shortDate(c.lastContact.date)}` : "No contact yet"}</span>
      </span>
    </Link>
  );
}
