import type { Metadata } from "next";
import Link from "next/link";
import { requirePageLeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { OpsFrame } from "@/components/ops/OpsFrame";
import { EventForm } from "@/components/ops/EventsViews";
import { churchData } from "@/lib/chms";
import { addDays, friendlyDate, today } from "@/lib/dates";
import { counts, eventsActor, loadEvents } from "@/lib/events/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events · Barnabas" };

const tileMonth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const tileDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
const tileWeekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

export default async function EventsPage() {
  const { leader, profile } = await requirePageLeader();
  const [actor, book] = await Promise.all([eventsActor(leader), loadEvents(leader.churchId)]);
  const asOf = today();
  const upcoming = book.events.filter((e) => e.date >= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const past = book.events.filter((e) => e.date < asOf).sort((a, b) => b.date.localeCompare(a.date));
  // Church calendar events that don't take registration yet, to start one from.
  const church = actor.manager ? (await churchData().events(asOf, addDays(asOf, 120))).filter((e) => !e.recurring && !book.events.some((x) => x.churchEventId === e.id)) : [];
  const card = (e: (typeof book.events)[number]) => {
    const c = counts(book, e.id);
    const pct = e.capacity ? Math.min(100, Math.round((c.registered / e.capacity) * 100)) : null;
    return (
      <Link key={e.id} href={`/events/${e.id}`} className="fin-card ops-event-card">
        <div className="event-card-head">
          <span className="date-tile" aria-hidden="true">
            <small>{tileMonth(e.date)}</small>
            <strong>{tileDay(e.date)}</strong>
          </span>
          <span className="event-card-title">
            <h2>{e.title}</h2>
            <span className="small muted">
              <span className="sr-only">{friendlyDate(e.date)}, </span>
              {tileWeekday(e.date)}
              {e.time ? ` ${e.time}` : ""}
              {e.location ? ` · ${e.location}` : ""}
            </span>
          </span>
          <span className={`pill ${e.open ? (c.spotsLeft === 0 ? "pill-watch" : "pill-ok") : "pill-high"}`}>{!e.open ? "Closed" : c.spotsLeft === 0 ? (e.waitlist ? "Full: waitlist" : "Full") : "Open"}</span>
        </div>
        <div className="fin-sub">
          <span>Registered</span>
          <span>
            {c.registered}
            {e.capacity ? ` of ${e.capacity}` : ""}
          </span>
        </div>
        {pct !== null && (
          <div className="fin-meter" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        <span className="small muted">
          {c.waitlisted ? `${c.waitlisted} on the waitlist · ` : ""}
          {c.checkedIn ? `${c.checkedIn} checked in · ` : ""}
          {e.priceCents ? `$${(e.priceCents / 100).toFixed(0)} per person` : "Free"}
        </span>
      </Link>
    );
  };
  return (
    <OpsFrame
      profile={profile}
      eyebrow="Events"
      title="Events and registrations"
      intro={actor.manager ? "Registration forms, capacity and waitlists, a public sign-up link for each event, attendee lists and event-day check-in." : "Events taking registrations and how they're filling. Pastors, deacons and staff manage them."}
      actions={actor.manager ? <a className="btn btn-primary" href="#new-event">New event</a> : undefined}
      demo={book.meta.demo ? { text: <>These are real events from MGBC&apos;s calendar. <strong>No one has registered yet</strong>, and no registrant is made up.</>, clear: actor.manager && (actor.access.role === "pastor" || actor.access.role === "staff") ? { path: "/api/events", method: "POST", body: { action: "demo-clear", confirm: "CLEAR" }, label: "Clear the demo events" } : undefined } : undefined}
    >
      <div className="fin-stack">
        {upcoming.length ? (
          <div className="fin-grid event-cards">{upcoming.map(card)}</div>
        ) : (
          <EmptyState title="No upcoming events take registration" actions={actor.manager ? [{ label: "Create your first event", href: "#new-event", primary: true }] : []}>
            Add a registration form to anything on the church calendar: a retreat, a dinner, a class. Each event gets a link people can open on their phone.
          </EmptyState>
        )}
        {actor.manager && <EventForm churchEvents={church.map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.time, endTime: e.endTime, location: e.location, description: e.description }))} />}
        {past.length > 0 && (
          <details className="fin-details">
            <summary>Past events ({past.length})</summary>
            <div className="fin-grid event-cards">{past.map(card)}</div>
          </details>
        )}
        <p className="fin-source">Registrations in Barnabas. Events that take registration also show on the Calendar with their status.</p>
      </div>
    </OpsFrame>
  );
}
