import { newId } from "../data/ids";
import type { Block, BlockType } from "./types";

/** A new block of each type, with neutral placeholder words (used by the editor's "Add block"). */
export function defaultBlock(type: BlockType, address = ""): Block {
  const id = newId("blk");
  switch (type) {
    case "hero":
      return { id, type, heading: "Welcome", text: "Add a short welcome here.", buttons: [] };
    case "richtext":
      return { id, type, html: "<p>Add your words here.</p>" };
    case "image":
      return { id, type, image: { url: "", alt: "" }, caption: "", wide: false };
    case "columns":
      return { id, type, columns: [{ heading: "", html: "<p>Left column.</p>" }, { heading: "", html: "<p>Right column.</p>" }] };
    case "service_times":
      return { id, type, heading: "Service times" };
    case "events":
      return { id, type, heading: "Upcoming events", limit: 6, registrationOnly: false };
    case "leadership":
      return { id, type, heading: "Our leadership", showBios: true, bios: [] };
    case "sermons":
      return { id, type, heading: "Sermons", limit: 4 };
    case "visit":
      return { id, type, heading: "Plan a visit", text: "Add what a first visit is like here.", showForm: true };
    case "give":
      return { id, type, heading: "Give", text: "", buttonLabel: "Give online" };
    case "contact":
      return { id, type, heading: "Get in touch", text: "", toDrafts: false };
    case "map":
      return { id, type, heading: "Find us", address };
    case "video":
      return { id, type, heading: "", url: "", title: "" };
    case "announcement":
      return { id, type, source: "latest" };
  }
}
