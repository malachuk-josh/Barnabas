import { z } from "zod";
import type { Leader } from "../auth/session";
import { clientAddress, rateLimit } from "../care/welcome";
import { noteProblem } from "../care/service";
import { updateCare } from "../care/store";
import type { PrayerRequest } from "../care/types";
import { audit, saveDraft, type Draft } from "../data/records";
import { newId } from "../data/ids";
import { checkMemoryText } from "../policy/privacy";
import { loadPeople } from "../people/store";
import { getLeaderRecord } from "../team";
import { inboxMessage, websitePrayer } from "../notifications/notify";
import { loadSite, updateSite } from "./store";
import type { BlockOf, InboxMessage, SiteBook, SiteDoc } from "./types";

/**
 * The website's and member app's public forms: contact, prayer request, guest card and push sign-up.
 * No sign-in. Each is rate-limited per network address and overall, has a honeypot field, takes only
 * the fields it needs, and says only whether it worked. Nothing from the church's records comes back.
 */

export class PublicFormError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const FORMS = ["contact", "prayer", "guest", "push"] as const;
export type FormKind = (typeof FORMS)[number];

export const FORM_LIMITS: Record<FormKind, { ip: { limit: number; windowSeconds: number }; all: { limit: number; windowSeconds: number } }> = {
  contact: { ip: { limit: 5, windowSeconds: 10 * 60 }, all: { limit: 200, windowSeconds: 60 * 60 } },
  prayer: { ip: { limit: 5, windowSeconds: 10 * 60 }, all: { limit: 200, windowSeconds: 60 * 60 } },
  guest: { ip: { limit: 5, windowSeconds: 10 * 60 }, all: { limit: 200, windowSeconds: 60 * 60 } },
  push: { ip: { limit: 10, windowSeconds: 10 * 60 }, all: { limit: 2000, windowSeconds: 60 * 60 } },
};

/** The audit identity for writes that come from the public website. */
export const sitePublicActor = (churchId: string): Leader => ({ churchId, leaderId: "site-public", name: "Church website", email: "", role: "website" });

/** Whether a public form may run: the site is published, or a signed-in leader is trying the draft. */
export function formsOpen(book: Pick<SiteBook, "published">, leaderSignedIn: boolean) {
  return Boolean(book.published) || leaderSignedIn;
}

/** True when a bot filled the field people never see. The caller says thanks and keeps nothing. */
export function isHoneypot(raw: Record<string, unknown>) {
  return typeof raw.website === "string" && raw.website.trim() !== "";
}

/** Counts this submission against the per-address and overall limits. False means "too many, try later". */
export async function allowSubmission(kind: FormKind, request: Request) {
  const ip = clientAddress(request);
  const rule = FORM_LIMITS[kind];
  if (!(await rateLimit(`site:${kind}:ip:${ip}`, rule.ip))) return false;
  return rateLimit(`site:${kind}:all`, rule.all);
}

const Contact = z.object({
  name: z.string().trim().min(1, "Add your name.").max(100),
  email: z.string().trim().email("Check the email address.").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).regex(/^[0-9 ()+.\-]*$/, "Use digits for the phone number.").optional().or(z.literal("")),
  message: z.string().trim().min(2, "Write a short message.").max(2000),
  page: z.string().trim().max(80).optional(),
  blockId: z.string().max(40).optional(),
});

function contactBlock(doc: SiteDoc | null, blockId: string | undefined): BlockOf<"contact"> | undefined {
  if (!doc || !blockId) return undefined;
  for (const p of doc.pages) for (const b of p.blocks) if (b.type === "contact" && b.id === blockId) return b;
  return undefined;
}

/**
 * A contact message goes to the website inbox. When the contact block asks for it (set in the editor,
 * read from the stored site, never from the request), a reply is also drafted into the Drafts review
 * queue of the leader who last published the site. Nothing is sent.
 */
export async function submitContact(churchId: string, raw: Record<string, unknown>, doc: SiteDoc | null) {
  const v = Contact.parse({ name: raw.name, email: raw.email || undefined, phone: raw.phone || undefined, message: raw.message, page: raw.page || undefined, blockId: raw.blockId || undefined });
  if (!v.email && !v.phone) throw new PublicFormError("Add an email or phone number so we can reply.");
  if (checkMemoryText(v.message, { allowSensitive: true })) throw new PublicFormError("Please leave out passwords, codes and account numbers.");
  const msg: InboxMessage = { id: newId("msg"), kind: "contact", name: v.name, email: v.email || undefined, phone: v.phone || undefined, message: v.message, page: v.page, createdAt: Date.now() };
  msg.personId = await personByEmail(churchId, msg.email);
  const block = contactBlock(doc, v.blockId);
  const book = await loadSite(churchId);
  if (block?.toDrafts) {
    const ownerId = book.meta.publishedById ?? book.meta.updatedById;
    const owner = ownerId ? await getLeaderRecord(churchId, ownerId) : null;
    if (owner) {
      const leader: Leader = { churchId, leaderId: owner.leaderId, name: owner.name, email: owner.email, role: owner.role };
      const first = v.name.split(/\s+/)[0];
      const text = `Hi ${first}, thank you for getting in touch with ${doc?.theme.churchName ?? "the church"}. `;
      const draft: Draft = {
        id: newId("draft"),
        leaderId: owner.leaderId,
        conversationId: `site:${msg.id}`,
        channel: v.phone && !v.email ? "sms" : "email",
        subject: v.email ? "Thanks for your message" : undefined,
        baseText: text,
        recipients: [{ personId: `site:${msg.id}`, name: v.name, language: "en", text }],
        status: "needs_review",
        createdAt: Date.now(),
      };
      await saveDraft(leader, draft);
      await audit(leader, { action: "draft.create", detail: `${draft.id} reply to website message ${msg.id}` });
      msg.draftId = draft.id;
    }
  }
  await updateSite(churchId, ["inbox"], (b) => {
    b.inbox = [msg, ...b.inbox].slice(0, 500);
  });
  await audit(sitePublicActor(churchId), { action: "site.contact.receive", detail: msg.id });
  inboxMessage(churchId, msg);
  return msg;
}

/** The People record with this email, if exactly one active person has it (for linking a message to them). */
export async function personByEmail(churchId: string, email: string | undefined) {
  if (!email) return undefined;
  const book = await loadPeople(churchId).catch(() => null);
  const matches = (book?.people ?? []).filter((p) => !p.archivedAt && p.email?.trim().toLowerCase() === email.trim().toLowerCase());
  return matches.length === 1 ? matches[0].id : undefined;
}

const Prayer = z.object({
  name: z.string().trim().min(1, "Add your name (a first name is fine).").max(100),
  request: z.string().trim().min(3, "Share a few words.").max(500),
  shareable: z.boolean().default(false),
});

/**
 * A prayer request from the website or member app becomes a new request in Shepherding (Care), under the
 * same privacy rules as the guest card: private (the pastors only) unless the person says the prayer team
 * may see it, and no health, family or money details kept online.
 */
export async function submitPrayer(churchId: string, raw: Record<string, unknown>) {
  const v = Prayer.parse({ name: raw.name, request: raw.request, shareable: raw.shareable === true });
  if (noteProblem(v.request) || noteProblem(v.name)) {
    throw new PublicFormError("To protect your privacy, we don't keep health, family or money details online. Write something short like \"for my family\", and a pastor will be glad to talk with you in person.");
  }
  const prayer: PrayerRequest = {
    id: newId("pr"),
    name: v.name,
    request: v.request,
    shareable: v.shareable,
    prayedCount: 0,
    prayedBy: [],
    createdById: "site:public",
    createdByName: `${v.name} (website)`,
    createdAt: Date.now(),
  };
  await updateCare(churchId, ["prayers"], (book) => {
    book.prayers.push(prayer);
  });
  await audit(sitePublicActor(churchId), { action: "care.prayer.website", detail: `${prayer.id}${v.shareable ? " shareable" : " private"}` });
  websitePrayer(churchId, prayer);
  return prayer;
}

const PushInput = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoints are https."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

export async function subscribePush(churchId: string, raw: Record<string, unknown>) {
  const sub = PushInput.parse(raw.subscription ?? raw);
  await updateSite(churchId, ["push"], (book) => {
    book.push = [{ ...sub, createdAt: Date.now() }, ...book.push.filter((p) => p.endpoint !== sub.endpoint)].slice(0, 5000);
  });
  await audit(sitePublicActor(churchId), { action: "site.push.subscribe", detail: new URL(sub.endpoint).host });
}

export async function unsubscribePush(churchId: string, endpoint: string) {
  await updateSite(churchId, ["push"], (book) => {
    book.push = book.push.filter((p) => p.endpoint !== endpoint);
  });
  await audit(sitePublicActor(churchId), { action: "site.push.unsubscribe", detail: "" });
}
