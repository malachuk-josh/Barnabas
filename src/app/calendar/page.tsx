import { AppShell, requirePageLeader } from "@/components/AppShell";
import { CalendarView } from "@/components/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { profile } = await requirePageLeader();
  return (
    <AppShell profile={profile}>
      <CalendarView timezone={profile.timezone} />
    </AppShell>
  );
}
