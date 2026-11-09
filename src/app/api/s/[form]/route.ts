import { NextResponse } from "next/server";
import { CareError, GuestInput, recordGuest } from "@/lib/care/service";
import { teamMembers } from "@/lib/care/team";
import { siteViewer } from "@/lib/site/context";
import { churchIdOf } from "@/lib/site/data";
import { jsonBody, respondSite } from "@/lib/site/http";
import { allowSubmission, FORMS, formsOpen, isHoneypot, PublicFormError, submitContact, submitPrayer, subscribePush, unsubscribePush, type FormKind } from "@/lib/site/public";
import { pushConfig } from "@/lib/site/push";
import { loadSite } from "@/lib/site/store";

export const runtime = "nodejs";

/**
 * Public: the website's and member app's forms (contact, prayer, guest, push). No session needed, but
 * they only work once the site is published (or for a signed-in leader trying the draft). Rate-limited
 * per address and overall; the honeypot field makes a bot's submission a silent no-op.
 */
export async function POST(request: Request, { params }: { params: Promise<{ form: string }> }) {
  const { form } = await params;
  if (!(FORMS as readonly string[]).includes(form)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const kind = form as FormKind;
  return respondSite(async () => {
    const churchId = churchIdOf();
    const [book, viewer] = await Promise.all([loadSite(churchId), siteViewer()]);
    if (!formsOpen(book, viewer.signedIn && !viewer.checkinOnly)) throw new PublicFormError("This form isn't open yet.", 404);
    if (!(await allowSubmission(kind, request))) throw new PublicFormError("Thanks! We've had a lot from here. Please try again in a few minutes.", 429);
    const raw = await jsonBody(request);
    if (isHoneypot(raw)) return { ok: true };
    if (kind === "contact") await submitContact(churchId, raw, book.published ?? book.draft);
    else if (kind === "prayer") await submitPrayer(churchId, raw);
    else if (kind === "guest") {
      const input = GuestInput.parse({
        name: raw.name,
        email: raw.email || undefined,
        phone: raw.phone || undefined,
        howHeard: raw.howHeard || undefined,
        kidsAges: raw.kidsAges || undefined,
        prayerRequest: raw.prayerRequest || undefined,
        prayerShareable: raw.prayerShareable === true,
        interests: Array.isArray(raw.interests) ? raw.interests : [],
      });
      if (!input.email && !input.phone) throw new PublicFormError("Add an email or phone number so we can say hello.");
      try {
        await recordGuest(churchId, null, input, await teamMembers(churchId));
      } catch (err) {
        if (err instanceof CareError) throw new PublicFormError(err.message);
        throw err;
      }
    } else {
      if (!pushConfig()) throw new PublicFormError("Notifications aren't set up yet.", 404);
      if (raw.unsubscribe === true && typeof raw.endpoint === "string") await unsubscribePush(churchId, raw.endpoint.slice(0, 1000));
      else await subscribePush(churchId, raw);
    }
    return { ok: true };
  });
}
