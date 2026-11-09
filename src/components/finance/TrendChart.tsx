import { monthLabel, type MonthPoint } from "@/lib/finance/giving";
import { wholeDollars } from "@/lib/finance/money";

function niceStep(raw: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

const axis = (cents: number) => (cents >= 100_000 ? `$${Math.round(cents / 100_000)}k` : `$${Math.round(cents / 100)}`);

/** Monthly giving as bars, drawn as inline SVG. Colors come from the theme, so it works in light and dark. */
export function TrendChart({ points, title, highlight }: { points: MonthPoint[]; title: string; highlight?: string }) {
  const W = 720;
  const H = 240;
  const pad = { top: 22, right: 8, bottom: 28, left: 50 };
  const max = Math.max(100, ...points.map((p) => p.total));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const bw = innerW / Math.max(points.length, 1);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const summary = points.map((p) => `${monthLabel(p.month, "long")}: ${wholeDollars(p.total)}`).join("; ");
  return (
    <svg className="fin-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`}>
      <title>{title}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
          <text x={pad.left - 8} y={y(t) + 4} textAnchor="end">
            {axis(t)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const x = pad.left + i * bw + bw * 0.16;
        const cls = p.month === highlight ? "bar current" : points.length > 12 && i === 0 ? "bar prior" : "bar";
        const label = `${monthLabel(p.month)}${i === 0 || p.month.endsWith("-01") ? ` '${p.month.slice(2, 4)}` : ""}`;
        return (
          <g key={p.month}>
            <rect className={cls} x={x} y={y(p.total)} width={bw * 0.68} height={Math.max(0, pad.top + innerH - y(p.total))} rx={3}>
              <title>{`${monthLabel(p.month, "long")}: ${wholeDollars(p.total)}`}</title>
            </rect>
            {bw > 40 && p.total > 0 && (
              <text className="val" x={x + bw * 0.34} y={y(p.total) - 5} textAnchor="middle">
                {p.total >= 100_000 ? `${(p.total / 100_000).toFixed(1)}k` : Math.round(p.total / 100)}
              </text>
            )}
            <text x={pad.left + i * bw + bw / 2} y={H - 8} textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
