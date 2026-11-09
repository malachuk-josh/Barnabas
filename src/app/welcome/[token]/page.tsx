import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Mark } from "@/components/Mark";
import { WelcomeForm } from "@/components/care/WelcomeForm";
import { config } from "@/lib/config";
import { RATE_LIMITS, rateLimit, resolveToken } from "@/lib/care/welcome";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };

/** Public: no sign-in. An unknown or turned-off link is a plain 404. */
export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await resolveToken(token);
  if (!found) {
    const h = await headers();
    await rateLimit(`welcome:miss:${(h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim()}`, RATE_LIMITS.miss);
    notFound();
  }
  const church = config.churchName.replace(/\s*\(demo\)\s*$/i, "");
  return (
    <main className="signin welcome">
      <div className="card">
        <h1>
          <Mark />
          Welcome!
        </h1>
        <p>
          Thanks for worshiping with us at <strong>{church}</strong> today. We&apos;d love to get to know you.
        </p>
        <WelcomeForm token={token} />
      </div>
    </main>
  );
}
