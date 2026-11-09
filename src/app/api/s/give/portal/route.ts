import { NextResponse } from "next/server";
import { z } from "zod";
import { clientAddress, rateLimit } from "@/lib/care/welcome";
import { jsonBody, respondSite } from "@/lib/site/http";
import { PublicFormError } from "@/lib/site/public";
import { returnOrigin } from "@/lib/stripe/checkout";
import { stripePort } from "@/lib/stripe/client";
import { stripeConfig } from "@/lib/stripe/config";

export const runtime = "nodejs";

const Input = z.object({ sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{10,200}$/, "That link has expired."), returnPath: z.string().max(120).regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/).default("/") });

/**
 * Public: open Stripe's Customer Portal for the giver who just finished Checkout (the session id in the
 * thank-you link proves it's them), so they can change or cancel a recurring gift. Without a session id,
 * givers use the portal's own email sign-in link (STRIPE_PORTAL_LOGIN_URL).
 */
export async function POST(request: Request) {
  return respondSite(async () => {
    const port = stripePort();
    if (!stripeConfig() || !port) throw new PublicFormError("Online giving isn't set up yet.", 404);
    if (!(await rateLimit(`give:portal:${clientAddress(request)}`, { limit: 10, windowSeconds: 10 * 60 }))) throw new PublicFormError("Please try again in a few minutes.", 429);
    const input = Input.parse(await jsonBody(request));
    try {
      const customer = await port.checkoutCustomer(input.sessionId);
      if (!customer) throw new PublicFormError("There's no recurring gift to manage from this link.");
      return NextResponse.json({ url: await port.portalSession(customer, `${returnOrigin(request)}${input.returnPath}`) });
    } catch (err) {
      if (err instanceof PublicFormError) throw err;
      throw new PublicFormError("We couldn't open that just now. Please try again.", 502);
    }
  });
}
