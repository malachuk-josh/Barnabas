import { AppShell, requirePageLeader } from "@/components/AppShell";
import { Briefing } from "@/components/Briefing";
import { Talk } from "@/components/Talk";
import { deepgram, elevenLabs } from "@/lib/voice/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await requirePageLeader();
  return (
    <AppShell profile={profile}>
      <div className="home">
        <Talk
          greetingName={profile.preferredName}
          voice={profile.voice}
          pronunciations={profile.pronunciations}
          cloudVoice={elevenLabs.configured() && Boolean(profile.voice.voiceId || elevenLabs.defaultVoice())}
          cloudListening={deepgram.configured()}
        />
        <Briefing />
      </div>
    </AppShell>
  );
}
