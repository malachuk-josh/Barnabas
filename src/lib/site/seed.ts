import { churchData } from "../chms";
import { config } from "../config";
import { newId } from "../data/ids";
import { DocSchema, type Block, type SiteDoc, type SitePage } from "./types";

/**
 * Starting documents. The demo church (Mount Greylock Baptist Church) gets a draft site built only from
 * what Barnabas already knows publicly: its name, address, weekly schedule, events and published
 * leadership. Nothing else about the church is invented; anything that needs the church's own words is
 * neutral placeholder text ("Add your church's story here"). It stays an unpublished, noindex draft.
 */

export const BARNABAS_PALETTE = { primary: "#1E4543", accent: "#D9A441", background: "#F3F6F4", surface: "#FFFFFF", text: "#0F2423" };
export const SEA_GLASS = "#BFD8D1";

export const MGBC_ADDRESS = "35 Notch Road, North Adams, MA";

type NewBlock = Block extends infer B ? (B extends Block ? Omit<B, "id"> : never) : never;
const b = (block: NewBlock): Block => ({ id: newId("blk"), ...block }) as Block;

function page(kind: SitePage["kind"], slug: string, title: string, blocks: Block[], description?: string): SitePage {
  return { id: kind === "custom" ? newId("pg").slice(0, 40) : `pg_${kind}`, kind, slug, title, description, nav: true, blocks };
}

/** Sentences from church records that don't belong on a public website: family, home town, workload notes. */
const PRIVATE_SENTENCE = /\b(married|kids|children|lives in|busy|travels|long stretch|twice a month|lighter)\b/i;

/** A website bio from a leader's record: only the sentences about their ministry. */
export function publicBio(bio: string | undefined): string {
  if (!bio) return "";
  return bio
    .split(/(?<=\.)\s+/)
    .filter((s) => s.trim() && !PRIVATE_SENTENCE.test(s))
    .join(" ")
    .trim();
}

export function churchDisplayName() {
  return config.churchName.replace(/\s*\(demo\)\s*$/i, "");
}

/** A plain starting site for any church: placeholder words, the Barnabas palette and the standard pages. */
export function starterDoc(churchName = churchDisplayName(), address = ""): SiteDoc {
  const map = address ? [b({ type: "map", heading: "Find us", address })] : [];
  const doc: SiteDoc = {
    theme: {
      churchName,
      tagline: "",
      colors: { ...BARNABAS_PALETTE },
      fonts: { heading: "Young Serif", body: "Figtree" },
      footer: { text: "", address, phone: "", email: "" },
      social: [],
    },
    pages: [
      page("home", "", "Home", [
        b({ type: "hero", heading: `Welcome to ${churchName}`, text: "Add a short welcome here: who you are and who you'd love to meet.", buttons: [{ label: "Plan a visit", href: "/visit", style: "primary" }, { label: "Service times", href: "/times", style: "secondary" }] }),
        b({ type: "announcement", source: "latest" }),
        b({ type: "service_times", heading: "Join us" }),
        b({ type: "events", heading: "Coming up", limit: 3, registrationOnly: false }),
        b({ type: "sermons", heading: "Preaching", limit: 3 }),
        ...map,
      ]),
      page("about", "about", "About and leadership", [
        b({ type: "richtext", html: "<h2>Our story</h2><p>Add your church's story here.</p>" }),
        b({ type: "leadership", heading: "Our leadership", showBios: true, bios: [] }),
        b({
          type: "richtext",
          html: "<h2>Serve with us</h2><blockquote><p>For we are labourers together with God: ye are God's husbandry, ye are God's building.</p><p>1 Corinthians 3:9 (KJV)</p></blockquote><p>Add how people can join in as co-laborers here.</p>",
        }),
      ]),
      page("visit", "visit", "Plan a visit", [
        b({ type: "visit", heading: "Plan your visit", text: "Add what a first Sunday is like here: where to park, where to go, and what to expect for kids.", showForm: true }),
        b({ type: "service_times", heading: "When we meet" }),
        ...map,
      ]),
      page("times", "times", "Service times", [b({ type: "service_times", heading: "Service times" }), ...map]),
      page("events", "events", "Events", [b({ type: "events", heading: "Upcoming events", limit: 12, registrationOnly: false })]),
      page("sermons", "sermons", "Sermons", [b({ type: "sermons", heading: "Sermons and preaching", limit: 8 })]),
      page("give", "give", "Give", [b({ type: "give", heading: "Give", text: "Add a few words about giving here.", buttonLabel: "Give online" })]),
      page("contact", "contact", "Contact", [b({ type: "contact", heading: "Get in touch", text: "Send us a note and someone from the church will get back to you.", toDrafts: false }), ...map]),
    ],
    app: {
      name: churchName.slice(0, 45),
      shortName: initialsName(churchName),
      icon: "",
      welcome: "",
      tabs: { events: true, sermons: true, give: true, connect: true },
    },
    give: { url: "", note: "" },
  };
  return DocSchema.parse(doc);
}

/** "Mount Greylock Baptist Church" -> "MGBC" (fits a home screen). */
export function initialsName(name: string) {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|at)$/i.test(w));
  const initials = words.map((w) => w[0]!.toUpperCase()).join("");
  return (name.length <= 12 ? name : initials || name).slice(0, 12);
}

/** The demo church's draft: the starter site with its real address and website bios for its published leadership. */
export async function seedDemoDoc(): Promise<SiteDoc> {
  const doc = starterDoc(churchDisplayName(), MGBC_ADDRESS);
  const leaders = (await churchData().leadership()).filter((l) => l.published !== false);
  for (const p of doc.pages) {
    for (const block of p.blocks) {
      if (block.type === "leadership") block.bios = leaders.map((l) => ({ name: l.name, bio: publicBio(l.bio) }));
    }
  }
  return DocSchema.parse(doc);
}
