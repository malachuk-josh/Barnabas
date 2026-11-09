import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Mark } from "@/components/Mark";
import { PublicRegistration } from "@/components/ops/PublicRegistration";
import { RATE_LIMITS, rateLimit } from "@/lib/care/welcome";
import { config } from "@/lib/config";
import { friendlyDate } from "@/lib/dates";
import { publicView, releaseExpired, resolveEventToken } from "@/lib/events/service";
import { stripeReady } from "@/lib/stripe/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register", robots: { index: false, follow: false } };

/** Public: no sign-in. An unknown or replaced link is a plain 404. It never shows who else registered. */
export default async function RegisterPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params;
  const { paid } = await searchParams;
  let found = await resolveEventToken(token);
  // Unpaid online holds past 60 minutes give their spots back before the page counts what's left.
  if (found && (await releaseExpired(found.churchId)).length) found = await resolveEventToken(token);
  if (!found) {
    const h = await headers();
    await rateLimit(`register:miss:${(h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim()}`, RATE_LIMITS.miss);
    notFound();
  }
  if (!found) notFound();
  const view = publicView(found.event, found.book);
  const payOnline = Boolean(view.priceCents) && stripeReady();
  const church = config.churchName.replace(/\s*\(demo\)\s*$/i, "");
  const past = view.date < new Date().toISOString().slice(0, 10);
  return (
    <main className="signin welcome">
      <div className="card">
        <span className="eyebrow ops-reg-church">
          <Mark /> {church}
        </span>
        <h1 style={{ fontSize: "1.8rem" }}>{view.title}</h1>
        <p>
          <strong>
            {friendlyDate(view.date)}
            {view.time ? `, ${view.time}${view.endTime ? ` to ${view.endTime}` : ""}` : ""}
          </strong>
          <br />
          <span className="muted">{view.location}</span>
        </p>
        {view.description && <p className="small">{view.description}</p>}
        {view.priceCents ? (
          <p className="small ops-seam">
            Cost: ${(view.priceCents / 100).toFixed(view.priceCents % 100 ? 2 : 0)} per person,{" "}
            {payOnline ? "paid online when you register (card, bank account, Apple Pay or Google Pay on Stripe's secure page)." : "paid at the event."}
          </p>
        ) : null}
        {paid === "1" ? (
          <p className="notice" role="status">
            Thank you! Your payment went through and you&apos;re registered. A receipt is on its way from Stripe. (A bank payment can take a few days to clear; your spot is kept.)
          </p>
        ) : paid === "0" ? (
          <p className="notice" role="status">
            Your payment wasn&apos;t finished, so you aren&apos;t registered yet. You can register again below.
          </p>
        ) : null}
        {past ? (
          <p className="notice">This event has already happened. Thanks for your interest!</p>
        ) : !view.open ? (
          <p className="notice">Registration for this event is closed. Please contact the church with any questions.</p>
        ) : view.full && !view.waitlist ? (
          <p className="notice">This event is full. Please contact the church if you have questions.</p>
        ) : (
          paid !== "1" && <PublicRegistration token={token} fields={view.fields} maxParty={view.maxParty} full={view.full} payOnline={payOnline && !view.full} />
        )}
      </div>
    </main>
  );
}
