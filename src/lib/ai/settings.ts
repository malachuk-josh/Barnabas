import { config } from "../config";
import { getJSON, setJSON } from "../store";
import type { AiSettingsView, ModelId, TextEffort } from "./choices";

/**
 * The church's choice of Claude models for Barnabas, set by an admin in Settings → Barnabas AI.
 * Anything not chosen falls back to the deployment's defaults (BARNABAS_MODEL, BARNABAS_VOICE_MODEL,
 * BARNABAS_EFFORT, then the built-in defaults).
 */
type Stored = { textModel?: ModelId; voiceModel?: ModelId; textEffort?: TextEffort; updatedBy?: string; updatedAt?: number };
export type ResolvedAi = { textModel: string; voiceModel: string; textEffort: string };

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

export const defaultAi = (): ResolvedAi => ({ textModel: config.model, voiceModel: config.voiceModel, textEffort: config.effort });

export async function resolvedAi(churchId: string): Promise<ResolvedAi> {
  const s = await stored(churchId).catch(() => ({}) as Stored);
  const d = defaultAi();
  return { textModel: s.textModel ?? d.textModel, voiceModel: s.voiceModel ?? d.voiceModel, textEffort: s.textEffort ?? d.textEffort };
}

export async function aiSettingsView(churchId: string): Promise<AiSettingsView> {
  const s = await stored(churchId);
  const d = defaultAi();
  return {
    textModel: s.textModel ?? d.textModel,
    voiceModel: s.voiceModel ?? d.voiceModel,
    textEffort: s.textEffort ?? d.textEffort,
    chosen: { textModel: Boolean(s.textModel), voiceModel: Boolean(s.voiceModel), textEffort: Boolean(s.textEffort) },
    defaults: d,
    updatedBy: s.updatedBy,
    updatedAt: s.updatedAt,
  };
}

/** null for a field means "use the default". */
export async function saveAiSettings(churchId: string, by: string, next: { textModel: ModelId | null; voiceModel: ModelId | null; textEffort: TextEffort | null }) {
  const value: Stored = { updatedBy: by, updatedAt: Date.now() };
  if (next.textModel) value.textModel = next.textModel;
  if (next.voiceModel) value.voiceModel = next.voiceModel;
  if (next.textEffort) value.textEffort = next.textEffort;
  await setJSON(key(churchId), value);
  cache.set(churchId, { at: Date.now(), value });
  return aiSettingsView(churchId);
}
