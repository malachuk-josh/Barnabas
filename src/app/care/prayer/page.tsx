import type { Metadata } from "next";
import { CareFrame, carePage, directory } from "@/components/care/CareFrame";
import { PrayerView } from "@/components/care/PrayerView";
import { prayerRows } from "@/lib/care/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prayer · Care · Barnabas" };

export default async function PrayerPage() {
  const ctx = await carePage();
  const prayers = prayerRows(ctx.book, ctx.actor);
  return (
    <CareFrame ctx={ctx} title="Prayer requests" intro="Requests the team is carrying. Private ones stay with the pastors and whoever added them.">
      <PrayerView prayers={prayers.map(({ prayedBy: _p, ...p }) => p)} people={(await directory()).map(({ id, name }) => ({ id, name }))} />
    </CareFrame>
  );
}
