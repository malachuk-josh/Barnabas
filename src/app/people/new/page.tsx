import { redirect } from "next/navigation";
import { requirePageLeader } from "@/components/AppShell";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { PersonForm } from "@/components/people/PersonForm";
import { peopleFor } from "@/lib/people/service";

export const dynamic = "force-dynamic";

export default async function NewPersonPage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await peopleFor(leader);
  if (!actor.edit) redirect("/people");
  return (
    <PeopleFrame profile={profile} edit title="Add a person" intro="Only a first name is needed; add the rest when you know it.">
      <PersonForm households={book.households.filter((h) => !h.archivedAt).map((h) => ({ id: h.id, name: h.name }))} fields={book.fields} />
    </PeopleFrame>
  );
}
