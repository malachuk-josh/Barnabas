"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GUEST_INTERESTS, INTEREST_LABELS, type GuestInterest } from "@/lib/care/types";
import { careApi, localToday, shortDate } from "./client";

type Task = { id: string; kind: string; label: string; dueAt: number; doneAt?: number; draftId?: string; draftOwnerId?: string; overdue: boolean; mine: boolean; assigneeName: string };
type Guest = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  howHeard?: string;
  kidsAges?: string;
  interests: GuestInterest[];
  visits: string[];
  assigneeName: string;
  mine: boolean;
  contacted: boolean;
  source: "leader" | "self";
  tasks: Task[];
  prayer: { request: string | null; shareable: boolean } | null;
};
type Link_ = { id: string; token: string; label: string; createdAt: number };

/** In the leader's own time zone, so the server and the browser render the same text. */
const when = (ms: number, timeZone: string) => new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });

function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act<T>(body: unknown, after?: (r: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const r = await careApi<T>("guests", body);
      after?.(r);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }
  return { act, error, busy };
}

function GuestCardView({ g, selfIds, canAssign, timeZone }: { g: Guest; selfIds: string[]; canAssign: boolean; timeZone: string }) {
  const { act, error, busy } = useAct();
  const [visit, setVisit] = useState(localToday());
  return (
    <article className={`fin-card care-guest${g.contacted ? "" : " waiting"}`} id={g.id}>
      <div className="fin-card-head">
        <h3>{g.name}</h3>
        <span className={`care-share ${g.contacted ? "" : "private"}`}>{g.contacted ? "Reached" : "Not reached yet"}</span>
      </div>
      <div className="care-meta">
        <span>
          {g.visits.length === 1 ? "First visit" : `${g.visits.length} visits`}: {g.visits.map(shortDate).join(", ")}
        </span>
        <span>Following up: {g.mine ? "you" : g.assigneeName}</span>
        {g.source === "self" && <span>Filled in by the guest</span>}
      </div>
      <dl className="care-dl">
        {g.phone && (
          <>
            <dt>Phone</dt>
            <dd>{g.phone}</dd>
          </>
        )}
        {g.email && (
          <>
            <dt>Email</dt>
            <dd>{g.email}</dd>
          </>
        )}
        {g.howHeard && (
          <>
            <dt>Heard about us</dt>
            <dd>{g.howHeard}</dd>
          </>
        )}
        {g.kidsAges && (
          <>
            <dt>Kids&apos; ages</dt>
            <dd>{g.kidsAges}</dd>
          </>
        )}
        {g.interests.length > 0 && (
          <>
            <dt>Interested in</dt>
            <dd>{g.interests.map((i) => INTEREST_LABELS[i]).join(", ")}</dd>
          </>
        )}
        {g.prayer && (
          <>
            <dt>Prayer</dt>
            <dd>{g.prayer.request ?? "A private request, with the pastors"}</dd>
          </>
        )}
      </dl>
      <ul className="care-tasks">
        {g.tasks.map((t) => (
          <li key={t.id} className={t.doneAt ? "done" : t.overdue ? "overdue" : undefined}>
            <span>
              <strong>{t.label}</strong>
              <small className={t.overdue && !t.doneAt ? "care-overdue" : "muted"}>
                {t.doneAt ? `Done ${when(t.doneAt, timeZone)}` : `${t.overdue ? "Overdue: was due" : "Due"} ${when(t.dueAt, timeZone)}`} · {t.mine ? "you" : t.assigneeName}
              </small>
            </span>
            {!t.doneAt && (
              <span className="row">
                {t.kind === "thank_you" &&
                  (t.draftId ? (
                    t.draftOwnerId && selfIds.includes(t.draftOwnerId) ? (
                      <Link className="btn" href="/drafts">
                        Review draft
                      </Link>
                    ) : (
                      <span className="small muted">Draft in {t.assigneeName}&apos;s queue</span>
                    )
                  ) : (
                    (g.email || g.phone) && (
                      <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "draft", id: g.id, taskId: t.id })}>
                        Draft it
                      </button>
                    )
                  ))}
                {(t.mine || canAssign) && (
                  <button className="btn" type="button" disabled={busy} onClick={() => void act({ action: "task-done", id: g.id, taskId: t.id })}>
                    Done
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "visit", id: g.id, date: visit });
        }}
      >
        <label className="sr-only" htmlFor={`v-${g.id}`}>
          Visit date
        </label>
        <input id={`v-${g.id}`} type="date" required value={visit} onChange={(e) => setVisit(e.target.value)} style={{ width: "auto", flex: "1 1 150px" }} />
        <button className="btn" type="submit" disabled={busy}>
          They came again
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </article>
  );
}

export function NewGuest() {
  const { act, error, busy } = useAct();
  const [open, setOpen] = useState(false);
  const blank = { name: "", email: "", phone: "", howHeard: "", kidsAges: "", prayerRequest: "", prayerShareable: false, interests: [] as GuestInterest[], visitDate: localToday() };
  const [f, setF] = useState(blank);
  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Add a guest card
      </button>
      {open && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="ng-title" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form
            className="sheet"
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: "record", guest: { ...f, email: f.email || undefined, phone: f.phone || undefined, howHeard: f.howHeard || undefined, kidsAges: f.kidsAges || undefined, prayerRequest: f.prayerRequest || undefined } }, () => {
                setOpen(false);
                setF(blank);
              });
            }}
          >
            <h2 id="ng-title">Guest card</h2>
            <GuestFields f={f} setF={setF} />
            <div className="field">
              <label htmlFor="g-visit">Visited on</label>
              <input id="g-visit" type="date" required value={f.visitDate} onChange={(e) => setF({ ...f, visitDate: e.target.value })} />
            </div>
            <p className="care-privacy">Saving makes the follow-up: a thank-you draft for review (nothing is sent), a welcome call within 48 hours, and an invitation to Discover Faith after a second visit.</p>
            {error && <p className="error">{error}</p>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Save card
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export type GuestForm = { name: string; email: string; phone: string; howHeard: string; kidsAges: string; prayerRequest: string; prayerShareable: boolean; interests: GuestInterest[] };

/** The fields shared by the leaders' card and the public card. */
export function GuestFields<T extends GuestForm>({ f, setF, publicForm = false }: { f: T; setF: (v: T) => void; publicForm?: boolean }) {
  const toggle = (i: GuestInterest) => setF({ ...f, interests: f.interests.includes(i) ? f.interests.filter((x) => x !== i) : [...f.interests, i] });
  return (
    <>
      <div className="field">
        <label htmlFor="g-name">{publicForm ? "Your name" : "Name"}</label>
        <input id="g-name" type="text" required maxLength={100} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="g-email">Email</label>
          <input id="g-email" type="email" maxLength={200} autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="g-phone">Phone</label>
          <input id="g-phone" type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="g-heard">How did {publicForm ? "you" : "they"} hear about us?</label>
          <input id="g-heard" type="text" maxLength={200} value={f.howHeard} onChange={(e) => setF({ ...f, howHeard: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="g-kids">Kids&apos; ages, if any</label>
          <input id="g-kids" type="text" maxLength={100} placeholder="4 and 7" value={f.kidsAges} onChange={(e) => setF({ ...f, kidsAges: e.target.value })} />
        </div>
      </div>
      <fieldset className="care-interests">
        <legend>{publicForm ? "I'd like to know more about" : "Interested in"}</legend>
        {GUEST_INTERESTS.map((i) => (
          <label key={i} className="check">
            <input type="checkbox" checked={f.interests.includes(i)} onChange={() => toggle(i)} />
            {INTEREST_LABELS[i]}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="g-prayer">{publicForm ? "How can we pray for you?" : "Prayer request"}</label>
        <textarea id="g-prayer" className="plain" maxLength={500} value={f.prayerRequest} onChange={(e) => setF({ ...f, prayerRequest: e.target.value })} />
      </div>
      {f.prayerRequest && (
        <label className="check">
          <input type="checkbox" checked={f.prayerShareable} onChange={(e) => setF({ ...f, prayerShareable: e.target.checked })} />
          {publicForm ? "It's OK to share this with the church's prayer team" : "They're happy for the prayer team to see it"}
        </label>
      )}
    </>
  );
}

export function GuestList({ guests, selfIds, canAssign, timeZone }: { guests: Guest[]; selfIds: string[]; canAssign: boolean; timeZone: string }) {
  const [filter, setFilter] = useState<"waiting" | "mine" | "all">("waiting");
  const shown = guests.filter((g) => (filter === "waiting" ? !g.contacted : filter === "mine" ? g.mine : true));
  return (
    <div className="fin-stack">
      <div className="seg" role="group" aria-label="Show">
        {(["waiting", "mine", "all"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {k === "waiting" ? `Not reached (${guests.filter((g) => !g.contacted).length})` : k === "mine" ? "Mine" : `All (${guests.length})`}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="fin-grid-2">
          {shown.map((g) => (
            <GuestCardView key={g.id} g={g} selfIds={selfIds} canAssign={canAssign} timeZone={timeZone} />
          ))}
        </div>
      ) : (
        <p className="muted">No guests here.</p>
      )}
    </div>
  );
}

export function WelcomeLinks({ links, origin }: { links: Link_[]; origin: string }) {
  const { act, error, busy } = useAct();
  const [label, setLabel] = useState("Welcome table");
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <section className="fin-card fin-form">
      <h2>Guest card link</h2>
      <p className="small muted">A private link guests can open on their phone (for example from a QR code at the welcome table) to fill in their own card. Anyone with the link can use it, so turn it off when you&apos;re done.</p>
      {links.map((l) => {
        const url = `${origin}/welcome/${l.token}`;
        return (
          <div key={l.id} className="fin-form">
            <strong>{l.label}</strong>
            <div className="copy-row">
              <input type="text" readOnly value={url} aria-label={`${l.label} link`} onFocus={(e) => e.target.select()} />
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  setCopied(l.id);
                }}
              >
                {copied === l.id ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="row">
              <a className="small" href={url} target="_blank" rel="noreferrer">
                Open it
              </a>
              <button className="linklike small" type="button" disabled={busy} onClick={() => void act({ action: "link-revoke", id: l.id })}>
                Turn off this link
              </button>
            </div>
          </div>
        );
      })}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "link-create", label });
        }}
      >
        <label className="sr-only" htmlFor="link-label">
          Label
        </label>
        <input id="link-label" type="text" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: "1 1 160px", width: "auto" }} />
        <button className="btn" type="submit" disabled={busy}>
          Make a link
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
