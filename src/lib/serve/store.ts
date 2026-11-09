import { config } from "../config";
import { bookStore } from "../store/book";
import type { ServeBook } from "./types";

/**
 * Redis layout, per church:
 *   ops:{church}:meta          demo flag
 *   ops:{church}:teams         teams, their positions, gatherings and leads
 *   ops:{church}:volunteers    volunteers, team membership, monthly caps and blackout dates
 *   ops:{church}:assignments   who serves where (date, gathering, team, position)
 *   ops:{church}:swaps         swap requests
 */
export const PARTS = ["meta", "teams", "volunteers", "assignments", "swaps"] as const;

export const emptyServe = (): ServeBook => ({ meta: { demo: false, createdAt: Date.now() }, teams: [], volunteers: [], assignments: [], swaps: [] });

const store = bookStore<ServeBook>({
  prefix: "ops",
  parts: PARTS,
  empty: emptyServe,
  async seed(church) {
    const { defaultTeams, seedDemoServe } = await import("./demo");
    // Every church starts with the usual teams and positions; only the demo church gets its leaders' rosters.
    if (church !== config.churchId) return { ...emptyServe(), teams: defaultTeams() };
    return seedDemoServe();
  },
});

export const loadServe = store.load;
export const updateServe = store.update;
export const resetServe = store.reset;
