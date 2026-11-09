import { requirePageLeader } from "@/components/AppShell";
import { AttendanceTaker } from "@/components/people/AttendanceTaker";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { can } from "@/lib/auth/roles";
import { addDays, lastSunday, today } from "@/lib/dates";
import { displayName, isActive } from "@/lib/people/native";
import { peopleFor } from "@/lib/people/service";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await peopleFor(leader);
  const people = book.people.filter(isActive).map((p) => ({ id: p.id, name: displayName(p) })).sort((a, b) => a.name.localeCompare(b.name));
  const since = addDays(today(), -120);
  const entries = book.attendance.filter((a) => a.date >= since).map(({ personId, date, kind, gathering, groupId }) => ({ personId, date, kind, gathering, groupId }));
  return (
    <PeopleFrame profile={profile} edit={actor.edit} title="Attendance" intro="Who was at each gathering and group. It feeds Reports and the weariness radar.">
      <AttendanceTaker people={people} groups={book.groups.filter((g) => !g.archivedAt).map((g) => ({ id: g.id, name: g.name, memberIds: g.memberIds }))} entries={entries} canTake={actor.edit || can(actor.access, "care.assign")} defaultDate={lastSunday(today())} />
    </PeopleFrame>
  );
}
