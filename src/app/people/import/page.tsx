import { redirect } from "next/navigation";
import { requirePageLeader } from "@/components/AppShell";
import { MigrationWizard, type LogEntry } from "@/components/people/MigrationWizard";
import { PeopleFrame } from "@/components/people/PeopleFrame";
import { can } from "@/lib/auth/roles";
import { isActive } from "@/lib/people/native";
import { peopleFor } from "@/lib/people/service";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await peopleFor(leader);
  if (!actor.edit) redirect("/people");
  const log: LogEntry[] = [...book.imports].reverse().map((b) => ({ id: b.id, system: b.system, file: b.file, fileName: b.fileName, at: b.at, byName: b.byName, counts: b.counts, skipped: b.skipped, created: Object.fromEntries(Object.entries(b.created).map(([k, v]) => [k, v.length])), undoneAt: b.undoneAt, undoneBy: b.undoneBy }));
  return (
    <PeopleFrame
      profile={profile}
      edit
      eyebrow="People"
      title="Move your church to Barnabas"
      intro="Bring your people, households, groups, attendance and giving history over from ChurchTrac or Planning Center, once. After that, Barnabas is where they live."
    >
      <MigrationWizard log={log} canGiving={can(actor.access, "finance.edit") && can(actor.access, "giving.donors")} peopleCount={book.people.filter(isActive).length} />
    </PeopleFrame>
  );
}
