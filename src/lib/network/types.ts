/**
 * Mesa: a consent-based network of churches using Barnabas, sharing ministry resources (never people).
 */

export const ITEM_KINDS = ["series_outline", "service_template", "training_doc", "event_idea", "prayer_need", "mission_need"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const KIND_LABELS: Record<ItemKind, string> = {
  series_outline: "Sermon series outline",
  service_template: "Service template",
  training_doc: "Co-laborer training",
  event_idea: "Event idea",
  prayer_need: "Prayer need",
  mission_need: "Mission partner need",
};

export type ChurchProfile = { churchId: string; name: string; joinedAt: number; /** A clearly fictional example church (demo). */ example?: boolean };

export type LinkStatus = "awaiting_them" | "awaiting_us" | "connected";

/** One side's view of a connection. Both churches keep their own copy. */
export type Link = {
  peer: string;
  peerName: string;
  status: LinkStatus;
  requestedAt: number;
  /** Which church's admin approved, and when (an admin's name stays inside their own church). */
  approvals: Record<string, { at: number }>;
  connectedAt?: number;
  example?: boolean;
};

export type Invite = { fromChurch: string; fromName: string; createdAt: number; expiresAt: number };

/** What leaves the church: a resource, already scrubbed of people. No sharer name, no person ids. */
export type SharedItem = {
  id: string;
  church: string;
  churchName: string;
  kind: ItemKind;
  title: string;
  body: string;
  tags: string[];
  /** Scripture references, for series outlines (e.g. "James 1–5"). */
  scripture?: string;
  sharedAt: number;
  example?: boolean;
};
