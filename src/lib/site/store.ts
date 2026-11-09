import { newToken } from "../care/welcome";
import { config } from "../config";
import { bookStore } from "../store/book";
import { seedDemoDoc, starterDoc } from "./seed";
import type { SiteBook } from "./types";

/**
 * Redis layout, per church:
 *   site:{church}:meta           published/updated stamps, demo flag, the preview token
 *   site:{church}:draft          the draft website and member app (what the editor changes)
 *   site:{church}:published      what visitors see (null until an admin publishes)
 *   site:{church}:versions       version history (saves, publishes, restores), newest first, capped
 *   site:{church}:inbox          contact-form messages for the leaders
 *   site:{church}:announcements  published announcements (member app, announcement blocks, push)
 *   site:{church}:push           web push subscriptions from the member app
 */
export const PARTS = ["meta", "draft", "published", "versions", "inbox", "announcements", "push"] as const;

export const emptySite = (): SiteBook => ({
  meta: { demo: false, createdAt: Date.now(), previewToken: newToken() },
  draft: starterDoc(),
  published: null,
  versions: [],
  inbox: [],
  announcements: [],
  push: [],
});

const store = bookStore<SiteBook>({
  prefix: "site",
  parts: PARTS,
  empty: emptySite,
  async seed(church) {
    if (church !== config.churchId) return null;
    return { ...emptySite(), meta: { demo: true, createdAt: Date.now(), previewToken: newToken() }, draft: await seedDemoDoc() };
  },
});

export const loadSite = store.load;
export const updateSite = store.update;
export const resetSite = store.reset;
