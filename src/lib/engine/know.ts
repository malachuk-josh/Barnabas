import { z } from "zod";
import type { Leader } from "../auth/session";
import { config } from "../config";
import { provenanceKey, saveConversation, type ConversationMeta } from "../data/conversations";
import { MemoryFS } from "../memory/fs";
import { checkMemoryText } from "../policy/privacy";
import { detectCrisis } from "../policy/crisis";
import { isAffirmative } from "../policy/confirm";
import { audit } from "../data/records";
import { getJSON, kv, setJSON } from "../store";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * "Getting to know you": twenty questions Barnabas works through with each leader over many conversations,
 * ranked so the leader's ministry needs come first. The rules are enforced here, in code:
 * - never in Barnabas's first reply of a conversation;
 * - at most two per conversation, unless the conversation has passed 15 exchanges or the leader said yes to
 *   "may I ask a few more?" (which Barnabas may ask once per conversation);
 * - one per reply, only with a specific reason it fits right now;
 * - never off the record, never in a turn where crisis language was detected;
 * - a question already answered, or asked in the last two weeks, is not asked again.
 * Answers live in the leader's memory file KNOW_PATH, one line per question id, so the leader can see,
 * edit or delete them on the Memory screen; Barnabas reads that file at the start of every conversation.
 */

export const KNOW_PATH = "/memories/getting-to-know-you.md";
export const PER_CONVERSATION = 2;
export const OPEN_AFTER_EXCHANGES = 15;
/** After the leader says yes to "may I ask a few more?". */
export const WITH_PERMISSION = 5;
const COOLDOWN_DAYS = 14;

export type KnowQuestion = { id: string; rank: number; topic: string; question: string; moments: string };

export const KNOW_QUESTIONS: KnowQuestion[] = [
  { id: "k01", rank: 1, topic: "Calling", question: "How did God call you into ministry?", moments: "they talk about why they serve, a hard season, or a milestone" },
  { id: "k02", rank: 2, topic: "Biggest challenge", question: "What's the biggest challenge or project in front of you right now?", moments: "planning, prioritizing, or they sound stuck" },
  { id: "k03", rank: 3, topic: "Hope for this year", question: "What are you hoping God does in your ministry this year?", moments: "planning, goals, reports, or the start of a season" },
  { id: "k04", rank: 4, topic: "Role and tenure", question: "How long have you served here, and what does your role really look like week to week?", moments: "planning their week or explaining their responsibilities" },
  { id: "k05", rank: 5, topic: "People they invest in", question: "Who are the few people you're investing in most right now?", moments: "discipleship, follow-ups, or a particular person" },
  { id: "k06", rank: 6, topic: "What drains", question: "What part of your ministry tends to drain you most?", moments: "they sound tired, behind, or frustrated with a task" },
  { id: "k07", rank: 7, topic: "What brings joy", question: "What part of your ministry brings you the most joy?", moments: "after a win, a good Sunday, or while planning" },
  { id: "k08", rank: 8, topic: "Heaviest days", question: "Which days of your week are heaviest?", moments: "calendar or scheduling" },
  { id: "k09", rank: 9, topic: "Focused work time", question: "When do you do your best focused work, like sermon prep or study?", moments: "sermon prep, study, or blocking time" },
  { id: "k10", rank: 10, topic: "Style under pressure", question: "When you're under pressure, do you want me brief and practical, or should I slow down and talk it through?", moments: "the first time they're stressed or rushed" },
  { id: "k11", rank: 11, topic: "Challenge or encourage", question: "Would you like me to gently challenge you sometimes, or mostly encourage?", moments: "they ask for advice or feedback" },
  { id: "k12", rank: 12, topic: "Sabbath", question: "When is your Sabbath or day off?", moments: "scheduling near a rest day, or they mention being tired" },
  { id: "k13", rank: 13, topic: "Scripture now", question: "What are you reading or studying in Scripture right now?", moments: "The Word, a passage, or sermon planning" },
  { id: "k14", rank: 14, topic: "Prayer reminders", question: "Would reminders to pray for specific people help you?", moments: "care, follow-ups, or someone going through something" },
  { id: "k15", rank: 15, topic: "Who encourages them", question: "Who encourages you, a mentor or friend?", moments: "they seem isolated or worn out" },
  { id: "k16", rank: 16, topic: "Steadying verse", question: "Is there a verse that steadies you in hard seasons?", moments: "a discouraging moment" },
  { id: "k17", rank: 17, topic: "Reminder channel", question: "How do you like reminders: text, email, or just when we talk?", moments: "they ask to be reminded of something" },
  { id: "k18", rank: 18, topic: "What refreshes", question: "What refreshes you outside ministry?", moments: "after a heavy week, or talk of rest" },
  { id: "k19", rank: 19, topic: "Boundaries", question: "Is there anything you'd rather I not bring up, or a way I could be more helpful?", moments: "late in a long, warm conversation" },
  { id: "k20", rank: 20, topic: "Family dates (optional)", question: "Is there anything about your family you'd like me to remember, like birthdays or an anniversary, so I can help protect that time?", moments: "scheduling near a family event; ask lightly, and only save what they choose to share" },
];

const BY_ID = new Map(KNOW_QUESTIONS.map((q) => [q.id, q]));
const ID_RE = /^-\s*\[(k\d{2})\]/;

/** Question ids answered in the leader's memory file. */
export function answeredIds(file: string | null): Set<string> {
  const out = new Set<string>();
  for (const line of (file ?? "").split("\n")) {
    const m = ID_RE.exec(line.trim());
    if (m && BY_ID.has(m[1]!)) out.add(m[1]!);
  }
  return out;
}

export function answersFile(file: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of (file ?? "").split("\n")) {
    const m = /^-\s*\[(k\d{2})\]\s*(?:[^:]*:\s*)?(.*)$/.exec(line.trim());
    if (m && BY_ID.has(m[1]!)) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

type AskLog = Record<string, { at: number; conversationId: string }>;
const askKey = (l: Pick<Leader, "churchId" | "leaderId">) => `know:${l.churchId}:${l.leaderId}:asked`;

async function askLog(leader: Pick<Leader, "churchId" | "leaderId">): Promise<AskLog> {
  return (await getJSON<AskLog>(askKey(leader))) ?? {};
}

/** Per-conversation state, kept on the conversation record. */
export type KnowState = {
  asked: string[];
  /** Question asked in which turn (one per reply). */
  lastAskTurn?: number;
  permission?: { status: "asked" | "granted" | "declined"; turn: number };
};

export function knowState(meta: ConversationMeta): KnowState {
  return meta.know ?? { asked: [] };
}

function setKnowState(meta: ConversationMeta, state: KnowState) {
  meta.know = state;
}

/**
 * At the start of a turn: if Barnabas asked "may I ask a few more?" in the previous reply, the leader's
 * words now are the answer. Anything other than a clear yes counts as no.
 */
export function resolvePermission(meta: ConversationMeta, leaderText: string): boolean {
  const s = knowState(meta);
  if (s.permission?.status !== "asked") return false;
  const status = s.permission.turn === meta.turns - 1 && isAffirmative(leaderText) ? "granted" : "declined";
  setKnowState(meta, { ...s, permission: { ...s.permission, status } });
  return true;
}

export function limitFor(meta: ConversationMeta): number {
  const s = knowState(meta);
  if (s.permission?.status === "granted") return WITH_PERMISSION;
  return meta.turns >= OPEN_AFTER_EXCHANGES ? Number.POSITIVE_INFINITY : PER_CONVERSATION;
}

const GENERIC = /^(to )?(get(ting)? to )?know (you|them|the leader)( better)?\.?$|^(it'?s )?(relevant|context(ual)?|natural|good time|fits)\.?$/i;

/** Why a question can't be asked now, or null if it can. Pure, for tests. */
export function askRefusal(opts: {
  meta: ConversationMeta;
  questionId: string;
  whyNow: string;
  leaderText: string;
  answered: Set<string>;
  log: AskLog;
  now: number;
}): string | null {
  const { meta, questionId, whyNow, leaderText, answered, log, now } = opts;
  const s = knowState(meta);
  if (!BY_ID.has(questionId)) return `There's no question ${questionId}.`;
  if (meta.offRecord) return "This conversation is off the record. Don't ask getting-to-know-you questions in it.";
  if (meta.turns === 0) return "Not in your first reply of a conversation. Help with what they came for; you can ask later if it fits.";
  if (detectCrisis(leaderText)) return "Not now: the leader may be in a hard moment. Stay with what they need.";
  if (answered.has(questionId)) return "That one is already answered in their memory. Use what you know instead of asking again.";
  const last = log[questionId];
  if (last && now - last.at < COOLDOWN_DAYS * 86_400_000) return "You asked that recently. Give it time; pick another only if one clearly fits, or none.";
  if (s.asked.includes(questionId)) return "You already asked that in this conversation.";
  if (s.lastAskTurn === meta.turns) return "Only one getting-to-know-you question per reply.";
  if (s.asked.length >= limitFor(meta)) {
    if (s.permission?.status === "declined") return "They said they'd rather not answer more questions in this conversation. Don't ask any more.";
    return s.permission
      ? "That's the limit for this conversation. Don't ask any more."
      : `You've asked ${s.asked.length} in this conversation, the limit before ${OPEN_AFTER_EXCHANGES} exchanges. If it feels welcome, you may ask once whether they'd mind a few more questions (ask_permission_to_know); otherwise wait for another conversation.`;
  }
  const why = whyNow.trim();
  if (why.length < 20 || GENERIC.test(why)) return "Give the specific reason this question fits what they just said. If there isn't one, don't ask.";
  return null;
}

function memoryFor(leader: Leader, meta: ConversationMeta) {
  return new MemoryFS(
    { churchId: leader.churchId, leaderId: leader.leaderId },
    (text) => checkMemoryText(text, { allowSensitive: config.allowSensitiveMemory }),
    async (path) => {
      if (!meta.offRecord) await kv().sadd(provenanceKey(leader, meta.id), path);
    },
  );
}

export async function readAnswers(leader: Pick<Leader, "churchId" | "leaderId">): Promise<string | null> {
  return new MemoryFS({ churchId: leader.churchId, leaderId: leader.leaderId }).read(KNOW_PATH);
}

/** The per-leader context section: what's known, and which questions are still open, in rank order. */
export async function knowContext(leader: Pick<Leader, "churchId" | "leaderId">, offRecord: boolean): Promise<string> {
  const file = await readAnswers(leader);
  const answers = answersFile(file);
  const open = KNOW_QUESTIONS.filter((q) => !answers.has(q.id));
  const lines = ["# Getting to know this leader"];
  if (answers.size) {
    lines.push("What they've told you (from their memory file):");
    for (const q of KNOW_QUESTIONS) if (answers.has(q.id)) lines.push(`- ${q.topic}: ${answers.get(q.id)}`);
  }
  if (offRecord) {
    lines.push("This conversation is off the record: don't ask getting-to-know-you questions.");
  } else if (open.length) {
    lines.push(`Still open (${open.length} of ${KNOW_QUESTIONS.length}), highest priority first. Ask only through ask_to_know, following the rules in your instructions:`);
    for (const q of open) lines.push(`- ${q.id} (${q.topic}): "${q.question}" Fits when: ${q.moments}.`);
  } else {
    lines.push("All twenty are answered. Keep what you know current with record_to_know when they share something new.");
  }
  return lines.join("\n");
}

const ok = (content: unknown): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false });
const fail = (content: string): ToolResult => ({ content, isError: true });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;
const IDS = KNOW_QUESTIONS.map((q) => q.id) as [string, ...string[]];

const askToKnow = tool({
  def: {
    name: "ask_to_know",
    description:
      "Use before asking one of the open getting-to-know-you questions listed in your context. The server checks the rules (not in your first reply, the per-conversation limit, one per reply, not answered or asked recently). " +
      "If it's allowed, ask it in your own words as one natural question near the end of your reply, after you've helped with what they asked. If it's refused, don't ask it.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        question_id: { type: "string", enum: IDS },
        why_now: { type: "string", description: "The specific thing they just said that makes this question fit now" },
      },
      required: ["question_id", "why_now"],
    },
  },
  schema: z.object({ question_id: z.enum(IDS), why_now: z.string().max(400) }),
  async run({ question_id, why_now }, ctx: ToolContext) {
    const [file, log] = await Promise.all([readAnswers(ctx.leader), askLog(ctx.leader)]);
    const refusal = askRefusal({ meta: ctx.meta, questionId: question_id, whyNow: why_now, leaderText: ctx.lastUserText, answered: answeredIds(file), log, now: Date.now() });
    if (refusal) return fail(refusal);
    const s = knowState(ctx.meta);
    setKnowState(ctx.meta, { ...s, asked: [...s.asked, question_id], lastAskTurn: ctx.meta.turns });
    await saveConversation(ctx.leader, ctx.meta);
    await setJSON(askKey(ctx.leader), { ...log, [question_id]: { at: Date.now(), conversationId: ctx.meta.id } });
    const q = BY_ID.get(question_id)!;
    return ok({
      allowed: true,
      question: q.question,
      how: "Ask it once, warmly, in your own words, as the last thing in your reply. Don't stack it with other questions. When they answer, save it with record_to_know.",
    });
  },
});

const askPermissionToKnow = tool({
  def: {
    name: "ask_permission_to_know",
    description:
      "Once per conversation at most: before asking whether they'd mind a few more questions so you can get to know them better. Only when the conversation is relaxed and you've reached the limit for this conversation. " +
      "If allowed, ask it as a simple yes-or-no question at the end of your reply. Their next message decides; anything but a clear yes means no.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { why_now: { type: "string" } }, required: ["why_now"] },
  },
  schema: z.object({ why_now: z.string().max(400) }),
  async run(_input, ctx: ToolContext) {
    const s = knowState(ctx.meta);
    if (ctx.meta.offRecord) return fail("This conversation is off the record.");
    if (ctx.meta.turns === 0) return fail("Not in your first reply of a conversation.");
    if (detectCrisis(ctx.lastUserText)) return fail("Not now: the leader may be in a hard moment.");
    if (s.permission) return fail("You've already asked that in this conversation. Don't ask again.");
    if (s.lastAskTurn === ctx.meta.turns) return fail("You've already asked a getting-to-know-you question in this reply.");
    const open = KNOW_QUESTIONS.length - answeredIds(await readAnswers(ctx.leader)).size;
    if (open === 0) return fail("You already know the answers to all twenty.");
    setKnowState(ctx.meta, { ...s, permission: { status: "asked", turn: ctx.meta.turns }, lastAskTurn: ctx.meta.turns });
    await saveConversation(ctx.leader, ctx.meta);
    return ok({ allowed: true, how: "Ask simply, e.g. \"Would it be all right if I asked a few more questions to get to know you better?\" Then wait for their answer." });
  },
});

const recordToKnow = tool({
  def: {
    name: "record_to_know",
    description:
      "Save the leader's answer to one of the twenty getting-to-know-you questions (whether you asked or they offered it), as one short line in their own words. Replaces any earlier answer to that question. " +
      "Keep it minimal: no health, counseling, family conflict or financial details.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { question_id: { type: "string", enum: IDS }, answer: { type: "string", description: "One sentence" } },
      required: ["question_id", "answer"],
    },
  },
  schema: z.object({ question_id: z.enum(IDS), answer: z.string().min(2).max(300) }),
  async run({ question_id, answer }, ctx: ToolContext) {
    if (ctx.meta.offRecord) return fail("This conversation is off the record, so nothing can be saved.");
    const clean = answer.replace(/\s+/g, " ").trim();
    const problem = checkMemoryText(clean, { allowSensitive: config.allowSensitiveMemory });
    if (problem) return fail(problem);
    const fs = memoryFor(ctx.leader, ctx.meta);
    const existing = (await fs.read(KNOW_PATH)) ?? "# Getting to know you\n\nWhat this leader has shared with Barnabas. Edit or delete any line.\n";
    const q = BY_ID.get(question_id)!;
    const kept = existing.split("\n").filter((l) => !l.trim().startsWith(`- [${question_id}]`));
    const text = `${kept.join("\n").replace(/\n*$/, "\n")}- [${question_id}] ${q.topic}: ${clean}\n`;
    const result = await fs.run({ command: "create", path: KNOW_PATH, file_text: text });
    if (result.isError) return fail(result.text);
    await audit(ctx.leader, { conversationId: ctx.meta.id, action: "memory.know", detail: `${question_id} ${q.topic}` });
    return ok("Saved.");
  },
});

export const KNOW_TOOLS = [askToKnow, askPermissionToKnow, recordToKnow];
