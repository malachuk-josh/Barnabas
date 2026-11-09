import { AppShell, requirePageLeader } from "@/components/AppShell";
import { CalendarView } from "@/components/CalendarView";
import { calendarSuggestions } from "@/lib/care/views";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { leader, profile } = await requirePageLeader();
  // Suggestions only: nothing goes on the calendar unless the leader adds it.
  const suggestions = await calendarSuggestions(leader).catch(() => []);
  return (
    <AppShell profile={profile}>
      <CalendarView timezone={profile.timezone} suggestions={suggestions} />
    </AppShell>
  );
}
