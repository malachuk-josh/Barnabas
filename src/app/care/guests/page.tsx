import type { Metadata } from "next";
import { headers } from "next/headers";
import { CareFrame, carePage } from "@/components/care/CareFrame";
import { GuestList, NewGuest, WelcomeLinks } from "@/components/care/GuestsView";
import { rotationPool } from "@/lib/care/guests";
import { guestRows } from "@/lib/care/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guests · Care · Barnabas" };

export default async function GuestsPage() {
  const ctx = await carePage();
  const guests = guestRows(ctx.book, ctx.actor);
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const pool = [...new Map(rotationPool(ctx.actor.members).map((m) => [m.id, m])).values()];
  return (
    <CareFrame ctx={ctx} title="Guests" intro="First-time guests and their follow-up: a thank-you within a day, a welcome call within two, and an invitation to Discover Faith when they come back." actions={<NewGuest />}>
      <div className="fin-stack">
        <GuestList guests={guests.map(({ tasks, ...g }) => ({ ...g, tasks: tasks.map(({ draftText: _t, ...t }) => t) }))} selfIds={ctx.actor.viewer.memberIds} canAssign={ctx.canAssign} />
        <div className="fin-grid-2">
          {ctx.canAssign && <WelcomeLinks links={ctx.book.links.filter((l) => !l.revokedAt).map(({ id, token, label, createdAt }) => ({ id, token, label, createdAt }))} origin={origin} />}
          <section className="fin-card">
            <h2>Who follows up</h2>
            <p className="small">New guests are shared in turn among {pool.map((m) => m.name).join(", ")}.</p>
            {pool.some((m) => m.lighterLoad) && (
              <p className="small muted">
                {pool
                  .filter((m) => m.lighterLoad)
                  .map((m) => m.name)
                  .join(" and ")}{" "}
                {pool.filter((m) => m.lighterLoad).length === 1 ? "is" : "are"} in a busy season, so they take about half as many.
              </p>
            )}
            <p className="fin-source">The deacons and connections staff on the care team, in a fixed order. A pastor, deacon or staff member can hand a guest to someone else.</p>
          </section>
        </div>
      </div>
    </CareFrame>
  );
}
