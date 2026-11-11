"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ITEM_KINDS, KIND_LABELS, type ItemKind, type SharedItem } from "@/lib/network/types";
import { networkPost } from "./client";
import { KIND_CHIPS, ResourceCard } from "./LibrarySearch";

type Starter = { id: string; kind: ItemKind; title: string; body: string; scripture?: string };
type Preview = { item: Omit<SharedItem, "id" | "sharedAt">; title: { removed: { kind: string; count: number }[]; total: number }; body: { removed: { kind: string; count: number }[]; total: number } };

const REMOVED: Record<string, string> = { email: "email address", phone: "phone number", address: "street address", handle: "handle", name: "name", link: "link tracking" };

function removedText(p: Preview) {
  const totals: Record<string, number> = {};
  for (const r of [...p.title.removed, ...p.body.removed]) totals[r.kind] = (totals[r.kind] ?? 0) + r.count;
  return Object.entries(totals).map(([k, n]) => `${n} ${REMOVED[k]}${n === 1 ? "" : "s"}`).join(", ");
}

/** Write, preview exactly what leaves the church (scrubbed in code), then share. */
export function ShareForm({ starters, mine }: { starters: { series: Starter[]; plans: Starter[]; prayers: Starter[] }; mine: SharedItem[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<ItemKind>("series_outline");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scripture, setScripture] = useState("");
  const [tags, setTags] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const all = [...starters.series, ...starters.plans, ...starters.prayers];

  const item = () => ({ kind, title, body, scripture: scripture || undefined, tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10) });
  const edit = (f: () => void) => {
    f();
    setPreview(null);
    setDone(null);
  };

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await networkPost<Preview>({ action: "preview", item: item() }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runShare() {
    setBusy(true);
    try {
      await networkPost({ action: "share", item: item() });
      setDone("Shared with your connected churches.");
      setPreview(null);
      setTitle("");
      setBody("");
      setScripture("");
      setTags("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await networkPost({ action: "unshare", id }).catch((e) => setError((e as Error).message));
    router.refresh();
  }

  return (
    <div className="mesa-share">
      <section className="fin-card fin-form mesa-share-form" data-no-pull>
        <h2>Share a resource</h2>
        <p className="small muted">Only resources leave the church, never people. Names, emails, phone numbers and addresses are removed before anything is shared, and you see exactly what goes out first.</p>
        {all.length > 0 && (
          <div className="field">
            <label htmlFor="mesa-start">Start from your own planning</label>
            <select
              id="mesa-start"
              defaultValue=""
              onChange={(e) => {
                const s = all.find((x) => x.id === e.target.value);
                if (s) edit(() => { setKind(s.kind); setTitle(s.title); setBody(s.body); setScripture(s.scripture ?? ""); });
              }}
            >
              <option value="">Choose a series, an order of service or a shareable prayer request…</option>
              {starters.series.length > 0 && <optgroup label="Sermon series">{starters.series.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</optgroup>}
              {starters.plans.length > 0 && <optgroup label="Orders of service">{starters.plans.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</optgroup>}
              {starters.prayers.length > 0 && <optgroup label="Shareable prayer requests">{starters.prayers.map((s) => <option key={s.id} value={s.id}>{s.body.slice(0, 60)}</option>)}</optgroup>}
            </select>
          </div>
        )}
        <fieldset className="field mesa-kind-pick">
          <legend>Kind</legend>
          <div className="mesa-kinds">
            {ITEM_KINDS.map((k) => (
              <label key={k} className="filter-chip" data-checked={kind === k ? "true" : undefined}>
                <input type="radio" name="mesa-kind-s" className="sr-only" value={k} checked={kind === k} onChange={() => edit(() => setKind(k))} />
                <span className={`mesa-kind-dot kind-${k}`} aria-hidden="true" />
                {KIND_CHIPS[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="mesa-title">Title</label>
          <input id="mesa-title" type="text" value={title} maxLength={120} onChange={(e) => edit(() => setTitle(e.target.value))} />
        </div>
        {kind === "series_outline" && (
          <div className="field">
            <label htmlFor="mesa-scripture">Scripture</label>
            <input id="mesa-scripture" type="text" value={scripture} maxLength={60} placeholder="James 1–5" onChange={(e) => edit(() => setScripture(e.target.value))} />
          </div>
        )}
        <div className="field">
          <label htmlFor="mesa-body">What to share</label>
          <textarea id="mesa-body" value={body} maxLength={8000} onChange={(e) => edit(() => setBody(e.target.value))} placeholder="The outline, the template, the training or the need, in your own words." style={{ fontFamily: "inherit" }} />
        </div>
        <div className="field">
          <label htmlFor="mesa-tags">Tags (comma-separated)</label>
          <input id="mesa-tags" type="text" value={tags} onChange={(e) => edit(() => setTags(e.target.value))} placeholder="james, faith, small groups" />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="button" disabled={busy || !title.trim() || !body.trim()} onClick={() => void runPreview()}>
            Preview what leaves the church
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {done && <p className="notice success" role="status">{done}</p>}
      </section>
      <div className="mesa-share-side">
        {preview ? (
          <section className="mesa-preview" aria-labelledby="mesa-prev-h">
            <h2 id="mesa-prev-h" className="eyebrow">
              Exactly what connected churches will see
            </h2>
            <ResourceCard r={preview.item} open />
            <p className={`small ${preview.title.total + preview.body.total ? "notice" : "muted"}`}>
              {preview.title.total + preview.body.total
                ? `Removed before sharing: ${removedText(preview)}.`
                : "Nothing about a person was found. Your name as the sharer isn't included either."}
            </p>
            <div className="row">
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void runShare()}>
                Share this
              </button>
              <button className="btn" type="button" onClick={() => setPreview(null)}>
                Keep editing
              </button>
            </div>
          </section>
        ) : (
          <section className="fin-card mesa-mine">
            <div className="fin-card-head">
              <h2>Shared by your church</h2>
              {mine.length > 0 && <span className="small muted">{mine.length}</span>}
            </div>
            {mine.length === 0 ? (
              <EmptyState compact title="Nothing shared yet">Share a series outline, a service template or co-laborer training, and connected churches can find it.</EmptyState>
            ) : (
              <ul className="mesa-mine-list">
                {mine.map((m) => (
                  <li key={m.id}>
                    <span className={`mesa-kind-dot kind-${m.kind}`} aria-hidden="true" />
                    <span className="mesa-mine-text">
                      <strong>{m.title}</strong>
                      <span className="small muted">{KIND_LABELS[m.kind]}</span>
                    </span>
                    <button className="btn btn-sm btn-quiet" type="button" onClick={() => void remove(m.id)}>
                      Stop sharing
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
