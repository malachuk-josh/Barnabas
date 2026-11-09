import { AppShell, requirePageLeader } from "@/components/AppShell";
import { Briefing } from "@/components/Briefing";
import { Talk } from "@/components/Talk";
import { VERSES, type VerseKey } from "@/lib/language";
import { deepgram, elevenLabs } from "@/lib/voice/server";

export const dynamic = "force-dynamic";

/** "Monday, November 9" and the part of the day, in the leader's own time zone. */
function todayIn(timezone: string) {
  const now = new Date();
  let tz: string | undefined = timezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = undefined;
  }
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  // Days since 1970 in this time zone, so "For today" turns over at the leader's own midnight.
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(now).split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return { date, part, dayNumber };
}

export default async function Home() {
  const { profile } = await requirePageLeader();
  const { date, part, dayNumber } = todayIn(profile.timezone);
  // The verse for today: one of Barnabas's KJV verses, a different one each day.
  const keys = Object.keys(VERSES) as VerseKey[];
  const todaysVerse = keys[dayNumber % keys.length]!;
  const name = profile.preferredName || profile.name;
  return (
    <AppShell profile={profile}>
      <header className="today-head">
        <p className="today-date">{date}</p>
        <h1>
          Good {part}
          {name ? `, ${name}` : ""}.
        </h1>
      </header>
      <div className="home">
        <Talk
          greetingName={profile.preferredName}
          voice={profile.voice}
          pronunciations={profile.pronunciations}
          cloudVoice={elevenLabs.configured() && Boolean(elevenLabs.defaultVoice())}
          cloudListening={deepgram.configured()}
        />
        <Briefing todaysVerse={todaysVerse} />
      </div>
    </AppShell>
  );
}
