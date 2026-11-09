import type { Metadata } from "next";
import { FinanceFrame, NoFinance, financePage } from "@/components/finance/FinanceFrame";
import { OnlineGivingView } from "@/components/finance/OnlineGivingView";
import { appUrl } from "@/lib/messages/config";
import { onlineGivingView } from "@/lib/stripe/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Online giving · Finance · Barnabas" };

export default async function OnlineGivingPage() {
  const ctx = await financePage();
  if (!ctx.books) return <NoFinance profile={ctx.profile} access={ctx.access} />;
  const view = await onlineGivingView(ctx.books, ctx.access, ctx.leader.churchId);
  return (
    <FinanceFrame
      ctx={ctx}
      eyebrow="Finance"
      title="Online giving"
      intro="Gifts and event payments through Stripe: what came in, the processing fees, and the payouts to the bank, so bank imports reconcile."
      actions={view.status.connected ? <span className={`badge ${view.status.testMode ? "badge-test" : "badge-live"}`}>{view.status.testMode ? "Test mode" : "Live"}</span> : undefined}
    >
      <OnlineGivingView view={view} canEdit={ctx.canEdit} canSeeDonors={ctx.canSeeDonors} webhookUrl={`${appUrl() ?? "https://barnabas-three.vercel.app"}/api/stripe/webhook`} />
    </FinanceFrame>
  );
}
