/** Validation for memory paths Claude sends. Every path must stay inside /memories. */

export const MEMORY_ROOT = "/memories";
const MAX_PATH = 200;

export class MemoryPathError extends Error {}

export function normalizeMemoryPath(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new MemoryPathError("A path is required.");
  const raw = input.trim();
  if (raw.length > MAX_PATH) throw new MemoryPathError("That path is too long.");
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new MemoryPathError("That path has invalid characters.");
  }
  if (decoded.includes("\\") || decoded.includes("\0")) {
    throw new MemoryPathError("That path has invalid characters.");
  }
  const parts = decoded.split("/").filter((p) => p.length > 0);
  if (parts.some((p) => p === "." || p === "..")) {
    throw new MemoryPathError("Paths can't contain '.' or '..'.");
  }
  if (parts[0] !== "memories") {
    throw new MemoryPathError("All memory paths must start with /memories.");
  }
  if (!parts.every((p) => /^[A-Za-z0-9._ -]+$/.test(p))) {
    throw new MemoryPathError("Use letters, numbers, dots, dashes and underscores in memory paths.");
  }
  return `/${parts.join("/")}`;
}

export function isRoot(path: string) {
  return path === MEMORY_ROOT;
}

/** A URL-safe file name for a person, e.g. "Ana López" -> "ana-lopez". */
export function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "note"
  );
}
