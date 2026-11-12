import type { Metadata } from "next";
import Link from "next/link";
import { requirePageLeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { MessageParent } from "@/components/inbox/MessageParent";
import { AutoRefresh } from "@/components/ops/AutoRefresh";
import { KidsNoAccess } from "@/components/ops/KidsViews";
import { KIDS_TABS, OpsFrame } from "@/components/ops/OpsFrame";
import { friendlyDate, today as todayIso } from "@/lib/dates";
import { roomRows } from "@/lib/kids/service";
import { parentLookup } from "@/lib/kids/parents";
import { kidsFor } from "@/lib/kids/views";
import { gatheringsOn, nextMeeting } from "@/lib/ops/gatherings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kids rooms · Barnabas" };

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default async function KidsRoomsPage({ searchParams }: { searchParams: Promise<{ date?: string; g?: string }> }) {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await kidsFor(leader);
  if (!actor.station) return <KidsNoAccess profile={profile} />;
  const q = await searchParams;
  const today = todayIso();
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) && gatheringsOn(q.date).length ? q.date : gatheringsOn(today).length ? today : nextMeeting(today);
  const options = gatheringsOn(date).filter((g) => g.kids);
  const g = options.find((x) => x.key === q.g) ?? options[0];
  const rooms = roomRows(book, date, g.key);
  const total = rooms.reduce((n, r) => n + r.present, 0);
  const parentsOf = await parentLookup(leader.churchId);
  const parents = (householdId: string) => parentsOf(book.households.find((h) => h.id === householdId));
  const log = book.log.filter((l) => l.action !== "family").slice(-12).reverse();
  return (
    <OpsFrame profile={profile} eyebrow="Kids" title="Room rosters" intro={`${g.label}, ${friendlyDate(date)}. Live counts refresh every 15 seconds.`} tabs={KIDS_TABS}>
      <AutoRefresh seconds={15} />
      <nav className="care-chips ops-dates" aria-label="Gathering">
        {options.map((o) => (
          <Link key={o.key} className="care-chip" href={`/kids/rooms?date=${date}&g=${o.key}`} aria-current={o.key === g.key ? "page" : undefined}>
            {o.label.replace(/^(Sunday|Wednesday) /, "")}
          </Link>
        ))}
      </nav>
      <dl className="fact-strip kids-summary">
        <div>
          <dt>Checked in now</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>Picked up</dt>
          <dd>{rooms.reduce((n, r) => n + r.checkedOut, 0)}</dd>
        </div>
        <div>
          <dt>Ratio warnings</dt>
          <dd className={rooms.some((r) => r.warning) ? "is-warn" : undefined}>{rooms.filter((r) => r.warning).length}</dd>
        </div>
      </dl>
      <p className="small muted" style={{ marginTop: -10, marginBottom: 16 }}>
        Two adults per room, and within each room&apos;s ratio.
      </p>
      {total === 0 && (
        <EmptyState title="No children checked in for this gathering" actions={[{ label: "Open the check-in station", href: `/kids?date=${date}&g=${g.key}`, primary: true }]}>
          As children are checked in, each room fills in here with first names, allergy flags and a live count.
        </EmptyState>
      )}
      <div className="fin-grid kids-room-cards">
        {rooms.map((r) => (
          <section key={r.id} className={`fin-card kids-room${r.warning ? " warn" : ""}`}>
            <div className="fin-card-head">
              <h2>{r.name}</h2>
              <span className="kids-count">
                {r.present}
                {r.capacity ? <small> of {r.capacity}</small> : null}
              </span>
            </div>
            <span className="small muted">
              {r.ages} · {r.adults} adult{r.adults === 1 ? "" : "s"} · 1 to {r.ratio}
              {r.capacity ? ` · holds ${r.capacity}` : ""}
            </span>
            {r.capacity ? (
              <span className={`kids-fill${r.present >= r.capacity ? " is-full" : r.present >= r.capacity * 0.8 ? " is-near" : ""}`} aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.round((r.present / r.capacity) * 100))}%` }} />
              </span>
            ) : null}
            {r.warning && <span className="kids-warning">{r.warning}</span>}
            {r.children.length ? (
              <ul className="kids-roster">
                {r.children.map((c) => (
                  <li key={c.checkinId}>
                    <span>
                      {c.firstName} {c.lastInitial}.{c.allergies && <span className="kids-allergy-dot" title="Has an allergy: see the label">Allergy</span>}
                    </span>
                    <span className="kids-roster-end">
                      <span className="small muted">{time(c.checkedInAt)}</span>
                      <MessageParent parents={parents(c.householdId)} child={c.firstName} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No one yet.</p>
            )}
          </section>
        ))}
      </div>
      <section className="fin-card" style={{ marginTop: 16 }}>
        <h2>Recent activity</h2>
        {log.length ? (
          <ul className="care-days">
            {log.map((l, i) => (
              <li key={i}>
                <span>
                  {l.action === "checkin" ? "Checked in" : l.action === "checkout" ? "Checked out" : l.action === "checkout_refused" ? "Checkout refused" : "Staffing"} · {l.by}
                </span>
                <span className="small muted">{time(l.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">Every check-in, checkout and refused checkout is recorded here and in the audit log.</p>
        )}
      </section>
    </OpsFrame>
  );
}
