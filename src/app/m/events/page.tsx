import { BlockView } from "@/components/site/Blocks";
import { memberContext } from "../member-context";

export const dynamic = "force-dynamic";

export default async function MemberEvents() {
  const { render } = await memberContext();
  return <BlockView block={{ id: "app-events", type: "events", heading: "Events", limit: 12, registrationOnly: false }} ctx={render} />;
}
