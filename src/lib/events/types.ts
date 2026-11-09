export const FIELD_KINDS = ["text", "choice", "number", "yesno"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const FIELD_LABELS: Record<FieldKind, string> = { text: "Short answer", choice: "Choice", number: "Number", yesno: "Yes / no" };

export type FormField = {
  id: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  /** For choice fields. */
  options?: string[];
  min?: number;
  max?: number;
};

export type RegEvent = {
  id: string;
  title: string;
  date: string;
  /** "6:00 PM" style, like the church calendar. */
  time?: string;
  endTime?: string;
  location: string;
  description?: string;
  /** The church calendar event this registration belongs to, when there is one. */
  churchEventId?: string;
  /** People (counting party size). Unset means no limit. */
  capacity?: number;
  /** When full, new registrations join a waitlist instead of being turned away. */
  waitlist: boolean;
  /** Whether the public page takes registrations. */
  open: boolean;
  /** Up to how many people one registration can bring (1 = individuals only). */
  maxParty: number;
  /** Display only: the cost per person in cents. Payment isn't collected here (see `Registration.payment`). */
  priceCents?: number;
  fields: FormField[];
  /** The public registration link token (32 random bytes, looked up by its hash). */
  token: string;
  createdAt: number;
  createdBy: string;
  demo?: boolean;
};

export type Answer = string | number | boolean;

export type PaymentStatus = "not_required" | "due" | "paid" | "refunded" | "waived";

/**
 * Stripe plugs in here. Today a paid event records `due` and the amount, and a leader can mark it paid
 * (cash or check at the door). A Stripe Checkout session id and webhook-confirmed status would live on
 * this object; nothing else needs to change.
 */
export type Payment = { status: PaymentStatus; amountCents?: number; /** future: Stripe Checkout session / payment intent id */ providerRef?: string; markedBy?: string; markedAt?: number };

export type Registration = {
  id: string;
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  partySize: number;
  answers: Record<string, Answer>;
  status: "registered" | "waitlisted" | "cancelled";
  payment: Payment;
  checkedInAt?: number;
  checkedInBy?: string;
  source: "public" | "leader";
  createdAt: number;
  cancelledAt?: number;
  promotedAt?: number;
};

export type EventsMeta = { demo: boolean; createdAt: number; clearedAt?: number };

export type EventsBook = { meta: EventsMeta; events: RegEvent[]; registrations: Registration[] };
