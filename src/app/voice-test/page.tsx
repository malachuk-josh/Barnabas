import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { VoiceTest } from "@/components/VoiceTest";
import { currentLeader } from "@/lib/auth/session";
import { getProfile } from "@/lib/profile";
import { accessFor } from "@/lib/team";
import { elevenLabs } from "@/lib/voice/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Voice test · Barnabas", robots: { index: false } };

/** Hidden admin page for comparing today's voice with the live ElevenLabs connection by ear. Not in the nav. */
export default async function VoiceTestPage() {
  const leader = await currentLeader();
  if (!leader || !(await accessFor(leader)).admin) notFound();
  const profile = await getProfile(leader);
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Admin · hidden</span>
          <h1>Voice test</h1>
          <p className="muted">Play the same words three ways and listen for warmth and flow. Use headphones or your phone speaker, as leaders do.</p>
        </div>
      </div>
      <VoiceTest
        pronunciations={profile.pronunciations}
        lang={profile.voice.language}
        rate={profile.voice.rate}
        configured={elevenLabs.configured() && Boolean(elevenLabs.defaultVoice())}
        model={elevenLabs.model()}
      />
    </AppShell>
  );
}
