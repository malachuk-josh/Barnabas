import Link from "next/link";
import { requirePageLeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Directory } from "@/components/people/Directory";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { addDays, today } from "@/lib/dates";
import { isActive } from "@/lib/people/native";
import { peopleFor, personView } from "@/lib/people/service";

export const dynamic = "force-dynamic";

/** Six weeks away from worship or a group reads as "missed lately". */
const MISSED_DAYS = 42;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await peopleFor(leader);
  const archived = (await searchParams).archived === "1";

  // Each person's last time present, from the attendance the church records.
  const lastSeen = new Map<string, string>();
  for (const a of book.attendance) {
    if (!a.present) continue;
    const prev = lastSeen.get(a.personId);
    if (!prev || a.date > prev) lastSeen.set(a.personId, a.date);
  }
  // Only flag absences when the church is actually taking attendance lately; otherwise everyone would look missed.
  const cutoff = addDays(today(), -MISSED_DAYS);
  const tracking = book.attendance.some((a) => a.present && a.date >= cutoff);

  const people = book.people
    .filter((p) => !p.mergedInto && (archived ? Boolean(p.archivedAt) : isActive(p)))
    .map((p) => {
      const seen = lastSeen.get(p.id);
      const regular = p.status === "member" || p.status === "regular";
      return { ...personView(book, actor, p), lastSeen: seen ?? null, missed: tracking && regular && Boolean(seen) && seen! < cutoff };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const any = book.people.some(isActive);

  return (
    <PeopleFrame
      profile={profile}
      edit={actor.edit}
      title={archived ? "Archived people" : "People"}
      intro={archived ? "People taken out of the directory. Open one to bring them back." : "Your church's directory: people, households, groups and attendance."}
      actions={actor.edit ? <Link className="btn btn-primary" href="/people/new">Add a person</Link> : undefined}
    >
      {!any && !archived ? (
        <EmptyState
          title="No one's in the directory yet"
          actions={actor.edit ? [{ label: "Move your church to Barnabas", href: "/people/import", primary: true }, { label: "Add a person", href: "/people/new" }] : []}
        >
          Bring everyone over from ChurchTrac or Planning Center in a few steps, or add people one at a time. Until then Barnabas knows only Mount Greylock&apos;s published leaders.
        </EmptyState>
      ) : (
        <Directory people={people} showContacts={actor.contacts} showLastSeen={book.attendance.length > 0} />
      )}
      <p className="small muted" style={{ marginTop: 14 }}>
        {archived ? <Link href="/people">Back to the directory</Link> : !actor.edit && <Link href="/people?archived=1">Archived people</Link>}
        {!actor.contacts && `${!archived && actor.edit ? "" : " · "}Contact details are visible to pastors, deacons and staff.`}
      </p>
    </PeopleFrame>
  );
}
