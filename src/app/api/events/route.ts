import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody, respondOps } from "@/lib/ops/http";
import { admit, cancelRegistration, checkIn, clearDemoEvents, counts, createEvent, EventInput, eventsActor, loadEvents, newLink, register, removeEvent, setPayment, updateEvent } from "@/lib/events/service";

export const runtime = "nodejs";

/** Events that take registration, with counts. Everyone signed in sees the events and counts; names are on /api/events/{id} for managers. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    const [actor, book] = await Promise.all([eventsActor(leader), loadEvents(leader.churchId)]);
    return {
      manager: actor.manager,
      events: book.events
        .map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.time, location: e.location, capacity: e.capacity, open: e.open, waitlist: e.waitlist, priceCents: e.priceCents, counts: counts(book, e.id) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
}

const Id = z.string().min(1).max(60);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), event: EventInput }),
  z.object({ action: z.literal("update"), id: Id, event: EventInput }),
  z.object({ action: z.literal("remove"), id: Id }),
  z.object({ action: z.literal("new-link"), id: Id }),
  z.object({ action: z.literal("register"), id: Id, registration: z.object({ name: z.string(), email: z.string().optional(), phone: z.string().optional(), partySize: z.number().optional(), answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional() }) }),
  z.object({ action: z.literal("cancel"), id: Id }),
  z.object({ action: z.literal("checkin"), id: Id, present: z.boolean() }),
  z.object({ action: z.literal("admit"), id: Id }),
  z.object({ action: z.literal("payment"), id: Id, status: z.enum(["paid", "due", "waived", "refunded"]) }),
  z.object({ action: z.literal("demo-clear"), confirm: z.literal("CLEAR") }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    const input = Action.parse(await rawBody(request));
    const actor = await eventsActor(leader);
    switch (input.action) {
      case "create":
        return await createEvent(actor, input.event);
      case "update":
        return await updateEvent(actor, input.id, input.event);
      case "remove":
        await removeEvent(actor, input.id);
        return { ok: true };
      case "new-link":
        return await newLink(actor, input.id);
      case "register":
        if (!actor.manager) return Response.json({ error: "Use the event's public registration link, or ask a pastor, deacon or staff member." }, { status: 403 });
        return await register(leader.churchId, input.id, input.registration, leader);
      case "cancel":
        return await cancelRegistration(actor, input.id);
      case "checkin":
        return await checkIn(actor, input.id, input.present);
      case "admit":
        return await admit(actor, input.id);
      case "payment":
        return await setPayment(actor, input.id, input.status);
      case "demo-clear":
        await clearDemoEvents(actor);
        return { ok: true };
    }
  });
}
