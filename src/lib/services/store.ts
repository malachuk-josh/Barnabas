import { addDays, lastSunday, today } from "../dates";
import { config } from "../config";
import { bookStore } from "../store/book";
import type { PreachingDate, ServicesBook } from "./types";

/**
 * Redis layout, per church:
 *   svc:{church}:meta       demo flag
 *   svc:{church}:series     sermon series
 *   svc:{church}:rotation   who preaches which Sunday
 *   svc:{church}:plans      orders of service, one per date and gathering
 */
export const PARTS = ["meta", "series", "rotation", "plans"] as const;

export const emptyServices = (): ServicesBook => ({ meta: { demo: false, createdAt: Date.now() }, series: [], rotation: [], plans: [] });

/**
 * The demo church's preaching rotation, the only thing seeded: Ethan Malachuk (Lead Pastor) preaches most
 * Sundays and Eric Malachuk (Care Pastor) occasionally, as the church described. No series titles, passages
 * or orders of service are made up; those start empty.
 */
export function seedDemoRotation(asOf = today()): PreachingDate[] {
  const first = addDays(lastSunday(asOf), 7);
  return Array.from({ length: 10 }, (_, i) => ({ date: addDays(first, 7 * i), preacher: i % 5 === 3 ? "Eric Malachuk" : "Ethan Malachuk", demo: true }));
}

const store = bookStore<ServicesBook>({
  prefix: "svc",
  parts: PARTS,
  empty: emptyServices,
  async seed(church) {
    if (church !== config.churchId) return null;
    return { ...emptyServices(), meta: { demo: true, createdAt: Date.now() }, rotation: seedDemoRotation() };
  },
});

export const loadServices = store.load;
export const updateServices = store.update;
export const resetServices = store.reset;
