/** Browser-safe: the models and thinking levels an admin can choose for Barnabas. */

export const MODEL_CHOICES = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "Deepest and warmest. A little slower to start. About $4 / $20 per million tokens in / out." },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "Fast and very capable. About $2 / $10 per million tokens." },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Fastest and cheapest; lighter on nuance. About $0.10 / $0.50 per million tokens." },
] as const;
export type ModelId = (typeof MODEL_CHOICES)[number]["id"];
export const MODEL_IDS = MODEL_CHOICES.map((m) => m.id) as [ModelId, ...ModelId[]];

export const EFFORT_CHOICES = [
  { id: "low", label: "Quick", note: "Fastest replies; fine for most conversations." },
  { id: "medium", label: "Balanced", note: "Thinks a little more before answering." },
  { id: "high", label: "Thorough", note: "Thinks hardest; slowest and costs more. For deep sermon or planning work." },
] as const;
export type TextEffort = (typeof EFFORT_CHOICES)[number]["id"];
export const EFFORT_IDS = EFFORT_CHOICES.map((e) => e.id) as [TextEffort, ...TextEffort[]];

/** What's in effect, and whether each comes from an admin's choice or the deployment's default. */
export type AiSettingsView = {
  textModel: string;
  voiceModel: string;
  textEffort: string;
  voiceEffort: string;
  chosen: { textModel: boolean; voiceModel: boolean; textEffort: boolean; voiceEffort: boolean };
  defaults: { textModel: string; voiceModel: string; textEffort: string; voiceEffort: string };
  updatedBy?: string;
  updatedAt?: number;
};
