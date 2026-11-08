export function newId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint8Array(9));
  const text = Array.from(rand, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
  return `${prefix}_${text}`;
}
