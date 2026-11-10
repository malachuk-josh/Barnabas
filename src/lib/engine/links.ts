/**
 * Action links: a tool that finds or changes something in the app can hand back a button for the
 * leader ("Open Ruth's record", "Open John 3 in The Word"). Talk shows them under Barnabas's reply.
 * Only paths inside the app are allowed.
 */
export type ActionLink = { label: string; href: string };

const MAX_LINKS = 4;

export function cleanLinks(links: ActionLink[] | undefined): ActionLink[] {
  if (!links?.length) return [];
  return links
    .filter((l) => typeof l.href === "string" && l.href.startsWith("/") && !l.href.startsWith("//") && typeof l.label === "string" && l.label.trim())
    .map((l) => ({ label: l.label.trim().slice(0, 60), href: l.href.slice(0, 300) }))
    .slice(0, MAX_LINKS);
}
