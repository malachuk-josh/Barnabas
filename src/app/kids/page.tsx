import type { Metadata } from "next";
import { requirePageLeader } from "@/components/AppShell";
import { ChildCare } from "@/components/ops/ChildCare";
import { KidsNoAccess } from "@/components/ops/KidsViews";
import { CheckInStation } from "@/components/ops/CheckInStation";
import { KIDS_TABS, OpsFrame } from "@/components/ops/OpsFrame";
import { today as todayIso } from "@/lib/dates";
import { myChildCare } from "@/lib/kids/parents";
import { roomRows } from "@/lib/kids/service";
import { kidsFor } from "@/lib/kids/views";
import { GATHERINGS, gatheringsOn, nextMeeting } from "@/lib/ops/gatherings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kids check-in · Barnabas" };

export default async function KidsStationPage({ searchParams }: { searchParams: Promise<{ date?: string; g?: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await kidsFor(leader);
  // Members see their own children here (Child care), never the station or anyone else's family.
  if (actor.access.level === "member" && !actor.access.admin) return <ChildCare profile={profile} {...await myChildCare(leader)} />;
  if (!actor.station) return <KidsNoAccess profile={profile} />;
  const q = await searchParams;
  const today = todayIso();
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) && gatheringsOn(q.date).length ? q.date : gatheringsOn(today).length ? today : nextMeeting(today);
  const options = gatheringsOn(date).filter((g) => g.kids);
  const g = options.find((x) => x.key === q.g)?.key ?? options[0].key;
  return (
    <OpsFrame profile={profile} eyebrow="Kids" title="Check-in station" intro="Search a family, check children in and print labels. Check out with the code on the parent's tag." tabs={KIDS_TABS}>
      <CheckInStation
        date={date}
        gathering={g}
        gatherings={GATHERINGS.filter((x) => x.kids).map((x) => ({ key: x.key, label: x.label, day: x.day }))}
        rooms={roomRows(book, date, g)}
        allRooms={book.rooms.map((r) => ({ id: r.id, name: r.name, ages: r.ages, gatherings: r.gatherings }))}
        families={book.households.length}
        admin={actor.admin}
      />
    </OpsFrame>
  );
}
