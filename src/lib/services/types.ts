import type { GatheringKey } from "../ops/gatherings";

export type SermonSeries = {
  id: string;
  title: string;
  /** e.g. "Philippians 1:1–4:23" or "Psalms 1–23"; links into The Word. */
  passage?: string;
  startDate: string;
  endDate: string;
  notes?: string;
  createdAt: number;
  demo?: boolean;
};

/** Who preaches on one Sunday. */
export type PreachingDate = {
  date: string;
  preacher: string;
  seriesId?: string;
  passage?: string;
  title?: string;
  demo?: boolean;
};

export const ITEM_KINDS = ["welcome", "song", "scripture", "prayer", "sermon", "communion", "offering", "announcements", "baptism", "benediction", "other"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_LABELS: Record<ItemKind, string> = {
  welcome: "Welcome",
  song: "Song",
  scripture: "Scripture reading",
  prayer: "Prayer",
  sermon: "Sermon",
  communion: "Communion",
  offering: "Offering",
  announcements: "Announcements",
  baptism: "Baptism",
  benediction: "Benediction",
  other: "Other",
};

export type ServiceItem = {
  id: string;
  kind: ItemKind;
  title: string;
  minutes: number;
  person?: string;
  /** A scripture reference, linked into The Word. */
  passage?: string;
  notes?: string;
};

export type ServicePlan = {
  id: string;
  date: string;
  gathering: GatheringKey;
  items: ServiceItem[];
  updatedAt: number;
  updatedBy: string;
};

export type ServicesMeta = { demo: boolean; createdAt: number; clearedAt?: number };

export type ServicesBook = {
  meta: ServicesMeta;
  series: SermonSeries[];
  rotation: PreachingDate[];
  plans: ServicePlan[];
};
