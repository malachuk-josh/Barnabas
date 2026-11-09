"use client";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button className="btn btn-primary no-print" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
