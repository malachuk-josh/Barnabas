export type EventKind = "meeting" | "visit" | "rest" | "service" | "prep" | "event" | "other";

export const EVENT_KINDS: { value: EventKind; label: string }[] = [
  { value: "meeting", label: "Meeting" },
  { value: "visit", label: "Pastoral visit" },
  { value: "service", label: "Service" },
  { value: "prep", label: "Preparation" },
  { value: "rest", label: "Rest / sabbath" },
  { value: "event", label: "Church event" },
  { value: "other", label: "Other" },
];

export type ProviderId = "google" | "microsoft";

/** An event on the leader's Barnabas calendar (editable by the leader and by Barnabas). */
export type CalendarEvent = {
  id: string;
  title: string;
  /** yyyy-mm-dd in the leader's time zone. */
  date: string;
  /** HH:MM, 24-hour, in the leader's time zone. Absent for all-day events. */
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  kind: EventKind;
  createdBy: "leader" | "barnabas";
  createdAt: number;
  updatedAt: number;
  /** Ids of the copies in connected calendars. */
  external?: Partial<Record<ProviderId, string>>;
  syncError?: string;
};

/** An event from somewhere else: Google, Outlook, or the church database. Read-only in Barnabas. */
export type OutsideEvent = {
  id: string;
  source: ProviderId | "church";
  title: string;
  date: string;
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  /** For church events that take registration: its status, and where to manage it in Barnabas. */
  registration?: { status: string; href: string };
};

export type EventInput = {
  title: string;
  date: string;
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  kind: EventKind;
};
