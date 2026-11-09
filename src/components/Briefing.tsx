"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TERMS } from "@/lib/language";
import { VerseNote } from "./VerseNote";

type RadarEntry = { personId: string; name: string; band: "high" | "watch" | "ok"; drivers: string[]; suggestion: string };
type FollowUp = { id: string; name: string; reason: string; due?: string; overdue?: boolean; href?: string };
type Upcoming = { date: string; title: string; time: string };
type BriefingData = { radar: RadarEntry[]; followUps: FollowUp[]; upcoming: Upcoming[] };
type Status = { claude: boolean; storage: string; churchData: string; churchName: string };

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Briefing() {
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

  return (
    <aside className="side" aria-label="This week">
      {status && (!status.claude || status.storage === "memory" || status.churchData === "demo") && (
        <div className="notice small stack" style={{ gap: 6 }}>
          <strong>Setup</strong>
          {!status.claude && <span>Claude isn&apos;t connected. Add ANTHROPIC_API_KEY in your Vercel project settings.</span>}
          {status.storage === "memory" && <span>Memory isn&apos;t saved between restarts. Add Upstash Redis from the Vercel Marketplace.</span>}
          {status.churchData === "demo" && <span>Showing Mount Greylock&apos;s demo schedule and leaders until your church database is connected.</span>}
        </div>
      )}

      <div className="card stack">
        <h2>{TERMS.colaborer.Many} to {TERMS.encourage.one}</h2>
        <VerseNote verse="encourage" />
        {!data && !failed && <p className="muted">Loading…</p>}
        {failed && <p className="muted">Couldn&apos;t load the briefing.</p>}
        {data && data.radar.length === 0 && <p className="muted">Every {TERMS.colaborer.one} on the rosters is serving at a healthy pace this week.</p>}
        {data && data.radar.length > 0 && (
          <ul className="list">
            {data.radar.slice(0, 5).map((r) => (
              <li key={r.personId}>
                <div className="row">
                  <strong>{r.name}</strong>
                  <span className={`pill pill-${r.band}`}>{r.band === "high" ? TERMS.encourage.One : "Watch"}</span>
                </div>
                <span className="small muted">{r.drivers.join(" · ")}</span>
                <span className="small">{r.suggestion}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card stack">
        <h2>Follow-ups</h2>
        {data && data.followUps.length === 0 && <p className="muted">Nothing open.</p>}
        {data && data.followUps.length > 0 && (
          <ul className="list">
            {data.followUps.slice(0, 6).map((f) => (
              <li key={f.id}>
                <div className="row">
                  {f.href ? (
                    <Link href={f.href}>
                      <strong>{f.name}</strong>
                    </Link>
                  ) : (
                    <strong>{f.name}</strong>
                  )}
                  {f.overdue && <span className="pill pill-watch">Overdue</span>}
                </div>
                <span className="small muted">
                  {f.reason}
                  {f.due ? ` By ${day(f.due)}.` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data && data.followUps.length > 6 && (
          <Link href="/shepherding" className="small">
            {data.followUps.length - 6} more in {TERMS.shepherding.One}
          </Link>
        )}
      </div>

      <div className="card stack">
        <h2>Coming up</h2>
        {data && data.upcoming.length === 0 && <p className="muted">Nothing on the calendar.</p>}
        {data && data.upcoming.length > 0 && (
          <ul className="list">
            {data.upcoming.slice(0, 5).map((e) => (
              <li key={`${e.date}-${e.title}`}>
                <strong>{e.title}</strong>
                <span className="small muted">
                  {day(e.date)}
                  {e.time ? `, ${e.time}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
