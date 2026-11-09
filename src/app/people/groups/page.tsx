import { requirePageLeader } from "@/components/AppShell";
import { GroupsView } from "@/components/people/GroupsView";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { displayName, isActive } from "@/lib/people/native";
import { peopleFor } from "@/lib/people/service";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await peopleFor(leader);
  const people = book.people.filter(isActive).map((p) => ({ id: p.id, name: displayName(p) })).sort((a, b) => a.name.localeCompare(b.name));
  const groups = book.groups.filter((g) => !g.archivedAt).sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name, kind, meets, leaderIds, memberIds }) => ({ id, name, kind, meets, leaderIds, memberIds }));
  return (
    <PeopleFrame profile={profile} edit={actor.edit} title="Groups" intro="Growth Groups, Life Groups, classes and ministry teams, with who's in each and who leads.">
      <GroupsView groups={groups} people={people} edit={actor.edit} />
    </PeopleFrame>
  );
}
