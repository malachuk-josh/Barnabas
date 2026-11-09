"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { careApi, localToday, shortDate } from "./client";

/** "I took a day off": logged privately, for this leader's own load. */
export function DayOff({ logged }: { logged: { date: string; note?: string; demo?: boolean }[] }) {
  const router = useRouter();
  const [date, setDate] = useState(localToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function act(body: unknown) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await careApi("load", body);
      if ((body as { action: string }).action === "day-off") setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fin-card fin-form">
      <h2>I took a day off</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "day-off", date });
        }}
      >
        <label className="sr-only" htmlFor="off-date">
          Date
        </label>
        <input id="off-date" type="date" required max={localToday()} value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto", flex: "1 1 160px" }} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Log it
        </button>
      </form>
      {saved && <p className="small" role="status">Logged. Good for you.</p>}
      {error && <p className="error">{error}</p>}
      {logged.length > 0 && (
        <ul className="care-days">
          {logged.map((d) => (
            <li key={d.date}>
              <span>
                {shortDate(d.date)}
                {d.demo ? <span className="badge">demo</span> : null}
              </span>
              <button className="linklike small" type="button" disabled={busy} onClick={() => void act({ action: "remove-day-off", date: d.date })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="fin-source">Days you log here, plus &ldquo;Rest / sabbath&rdquo; events on your Barnabas calendar. Only you can see them.</p>
    </section>
  );
}
