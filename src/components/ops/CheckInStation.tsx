"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { RoomRow } from "@/lib/kids/service";
import { longDate, opsApi, Status } from "./client";

type StationChild = { id: string; firstName: string; lastName: string; grade?: string; allergies?: string; roomId?: string; checkin: { id: string; roomId: string; at: number } | null };
type StationFamily = { id: string; name: string; guardians: { name: string; relationship?: string; phoneLast4?: string }[]; pickups: { name: string; relationship?: string }[]; children: StationChild[] };
type RoomInfo = { id: string; name: string; ages: string; gatherings: string[] };

/**
 * The check-in station. It never shows pickup codes (only the labels do, once), medical notes or full
 * phone numbers. Dragging down here doesn't reload the page (data-no-pull), so a busy desk can't lose its place.
 */
export function CheckInStation({ date, gathering, gatherings, rooms, allRooms, families, admin }: { date: string; gathering: string; gatherings: { key: string; label: string; day: number }[]; rooms: RoomRow[]; allRooms: RoomInfo[]; families: number; admin: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StationFamily[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<{ family: string; code: string; ids: string[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const here = allRooms.filter((r) => r.gatherings.includes(gathering));

  async function search(text: string) {
    if (text.trim().length < 2) return setResults(null);
    const res = await fetch(`/api/kids?q=${encodeURIComponent(text)}&date=${date}&gathering=${gathering}`);
    const json = await res.json().catch(() => ({}));
    if (res.ok) setResults(json.families);
    else setError(json.error ?? "Couldn't search.");
  }
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void search(q), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, date, gathering]);
  // Keep the room counts fresh while the desk is open.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [router]);

  const refreshAll = async () => {
    router.refresh();
    await search(q);
  };

  return (
    <div className="kids-station" data-no-pull>
      <div className="kids-station-main fin-stack">
        <details className="kids-when-bar">
          <summary>
            <span>
              <strong>{longDate(date)}</strong>
              <span className="muted"> · {gatherings.find((g) => g.key === gathering)?.label ?? ""}</span>
            </span>
            <span className="kids-when-change">Change</span>
          </summary>
          <form className="kids-when" onSubmit={(e) => e.preventDefault()}>
          <div className="fin-form-row">
            <div className="field">
              <label htmlFor="ks-date">Date</label>
              <input id="ks-date" type="date" value={date} onChange={(e) => router.push(`/kids?date=${e.target.value}`)} />
            </div>
            <div className="field">
              <label htmlFor="ks-g">Gathering</label>
              <select id="ks-g" value={gathering} onChange={(e) => router.push(`/kids?date=${date}&g=${e.target.value}`)}>
                {gatherings.filter((g) => g.day === day).map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          </form>
        </details>

        <section className="fin-card">
          <label className="kids-search-label" htmlFor="ks-search">
            Find a family
          </label>
          <input id="ks-search" className="kids-search" type="search" inputMode="search" autoComplete="off" placeholder="Last name, or last 4 digits of a phone" value={q} onChange={(e) => setQ(e.target.value)} />
          <Status error={error} notice={notice} />
          {done && (
            <div className="kids-done" role="status">
              <div>
                <strong>{done.family} family checked in.</strong>
                <span className="small muted">The parent keeps the pickup tag; the code matches each child&apos;s label.</span>
              </div>
              <span className="kids-code" aria-label={`Pickup code ${done.code.split("").join(" ")}`}>
                {done.code}
              </span>
              <Link className="btn btn-primary" href={`/kids/labels?ids=${done.ids.join(",")}`} target="_blank">
                Print labels
              </Link>
            </div>
          )}
          {families === 0 ? (
            <EmptyState title="No families on file yet" actions={admin ? [{ label: "Add your first family", href: "/kids/families#new-family", primary: true }] : []}>
              Add each family once, with their children, any allergies and who may pick them up. Then check-in is a search away.
            </EmptyState>
          ) : results === null ? (
            <p className="small muted">Type at least two letters, or four digits.</p>
          ) : results.length === 0 ? (
            <EmptyState compact title="No family matches" actions={admin ? [{ label: "Add a family", href: "/kids/families#new-family" }] : []}>
              Check the spelling, or try the last four digits of a parent&apos;s phone.
            </EmptyState>
          ) : (
            <div className="kids-results">
              {results.map((f) => (
                <FamilyCard
                  key={f.id}
                  family={f}
                  rooms={here}
                  date={date}
                  gathering={gathering}
                  onError={setError}
                  onCheckedIn={(code, ids) => {
                    setError(null);
                    setNotice(null);
                    setDone({ family: f.name, code, ids });
                    void refreshAll();
                  }}
                  onCheckedOut={(names) => {
                    setError(null);
                    setDone(null);
                    setNotice(`${names} checked out. Thank you!`);
                    void refreshAll();
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      <RoomsPanel rooms={rooms} date={date} gathering={gathering} onError={setError} />
    </div>
  );
}

function FamilyCard({ family, rooms, date, gathering, onCheckedIn, onCheckedOut, onError }: { family: StationFamily; rooms: RoomInfo[]; date: string; gathering: string; onCheckedIn: (code: string, ids: string[]) => void; onCheckedOut: (names: string) => void; onError: (e: string | null) => void }) {
  const waiting = family.children.filter((c) => !c.checkin);
  const inside = family.children.filter((c) => c.checkin);
  const defaultRoom = (c: StationChild) => (c.roomId && rooms.some((r) => r.id === c.roomId) ? c.roomId : rooms[0]?.id ?? "");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [who, setWho] = useState("");
  const [out, setOut] = useState<string[]>([]);
  const people = [...family.guardians.map((g) => g.name), ...family.pickups.map((p) => p.name)];

  async function checkIn() {
    const children = Object.entries(picked).map(([childId, roomId]) => ({ childId, roomId }));
    setBusy(true);
    try {
      const r = await opsApi<{ checkinIds: string[]; code: string }>("kids", { action: "checkin", checkin: { date, gathering, householdId: family.id, children } });
      setPicked({});
      onCheckedIn(r.code, r.checkinIds);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function checkOut() {
    setBusy(true);
    try {
      await opsApi("kids", { action: "checkout", checkout: { checkinIds: out, code, pickedUpBy: who || undefined } });
      const names = inside.filter((c) => out.includes(c.checkin!.id)).map((c) => c.firstName).join(" and ");
      setOut([]);
      setCode("");
      setWho("");
      onCheckedOut(names);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="kids-family">
      <div className="fin-card-head">
        <h3>{family.name}</h3>
        <span className="small muted">{family.guardians.map((g) => `${g.name}${g.phoneLast4 ? ` (…${g.phoneLast4})` : ""}`).join(", ")}</span>
      </div>
      {waiting.length > 0 && (
        <ul className="kids-children">
          {waiting.map((c) => {
            const on = c.id in picked;
            return (
              <li key={c.id} className={on ? "on" : ""}>
                <label className="check kids-child">
                  <input type="checkbox" checked={on} onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[c.id] = defaultRoom(c); else delete n[c.id]; return n; })} />
                  <span className="kids-initial" aria-hidden="true">
                    {c.firstName.charAt(0).toUpperCase()}
                  </span>
                  <span className="kids-child-text">
                    <strong>
                      {c.firstName} {c.lastName}
                    </strong>
                    {c.grade && <span className="small muted">{c.grade}</span>}
                    {c.allergies && <span className="kids-allergy">Allergy: {c.allergies}</span>}
                  </span>
                </label>
                {on && (
                  <>
                    <label className="sr-only" htmlFor={`room-${c.id}`}>
                      Room for {c.firstName}
                    </label>
                    <select id={`room-${c.id}`} value={picked[c.id]} onChange={(e) => setPicked({ ...picked, [c.id]: e.target.value })}>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.ages})
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {waiting.length > 0 && (
        <button className="btn btn-primary kids-big" type="button" disabled={busy || !Object.keys(picked).length || !rooms.length} onClick={() => void checkIn()}>
          {Object.keys(picked).length ? `Check in ${Object.keys(picked).length} ${Object.keys(picked).length === 1 ? "child" : "children"} and print labels` : "Tap the children to check in"}
        </button>
      )}
      {inside.length > 0 && (
        <div className="kids-out">
          <h4>Checked in now</h4>
          <ul className="kids-children">
            {inside.map((c) => (
              <li key={c.id}>
                <label className="check kids-child">
                  <input type="checkbox" checked={out.includes(c.checkin!.id)} onChange={(e) => setOut(e.target.checked ? [...out, c.checkin!.id] : out.filter((x) => x !== c.checkin!.id))} />
                  <span>
                    <strong>{c.firstName}</strong> <span className="small muted">in {rooms.find((r) => r.id === c.checkin!.roomId)?.name ?? "their room"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {out.length > 0 && (
            <form
              className="fin-form kids-checkout"
              onSubmit={(e) => {
                e.preventDefault();
                void checkOut();
              }}
            >
              <div className="form-row">
                <div className="field">
                  <label htmlFor={`code-${family.id}`}>Code on the parent&apos;s tag</label>
                  <input id={`code-${family.id}`} className="kids-code-input" type="text" required autoComplete="off" autoCapitalize="characters" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                </div>
                <div className="field">
                  <label htmlFor={`who-${family.id}`}>Picked up by</label>
                  <select id={`who-${family.id}`} value={who} onChange={(e) => setWho(e.target.value)}>
                    <option value="">Choose…</option>
                    {people.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="btn btn-primary kids-big" type="submit" disabled={busy || !code}>
                Check out {out.length}
              </button>
            </form>
          )}
        </div>
      )}
      {!waiting.length && !inside.length && <p className="small muted">No children on file for this family.</p>}
    </article>
  );
}

function RoomsPanel({ rooms, date, gathering, onError }: { rooms: RoomRow[]; date: string; gathering: string; onError: (e: string | null) => void }) {
  const router = useRouter();
  const total = rooms.reduce((n, r) => n + r.present, 0);
  async function adults(roomId: string, n: number) {
    try {
      await opsApi("kids", { action: "staffing", date, gathering, roomId, adults: Math.max(0, n) });
      router.refresh();
    } catch (err) {
      onError((err as Error).message);
    }
  }
  return (
    <aside className="fin-card kids-rooms-panel" aria-label="Rooms">
      <div className="fin-card-head">
        <h2>Rooms</h2>
        <span className="pill pill-ok">{total} checked in</span>
      </div>
      <ul className="kids-room-list">
        {rooms.map((r) => (
          <li key={r.id} className={r.warning ? "warn" : ""}>
            <div className="kids-room-head">
              <strong>{r.name}</strong>
              <span className="kids-count">{r.present}</span>
            </div>
            <div className="kids-adults">
              <span className="small muted">Adults</span>
              <button className="icon-btn" type="button" aria-label={`One fewer adult in ${r.name}`} onClick={() => void adults(r.id, r.adults - 1)}>
                −
              </button>
              <span className="kids-adult-n">{r.adults}</span>
              <button className="icon-btn" type="button" aria-label={`One more adult in ${r.name}`} onClick={() => void adults(r.id, r.adults + 1)}>
                +
              </button>
              <span className="small muted">1 to {r.ratio}</span>
            </div>
            {r.warning && <span className="kids-warning">{r.warning}</span>}
          </li>
        ))}
      </ul>
      <Link className="small" href={`/kids/rooms?date=${date}&g=${gathering}`}>
        Room rosters
      </Link>
    </aside>
  );
}
