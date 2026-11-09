import { can, isCheckinOnly, type Access } from "../auth/roles";

/**
 * What Barnabas sends push notifications about. Browser-safe (Settings imports it), like
 * `src/lib/profile/translations.ts`: no server imports here.
 *
 * Privacy: notification text never carries health or confidential shepherding details, pickup codes or
 * giving amounts. Counts and first names at most; a confidential need has no name at all.
 */
export const NOTIFICATION_TYPES = ["briefing", "messages", "childcare", "shepherding", "serving", "events", "inbox", "kids"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_LABELS: Record<NotificationType, { label: string; hint: string }> = {
  briefing: { label: "Morning briefing", hint: "About 7:00 AM your time, how many needs and follow-ups are waiting on you. Only on days something is." },
  messages: { label: "Messages", hint: "Someone sends you a message in Barnabas. Only their first name shows, never the words." },
  childcare: { label: "Child care", hint: "Your children are checked in or picked up at church. Needs your email on your family's kids record." },
  shepherding: { label: "Shepherding", hint: "A need assigned to you, a new guest card for you, and new prayer requests from the website you can see." },
  serving: { label: "Serving", hint: "Someone asks you to cover a slot, or accepts your swap request." },
  events: { label: "Event registrations", hint: "New registrations for events you created, collapsed into one running count per event." },
  inbox: { label: "Website inbox", hint: "A new message from the website's contact form." },
  kids: { label: "Kids check-in", hint: "A checkout was refused at the kids check-in station." },
};

export type NotificationSettings = {
  /** The master switch. Off stops every notification; this device stays subscribed so turning it back on works. */
  enabled: boolean;
  types: Record<NotificationType, boolean>;
};

export function defaultNotifications(): NotificationSettings {
  return { enabled: true, types: { briefing: true, messages: true, childcare: true, shepherding: true, serving: true, events: true, inbox: true, kids: true } };
}

/** Saved settings over the defaults, so a type added later starts on. */
export function mergeNotifications(saved: Partial<NotificationSettings> | undefined | null): NotificationSettings {
  const base = defaultNotifications();
  if (!saved || typeof saved !== "object") return base;
  const types = { ...base.types };
  for (const t of NOTIFICATION_TYPES) if (typeof saved.types?.[t] === "boolean") types[t] = saved.types[t];
  return { enabled: typeof saved.enabled === "boolean" ? saved.enabled : base.enabled, types };
}

/**
 * The types a role can get, which is also what Settings offers. A check-in-only volunteer gets none of
 * these but Messages (the refused-checkout alert goes to the pastors and staff who keep family records).
 */
export function typesFor(access: Access | null | undefined): NotificationType[] {
  if (!access) return [];
  // Messages reach everyone, the check-in desk included.
  if (isCheckinOnly(access)) return ["messages", "childcare"];
  // Members: their messages and their own children.
  if (access.level === "member" && !access.admin) return ["messages", "childcare"];
  return NOTIFICATION_TYPES.filter((t) => {
    if (t === "events") return can(access, "events.manage");
    if (t === "inbox") return can(access, "site.edit");
    if (t === "kids") return can(access, "kids.admin");
    return true;
  });
}

/** What a notification carries to the service worker. `url` is a path in the leader app. */
export type NotificationPayload = { title: string; body: string; url: string; tag: string };
