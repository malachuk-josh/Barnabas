/**
 * Central place for environment configuration. Everything here is server-only.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

function effortFrom(value: string | undefined, fallback: Effort): Effort {
  return EFFORTS.includes(value as Effort) ? (value as Effort) : fallback;
}

export const isProduction = process.env.NODE_ENV === "production";

export const config = {
  model: process.env.BARNABAS_MODEL || "claude-opus-5-5",
  effort: effortFrom(process.env.BARNABAS_EFFORT, "low"),
  memoryEffort: effortFrom(process.env.BARNABAS_MEMORY_EFFORT, "medium"),
  churchName: process.env.BARNABAS_CHURCH_NAME || "Grace Fellowship (demo)",
  churchId: "demo",
  allowSensitiveMemory: process.env.BARNABAS_ALLOW_SENSITIVE_MEMORY === "true",
  /** Beta header for server-side refusal fallback with fallbacks: "default". */
  fallbackBeta: "server-side-fallback-2026-07-01",
};

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function accessCode(): string | null {
  const code = process.env.BARNABAS_ACCESS_CODE;
  if (code) return code;
  // A fixed code is only allowed outside production, so a misconfigured deploy fails closed.
  return isProduction ? null : "grace";
}

export function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (isProduction) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
  }
  return new TextEncoder().encode("barnabas-local-development-secret-not-for-production");
}
