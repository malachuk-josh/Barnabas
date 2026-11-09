import { BlockView } from "@/components/site/Blocks";
import { memberContext } from "../member-context";

export const dynamic = "force-dynamic";

/** Giving: the online give form when Stripe is connected, else the church's giving link or "coming soon" (see giveTarget in src/lib/site/give.ts). */
export default async function MemberGive() {
  const { render } = await memberContext();
  return <BlockView block={{ id: "app-give", type: "give", heading: "Give", text: undefined, buttonLabel: "Give online" }} ctx={render} />;
}
