import { BlockView } from "@/components/site/Blocks";
import { memberContext } from "../member-context";

export const dynamic = "force-dynamic";

/** Series, preachers and passages. Passage references are text while The Word needs a sign-in. */
export default async function MemberSermons() {
  const { render } = await memberContext();
  return <BlockView block={{ id: "app-sermons", type: "sermons", heading: "Sermons", limit: 12 }} ctx={render} />;
}
