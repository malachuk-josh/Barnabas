/** The Barnabas mark: one figure lifting another (the "son of encouragement"). */
export function Mark({ light = false }: { light?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="15" r="7" fill="#D9A441" />
      <path d="M8 41 Q24 20 40 41" fill="none" stroke={light ? "#F3F6F4" : "currentColor"} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
