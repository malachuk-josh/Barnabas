import { after } from "next/server";
import type { Leader } from "../auth/session";
import { can, type Permission } from "../auth/roles";
import { findMember, memberIdsFor } from "../care/team";
import type { CareCase, GuestCard, PrayerRequest, TeamMember } from "../care/types";
import { canSeePrayer } from "../care/visibility";
import { loadEvents } from "../events/store";
import type { RegEvent } from "../events/types";
import { pushConfig } from "../push/vapid";
import { loadServe } from "../serve/store";
import type { ServeBook, SwapRequest } from "../serve/types";
import { accessFor, listLeaders, type LeaderRecord } from "../team";
import { notifyLeaders } from "./send";

/**
 * The moments Barnabas notifies about, one function per moment, each called once from the service that
 * makes it happen. All of them run after the response (`later`) and never throw into the caller.
 *
 * Privacy: counts and first names at most. Never a need's type or notes, a prayer's words, a message's
 * text, a pickup code or an amount. A confidential need carries no name at all.
 */

/** Runs `task` after the response when inside a request (next/server `after`), otherwise in the background. */
export function later(task: () => Promise<unknown>) {
  if (!pushConfig()) return;
  const run = () => task().catch((err) => console.error("[barnabas] notification failed", err instanceof Error ? err.message : "unknown"));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** "Maria Lopez" -> "Maria"; "The Delgado family" -> "the Delgado family". */
export function firstName(name: string | undefined): string {
  const n = (name ?? "").replace(/\s*\((website|guest card)\)\s*$/i, "").trim();
  if (!n) return "Someone";
  if (/^the\s+/i.test(n)) return n.replace(/^the\s+/i, "the ").slice(0, 40);
  return (n.split(/\s+/)[0] ?? n).slice(0, 30);
}

const leaderOf = (members: TeamMember[], memberId: string | undefined) => findMember(members, memberId)?.leaderId;

async function leadersWith(churchId: string, permission: Permission, except?: string) {
  const records = await listLeaders(churchId);
  const withAccess = await Promise.all(records.map(async (r) => ({ r, access: await accessFor(r) })));
  return withAccess.filter((x) => can(x.access, permission) && x.r.leaderId !== except).map((x) => x.r.leaderId);
}

/* ---------- Shepherding ---------- */

/** The payload for a need assigned to someone. Confidential needs say nothing about who it's for. */
export function needAssignedPayload(c: Pick<CareCase, "id" | "confidential" | "subject">) {
  return c.confidential
    ? { title: "A need for you", body: "A confidential need was assigned to you.", url: "/shepherding", tag: `need-${c.id}` }
    : { title: "A need for you", body: `A need for ${firstName(c.subject.name)} was assigned to you.`, url: `/shepherding/cases/${c.id}`, tag: `need-${c.id}` };
}

/** A need was given to someone other than the leader who did it. */
export function needAssigned(actor: { leader: Leader; members: TeamMember[] }, c: CareCase) {
  const to = leaderOf(actor.members, c.assigneeId);
  if (!to || to === actor.leader.leaderId || c.status === "closed") return;
  later(() => notifyLeaders(actor.leader.churchId, [to], "shepherding", needAssignedPayload(c)));
}

/** A guest card the leader follows up on. Only when someone else (or the guest) filled it in. */
export function guestCardAssigned(churchId: string, card: GuestCard, members: TeamMember[], actorLeaderId?: string) {
  const to = leaderOf(members, card.assigneeId);
  if (!to || to === actorLeaderId) return;
  later(() =>
    notifyLeaders(churchId, [to], "shepherding", {
      title: "A new guest to welcome",
      body: `${firstName(card.name)} filled in a guest card. You're following up.`,
      url: `/shepherding/guests#${card.id}`,
      tag: `guest-${card.id}`,
    }),
  );
}

/** Who should hear about a prayer request: everyone who can see it under the prayer list's rules. */
export async function prayerAudience(churchId: string, p: Pick<PrayerRequest, "shareable" | "createdById">, records?: LeaderRecord[]) {
  const all = records ?? (await listLeaders(churchId));
  const out: string[] = [];
  for (const r of all) {
    const access = await accessFor(r);
    if (canSeePrayer({ access, memberIds: memberIdsFor(r) }, p)) out.push(r.leaderId);
  }
  return out;
}

/** A prayer request from the website or member app. The words of the prayer never go in a notification. */
export function websitePrayer(churchId: string, p: PrayerRequest) {
  later(async () =>
    notifyLeaders(churchId, await prayerAudience(churchId, p), "shepherding", {
      title: "New prayer request",
      body: p.shareable ? `${firstName(p.name)} asked for prayer on the website.` : "A private prayer request came in from the website.",
      url: "/shepherding/prayer",
      tag: "prayer-website",
    }),
  );
}

/* ---------- Serving ---------- */

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function volunteerLeader(churchId: string, book: ServeBook, volunteerId: string) {
  const v = book.volunteers.find((x) => x.id === volunteerId);
  if (!v) return undefined;
  if (v.leaderId) return v.leaderId;
  return (await listLeaders(churchId)).find((r) => slug(r.name) === slug(v.name))?.leaderId;
}

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function slotOf(book: ServeBook, assignmentId: string) {
  const a = book.assignments.find((x) => x.id === assignmentId);
  const team = a ? book.teams.find((t) => t.id === a.teamId) : undefined;
  return { date: a ? shortDate(a.date) : "", team: team?.name ?? "your team" };
}

/** Someone was asked to cover a slot. */
export function swapRequested(actor: { leader: Leader }, s: SwapRequest) {
  later(async () => {
    const book = await loadServe(actor.leader.churchId);
    const to = await volunteerLeader(actor.leader.churchId, book, s.toVolunteerId);
    if (!to || to === actor.leader.leaderId) return;
    const from = book.volunteers.find((v) => v.id === s.fromVolunteerId);
    const slot = slotOf(book, s.assignmentId);
    await notifyLeaders(actor.leader.churchId, [to], "serving", {
      title: "Can you cover?",
      body: `${firstName(from?.name)} asked you to cover ${slot.team}${slot.date ? ` on ${slot.date}` : ""}.`,
      url: "/serve/mine",
      tag: `swap-${s.id}`,
    });
  });
}

/** The teammate accepted a swap: tell whoever asked. */
export function swapAccepted(actor: { leader: Leader }, s: SwapRequest) {
  if (s.status !== "accepted") return;
  later(async () => {
    const book = await loadServe(actor.leader.churchId);
    const to = await volunteerLeader(actor.leader.churchId, book, s.fromVolunteerId);
    if (!to || to === actor.leader.leaderId) return;
    const by = book.volunteers.find((v) => v.id === s.toVolunteerId);
    const slot = slotOf(book, s.assignmentId);
    await notifyLeaders(actor.leader.churchId, [to], "serving", {
      title: "Swap accepted",
      body: `${firstName(by?.name)} will cover your ${slot.team} slot${slot.date ? ` on ${slot.date}` : ""}.`,
      url: "/serve/mine",
      tag: `swap-${s.id}`,
    });
  });
}

/* ---------- Events, the website inbox and kids ---------- */

/**
 * A new registration. To the leader who created the event (or, if they no longer manage events, everyone
 * who does), collapsed into one notification per event that shows the running count.
 */
export function eventRegistration(churchId: string, ev: Pick<RegEvent, "id" | "title" | "createdBy">, status: "registered" | "waitlisted") {
  later(async () => {
    const book = await loadEvents(churchId);
    const registered = book.registrations.filter((r) => r.eventId === ev.id && r.status === "registered").reduce((n, r) => n + r.partySize, 0);
    const managers = await leadersWith(churchId, "events.manage");
    const to = managers.includes(ev.createdBy) ? [ev.createdBy] : managers;
    await notifyLeaders(churchId, to, "events", {
      title: ev.title.slice(0, 60),
      body: status === "waitlisted" ? `Someone joined the waitlist. ${registered} registered so far.` : `New registration. ${registered} registered so far.`,
      url: `/events/${ev.id}`,
      tag: `event-${ev.id}`,
    });
  });
}

/** A contact-form message on the website. */
export function inboxMessage(churchId: string, msg: { id: string; name: string }) {
  later(async () =>
    notifyLeaders(churchId, await leadersWith(churchId, "site.edit"), "inbox", {
      title: "Website message",
      body: `New message from ${firstName(msg.name)}.`,
      url: "/site/inbox",
      tag: "site-inbox",
    }),
  );
}

/** Someone not on a family's pickup list tried to take a child. To the pastors and staff, never with names. */
export function checkoutRefused(actor: { leader: Leader }) {
  later(async () =>
    notifyLeaders(actor.leader.churchId, await leadersWith(actor.leader.churchId, "kids.admin", actor.leader.leaderId), "kids", {
      title: "Kids check-in",
      body: "A checkout was refused: the person wasn't on the family's pickup list.",
      url: "/kids",
      tag: "kids-refused",
    }),
  );
}

