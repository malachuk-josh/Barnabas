import { config } from "../config";
import { deliverySettings } from "../voice/server";
import { getJSON, setJSON } from "../store";
import { DEFAULT_TONE, type AiSettingsView, type ModelId, type TextEffort } from "./choices";

/**
 * The church's choice of Claude models for Barnabas, set by an admin in Settings → Barnabas AI.
 * Anything not chosen falls back to the deployment's defaults (BARNABAS_MODEL, BARNABAS_VOICE_MODEL,
 * BARNABAS_EFFORT, then the built-in defaults).
 */
type Stored = { textModel?: ModelId; voiceModel?: ModelId; textEffort?: TextEffort; voiceEffort?: TextEffort; voiceStability?: number; voiceStyle?: number; tone?: number; webSearch?: boolean; webDomains?: string[]; updatedBy?: string; updatedAt?: number };
export type ResolvedAi = { textModel: string; voiceModel: string; textEffort: string; voiceEffort: string; tone?: number; webSearch?: boolean; webDomains?: string[]; tools?: string[] | null };

const key = (churchId: string) => `cfg:${churchId}:ai`;
const cache = new Map<string, { at: number; value: Stored }>();
const TTL_MS = 5_000;

async function stored(churchId: string): Promise<Stored> {
  const hit = cache.get(churchId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = (await getJSON<Stored>(key(churchId))) ?? {};
  cache.set(churchId, { at: Date.now(), value });
  return value;
}

/** Spoken replies default to the least thinking, so Barnabas starts talking quickly. */
export const defaultAi = (): ResolvedAi => ({ textModel: config.model, voiceModel: config.voiceModel, textEffort: config.effort, voiceEffort: "low" });

export async function resolvedAi(churchId: string): Promise<ResolvedAi> {
  const s = await stored(churchId).catch(() => ({}) as Stored);
  const d = defaultAi();
  return {
    textModel: s.textModel ?? d.textModel,
    voiceModel: s.voiceModel ?? d.voiceModel,
    textEffort: s.textEffort ?? d.textEffort,
    voiceEffort: s.voiceEffort ?? d.voiceEffort,
    tone: s.tone ?? DEFAULT_TONE,
    webSearch: s.webSearch === true,
    webDomains: s.webDomains ?? [],
  };
}

export async function aiSettingsView(churchId: string): Promise<AiSettingsView> {
  const s = await stored(churchId);
  const d = defaultAi();
  const envVoice = deliverySettings();
  return {
    textModel: s.textModel ?? d.textModel,
    voiceModel: s.voiceModel ?? d.voiceModel,
    textEffort: s.textEffort ?? d.textEffort,
    voiceEffort: s.voiceEffort ?? d.voiceEffort,
    voiceStability: s.voiceStability ?? envVoice.stability,
    voiceStyle: s.voiceStyle ?? envVoice.style,
    tone: s.tone ?? DEFAULT_TONE,
    webSearch: s.webSearch === true,
    webDomains: s.webDomains ?? [],
    chosen: {
      textModel: Boolean(s.textModel),
      voiceModel: Boolean(s.voiceModel),
      textEffort: Boolean(s.textEffort),
      voiceEffort: Boolean(s.voiceEffort),
      voiceStability: s.voiceStability !== undefined,
      voiceStyle: s.voiceStyle !== undefined,
      tone: s.tone !== undefined,
    },
    defaults: { ...d, voiceStability: envVoice.stability, voiceStyle: envVoice.style, tone: DEFAULT_TONE },
    updatedBy: s.updatedBy,
    updatedAt: s.updatedAt,
  };
}

/** null for a field means "use the default". */
export type AiSettingsChange = { textModel?: ModelId | null; voiceModel?: ModelId | null; textEffort?: TextEffort | null; voiceEffort?: TextEffort | null; voiceStability?: number | null; voiceStyle?: number | null; tone?: number | null; webSearch?: boolean; webDomains?: string[] };

/**
 * Saves the fields given and keeps the rest, so the AI card and the voice sliders
 * (which live with the voice settings) can save separately. null resets a field to its default.
 */
export async function saveAiSettings(churchId: string, by: string, next: AiSettingsChange) {
  const value: Stored = { ...(await stored(churchId).catch(() => ({}) as Stored)), updatedBy: by, updatedAt: Date.now() };
  const two = (n: number) => Math.round(n * 100) / 100;
  const put = <K extends keyof Stored>(k: K, v: Stored[K] | null | undefined) => {
    if (v === undefined) return;
    if (v === null || v === false || (Array.isArray(v) && v.length === 0)) delete value[k];
    else value[k] = v;
  };
  put("textModel", next.textModel || (next.textModel === undefined ? undefined : null));
  put("voiceModel", next.voiceModel || (next.voiceModel === undefined ? undefined : null));
  put("textEffort", next.textEffort || (next.textEffort === undefined ? undefined : null));
  put("voiceEffort", next.voiceEffort || (next.voiceEffort === undefined ? undefined : null));
  put("voiceStability", typeof next.voiceStability === "number" ? two(next.voiceStability) : next.voiceStability);
  put("voiceStyle", typeof next.voiceStyle === "number" ? two(next.voiceStyle) : next.voiceStyle);
  put("tone", typeof next.tone === "number" ? two(next.tone) : next.tone);
  put("webSearch", next.webSearch);
  put("webDomains", next.webDomains === undefined ? undefined : [...new Set(next.webDomains.map((d) => d.toLowerCase()))]);
  await setJSON(key(churchId), value);
  cache.set(churchId, { at: Date.now(), value });
  return aiSettingsView(churchId);
}

/** Barnabas's voice delivery for this church: the admin's sliders, else Vercel's values, else the defaults. */
export async function voiceDelivery(churchId: string) {
  const s = await stored(churchId).catch(() => ({}) as Stored);
  return deliverySettings({ stability: s.voiceStability, style: s.voiceStyle });
}

/** Team and Member levels talk with Barnabas on Claude Haiku, by typing only. */
export const LIMITED_MODEL = "claude-haiku-5-5";

/** The church's settings, narrowed for someone at the Team or Member level. */
export function limitAi(ai: ResolvedAi, tools: string[] | null): ResolvedAi {
  if (!tools) return ai;
  return { ...ai, textModel: LIMITED_MODEL, voiceModel: LIMITED_MODEL, tools };
}
