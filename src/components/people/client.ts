export async function peoplePost<T = Record<string, unknown>>(body: unknown, path = "/api/people"): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json as T;
}
