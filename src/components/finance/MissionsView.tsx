"use client";

import { EmptyState } from "@/components/EmptyState";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dollars, parseMoney, percent, wholeDollars } from "@/lib/finance/money";
import type { CampaignStatus, PartnerStatus } from "@/lib/finance/missions";
import type { MissionsPartner } from "@/lib/finance/types";

type View = {
  asOf: string;
  partners: PartnerStatus[];
  campaigns: CampaignStatus[];
  fund: { balance: number; income: number; expenses: number; opening: number } | null;
  missionsGivingYtd: number;
  pledges?: { id: string; donorName: string; personId?: string; amount: number; given: number; campaignId?: string }[];
  donorDetail: boolean;
};

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function post(body: unknown) {
  const res = await fetch("/api/finance/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json;
}

const SUPPORT: Record<MissionsPartner["supportLevel"], string> = { full: "Full support", partial: "Partial support", project: "Project support" };

export function MissionsView({ view, canEdit, canSeeDonors, today, people }: { view: View; canEdit: boolean; canSeeDonors: boolean; today: string; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [addingPartner, setAddingPartner] = useState(false);
  const committed = view.partners.reduce((a, p) => a + p.committed, 0);
  const paid = view.partners.reduce((a, p) => a + p.paid, 0);
  const monthly = view.partners.filter((p) => p.partner.active).reduce((a, p) => a + p.partner.monthly, 0);

  async function act(body: unknown, after?: () => void) {
    setError(null);
    try {
      await post(body);
      after?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  return (
    <div className="fin-stack">
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}
      <div className="fin-grid">
        {view.campaigns.map((c) => (
          <section className="fin-card" key={c.campaign.id}>
            <span className="label">{c.campaign.name}</span>
            <div className="fin-stat">{wholeDollars(c.received)}</div>
            <span className="small muted">
              received of {wholeDollars(c.pledged)} pledged by {c.pledgeCount} {c.pledgeCount === 1 ? "family" : "families"}. Goal {wholeDollars(c.campaign.goal)}.
            </span>
            <div className="fin-meter" role="img" aria-label={`${percent(c.received, c.campaign.goal) ?? 0}% of the goal received`}>
              <span style={{ width: `${Math.min(100, percent(c.received, c.campaign.goal) ?? 0)}%` }} />
              <i style={{ left: `calc(${Math.min(100, percent(c.pledged, c.campaign.goal) ?? 0)}% - 1px)` }} />
            </div>
            <span className="small muted">Bar: received toward the goal. Brass tick: pledged so far.</span>
            {c.campaign.note && <p className="small">{c.campaign.note}</p>}
            <p className="fin-source">
              Pledges recorded for this campaign; received is every gift to the Missions fund from {shortDate(c.campaign.start)} to {shortDate(c.campaign.end < view.asOf ? c.campaign.end : view.asOf)}.
            </p>
          </section>
        ))}
        <section className="fin-card">
          <span className="label">Missions fund (restricted)</span>
          <div className="fin-stat">{wholeDollars(view.fund?.balance ?? 0)}</div>
          <span className="small muted">Missions gifts this year: {wholeDollars(view.missionsGivingYtd)}</span>
          {view.fund && (
            <p className="fin-source">
              Opening {dollars(view.fund.opening)}, plus {dollars(view.fund.income)} given to Missions, less {dollars(view.fund.expenses)} paid out from it.
            </p>
          )}
        </section>
        <section className="fin-card">
          <span className="label">Partner support this year</span>
          <div className="fin-stat">{wholeDollars(paid)}</div>
          <span className="small muted">
            paid of {wholeDollars(committed)} committed. {wholeDollars(monthly)} a month to {view.partners.filter((p) => p.partner.active).length} partners.
          </span>
          <p className="fin-source">Missionary support lines tagged with a partner in the ledger, compared with each partner&apos;s monthly commitment for the months of this year their pledge covers.</p>
        </section>
      </div>

      <section className="fin-card">
        <div className="fin-card-head">
          <h2>Missions partners</h2>
          {canEdit && (
            <button className="btn" type="button" onClick={() => setAddingPartner((x) => !x)}>
              {addingPartner ? "Cancel" : "Add a partner"}
            </button>
          )}
        </div>
        {addingPartner && <PartnerForm today={today} onSave={(partner) => act({ action: "save-partner", partner }, () => setAddingPartner(false))} />}
        {view.partners.map((p) => (
          <Partner key={p.partner.id} status={p} canEdit={canEdit} today={today} onUpdate={(text, date) => act({ action: "add-update", partnerId: p.partner.id, text, date })} />
        ))}
      </section>

      {canSeeDonors && view.pledges && (
        <Pledges pledges={view.pledges} campaigns={view.campaigns} canEdit={canEdit} people={people} onAdd={(pledge, after) => act({ action: "add-pledge", pledge }, after)} />
      )}
      {!canSeeDonors && <p className="fin-note">Pledges by name are kept between the pastor and treasurer. Campaign totals above include every pledge.</p>}

      {canEdit && <CampaignForm today={today} onSave={(campaign, after) => act({ action: "add-campaign", campaign }, after)} />}
    </div>
  );
}

function Partner({ status, canEdit, today, onUpdate }: { status: PartnerStatus; canEdit: boolean; today: string; onUpdate: (text: string, date: string) => Promise<void> }) {
  const { partner, committed, paid } = status;
  const [text, setText] = useState("");
  const pctPaid = percent(paid, committed);
  return (
    <div className="fin-partner">
      <div className="fin-partner-head">
        <strong>{partner.name}</strong>
        <span className="small muted">
          {partner.field} · {partner.type || (partner.kind === "missionary" ? "Missionary" : "Organization")}
        </span>
      </div>
      <div className="row small">
        <span className="badge" style={{ marginLeft: 0 }}>
          {partner.kind === "missionary" ? "Missionary" : "Organization"}
        </span>
        <span className="badge">{SUPPORT[partner.supportLevel]}</span>
        <span>{dollars(partner.monthly)} a month</span>
        <span className="muted">
          Pledged since {shortDate(partner.pledgeStart)}
          {partner.pledgeEnd ? `, through ${shortDate(partner.pledgeEnd)}` : ", ongoing"}
        </span>
        {!partner.active && <span className="badge">ended</span>}
      </div>
      <div className="fin-sub">
        <span>Paid this year</span>
        <span>
          {dollars(paid, { cents: false })} of {dollars(committed, { cents: false })}
          {pctPaid !== null ? ` (${Math.round(pctPaid)}%)` : ""}
        </span>
      </div>
      <details className="fin-details">
        <summary>
          Prayer updates ({partner.updates.length}){status.lastUpdate ? `, latest ${shortDate(status.lastUpdate)}` : ""}
        </summary>
        {partner.updates.length > 0 ? (
          <ul className="fin-updates">
            {partner.updates.map((u) => (
              <li key={u.id}>
                <span className="small muted">{shortDate(u.date)}</span>
                <div>{u.text}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No updates yet.</p>
        )}
        {canEdit && (
          <form
            className="row"
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void onUpdate(text.trim(), today).then(() => setText(""));
            }}
          >
            <input type="text" aria-label={`Prayer update for ${partner.name}`} placeholder="Add a prayer update" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <button className="btn" type="submit" disabled={!text.trim()}>
              Add
            </button>
          </form>
        )}
      </details>
    </div>
  );
}

function PartnerForm({ today, onSave }: { today: string; onSave: (p: unknown) => Promise<void> }) {
  const [f, setF] = useState({ name: "", kind: "missionary", field: "", type: "", supportLevel: "partial", monthly: "", pledgeStart: today, pledgeEnd: "" });
  return (
    <form
      className="fin-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ ...f, monthly: parseMoney(f.monthly) ?? 0, active: true });
      }}
    >
      <div className="fin-form-row">
        <div className="field">
          <label htmlFor="p-name">Name</label>
          <input id="p-name" type="text" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="p-kind">Kind</label>
          <select id="p-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="missionary">Missionary</option>
            <option value="organization">Organization</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-field">Field or country</label>
          <input id="p-field" type="text" required maxLength={100} value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="p-type">Work</label>
          <input id="p-type" type="text" maxLength={80} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="e.g. Church planting" />
        </div>
      </div>
      <div className="fin-form-row">
        <div className="field">
          <label htmlFor="p-level">Support level</label>
          <select id="p-level" value={f.supportLevel} onChange={(e) => setF({ ...f, supportLevel: e.target.value })}>
            <option value="full">Full</option>
            <option value="partial">Partial</option>
            <option value="project">Project</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-monthly">Monthly commitment</label>
          <input id="p-monthly" type="text" inputMode="decimal" required value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} placeholder="0.00" />
        </div>
        <div className="field">
          <label htmlFor="p-start">Pledge starts</label>
          <input id="p-start" type="date" required value={f.pledgeStart} onChange={(e) => setF({ ...f, pledgeStart: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="p-end">Pledge ends (optional)</label>
          <input id="p-end" type="date" value={f.pledgeEnd} onChange={(e) => setF({ ...f, pledgeEnd: e.target.value })} />
        </div>
      </div>
      <div>
        <button className="btn btn-primary" type="submit">
          Save partner
        </button>
      </div>
    </form>
  );
}

function Pledges({
  pledges,
  campaigns,
  canEdit,
  people,
  onAdd,
}: {
  pledges: NonNullable<View["pledges"]>;
  campaigns: CampaignStatus[];
  canEdit: boolean;
  people: { id: string; name: string }[];
  onAdd: (pledge: unknown, after: () => void) => Promise<void>;
}) {
  const [donor, setDonor] = useState("");
  const [amount, setAmount] = useState("");
  const [campaignId, setCampaign] = useState(campaigns[campaigns.length - 1]?.campaign.id ?? "");
  const [limit, setLimit] = useState(12);
  const sorted = [...pledges].sort((a, b) => b.amount - a.amount);
  return (
    <section className="fin-card">
      <div className="fin-card-head">
        <h2>Pledges</h2>
        <span className="small muted">Confidential: pastor and treasurer only</span>
      </div>
      {sorted.length === 0 ? (
        <EmptyState compact title="No pledges recorded yet">
          When people make a faith-promise pledge, add it below. Giving to the Missions fund already counts toward the campaign goal.
        </EmptyState>
      ) : (
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Pledged by</th>
              <th>Campaign</th>
              <th className="num">Pledged</th>
              <th className="num">Given so far</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((p) => (
              <tr key={p.id}>
                <td className="wide">{p.donorName}</td>
                <td>{campaigns.find((c) => c.campaign.id === p.campaignId)?.campaign.name ?? "General missions"}</td>
                <td className="num">{dollars(p.amount)}</td>
                <td className="num">{dollars(p.given)}</td>
                <td className="num">{Math.round(percent(p.given, p.amount) ?? 0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {sorted.length > limit && (
        <button className="btn" type="button" onClick={() => setLimit((l) => l + 50)}>
          Show all {sorted.length} pledges
        </button>
      )}
      {canEdit && (
        <form
          className="fin-form-row"
          onSubmit={(e) => {
            e.preventDefault();
            const cents = parseMoney(amount);
            if (!cents || cents <= 0) return;
            const person = people.find((p) => p.name.toLowerCase() === donor.trim().toLowerCase());
            void onAdd({ personId: person?.id, donorName: person ? undefined : donor.trim(), amount: cents, campaignId: campaignId || undefined }, () => {
              setDonor("");
              setAmount("");
            });
          }}
        >
          <datalist id="pledge-people">
            {people.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <div className="field">
            <label htmlFor="pl-donor">Pledged by</label>
            <input id="pl-donor" type="text" list="pledge-people" required value={donor} onChange={(e) => setDonor(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pl-amount">Amount for the campaign</label>
            <input id="pl-amount" type="text" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label htmlFor="pl-camp">Campaign</label>
            <select id="pl-camp" value={campaignId} onChange={(e) => setCampaign(e.target.value)}>
              <option value="">General missions</option>
              {campaigns.map((c) => (
                <option key={c.campaign.id} value={c.campaign.id}>
                  {c.campaign.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit">
            Add pledge
          </button>
        </form>
      )}
    </section>
  );
}

function CampaignForm({ today, onSave }: { today: string; onSave: (c: unknown, after: () => void) => Promise<void> }) {
  const year = Number(today.slice(0, 4)) + 1;
  const [f, setF] = useState({ name: `Faith Promise ${year}`, goal: "", start: `${year}-01-01`, end: `${year}-12-31`, note: "" });
  return (
    <details className="fin-card fin-details">
      <summary>Start a missions conference or faith-promise campaign</summary>
      <form
        className="fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const goal = parseMoney(f.goal);
          if (!goal) return;
          void onSave({ ...f, goal, note: f.note || undefined }, () => setF({ ...f, goal: "", note: "" }));
        }}
      >
        <div className="fin-form-row">
          <div className="field">
            <label htmlFor="c-name">Name</label>
            <input id="c-name" type="text" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-goal">Goal</label>
            <input id="c-goal" type="text" inputMode="decimal" required value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="0.00" />
          </div>
          <div className="field">
            <label htmlFor="c-start">Starts</label>
            <input id="c-start" type="date" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-end">Ends</label>
            <input id="c-end" type="date" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="c-note">Note</label>
          <input id="c-note" type="text" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Pledged at the missions conference in March" />
        </div>
        <div>
          <button className="btn btn-primary" type="submit">
            Start campaign
          </button>
        </div>
      </form>
    </details>
  );
}
