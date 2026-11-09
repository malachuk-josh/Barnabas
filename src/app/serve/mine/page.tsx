import type { Metadata } from "next";
import { requirePageLeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { OpsFrame, SERVE_TABS } from "@/components/ops/OpsFrame";
import { AwayDates, MySwaps } from "@/components/ops/ServeForms";
import { myServing, serveFor } from "@/lib/serve/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My serving · Barnabas" };

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export default async function MyServingPage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await serveFor(leader);
  const mine = myServing(book, actor);
  return (
    <OpsFrame profile={profile} eyebrow="Serve" title="My serving" intro="Where you're serving, teammates asking you to cover, and the dates you're away." tabs={SERVE_TABS}>
      <div className="fin-grid-2">
        <div className="fin-stack">
          <section className="fin-card">
            <h2>Coming up</h2>
            {mine.upcoming.length ? (
              <ul className="care-tasks">
                {mine.upcoming.map((a) => (
                  <li key={a.id}>
                    <span>
                      <strong>{day(a.date)}</strong>
                      <span className="small muted">
                        {a.positionName} · {a.teamName} · {a.label}
                      </span>
                    </span>
                    <a className="btn" href={`/serve?date=${a.date}`}>
                      Open roster
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="You're not on a roster yet" actions={[{ label: "See open slots", href: "/serve", primary: true }]}>
                Pick any open slot on the Rosters page and you&apos;re on that team. Thank you for serving!
              </EmptyState>
            )}
          </section>
          <MySwaps forMe={mine.swapsForMe.map((s) => ({ id: s.id, fromName: s.fromName, date: s.date, label: s.label, teamName: s.teamName, positionName: s.positionName }))} fromMe={mine.swapsFromMe.map((s) => ({ id: s.id, toName: s.toName, date: s.date, label: s.label, teamName: s.teamName }))} />
        </div>
        <AwayDates volunteerId={mine.volunteer?.id ?? null} blackouts={mine.volunteer?.blackouts ?? []} cap={mine.volunteer?.maxPerMonth} />
      </div>
    </OpsFrame>
  );
}
