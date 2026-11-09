/** Small helpers shared by the Care client components. */

export async function careApi<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/care/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json as T;
}

export const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/** Today in the browser's time zone, yyyy-mm-dd. */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dueText(due: string | undefined, today: string) {
  if (!due) return "No date";
  if (due < today) return `Overdue since ${shortDate(due)}`;
  if (due === today) return "Due today";
  return `Due ${shortDate(due)}`;
}
