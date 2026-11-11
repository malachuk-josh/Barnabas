"use client";

import Link from "next/link";
import { useState } from "react";
import { Status, useOps } from "@/components/ops/client";
import { AA, contrast, onColor } from "@/lib/site/media";
import { AppSchema, FONTS, GiveSchema, PAGE_KIND_LABELS, SOCIAL_KINDS, SOCIAL_LABELS, ThemeSchema, type Announcement, type GiveSettings, type InboxMessage, type MemberApp, type SiteTheme } from "@/lib/site/types";
import { AreaField, Check, ImageField, TextField } from "./fields";

const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/* ---------- Publish ---------- */

export function PublishPanel({ published, publishedAt, publishedBy, changes, problems, previewUrl, liveUrl }: { published: boolean; publishedAt?: number; publishedBy?: string; changes: boolean; problems: string[]; previewUrl: string; liveUrl: string }) {
  const { act, busy, error, notice } = useOps("site");
  const [copied, setCopied] = useState(false);
  return (
    <section className={`fin-card se-publish ${published ? (changes ? "is-changed" : "is-live") : "is-draft"}`} aria-labelledby="pub-h">
      <div className="se-publish-head">
        <span className="se-publish-dot" aria-hidden="true" />
        <div>
          <h2 id="pub-h">{published ? (changes ? "Live, with changes not yet published" : "Live and up to date") : "Draft: not published yet"}</h2>
          <span className="small muted">{published ? (changes ? "Visitors still see the last published version." : "Visitors see exactly what's in the draft.") : "Only signed-in leaders can see it, and search engines are asked not to index it."}</span>
        </div>
      </div>
      <p className="small muted se-publish-detail">
        {published
          ? `Published ${publishedAt ? when(publishedAt) : ""}${publishedBy ? ` by ${publishedBy}` : ""}. Visitors see the published version; your edits stay in the draft until you publish again.`
          : "Until you publish, the site shows only to signed-in leaders and asks search engines not to index it."}
      </p>
      {problems.length > 0 && (
        <div className="notice" role="note">
          <strong>Before publishing:</strong>
          <ul className="se-problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="row se-publish-actions">
        <a className="btn" href="/s?preview=1" target="_blank" rel="noopener">
          Preview draft
        </a>
        {published && (
          <a className="btn" href={liveUrl} target="_blank" rel="noopener">
            View live site
          </a>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || problems.length > 0 || (published && !changes)}
          onClick={() => {
            if (window.confirm(published ? "Publish your changes to the live site?" : "Publish the website? It becomes public and search engines may index it.")) act({ action: "publish" }, () => "Published.");
          }}
        >
          {published ? "Publish changes" : "Publish site"}
        </button>
        {published && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => window.confirm("Take the site offline? Visitors will get a 'not found' page until you publish again.") && act({ action: "unpublish" }, () => "The site is offline.")}>
            Take offline
          </button>
        )}
      </div>
      <details className="se-preview-link">
        <summary>Share a preview link</summary>
        <p className="small muted">Anyone with this link can see the draft (not indexed). Making a new link turns the old one off.</p>
        <div className="row">
          <input type="text" readOnly value={previewUrl} aria-label="Preview link" onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className="btn se-small"
            onClick={async () => {
              await navigator.clipboard?.writeText(previewUrl).catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="btn se-small" disabled={busy} onClick={() => act({ action: "preview-link" }, () => "New preview link made; the old one no longer works.")}>
            New link
          </button>
        </div>
      </details>
      <Status error={error} notice={notice} />
    </section>
  );
}

/* ---------- Pages ---------- */

export type PageRow = { id: string; title: string; kind: keyof typeof PAGE_KIND_LABELS; slug: string; blocks: number; nav: boolean };

export function PagesList({ pages, base }: { pages: PageRow[]; base: string }) {
  const { act, busy, error, notice } = useOps("site");
  const [title, setTitle] = useState("");
  return (
    <section className="fin-card se-pages-card" aria-labelledby="pages-h">
      <div className="fin-card-head">
        <h2 id="pages-h">Pages</h2>
        <span className="small muted">
          {pages.length} {pages.length === 1 ? "page" : "pages"} · {pages.filter((p) => p.nav).length} in the menu
        </span>
      </div>
      <ul className="se-pages">
        {pages.map((p, i) => (
          <li key={p.id} className={p.kind === "home" ? "is-home" : undefined}>
            <span className="se-page-icon" aria-hidden="true">
              {p.kind === "home" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20Z" />
                  <path d="M14 3.5V8h4M10 12h5M10 15.5h5" />
                </svg>
              )}
            </span>
            <div className="se-page-text">
              <Link href={`/site/edit/${p.id}`} className="se-page-link">
                {p.title}
              </Link>
              <span className="se-page-meta">
                <code>
                  {base}/{p.slug}
                </code>
                <span>
                  {p.blocks} block{p.blocks === 1 ? "" : "s"}
                </span>
                {p.kind !== "home" && p.kind !== "custom" && PAGE_KIND_LABELS[p.kind] !== p.title && <span>{PAGE_KIND_LABELS[p.kind]}</span>}
                <span className={p.nav ? "se-in-menu" : "se-not-menu"}>{p.nav ? "In the menu" : "Not in the menu"}</span>
              </span>
            </div>
            <div className="se-page-actions">
              {p.kind !== "home" && (
                <span className="se-move" role="group" aria-label={`Move ${p.title}`}>
                  <button type="button" className="se-icon-btn" disabled={busy || i <= 1} onClick={() => act({ action: "move-page", id: p.id, dir: -1 })} aria-label={`Move ${p.title} up`}>
                    ↑
                  </button>
                  <button type="button" className="se-icon-btn" disabled={busy || i === pages.length - 1} onClick={() => act({ action: "move-page", id: p.id, dir: 1 })} aria-label={`Move ${p.title} down`}>
                    ↓
                  </button>
                </span>
              )}
              <Link className="btn se-small" href={`/site/edit/${p.id}`}>
                Edit
              </Link>
              {p.kind !== "home" && (
                <button type="button" className="se-remove" disabled={busy} onClick={() => window.confirm(`Remove the page "${p.title}"?`) && act({ action: "remove-page", id: p.id }, () => "Page removed from the draft.")} aria-label={`Remove ${p.title}`}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form
        className="row se-newpage"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) act({ action: "add-page", title }, () => `Added "${title}".`).then((out) => out && setTitle(""));
        }}
      >
        <label htmlFor="np-title" className="se-sr">
          New page title
        </label>
        <input id="np-title" type="text" placeholder="New page title, e.g. Kids ministry" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy || !title.trim()}>
          Add page
        </button>
      </form>
      <Status error={error} notice={notice} />
    </section>
  );
}

/* ---------- Theme ---------- */

const COLOR_LABELS: Record<keyof SiteTheme["colors"], string> = { primary: "Main color (buttons, links, footer)", accent: "Accent", background: "Page background", surface: "Cards", text: "Text" };

export function ThemeEditor({ theme: initial, uploads }: { theme: SiteTheme; uploads: boolean }) {
  const { act, busy, error, notice, setError } = useOps("site");
  const [t, setT] = useState<SiteTheme>(initial);
  const c = t.colors;
  const checks = [
    { label: "Text on background", ratio: contrast(c.text, c.background) },
    { label: "Text on cards", ratio: contrast(c.text, c.surface) },
    { label: "Button text on main color", ratio: contrast(onColor(c.primary), c.primary) },
    { label: "Links on background", ratio: contrast(c.primary, c.background) },
  ];
  return (
    <form
      className="se-theme"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = ThemeSchema.safeParse(t);
        if (!parsed.success) return setError(parsed.error.issues[0].message);
        act({ action: "save-theme", theme: parsed.data }, () => "Theme saved to the draft.");
      }}
    >
      <div className="se-theme-main">
      <section className="fin-card">
        <h2>Church</h2>
        <div className="form-row">
          <TextField label="Church name" value={t.churchName} max={100} required onChange={(churchName) => setT({ ...t, churchName })} />
          <TextField label="Tagline" value={t.tagline} max={140} onChange={(tagline) => setT({ ...t, tagline })} />
        </div>
        <ImageField label="Logo (optional)" optional value={t.logo} uploads={uploads} onChange={(logo) => setT({ ...t, logo })} />
      </section>
      <section className="fin-card">
        <h2>Colors</h2>
        <p className="small muted">Starts from the Barnabas palette. The preview beside the form shows them together, with the contrast checks.</p>
        <div className="se-colors">
          {(Object.keys(COLOR_LABELS) as (keyof SiteTheme["colors"])[]).map((k) => (
            <div key={k} className="field se-color">
              <label htmlFor={`col-${k}`}>{COLOR_LABELS[k]}</label>
              <div className="row">
                <input id={`col-${k}`} type="color" value={c[k].toLowerCase()} onChange={(e) => setT({ ...t, colors: { ...c, [k]: e.target.value.toUpperCase() } })} />
                <input type="text" aria-label={`${COLOR_LABELS[k]} hex`} value={c[k]} maxLength={7} onChange={(e) => setT({ ...t, colors: { ...c, [k]: e.target.value } })} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="fin-card">
        <h2>Fonts</h2>
        <div className="form-row">
          {(["heading", "body"] as const).map((k) => (
            <div key={k} className="field">
              <label htmlFor={`font-${k}`}>{k === "heading" ? "Headings" : "Text"}</label>
              <select id={`font-${k}`} className="se-select" value={t.fonts[k]} onChange={(e) => setT({ ...t, fonts: { ...t.fonts, [k]: e.target.value } })}>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
      <section className="fin-card">
        <h2>Footer and contact</h2>
        <div className="form-row">
          <TextField label="Address" value={t.footer.address} max={200} onChange={(address) => setT({ ...t, footer: { ...t.footer, address } })} />
          <TextField label="Phone" type="tel" value={t.footer.phone} max={40} onChange={(phone) => setT({ ...t, footer: { ...t.footer, phone } })} />
        </div>
        <div className="form-row">
          <TextField label="Email" type="email" value={t.footer.email} max={200} onChange={(email) => setT({ ...t, footer: { ...t.footer, email } })} />
          <TextField label="Footer note" value={t.footer.text} max={300} onChange={(text) => setT({ ...t, footer: { ...t.footer, text } })} />
        </div>
        <h3>Social links</h3>
        {t.social.map((s, i) => (
          <div key={i} className="row se-social">
            <label className="se-sr" htmlFor={`soc-${i}`}>
              Network
            </label>
            <select id={`soc-${i}`} className="se-select" value={s.kind} onChange={(e) => setT({ ...t, social: t.social.map((x, j) => (j === i ? { ...x, kind: e.target.value as typeof s.kind } : x)) })}>
              {SOCIAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SOCIAL_LABELS[k]}
                </option>
              ))}
            </select>
            <input type="text" aria-label={`${SOCIAL_LABELS[s.kind]} address`} placeholder="https://…" value={s.url} onChange={(e) => setT({ ...t, social: t.social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
            <button type="button" className="btn btn-danger se-small" onClick={() => setT({ ...t, social: t.social.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
        {t.social.length < 8 && (
          <button type="button" className="btn se-small" onClick={() => setT({ ...t, social: [...t.social, { kind: "facebook", url: "" }] })}>
            Add a social link
          </button>
        )}
        <p className="small muted">Navigation comes from your pages: reorder them on Pages, and untick &quot;Show in the menu&quot; on a page to leave it out.</p>
      </section>
      </div>
      <aside className="se-theme-side" aria-label="Preview">
        <div className="se-site-mock" style={{ background: c.background, color: c.text, fontFamily: `"${t.fonts.body}", sans-serif` }}>
          <div className="se-mock-bar" style={{ background: c.primary, color: onColor(c.primary) }}>
            <span style={{ fontFamily: `"${t.fonts.heading}", serif` }}>{t.churchName || "Your church"}</span>
            <span className="se-mock-nav" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="se-mock-hero">
            <span className="se-mock-h" style={{ fontFamily: `"${t.fonts.heading}", serif` }}>
              Welcome home
            </span>
            {t.tagline && <span className="se-mock-tag">{t.tagline}</span>}
            <span>
              Body text looks like this, with a <span style={{ color: c.primary, textDecoration: "underline" }}>link</span>.
            </span>
            <span className="se-swatch-btn" style={{ background: c.primary, color: onColor(c.primary) }}>
              Plan a visit
            </span>
          </div>
          <div className="se-mock-card" style={{ background: c.surface, color: c.text, borderColor: c.accent }}>
            <span style={{ fontFamily: `"${t.fonts.heading}", serif` }}>Sunday worship</span>
            <span className="se-mock-small">A card, with the accent along its edge.</span>
          </div>
        </div>
        <section className="se-contrast-card" aria-labelledby="contrast-h">
          <h3 id="contrast-h">Readable for everyone</h3>
          <p className="small muted">Each pair must reach WCAG AA contrast ({AA}:1) before publishing.</p>
          <ul className="se-contrast">
            {checks.map((x) => (
              <li key={x.label} className={x.ratio >= AA ? "is-pass" : "is-fail"}>
                <span>{x.label}</span>
                <span className="tabular">
                  {x.ratio.toFixed(1)}:1 {x.ratio >= AA ? "✓" : "Too faint"}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <button className="btn btn-primary se-theme-save" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save theme"}
        </button>
        <Status error={error} notice={notice} />
      </aside>
    </form>
  );
}

/* ---------- Member app, giving, announcements ---------- */

export function AppEditor({ app: initial, give: initialGive, uploads }: { app: MemberApp; give: GiveSettings; uploads: boolean }) {
  const { act, busy, error, notice, setError } = useOps("site");
  const [app, setApp] = useState<MemberApp>(initial);
  const [give, setGive] = useState<GiveSettings>(initialGive);
  const tab = (k: keyof MemberApp["tabs"], label: string) => <Check label={label} checked={app.tabs[k]} onChange={(v) => setApp({ ...app, tabs: { ...app.tabs, [k]: v } })} />;
  return (
    <div className="fin-stack">
      <form
        className="fin-card"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = AppSchema.safeParse(app);
          if (!parsed.success) return setError(parsed.error.issues[0].message);
          act({ action: "save-app", app: parsed.data }, () => "Member app settings saved to the draft. Publish to update the app.");
        }}
      >
        <h2>Member app</h2>
        <div className="form-row">
          <TextField label="App name" value={app.name} max={45} required onChange={(name) => setApp({ ...app, name })} />
          <TextField label="Home-screen name" value={app.shortName} max={12} required hint="12 letters or fewer." onChange={(shortName) => setApp({ ...app, shortName })} />
        </div>
        <ImageField
          label="App icon (optional, square)"
          optional
          decorative
          value={app.icon ? { url: app.icon, alt: "App icon" } : undefined}
          uploads={uploads}
          onChange={(v) => setApp({ ...app, icon: v?.url ?? "" })}
        />
        <p className="small muted">Without an icon, one is drawn from the church&apos;s initials in the main color.</p>
        <AreaField label="Welcome line on the Home tab" value={app.welcome} max={300} rows={2} onChange={(welcome) => setApp({ ...app, welcome })} />
        <fieldset className="se-radios">
          <legend>Tabs (Home always shows)</legend>
          {tab("events", "Events")}
          {tab("sermons", "Sermons")}
          {tab("give", "Give")}
          {tab("connect", "Connect (plan a visit, prayer, contact)")}
        </fieldset>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Save app settings
        </button>
      </form>
      <form
        className="fin-card"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = GiveSchema.safeParse(give);
          if (!parsed.success) return setError(parsed.error.issues[0].message);
          act({ action: "save-give", give: parsed.data }, () => "Giving saved to the draft.");
        }}
      >
        <h2>Giving</h2>
        <p className="small muted">Online giving through Stripe comes later. For now, link your existing giving page, or leave it empty to show &quot;Online giving is coming soon&quot;.</p>
        <TextField label="Giving page link" type="url" value={give.url} max={500} placeholder="https://…" onChange={(url) => setGive({ ...give, url })} />
        <TextField label="Note under the button" value={give.note} max={300} onChange={(note) => setGive({ ...give, note })} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Save giving
        </button>
      </form>
      <Status error={error} notice={notice} />
    </div>
  );
}

export function Announcements({ items, pushReady, devices, published }: { items: Announcement[]; pushReady: boolean; devices: number; published: boolean }) {
  const { act, busy, error, notice } = useOps("site");
  const [f, setF] = useState({ title: "", body: "", expiresOn: "" });
  return (
    <section className="fin-card" aria-labelledby="ann-h">
      <h2 id="ann-h">Announcements</h2>
      <p className="small muted">Announcements show right away on the member app&apos;s Home tab and in &quot;latest announcement&quot; blocks. Barnabas can draft one too; it asks you before posting.</p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!window.confirm(`Post "${f.title}" to the member app and website now?`)) return;
          act({ action: "announce", announcement: { title: f.title, body: f.body, expiresOn: f.expiresOn || undefined } }, () => "Announcement posted.").then((out) => out && setF({ title: "", body: "", expiresOn: "" }));
        }}
      >
        <TextField label="Title" value={f.title} max={80} required onChange={(title) => setF({ ...f, title })} />
        <AreaField label="Announcement" value={f.body} max={500} rows={3} onChange={(body) => setF({ ...f, body })} />
        <TextField label="Stop showing after (optional)" type="date" value={f.expiresOn} onChange={(expiresOn) => setF({ ...f, expiresOn })} />
        <div>
          <button className="btn btn-primary" type="submit" disabled={busy || !f.title.trim() || !f.body.trim()}>
            Post announcement
          </button>
        </div>
      </form>
      {!pushReady && <p className="notice small">Push notifications aren&apos;t set up (no VAPID keys). Announcements still show in the app; see the README to turn on notifications.</p>}
      {pushReady && <p className="small muted">{devices} device{devices === 1 ? "" : "s"} signed up for notifications.</p>}
      <ul className="se-ann">
        {items.map((a) => (
          <li key={a.id}>
            <div>
              <strong>{a.title}</strong>
              <p className="small">{a.body}</p>
              <span className="small muted">
                {when(a.publishedAt)} by {a.by}
                {a.expiresOn ? ` · until ${a.expiresOn}` : ""}
                {a.pushedAt ? ` · notification sent ${when(a.pushedAt)}` : ""}
              </span>
            </div>
            <div className="row">
              {pushReady && !a.pushedAt && (
                <button
                  type="button"
                  className="btn se-small"
                  disabled={busy || !published || devices === 0}
                  title={!published ? "Publish the site first" : devices === 0 ? "No one has signed up yet" : undefined}
                  onClick={() => window.confirm(`Send "${a.title}" as a notification to ${devices} device${devices === 1 ? "" : "s"}? This can't be undone.`) && act({ action: "push", id: a.id, confirm: "SEND" }, (out: { sent?: number }) => `Sent to ${out.sent ?? 0} device(s).`)}
                >
                  Send notification
                </button>
              )}
              <button type="button" className="btn btn-danger se-small" disabled={busy} onClick={() => window.confirm("Remove this announcement?") && act({ action: "announce-remove", id: a.id }, () => "Removed.")}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!items.length && <p className="muted small">No announcements yet.</p>}
      <Status error={error} notice={notice} />
    </section>
  );
}

/* ---------- Inbox ---------- */

export function InboxList({ messages }: { messages: InboxMessage[] }) {
  const { act, busy, error, notice } = useOps("site");
  const [show, setShow] = useState<"open" | "all">("open");
  const list = messages.filter((m) => show === "all" || !m.handledAt);
  return (
    <section className="fin-stack">
      <div className="seg" role="group" aria-label="Show">
        <button type="button" aria-pressed={show === "open"} onClick={() => setShow("open")}>
          Waiting ({messages.filter((m) => !m.handledAt).length})
        </button>
        <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")}>
          All ({messages.length})
        </button>
      </div>
      {list.length ? (
        <ul className="se-inbox">
          {list.map((m) => (
            <li key={m.id} className="fin-card">
              <div className="fin-card-head">
                <h3>{m.name}</h3>
                <span className="small muted">{when(m.createdAt)}</span>
              </div>
              <p className="se-msg">{m.message}</p>
              <p className="small">
                {m.email && <a href={`mailto:${m.email}`}>{m.email}</a>}
                {m.email && m.phone ? " · " : ""}
                {m.phone && <a href={`tel:${m.phone.replace(/[^0-9+]/g, "")}`}>{m.phone}</a>}
                {m.page ? <span className="muted"> · from {m.page === "app" ? "the member app" : `/${m.page}`}</span> : null}
              </p>
              {m.personId && (
                <p className="small">
                  <Link href={`/people/${m.personId}`}>Matches someone in People</Link>
                </p>
              )}
              {m.draftId && (
                <p className="small">
                  A reply is waiting in <Link href="/drafts">Drafts</Link>.
                </p>
              )}
              <div className="row">
                <button type="button" className="btn se-small" disabled={busy} onClick={() => act({ action: "inbox-mark", id: m.id, handled: !m.handledAt })}>
                  {m.handledAt ? "Mark as waiting" : "Mark as answered"}
                </button>
                <button type="button" className="btn btn-danger se-small" disabled={busy} onClick={() => window.confirm("Delete this message?") && act({ action: "inbox-delete", id: m.id })}>
                  Delete
                </button>
              </div>
              {m.handledAt && <span className="small muted">Answered by {m.handledBy}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{show === "open" ? "No messages waiting." : "No messages yet. Contact forms on the website and member app send messages here."}</p>
      )}
      <Status error={error} notice={notice} />
    </section>
  );
}

/* ---------- History ---------- */

export function HistoryList({ versions }: { versions: { id: string; at: number; by: string; label: string; kind: string; pages: number }[] }) {
  const { act, busy, error, notice } = useOps("site");
  return (
    <section className="fin-card">
      <h2>Version history</h2>
      <p className="small muted">The last 25 saves, publishes and restores. Restoring copies a version into the draft; publish to make it live.</p>
      {versions.length ? (
        <ol className="se-history">
          {versions.map((v, i) => (
            <li key={v.id}>
              <div>
                <strong>{v.label}</strong> <span className={`pill ${v.kind === "publish" ? "pill-ok" : "pill-watch"}`}>{v.kind === "publish" ? "Published" : v.kind === "restore" ? "Restored" : "Draft"}</span>
                <br />
                <span className="small muted">
                  {when(v.at)} · {v.by} · {v.pages} pages
                </span>
              </div>
              {i > 0 && (
                <button type="button" className="btn se-small" disabled={busy} onClick={() => window.confirm("Restore this version into the draft? Your current draft is kept in the history.") && act({ action: "restore", id: v.id }, () => "Restored into the draft.")}>
                  Restore
                </button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No versions yet. Each save and publish is kept here.</p>
      )}
      <Status error={error} notice={notice} />
    </section>
  );
}
