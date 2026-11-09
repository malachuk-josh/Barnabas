export async function networkPost<T = Record<string, unknown>>(body: unknown): Promise<T> {
  const res = await fetch("/api/network", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json as T;
}
