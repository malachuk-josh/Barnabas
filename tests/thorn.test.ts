import { beforeEach, describe, expect, it } from "vitest";
import { createConversation, type ConversationMeta } from "@/lib/data/conversations";
import { BARNABAS_SYSTEM } from "@/lib/engine/prompt";
import { consentsToRemember, readThorns, rememberThorn, thornContext, THORN_PATH } from "@/lib/engine/thorn";
import { TOOL_DEFS, executeTool } from "@/lib/engine/tools";
import { mentionsHealth } from "@/lib/policy/privacy";
import { freshStore, leader } from "./helpers";

const DETAIL = "Lives with rheumatoid arthritis; mornings are hardest.";

async function conv(turns: number, offRecord = false): Promise<ConversationMeta> {
  const m: ConversationMeta = { id: `c${Math.random().toString(36).slice(2, 8)}`, title: "t", mode: "voice", offRecord, createdAt: 0, updatedAt: 0, context: "", turns };
  await createConversation(leader, m);
  return m;
}
const ctx = (meta: ConversationMeta, lastUserText: string) => ({ leader, meta, turnStartedAt: Date.now(), lastUserText });
const run = (meta: ConversationMeta, said: string, detail = DETAIL) => rememberThorn.run({ detail } as never, ctx(meta, said));

describe("consent words", () => {
  it("only a clear yes to remembering counts", () => {
    for (const yes of ["Yes", "Yes, please remember that", "Sure, you can", "Okay", "Please do", "Remember it as a thorn"]) expect(consentsToRemember(yes), yes).toBe(true);
    for (const no of ["Keep it private", "No thanks", "I'd rather not", "Don't save that", "Let's keep that between us", "Hmm, what's on Sunday?", "", "yes but actually don't"]) expect(consentsToRemember(no), no).toBe(false);
  });

  it("recognizes common chronic conditions as health details", () => {
    for (const t of ["chronic back pain", "I have migraines", "my diabetes", "lupus flare", "recovering from surgery"]) expect(mentionsHealth(t), t).toBe(true);
    expect(mentionsHealth("Sunday is busy")).toBe(false);
  });
});

describe("remembering a thorn in the flesh", () => {
  beforeEach(() => freshStore());

  it("saves nothing until the leader's next words say yes, then saves it", async () => {
    const m = await conv(2);
    const ask = await run(m, "My arthritis makes early Sundays rough.");
    expect(ask.isError).toBe(false);
    expect(JSON.parse(ask.content).ask).toMatch(/thorn in the flesh/);
    expect(await readThorns(leader)).toBeNull();
    m.turns = 3; // the leader's next message
    const saved = await run(m, "Yes, please remember that.");
    expect(JSON.parse(saved.content).saved).toBe(true);
    const file = await readThorns(leader);
    expect(file).toContain("rheumatoid arthritis");
    expect(file).toContain("2 Corinthians 12:7");
    expect(await thornContext(leader)).toContain("rheumatoid arthritis");
  });

  it("keeps it private on anything but a clear yes", async () => {
    const m = await conv(2);
    await run(m, "My arthritis makes early Sundays rough.");
    m.turns = 3;
    const r = await run(m, "Let's keep it private.");
    expect(JSON.parse(r.content).saved).toBe(false);
    expect(await readThorns(leader)).toBeNull();
  });

  it("the yes must come on the very next message and about the same detail", async () => {
    const m = await conv(2);
    await run(m, "My arthritis makes early Sundays rough.");
    m.turns = 4; // a message went by
    const late = await run(m, "Yes");
    expect(JSON.parse(late.content).saved).toBe(false); // treated as a new offer, nothing saved
    expect(await readThorns(leader)).toBeNull();
    m.turns = 5;
    const other = await run(m, "Yes", "Has a heart condition.");
    expect(JSON.parse(other.content).saved).toBe(false);
    expect(await readThorns(leader)).toBeNull();
  });

  it("never off the record, and never offered in a crisis moment", async () => {
    expect((await run(await conv(2, true), "My arthritis is bad")).isError).toBe(true);
    expect((await run(await conv(2), "I don't want to live anymore")).isError).toBe(true);
  });

  it("the quick-note tool won't store the leader's own health", async () => {
    const m = await conv(2);
    const r = await executeTool("save_memory", { note: "Has chronic migraines on Mondays" }, ctx(m, "I get migraines"));
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/remember_thorn/);
  });

  it("is in Barnabas's tools and instructions", () => {
    expect(TOOL_DEFS.map((t) => t.name)).toContain("remember_thorn");
    expect(BARNABAS_SYSTEM).toMatch(/thorn in the flesh \(2 Corinthians 12:7\)/);
    expect(THORN_PATH).toBe("/memories/thorn-in-the-flesh.md");
  });
});
