import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageLeader } from "@/components/AppShell";
import { Attendees, EventDetailsFold } from "@/components/ops/EventsViews";
import { OpsFrame } from "@/components/ops/OpsFrame";
import { friendlyDate } from "@/lib/dates";
import { counts, eventsActor, loadEvents } from "@/lib/events/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event · Barnabas" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { leader, profile } = await requirePageLeader();
  const [actor, book] = await Promise.all([eventsActor(leader), loadEvents(leader.churchId)]);
  const event = book.events.find((e) => e.id === id);
  if (!event) notFound();
  const c = counts(book, id);
  const h = await headers();
  const origin = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  return (
    <OpsFrame
      profile={profile}
      eyebrow="Events"
      title={event.title}
      intro={
        <>
          {friendlyDate(event.date)}
          {event.time ? `, ${event.time}${event.endTime ? ` to ${event.endTime}` : ""}` : ""} · {event.location} · <Link href="/events">All events</Link>
        </>
      }
    >
      <dl className="fact-strip event-summary">
        <div>
          <dt>Registered</dt>
          <dd>
            {c.registered}
            {event.capacity ? <span className="muted"> of {event.capacity}</span> : null}
          </dd>
          <span className="small muted">{c.spotsLeft === null ? "No limit" : c.spotsLeft ? `${c.spotsLeft} spots left` : event.waitlist ? "Full: new registrations join the waitlist" : "Full"}</span>
        </div>
        <div>
          <dt>Waitlist</dt>
          <dd>{event.waitlist ? c.waitlisted : "Off"}</dd>
          <span className="small muted">Moves up in order when someone cancels.</span>
        </div>
        <div>
          <dt>Checked in</dt>
          <dd>{c.checkedIn}</dd>
          <span className="small muted">{event.priceCents ? `${c.paymentDue} payment${c.paymentDue === 1 ? "" : "s"} due at the door` : "Free event"}</span>
        </div>
      </dl>
      {actor.manager ? (
        <div className="event-layout">
          <Attendees event={event} registrations={book.registrations.filter((r) => r.eventId === id)} origin={origin} />
          <EventDetailsFold event={event} />
        </div>
      ) : (
        <section className="fin-card">
          <p className="muted">Pastors, deacons and staff see who registered and check people in.</p>
          {event.open && (
            <p>
              <Link className="btn btn-primary" href={`/register/${event.token}`}>
                Register
              </Link>
            </p>
          )}
        </section>
      )}
    </OpsFrame>
  );
}
