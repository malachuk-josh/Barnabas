"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CASE_TYPES, CASE_TYPE_LABELS } from "@/lib/care/types";

/** Mine / all, type, overdue and due-date / stage views, kept in the address so a view can be shared or reloaded. */
export function CaseFilters({ canSeeOthers }: { canSeeOthers: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const scope = params.get("scope") === "mine" ? "mine" : "all";
  // "By due date" is the default; the board (by stage) is ?view=board. An old ?view=list link lands on due dates.
  const view = params.get("view") === "board" ? "board" : "due";
  const overdue = params.get("overdue") === "1";
  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    return q ? `${pathname}?${q}` : pathname;
  };
  return (
    <div className="care-filters" role="group" aria-label="Filter needs">
      <span className="seg">
        <Link className="seg-link" href={href({ scope: null })} aria-current={scope === "all" ? "page" : undefined}>
          {canSeeOthers ? "All I can see" : "All"}
        </Link>
        <Link className="seg-link" href={href({ scope: "mine" })} aria-current={scope === "mine" ? "page" : undefined}>
          Mine
        </Link>
      </span>
      <label className="care-select">
        <span className="sr-only">Type</span>
        <select value={params.get("type") ?? ""} onChange={(e) => router.push(href({ type: e.target.value || null }))}>
          <option value="">Every type</option>
          {CASE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CASE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <Link className="filter-chip" href={href({ overdue: overdue ? null : "1" })} aria-current={overdue ? "true" : undefined}>
        Overdue only
      </Link>
      <span className="seg care-view">
        <Link className="seg-link" href={href({ view: null })} aria-current={view === "due" ? "page" : undefined}>
          By due date
        </Link>
        <Link className="seg-link" href={href({ view: "board" })} aria-current={view === "board" ? "page" : undefined}>
          By stage
        </Link>
      </span>
    </div>
  );
}
