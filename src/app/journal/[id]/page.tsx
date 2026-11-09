import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import { JournalEditor } from "@/components/journal/JournalEditor";
import { addDays, lastSunday, today } from "@/lib/dates";
import { canSendToService, getEntry, journalActor, JournalError } from "@/lib/journal/service";
import { GATHERINGS } from "@/lib/ops/gatherings";
import { BIBLE_TRANSLATIONS, DEFAULT_BIBLE_TRANSLATION } from "@/lib/profile";
import { loadServices } from "@/lib/services/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Journal · Barnabas" };

const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const { id } = await params;
  const actor = await journalActor(leader).catch(() => null);
  if (!actor) notFound();
  let view;
  try {
    view = await getEntry(actor, id);
  } catch (err) {
    if (err instanceof JournalError) notFound();
    throw err;
  }
  const [book, canSend] = await Promise.all([loadServices(leader.churchId), view.mine && view.entry.kind === "setlist" ? canSendToService(actor) : Promise.resolve(false)]);
  const first = addDays(lastSunday(today()), 7);
  const sundays = Array.from({ length: 12 }, (_, i) => addDays(first, 7 * i)).map((date) => {
    const r = book.rotation.find((x) => x.date === date);
    const series = r?.seriesId ? book.series.find((s) => s.id === r.seriesId) : book.series.find((s) => date >= s.startDate && date <= s.endDate);
    return { date, label: label(date), preacher: r?.preacher, seriesId: series?.id, seriesTitle: series?.title };
  });
  return (
    <AppShell profile={profile}>
      <JournalEditor
        entry={view.entry}
        mine={view.mine}
        canSend={canSend}
        sundays={sundays}
        series={book.series.map((s) => ({ id: s.id, title: s.title }))}
        services={GATHERINGS.filter((g) => g.worship).map((g) => ({ key: g.key, label: g.label }))}
        translation={BIBLE_TRANSLATIONS[profile.bibleTranslation ?? DEFAULT_BIBLE_TRANSLATION]}
      />
    </AppShell>
  );
}
