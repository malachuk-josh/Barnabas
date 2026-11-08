import { AppShell, requirePageLeader } from "@/components/AppShell";
import { Briefing } from "@/components/Briefing";
import { Talk } from "@/components/Talk";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await requirePageLeader();
  return (
    <AppShell profile={profile}>
      <div className="home">
        <Talk greetingName={profile.preferredName} voice={profile.voice} />
        <Briefing />
      </div>
    </AppShell>
  );
}
