"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { defaultBlock } from "@/lib/site/defaults";
import { parseVideo } from "@/lib/site/media";
import { BLOCK_HINTS, BLOCK_LABELS, BLOCK_TYPES, PageSchema, type Block, type BlockOf, type BlockType, type SitePage } from "@/lib/site/types";
import { AreaField, Check, ImageField, NumberField, RichTextField, TextField } from "./fields";

export type LeaderOption = { name: string; title: string; suggestedBio: string };

type Props = { page: SitePage; uploads: boolean; leaders: LeaderOption[]; address: string; previewHref: string; published: boolean };

/** The block editor for one page: add, reorder, edit and remove blocks, validated with zod before saving. */
export function PageEditor({ page: initial, uploads, leaders, address, previewHref }: Props) {
  const router = useRouter();
  const [page, setPage] = useState<SitePage>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState<BlockType>("richtext");

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (next: SitePage) => {
    setPage(next);
    setDirty(true);
    setNotice(null);
  };
  const setBlock = (i: number, b: Block) => change({ ...page, blocks: page.blocks.map((x, j) => (j === i ? b : x)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= page.blocks.length) return;
    const blocks = [...page.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    change({ ...page, blocks });
    requestAnimationFrame(() => document.getElementById(`blk-${blocks[j].id}`)?.focus());
  };
  const remove = (i: number) => {
    if (!window.confirm(`Remove this ${BLOCK_LABELS[page.blocks[i].type].toLowerCase()} block?`)) return;
    change({ ...page, blocks: page.blocks.filter((_, j) => j !== i) });
  };
  const add = (type: BlockType = adding) => {
    const b = defaultBlock(type, address);
    change({ ...page, blocks: [...page.blocks, b] });
    requestAnimationFrame(() => document.getElementById(`blk-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  async function save() {
    setError(null);
    setNotice(null);
    const parsed = PageSchema.safeParse(page);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const at = issue.path[0] === "blocks" && typeof issue.path[1] === "number" ? ` (block ${issue.path[1] + 1}, ${BLOCK_LABELS[page.blocks[issue.path[1]]?.type ?? "richtext"]})` : "";
      setError(`${issue.message}${at}`);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-page", page: parsed.data }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "That didn't save.");
    const saved = json.doc?.pages?.find((p: SitePage) => p.id === page.id);
    if (saved) setPage(saved);
    setDirty(false);
    setNotice("Saved to the draft. Publish from Pages when you're ready.");
    router.refresh();
  }

  const jump = (id: string) => {
    const el = document.getElementById(`blk-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  };

  return (
    <div className="se-editor">
      <div className="se-bar" role="region" aria-label="Page actions">
        <span className="small muted" aria-live="polite">
          {dirty ? "Unsaved changes" : "All changes saved to the draft"}
        </span>
        <div className="row">
          <a className="btn" href={previewHref} target="_blank" rel="noopener">
            Preview
          </a>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>
      {error && (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <div className="se-layout">
        <div className="se-main">
      <section className="fin-card" aria-labelledby="pg-settings">
        <h2 id="pg-settings">Page settings</h2>
        <div className="form-row">
          <TextField label="Title" value={page.title} max={80} required onChange={(title) => change({ ...page, title })} />
          {page.kind === "home" ? (
            <p className="small muted se-home-addr">The home page lives at the site&apos;s main address.</p>
          ) : (
            <TextField label="Address" value={page.slug} max={60} hint="Lowercase letters, numbers and hyphens, like plan-a-visit." onChange={(slug) => change({ ...page, slug: slug.toLowerCase().replace(/\s+/g, "-") })} />
          )}
        </div>
        <AreaField label="Search description" value={page.description} max={300} rows={2} hint="One or two sentences shown in search results and link previews." onChange={(description) => change({ ...page, description })} />
        <Check label="Show this page in the site's menu" checked={page.nav} onChange={(nav) => change({ ...page, nav })} />
      </section>

      <ol className="se-blocks" data-no-pull>
        {page.blocks.map((b, i) => (
          <li key={b.id} className="se-block fin-card">
            <div className="se-block-head">
              <span className="se-block-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="se-block-title">
                <h3 id={`blk-${b.id}`} tabIndex={-1}>
                  <span className="se-sr">{i + 1}. </span>
                  {BLOCK_LABELS[b.type]}
                </h3>
                <p className="small muted">{BLOCK_HINTS[b.type]}</p>
              </div>
              <div className="se-block-actions">
                <span className="se-move" role="group" aria-label={`Move ${BLOCK_LABELS[b.type]}`}>
                  <button type="button" className="se-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${BLOCK_LABELS[b.type]} up`}>
                    ↑
                  </button>
                  <button type="button" className="se-icon-btn" onClick={() => move(i, 1)} disabled={i === page.blocks.length - 1} aria-label={`Move ${BLOCK_LABELS[b.type]} down`}>
                    ↓
                  </button>
                </span>
                <button type="button" className="se-remove" onClick={() => remove(i)} aria-label={`Remove ${BLOCK_LABELS[b.type]}`}>
                  Remove
                </button>
              </div>
            </div>
            <BlockForm block={b} onChange={(nb) => setBlock(i, nb)} uploads={uploads} leaders={leaders} />
          </li>
        ))}
      </ol>
      {!page.blocks.length && <p className="muted">This page is empty. Add a block below.</p>}

      <section className="fin-card se-add" aria-labelledby="add-h">
        <h2 id="add-h">Add a block</h2>
        <p className="small muted">It goes at the end of the page; move it up from there.</p>
        <div className="se-add-grid">
          {BLOCK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="se-add-tile"
              disabled={page.blocks.length >= 40}
              onClick={() => {
                setAdding(t);
                add(t);
              }}
            >
              <strong>{BLOCK_LABELS[t]}</strong>
              <span>{BLOCK_HINTS[t]}</span>
            </button>
          ))}
        </div>
      </section>
        </div>
        <aside className="se-outline" aria-label="On this page">
          <div className="se-outline-card">
            <p className="se-outline-label">On this page</p>
            {page.blocks.length ? (
              <ol>
                {page.blocks.map((b, i) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => jump(b.id)}>
                      <span className="se-outline-num">{i + 1}</span>
                      {BLOCK_LABELS[b.type]}
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="small muted">No blocks yet.</p>
            )}
            <a className="se-outline-add" href="#add-h">
              + Add a block
            </a>
          </div>
        </aside>
      </div>
      <p className="small">
        <Link href="/site">Back to pages</Link>
      </p>
    </div>
  );
}

function BlockForm({ block, onChange, uploads, leaders }: { block: Block; onChange: (b: Block) => void; uploads: boolean; leaders: LeaderOption[] }) {
  const set = <T extends Block>(b: T, patch: Partial<T>) => onChange({ ...b, ...patch } as Block);
  switch (block.type) {
    case "hero":
      return <HeroForm b={block} onChange={onChange} uploads={uploads} />;
    case "richtext":
      return <RichTextField label="Text" value={block.html} onChange={(html) => set(block, { html })} />;
    case "image":
      return (
        <>
          <ImageField label="Image" value={block.image} uploads={uploads} onChange={(image) => set(block, { image: image ?? { url: "", alt: "" } })} />
          <TextField label="Caption" value={block.caption} max={200} onChange={(caption) => set(block, { caption })} />
          <Check label="Full width" checked={block.wide} onChange={(wide) => set(block, { wide })} />
        </>
      );
    case "columns":
      return (
        <div className="se-cols">
          {block.columns.map((c, i) => (
            <div key={i} className="stack">
              <TextField label={`Column ${i + 1} heading`} value={c.heading} max={120} onChange={(heading) => set(block, { columns: block.columns.map((x, j) => (j === i ? { ...x, heading } : x)) })} />
              <RichTextField label={`Column ${i + 1} text`} value={c.html} onChange={(html) => set(block, { columns: block.columns.map((x, j) => (j === i ? { ...x, html } : x)) })} />
              <ImageField label={`Column ${i + 1} image (optional)`} optional value={c.image} uploads={uploads} onChange={(image) => set(block, { columns: block.columns.map((x, j) => (j === i ? { ...x, image } : x)) })} />
            </div>
          ))}
        </div>
      );
    case "service_times":
      return (
        <>
          <TextField label="Heading" value={block.heading} max={120} onChange={(heading) => set(block, { heading })} />
          <TextField label="Note under the times" value={block.note} max={300} onChange={(note) => set(block, { note })} />
          <p className="small muted">The times come from the church&apos;s weekly schedule, so they stay current.</p>
        </>
      );
    case "events":
      return (
        <>
          <TextField label="Heading" value={block.heading} max={120} onChange={(heading) => set(block, { heading })} />
          <div className="form-row">
            <NumberField label="How many" value={block.limit} min={1} max={12} onChange={(limit) => set(block, { limit })} />
            <Check label="Only events that take registration" checked={block.registrationOnly} onChange={(registrationOnly) => set(block, { registrationOnly })} />
          </div>
          <p className="small muted">From Events and the church calendar. Events with an open registration get a Register button.</p>
        </>
      );
    case "leadership":
      return <LeadershipForm b={block} onChange={onChange} leaders={leaders} />;
    case "sermons":
      return (
        <>
          <TextField label="Heading" value={block.heading} max={120} onChange={(heading) => set(block, { heading })} />
          <NumberField label="How many" value={block.limit} min={1} max={12} onChange={(limit) => set(block, { limit })} />
          <p className="small muted">Series and who&apos;s preaching come from Services. Passages show as references.</p>
        </>
      );
    case "visit":
      return (
        <>
          <TextField label="Heading" value={block.heading} max={120} onChange={(heading) => set(block, { heading })} />
          <AreaField label="What to expect" value={block.text} max={600} onChange={(text) => set(block, { text })} />
          <Check label="Include the guest card (goes to Shepherding → Guests)" checked={block.showForm} onChange={(showForm) => set(block, { showForm })} />
        </>
      );
    case "give":
      return (
        <>
          <TextField label="Heading" value={block.heading} max={120} onChange={(heading) => set(block, { heading })} />
          <AreaField label="Text" value={block.text} max={400} onChange={(text) => set(block, { text })} />
          <TextField label="Button label" value={block.buttonLabel} max={40} onChange={(buttonLabel) => set(block, { buttonLabel })} />
          <p className="small muted">
            The button goes to the giving link set under <Link href="/site/app">Member app and giving</Link>. Without one, it says online giving is coming soon.
          </p>
        </>
      );
    case "contact":
      return (
        <>
          <TextField label="Heading" value={block.heading} max={120} onChange={(heading) => set(block, { heading })} />
          <AreaField label="Text" value={block.text} max={400} onChange={(text) => set(block, { text })} />
          <Check label="Also draft a reply in Drafts for review (nothing is sent)" checked={block.toDrafts} onChange={(toDrafts) => set(block, { toDrafts })} />
          <p className="small muted">Messages arrive in the website inbox.</p>
        </>
      );
    case "map":
      return (
        <>
          <TextField label="Heading" value={block.heading} max={120} onChange={(heading) => set(block, { heading })} />
          <TextField label="Address" value={block.address} max={200} required onChange={(address) => set(block, { address })} />
        </>
      );
    case "video": {
      const ok = block.url ? Boolean(parseVideo(block.url)) : true;
      return (
        <>
          <TextField label="Heading" value={block.heading} max={120} onChange={(heading) => set(block, { heading })} />
          <TextField label="YouTube or Vimeo link" type="url" value={block.url} max={300} required hint={ok ? "Only YouTube and Vimeo videos can be embedded." : "That isn't a YouTube or Vimeo link."} onChange={(url) => set(block, { url })} />
          <TextField label="Video title" value={block.title} max={120} required hint="Screen readers announce this." onChange={(title) => set(block, { title })} />
        </>
      );
    }
    case "announcement":
      return (
        <>
          <fieldset className="se-radios">
            <legend>Show</legend>
            <label className="check">
              <input type="radio" name={`src-${block.id}`} checked={block.source === "latest"} onChange={() => set(block, { source: "latest" })} />
              The latest announcement (from Member app and giving)
            </label>
            <label className="check">
              <input type="radio" name={`src-${block.id}`} checked={block.source === "text"} onChange={() => set(block, { source: "text" })} />
              This text
            </label>
          </fieldset>
          {block.source === "text" && <AreaField label="Announcement" value={block.text} max={400} onChange={(text) => set(block, { text })} />}
          <LinkFields value={block.link} onChange={(link) => set(block, { link })} />
        </>
      );
  }
}

function LinkFields({ value, onChange }: { value: { label: string; href: string } | undefined; onChange: (v: { label: string; href: string } | undefined) => void }) {
  const v = value ?? { label: "", href: "" };
  const set = (n: typeof v) => onChange(!n.label && !n.href ? undefined : n);
  return (
    <div className="form-row">
      <TextField label="Link label (optional)" value={v.label} max={40} onChange={(label) => set({ ...v, label })} />
      <TextField label="Link to" value={v.href} max={500} placeholder="/events or https://…" onChange={(href) => set({ ...v, href })} />
    </div>
  );
}

function HeroForm({ b, onChange, uploads }: { b: BlockOf<"hero">; onChange: (b: Block) => void; uploads: boolean }) {
  return (
    <>
      <TextField label="Heading" value={b.heading} max={120} required onChange={(heading) => onChange({ ...b, heading })} />
      <AreaField label="Text" value={b.text} max={400} rows={2} onChange={(text) => onChange({ ...b, text })} />
      <ImageField label="Picture (optional)" optional value={b.image} uploads={uploads} onChange={(image) => onChange({ ...b, image })} />
      <fieldset className="se-buttons">
        <legend>Buttons</legend>
        {b.buttons.map((btn, i) => (
          <div key={i} className="se-button-row">
            <TextField label={`Button ${i + 1} label`} value={btn.label} max={40} onChange={(label) => onChange({ ...b, buttons: b.buttons.map((x, j) => (j === i ? { ...x, label } : x)) })} />
            <TextField label="Link to" value={btn.href} max={500} placeholder="/visit or https://…" onChange={(href) => onChange({ ...b, buttons: b.buttons.map((x, j) => (j === i ? { ...x, href } : x)) })} />
            <div className="field">
              <label htmlFor={`st-${b.id}-${i}`}>Style</label>
              <select id={`st-${b.id}-${i}`} className="se-select" value={btn.style} onChange={(e) => onChange({ ...b, buttons: b.buttons.map((x, j) => (j === i ? { ...x, style: e.target.value as "primary" | "secondary" } : x)) })}>
                <option value="primary">Filled</option>
                <option value="secondary">Outline</option>
              </select>
            </div>
            <button type="button" className="btn btn-danger se-small" onClick={() => onChange({ ...b, buttons: b.buttons.filter((_, j) => j !== i) })}>
              Remove button
            </button>
          </div>
        ))}
        {b.buttons.length < 3 && (
          <button type="button" className="btn se-small" onClick={() => onChange({ ...b, buttons: [...b.buttons, { label: "", href: "/", style: b.buttons.length ? "secondary" : "primary" }] })}>
            Add a button
          </button>
        )}
      </fieldset>
    </>
  );
}

function LeadershipForm({ b, onChange, leaders }: { b: BlockOf<"leadership">; onChange: (b: Block) => void; leaders: LeaderOption[] }) {
  const bioOf = (name: string) => b.bios.find((x) => x.name === name)?.bio ?? "";
  const setBio = (name: string, bio: string) => onChange({ ...b, bios: [...b.bios.filter((x) => x.name !== name), { name, bio }].sort((x, y) => leaders.findIndex((l) => l.name === x.name) - leaders.findIndex((l) => l.name === y.name)) });
  return (
    <>
      <TextField label="Heading" value={b.heading} max={120} onChange={(heading) => onChange({ ...b, heading })} />
      <AreaField label="Introduction" value={b.intro} max={400} rows={2} onChange={(intro) => onChange({ ...b, intro })} />
      <Check label="Show website bios" checked={b.showBios} onChange={(showBios) => onChange({ ...b, showBios })} />
      <p className="small muted">Names and titles come from the church&apos;s leadership list. Only the website bios below are shown publicly; notes in church records never are.</p>
      {b.showBios &&
        leaders.map((l) => (
          <div key={l.name} className="se-bio">
            <AreaField label={`${l.name}, ${l.title}`} value={bioOf(l.name)} max={800} rows={3} onChange={(bio) => setBio(l.name, bio)} />
            {l.suggestedBio && bioOf(l.name) !== l.suggestedBio && (
              <button type="button" className="btn se-small" onClick={() => setBio(l.name, l.suggestedBio)}>
                Use the published bio
              </button>
            )}
          </div>
        ))}
    </>
  );
}
