"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TERMS, VERSES, type VerseKey } from "@/lib/language";
import { ASK_EVENT } from "./NavLinks";
import { VerseNote } from "./VerseNote";

type RadarEntry = { personId: string; name: string; band: "high" | "watch" | "ok"; drivers: string[]; suggestion: string };
type FollowUp = { id: string; name: string; reason: string; due?: string; overdue?: boolean; href?: string };
type Upcoming = { date: string; title: string; time: string };
type BriefingData = { radar: RadarEntry[]; followUps: FollowUp[]; upcoming: Upcoming[] };
type Status = { claude: boolean; storage: string; churchData: string; churchName: string };

/** "Today" or "Tomorrow" by the device's own date, or nothing. */
function relativeDay(iso: string): string | null {
  const now = new Date();
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (iso === ymd(now)) return "Today";
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return iso === ymd(t) ? "Tomorrow" : null;
}

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function dateTile(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    num: d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" }),
  };
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function ask(text: string) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: text }));
}

export function Briefing({ todaysVerse }: { todaysVerse: VerseKey }) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/briefing?date=${localDate()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);

  const setup = status
    ? [
        !status.claude && "Claude isn't connected. Add ANTHROPIC_API_KEY in your Vercel project settings.",
        status.storage === "memory" && "Memory isn't saved between restarts. Add Upstash Redis from the Vercel Marketplace.",
        status.churchData === "demo" && "Showing Mount Greylock's demo schedule and leaders until your church database is connected.",
      ].filter((s): s is string => Boolean(s))
    : [];
  const demo = status?.churchData === "demo";

  // Those to encourage first, then the ones to watch, then open follow-ups (overdue first).
  const radar = (data?.radar ?? []).filter((r) => r.band !== "ok").sort((a, b) => (a.band === b.band ? 0 : a.band === "high" ? -1 : 1));
  const followUps = [...(data?.followUps ?? [])].sort((a, b) => Number(Boolean(b.overdue)) - Number(Boolean(a.overdue)));
  const shownRadar = radar.slice(0, 5);
  const shownFollowUps = followUps.slice(0, 6);

  return (
    <>
      {setup.length > 0 && (
        <details className="setup-strip">
          <summary>
            <span className="setup-text">
              <strong>{demo ? "Demo mode." : "Setup."}</strong>{" "}
              {setup.length === 1 ? "One setup step left." : `${setup.length} setup steps left.`}
            </span>
            <span className="setup-more">Details</span>
          </summary>
          <ul>
            {setup.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      )}

      <section className="needs" aria-labelledby="needs-head">
        <div className="section-head">
          <h2 id="needs-head">Needs you</h2>
          <span className="small muted">Most important first</span>
        </div>
        {/* On the days "For today" is this same verse, it isn't shown twice. */}
        {todaysVerse !== "encourage" && <VerseNote verse="encourage" />}
        <div className="list-card">
          {!data && !failed && <p className="list-empty muted">Loading…</p>}
          {failed && <p className="list-empty muted">Couldn&apos;t load the briefing.</p>}
          {shownRadar.map((r) => (
            <div key={r.personId} className="need-row">
              <span className={`need-avatar band-${r.band}`} aria-hidden="true">
                {initials(r.name)}
              </span>
              <div className="need-text">
                <div className="row" style={{ gap: 8 }}>
                  <strong>{r.name}</strong>
                  <span className={`pill pill-${r.band}`}>{r.band === "high" ? TERMS.encourage.One : "Watch"}</span>
                </div>
                <span className="small muted">{r.drivers.join(" · ")}</span>
                <span className="small">{r.suggestion}</span>
              </div>
              <div className="need-actions">
                <button type="button" className="btn btn-primary" onClick={() => ask(`Draft a thank-you to ${r.name} for serving so faithfully.`)}>
                  Draft a thank-you
                </button>
              </div>
            </div>
          ))}
          {shownFollowUps.map((f) => (
            <div key={f.id} className="need-row">
              <span className="need-avatar" aria-hidden="true">
                {initials(f.name)}
              </span>
              <div className="need-text">
                <div className="row" style={{ gap: 8 }}>
                  <strong>{f.name}</strong>
                  {f.overdue && <span className="pill pill-watch">Overdue</span>}
                </div>
                <span className="small muted">
                  {f.reason}
                  {f.due ? ` By ${day(f.due)}.` : ""}
                </span>
              </div>
              {f.href && (
                <div className="need-actions">
                  <Link href={f.href} className="btn">
                    Open
                  </Link>
                </div>
              )}
            </div>
          ))}
          {data && followUps.length > 6 && (
            <Link href="/shepherding" className="need-row need-more">
              {followUps.length - 6} more follow-ups in {TERMS.shepherding.One}
            </Link>
          )}
          {data && (
            <p className="need-row need-calm small muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="m5 12 4.5 4.5L19 7" />
              </svg>
              {followUps.length === 0 ? "No open follow-ups. " : ""}
              {radar.length === 0
                ? `Every ${TERMS.colaborer.one} on the rosters is serving at a healthy pace this week.`
                : `Every other ${TERMS.colaborer.one} is serving at a healthy pace.`}
            </p>
          )}
        </div>
      </section>

      <aside className="week" aria-labelledby="week-head">
        <section className="list-card week-card">
          <div className="section-head">
            <h2 id="week-head">Coming up</h2>
            <Link href="/calendar" className="small">
              Calendar
            </Link>
          </div>
          {data && data.upcoming.length === 0 && <p className="muted">Nothing on the calendar.</p>}
          {data && data.upcoming.length > 0 && (
            <ul className="week-list">
              {data.upcoming.slice(0, 5).map((e) => {
                const t = dateTile(e.date);
                const soon = relativeDay(e.date);
                return (
                  <li key={`${e.date}-${e.title}`} className={soon ? "is-soon" : undefined}>
                    <span className="date-tile" aria-hidden="true">
                      <small>{t.weekday}</small>
                      <strong>{t.num}</strong>
                    </span>
                    <span className="week-what">
                      <strong>{e.title}</strong>
                      <span className="small muted">
                        <span className="sr-only">{day(e.date)}</span>
                        {soon && <span className="week-soon">{soon}</span>}
                        {soon && e.time ? " · " : ""}
                        {e.time}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <figure className="today-verse">
          <p className="today-verse-label">For today</p>
          <blockquote>&ldquo;{VERSES[todaysVerse].text}&rdquo;</blockquote>
          <figcaption>{VERSES[todaysVerse].reference}, KJV</figcaption>
        </figure>
      </aside>
    </>
  );
}
