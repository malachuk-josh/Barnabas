import { encode } from "uqr";

/** A QR code drawn as SVG rectangles (no HTML injection), for "get our app" signs and slides. */
export function QrCode({ text, size = 200, label }: { text: string; size?: number; label: string }) {
  const { data, size: n } = encode(text, { ecc: "M", border: 2 });
  const rows: React.ReactNode[] = [];
  data.forEach((row, y) => {
    let x = 0;
    while (x < n) {
      if (!row[x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < n && row[x + w]) w++;
      rows.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} />);
      x += w;
    }
  });
  return (
    <svg className="se-qr" viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#ffffff" />
      <g fill="#0f2423">{rows}</g>
    </svg>
  );
}
