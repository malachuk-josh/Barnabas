import { HEALTH_LABELS, type Health } from "@/lib/finance/budget";

export function HealthPill({ health }: { health: Health }) {
  return <span className={`fin-health fin-health-${health}`}>{HEALTH_LABELS[health]}</span>;
}

/** A bar for the share of the budget used, with a brass tick at the share of the year that has passed. */
export function Meter({ used, elapsed, health, label }: { used: number | null; elapsed: number; health: Health; label: string }) {
  const width = Math.max(0, Math.min(100, used ?? 0));
  return (
    <div className={`fin-meter ${health}`} role="img" aria-label={label}>
      <span style={{ width: `${width}%` }} />
      <i style={{ left: `calc(${Math.round(elapsed * 1000) / 10}% - 1px)` }} />
    </div>
  );
}
