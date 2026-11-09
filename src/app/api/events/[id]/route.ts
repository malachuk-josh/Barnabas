import { NextResponse } from "next/server";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { audit } from "@/lib/data/records";
import { counts, loadEvents, registrationsCsv } from "@/lib/events/service";
import { respondOps } from "@/lib/ops/http";

export const runtime = "nodejs";

/** One event with its registrations (events.manage). `?format=csv` downloads the attendee list. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const leader = await requirePermission("events.manage");
  if (isResponse(leader)) return leader;
  const { id } = await params;
  return respondOps(async () => {
    const book = await loadEvents(leader.churchId);
    const event = book.events.find((e) => e.id === id);
    if (!event) return NextResponse.json({ error: "That event doesn't exist." }, { status: 404 });
    const registrations = book.registrations.filter((r) => r.eventId === id).sort((a, b) => a.createdAt - b.createdAt);
    if (new URL(request.url).searchParams.get("format") === "csv") {
      await audit(leader, { action: "events.export", detail: id });
      const name = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "event";
      return new NextResponse(registrationsCsv(event, registrations), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${event.date}.csv"`, "Cache-Control": "no-store" },
      });
    }
    return { event, registrations, counts: counts(book, id) };
  });
}
