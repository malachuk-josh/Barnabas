import Link from "next/link";
import { requirePageLeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Directory } from "@/components/people/Directory";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { isActive } from "@/lib/people/native";
import { peopleFor, personView } from "@/lib/people/service";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await peopleFor(leader);
  const archived = (await searchParams).archived === "1";
  const people = book.people.filter((p) => !p.mergedInto && (archived ? Boolean(p.archivedAt) : isActive(p))).map((p) => personView(book, actor, p)).sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const any = book.people.some(isActive);
  return (
    <PeopleFrame
      profile={profile}
      edit={actor.edit}
      title="People"
      intro="The church's directory: people, households, groups and attendance, kept in Barnabas."
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
        <Directory people={people} showContacts={actor.contacts} />
      )}
      <p className="small muted" style={{ marginTop: 14 }}>
        {archived ? <Link href="/people">Back to the directory</Link> : <Link href="/people?archived=1">Archived people</Link>}
        {!actor.contacts && " · Contact details are visible to pastors, deacons and staff."}
      </p>
    </PeopleFrame>
  );
}
