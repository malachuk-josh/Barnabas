import { z } from "zod";
import { isResponse, requirePermission } from "@/lib/auth/require";
import { today } from "@/lib/dates";
import { CheckInInput, CheckOutInput, checkInChildren, checkOutChildren, HouseholdInput, removeHousehold, roomRows, saveHousehold, setStaffing } from "@/lib/kids/service";
import { parentLookup } from "@/lib/kids/parents";
import { kidsFor, stationFamily, stationSearch } from "@/lib/kids/views";
import { GATHERING_KEYS, gatheringsOn, type GatheringKey } from "@/lib/ops/gatherings";
import { rawBody, respondOps } from "@/lib/ops/http";

export const runtime = "nodejs";

/** The station (kids.checkin): room counts for a gathering, or families matching `q` (last name or phone last 4). */
export async function GET(request: Request) {
  const leader = await requirePermission("kids.checkin");
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    const url = new URL(request.url);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(today()).parse(url.searchParams.get("date") ?? today());
    const g = z.enum(GATHERING_KEYS).catch((gatheringsOn(date)[0]?.key ?? "sun-0945") as GatheringKey).parse(url.searchParams.get("gathering"));
    const { actor, book } = await kidsFor(leader);
    const q = url.searchParams.get("q");
    if (q !== null) return { families: stationSearch(book, actor, q.slice(0, 40), date, g, await parentLookup(leader.churchId)) };
    const fam = url.searchParams.get("family");
    if (fam) {
      const h = book.households.find((x) => x.id === fam);
      return { family: h ? stationFamily(book, h, date, g, await parentLookup(leader.churchId)) : null };
    }
    return { date, gathering: g, rooms: roomRows(book, date, g), families: book.households.length };
  });
}

const Id = z.string().min(1).max(60);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkin"), checkin: CheckInInput }),
  z.object({ action: z.literal("checkout"), checkout: CheckOutInput }),
  z.object({ action: z.literal("staffing"), date: z.string(), gathering: z.enum(GATHERING_KEYS), roomId: Id, adults: z.number() }),
  z.object({ action: z.literal("family-save"), id: Id.optional(), family: HouseholdInput }),
  z.object({ action: z.literal("family-remove"), id: Id }),
]);

export async function POST(request: Request) {
  const leader = await requirePermission("kids.checkin");
  if (isResponse(leader)) return leader;
  return respondOps(async () => {
    const input = Action.parse(await rawBody(request));
    const { actor } = await kidsFor(leader);
    switch (input.action) {
      case "checkin": {
        const r = await checkInChildren(actor, input.checkin);
        // The code goes back once, for the labels; the station never lists it again.
        return { checkinIds: r.checkins.map((c) => c.id), code: r.code };
      }
      case "checkout":
        return { checkedOut: (await checkOutChildren(actor, input.checkout)).map((c) => c.id) };
      case "staffing":
        await setStaffing(actor, input);
        return { ok: true };
      case "family-save":
        return { id: (await saveHousehold(actor, input.family, input.id)).id };
      case "family-remove":
        await removeHousehold(actor, input.id);
        return { ok: true };
    }
  });
}
