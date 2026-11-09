import { NextResponse } from "next/server";
import { clientAddress, rateLimit } from "@/lib/care/welcome";
import { config } from "@/lib/config";
import { onlineFunds } from "@/lib/finance/online";
import { siteViewer } from "@/lib/site/context";
import { churchIdOf } from "@/lib/site/data";
import { jsonBody, respondSite } from "@/lib/site/http";
import { formsOpen, isHoneypot, PublicFormError } from "@/lib/site/public";
import { loadSite } from "@/lib/site/store";
import { CheckoutError, createGiftCheckout, GiveInput, returnOrigin } from "@/lib/stripe/checkout";
import { stripePort } from "@/lib/stripe/client";
import { stripeConfig } from "@/lib/stripe/config";

export const runtime = "nodejs";

const GIVE_LIMITS = { ip: { limit: 10, windowSeconds: 10 * 60 }, all: { limit: 600, windowSeconds: 60 * 60 } };

/**
 * Public: start an online gift. Validates the fund (only funds open for online giving), the amount
 * ($1 to $25,000) and the frequency, then returns the address of Stripe's hosted Checkout page.
 * Works on the church's own domain (/api/s passes through) and in the member app. Rate-limited per
 * address and overall; the honeypot makes a bot's request a quiet no-op.
 */
export async function POST(request: Request) {
  return respondSite(async () => {
    const cfg = stripeConfig();
    const port = stripePort();
    if (!cfg || !port) throw new PublicFormError("Online giving isn't set up yet.", 404);
    const churchId = churchIdOf();
    const [book, viewer] = await Promise.all([loadSite(churchId), siteViewer()]);
    if (!formsOpen(book, viewer.signedIn && !viewer.checkinOnly)) throw new PublicFormError("Online giving isn't open yet.", 404);
    const ip = clientAddress(request);
    if (!(await rateLimit(`give:ip:${ip}`, GIVE_LIMITS.ip)) || !(await rateLimit("give:all", GIVE_LIMITS.all))) {
      throw new PublicFormError("We've had a lot of requests from here. Please try again in a few minutes.", 429);
    }
    const raw = await jsonBody(request);
    if (isHoneypot(raw)) return { ok: true };
    const input = GiveInput.parse({ fundId: raw.fundId, amount: raw.amount, frequency: raw.frequency, coverFee: raw.coverFee === true, returnPath: raw.returnPath });
    const fund = (await onlineFunds(churchId)).find((f) => f.id === input.fundId);
    if (!fund) throw new PublicFormError("That fund isn't open for online giving.");
    try {
      const session = await createGiftCheckout(port, input, fund, { churchId, churchName: config.churchName.replace(/\s*\(demo\)\s*$/i, ""), origin: returnOrigin(request), cfg });
      return NextResponse.json({ url: session.url });
    } catch (err) {
      if (err instanceof CheckoutError) throw new PublicFormError(err.message, err.status);
      console.error("[barnabas] gift checkout failed", err instanceof Error ? err.message : "unknown");
      throw new PublicFormError("We couldn't reach our payment provider. Please try again in a moment.", 502);
    }
  });
}
