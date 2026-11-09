import { redirect } from "next/navigation";
import { requirePageLeader } from "@/components/AppShell";
import { FieldsEditor } from "@/components/people/FieldsEditor";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { peopleFor } from "@/lib/people/service";

export const dynamic = "force-dynamic";

export default async function FieldsPage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await peopleFor(leader);
  if (!actor.edit) redirect("/people");
  return (
    <PeopleFrame profile={profile} edit title="Custom fields" intro="Anything else your church keeps on people. Pastors, deacons and staff see these on each person's page.">
      <FieldsEditor fields={book.fields} />
    </PeopleFrame>
  );
}
