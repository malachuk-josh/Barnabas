import { redirect } from "next/navigation";
import { requirePageLeader } from "@/components/AppShell";
import { Duplicates } from "@/components/people/Duplicates";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { displayName } from "@/lib/people/native";
import { duplicates, peopleFor } from "@/lib/people/service";
import { MEMBER_LABELS } from "@/lib/people/types";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await peopleFor(leader);
  if (!actor.edit) redirect("/people");
  const sets = duplicates(book).map((s) => ({ reason: s.reason, people: s.people.map((p) => ({ id: p.id, name: displayName(p), email: p.email, phone: p.phone, household: book.households.find((h) => h.id === p.householdId)?.name, status: MEMBER_LABELS[p.status] })) }));
  return (
    <PeopleFrame profile={profile} edit title="Duplicates" intro="People who might be in the directory twice. Pick the record to keep and merge.">
      <Duplicates sets={sets} />
    </PeopleFrame>
  );
}
