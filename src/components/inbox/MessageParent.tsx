import Link from "next/link";

/** Opens Messages with a new message to these people, about a child (by first name). */
export function inboxHref(to: string[], about?: string) {
  const q = new URLSearchParams();
  if (to.length) q.set("to", to.join(","));
  if (about) q.set("about", about);
  const s = q.toString();
  return s ? `/inbox?${s}` : "/inbox";
}

/** "Message parent" for a checked-in child, or a quiet note when no guardian is on Barnabas. */
export function MessageParent({ parents, child }: { parents: string[]; child: string }) {
  if (!parents.length) return <span className="small muted kids-msg-none">No parent on Barnabas yet</span>;
  return (
    <Link className="kids-msg" href={inboxHref(parents, child)} aria-label={`Message ${child}'s parent`}>
      Message parent
    </Link>
  );
}
