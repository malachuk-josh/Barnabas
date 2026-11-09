import type { Metadata } from "next";
import Link from "next/link";
import { requirePageLeader } from "@/components/AppShell";
import { PrintButton } from "@/components/finance/PrintButton";
import { config } from "@/lib/config";
import { kidsActor, labelsFor } from "@/lib/kids/service";
import { loadKids } from "@/lib/kids/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Labels · Barnabas", robots: { index: false, follow: false } };

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Printable 4" × 2" labels: one per child (name, room, allergies, pickup code) and a matching pickup tag
 * for the parent. Printed on a label printer, each is its own page (`@page { size: 4in 2in }`).
 */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { leader } = await requirePageLeader();
  const actor = await kidsActor(leader);
  const ids = ((await searchParams).ids ?? "").split(",").filter(Boolean).slice(0, 10);
  const labels = actor.station ? labelsFor(await loadKids(leader.churchId), ids) : null;
  const church = config.churchName.replace(/\s*\(demo\)\s*$/i, "");
  return (
    <main className="labels-page">
      <div className="labels-bar no-print">
        <Link href="/kids" className="btn">
          Back to the station
        </Link>
        {labels && <PrintButton label="Print labels" />}
        <span className="small muted">Set the printer to 4 × 2 inch labels, no margins.</span>
      </div>
      {!labels ? (
        <p className="card">{actor.station ? "These children are already checked out, or the labels link is old. Check them in again to print new labels." : "Labels are for the check-in station."}</p>
      ) : (
        <div className="labels-sheet">
          {labels.children.map((c) => (
            <section key={c.checkinId} className="klabel klabel-child" aria-label={`Label for ${c.firstName}`}>
              <div className="klabel-top">
                <span className="klabel-church">{church}</span>
                <span>{day(c.date)}</span>
              </div>
              <div className="klabel-name">{c.firstName}</div>
              <div className="klabel-last">{c.lastName}</div>
              <div className="klabel-row">
                <span className="klabel-room">{c.room}</span>
                <span className="klabel-code">{c.code}</span>
              </div>
              {c.allergies ? <div className="klabel-allergy">Allergy: {c.allergies}</div> : <div className="klabel-gathering">{c.gathering}</div>}
            </section>
          ))}
          <section className="klabel klabel-parent" aria-label="Parent pickup tag">
            <div className="klabel-top">
              <span className="klabel-church">{church}</span>
              <span>{day(labels.date)}</span>
            </div>
            <div className="klabel-title">Pickup tag</div>
            <div className="klabel-code klabel-code-big">{labels.code}</div>
            <div className="klabel-kids">
              {labels.family}: {labels.children.map((c) => c.firstName).join(", ")}
            </div>
            <div className="klabel-gathering">Show this tag to pick up. The code must match your child&apos;s label.</div>
          </section>
        </div>
      )}
    </main>
  );
}
