import type { Metadata } from "next";
import { FinanceFrame, NoFinance, financePage } from "@/components/finance/FinanceFrame";
import { MissionsView } from "@/components/finance/MissionsView";
import { churchData } from "@/lib/chms";
import { today } from "@/lib/dates";
import { missionsView } from "@/lib/finance/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Missions · Finance · Barnabas" };

export default async function MissionsPage() {
  const ctx = await financePage();
  if (!ctx.books) return <NoFinance profile={ctx.profile} access={ctx.access} />;
  const asOf = today();
  const view = missionsView(ctx.books, ctx.access, asOf);
  const people = ctx.canSeeDonors ? (await churchData().listPeople()).map((p) => ({ id: p.id, name: p.name })) : [];
  return (
    <FinanceFrame ctx={ctx} eyebrow="Finance" title="Missions" intro="The partners this church sends and supports, the faith-promise campaign, and the restricted Missions fund that ties them together.">
      <MissionsView view={view} canEdit={ctx.canEdit} canSeeDonors={ctx.canSeeDonors} today={asOf} people={people} />
    </FinanceFrame>
  );
}
