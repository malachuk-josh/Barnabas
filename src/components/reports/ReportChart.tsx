"use client";

import { useId, useState } from "react";
import type { Chart } from "@/lib/reports/types";
import { formatValue, niceMax } from "./format";

/**
 * Brand-styled SVG charts: thin 2px lines with a hover crosshair and tooltip, rounded bars with a 2px gap,
 * recessive grid, tabular numbers, a legend for two series (the reference series is also dashed, so identity
 * never rests on color alone), and keyboard focus on every point. Long category names switch to horizontal
 * bars so labels never collide on a phone.
 */
export function ReportChart({ chart }: { chart: Chart }) {
  const horizontal = chart.kind === "bars" && (chart.x.some((l) => l.length > 6) || chart.x.length > 14);
  return (
    <figure className="rchart" data-no-pull>
      <figcaption className="rchart-title">{chart.title}</figcaption>
      {chart.series.length > 1 && (
        <ul className="rchart-legend" aria-label="Legend">
          {chart.series.map((s) => (
            <li key={s.name}>
              <svg width="22" height="10" aria-hidden="true">
                <line x1="1" x2="21" y1="5" y2="5" className={`rc-line rc-${s.role}`} />
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
      )}
      {horizontal ? <HBars chart={chart} /> : chart.kind === "bars" ? <VBars chart={chart} /> : <Lines chart={chart} />}
    </figure>
  );
}

const W = 640;
const H = 220;
const PAD = { top: 14, right: 16, bottom: 26, left: 48 };

function Axis({ top, step, unit, y }: { top: number; step: number; unit: Chart["unit"]; y: (v: number) => number }) {
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return (
    <g className="rc-axis" aria-hidden="true">
      {ticks.map((t) => (
        <g key={t}>
          <line className="rc-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
            {formatValue(t, unit, true)}
          </text>
        </g>
      ))}
    </g>
  );
}

function Tip({ chart, i, x }: { chart: Chart; i: number; x: number }) {
  const left = `${Math.min(88, Math.max(12, (x / W) * 100))}%`;
  return (
    <div className="rchart-tip" style={{ left }} role="status">
      <strong>{chart.x[i]}</strong>
      {chart.series.map((s) => (
        <span key={s.name}>
          {chart.series.length > 1 && `${s.name}: `}
          <b className="tabular">{formatValue(s.values[i], chart.unit)}</b>
        </span>
      ))}
    </div>
  );
}

function Lines({ chart }: { chart: Chart }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...chart.series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const { top, step } = niceMax(max);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = chart.x.length;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const every = chart.every ?? Math.max(1, Math.ceil(n / 8));
  const id = useId();
  return (
    <div className="rchart-plot" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-d`}>
        <desc id={`${id}-d`}>{`${chart.title}. ${chart.x.map((l, i) => `${l}: ${chart.series.map((s) => `${chart.series.length > 1 ? `${s.name} ` : ""}${formatValue(s.values[i], chart.unit)}`).join(", ")}`).join("; ")}`}</desc>
        <Axis top={top} step={step} unit={chart.unit} y={y} />
        {chart.x.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={l + i} className="rc-xlabel" x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} aria-hidden="true">
              {l}
            </text>
          ) : null,
        )}
        {hover !== null && <line className="rc-cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />}
        {chart.series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
          return <polyline key={s.name} className={`rc-line rc-${s.role}`} points={pts.join(" ")} fill="none" />;
        })}
        {chart.series.map((s) => {
          const i = s.values.length - 1;
          const v = s.values[i];
          return v === null ? null : <circle key={`${s.name}-end`} className={`rc-dot rc-${s.role}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} />;
        })}
        {hover !== null &&
          chart.series.map((s) => {
            const v = s.values[hover];
            return v === null || hover === s.values.length - 1 ? null : <circle key={`${s.name}-h`} className={`rc-dot rc-${s.role}`} cx={x(hover)} cy={y(v)} r={5} />;
          })}
        {chart.x.map((l, i) => (
          <rect
            key={`hit-${i}`}
            className="rc-hit"
            x={x(i) - innerW / Math.max(1, n - 1) / 2}
            y={PAD.top}
            width={innerW / Math.max(1, n - 1)}
            height={innerH}
            tabIndex={0}
            aria-label={`${l}: ${chart.series.map((s) => `${chart.series.length > 1 ? `${s.name} ` : ""}${formatValue(s.values[i], chart.unit)}`).join(", ")}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {hover !== null && <Tip chart={chart} i={hover} x={x(hover)} />}
    </div>
  );
}

function VBars({ chart }: { chart: Chart }) {
  const [hover, setHover] = useState<number | null>(null);
  const s = chart.series[0];
  const max = Math.max(0, ...s.values.map((v) => v ?? 0));
  const { top, step } = niceMax(max);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = chart.x.length;
  const bw = innerW / Math.max(n, 1);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const every = chart.every ?? Math.max(1, Math.ceil(n / 8));
  const id = useId();
  return (
    <div className="rchart-plot" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-d`}>
        <desc id={`${id}-d`}>{`${chart.title}. ${chart.x.map((l, i) => `${l}: ${formatValue(s.values[i], chart.unit)}`).join("; ")}`}</desc>
        <Axis top={top} step={step} unit={chart.unit} y={y} />
        {chart.x.map((l, i) => {
          const v = s.values[i] ?? 0;
          const h = Math.max(0, PAD.top + innerH - y(v));
          const bx = PAD.left + i * bw + 1;
          const w = Math.max(2, Math.min(bw - 2, 44));
          const cx = PAD.left + i * bw + bw / 2;
          return (
            <g key={l + i}>
              {v > 0 && <path className={`rc-bar${hover === i ? " on" : ""}`} d={roundedTop(cx - w / 2, y(v), w, h, Math.min(4, w / 2, h))} />}
              {(i % every === 0 || i === n - 1) && (
                <text className="rc-xlabel" x={cx} y={H - 6} textAnchor="middle" aria-hidden="true">
                  {l}
                </text>
              )}
              <rect className="rc-hit" x={bx - 1} y={PAD.top} width={bw} height={innerH} tabIndex={0} aria-label={`${l}: ${formatValue(s.values[i], chart.unit)}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && <Tip chart={chart} i={hover} x={PAD.left + hover * bw + bw / 2} />}
    </div>
  );
}

/** A bar with its data end rounded and its base square on the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function HBars({ chart }: { chart: Chart }) {
  const s = chart.series[0];
  const max = Math.max(1, ...s.values.map((v) => v ?? 0));
  return (
    <ul className="rc-hbars" aria-label={chart.title}>
      {chart.x.map((l, i) => {
        const v = s.values[i];
        return (
          <li key={l + i} title={`${l}: ${formatValue(v, chart.unit)}`}>
            <span className="rc-hlabel">{l}</span>
            <span className="rc-htrack" aria-hidden="true">
              <span className="rc-hbar" style={{ width: `${Math.max(v ? 1.5 : 0, ((v ?? 0) / max) * 100)}%` }} />
            </span>
            <span className="rc-hval tabular">{formatValue(v, chart.unit)}</span>
          </li>
        );
      })}
    </ul>
  );
}
