"use client";

import { useEffect, useState } from "react";
import { EFFORT_CHOICES, MODEL_CHOICES, toneLabel, type AiSettingsView } from "@/lib/ai/choices";

const label = (id: string) => MODEL_CHOICES.find((m) => m.id === id)?.label ?? id;
const effortLabel = (id: string) => EFFORT_CHOICES.find((e) => e.id === id)?.label ?? id;

/**
 * Settings → Barnabas and voice (embedded, inside the profile form, so no nested <form>) or a card of its own.
 */
function Wrap({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  if (embedded)
    return (
      <div id="ai" className="stack" style={{ gap: 12 }}>
        <h3 className="settings-group">How Barnabas thinks (admins)</h3>
        {children}
      </div>
    );
  return (
    <section id="ai" className="card stack ai-card">
      <div className="settings-head">
        <h2>
          Barnabas for everyone <span className="ai-admin-tag">Admins only</span>
        </h2>
      </div>
      {children}
    </section>
  );
}

function Form({ embedded, onSave, children }: { embedded: boolean; onSave: (e?: React.FormEvent) => Promise<void>; children: React.ReactNode }) {
  if (embedded) return <div className="stack">{children}</div>;
  return (
    <form className="stack" onSubmit={(e) => void onSave(e)}>
      {children}
    </form>
  );
}

/** Settings → Barnabas AI (admins): which Claude model answers typed and spoken messages. */
export function AiSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [form, setForm] = useState({ textModel: "", voiceModel: "", textEffort: "", voiceEffort: "" });
  const [web, setWeb] = useState({ on: false, domains: "" });
  // null = his usual tone
  const [tone, setTone] = useState<number | null>(null);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = (v: AiSettingsView) => {
    setView(v);
    setForm({ textModel: v.chosen.textModel ? v.textModel : "", voiceModel: v.chosen.voiceModel ? v.voiceModel : "", textEffort: v.chosen.textEffort ? v.textEffort : "", voiceEffort: v.chosen.voiceEffort ? v.voiceEffort : "" });
    setWeb({ on: v.webSearch, domains: v.webDomains.join("\n") });
    setTone(v.chosen.tone ? v.tone : null);
  };

  useEffect(() => {
    fetch("/api/admin/ai")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && load(v))
      .catch(() => {});
  }, []);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setState(null);
    const res = await fetch("/api/admin/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textModel: form.textModel || null, voiceModel: form.voiceModel || null, textEffort: form.textEffort || null, voiceEffort: form.voiceEffort || null, tone, webSearch: web.on, webDomains: web.domains.split(/[\s,]+/).map((d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean) }),
    });
    setSaving(false);
    if (res.ok) {
      load(await res.json());
      setState({ ok: true, text: "Saved. Barnabas uses these from the next message, for everyone in the church." });
    } else {
      setState({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save." });
    }
  }

  return (
    <Wrap embedded={embedded}>
      <p className="muted small">Which Claude model answers, how much he thinks first, and his tone, for everyone in the church. Only administrators see this.</p>
      {!view && <p className="muted">Loading…</p>}
      {view && (
        <Form embedded={embedded} onSave={save}>
          <div className="ai-grid">
          <div className="field">
            <label htmlFor="ai-text">Typed messages</label>
            <select id="ai-text" value={form.textModel} onChange={(e) => setForm({ ...form, textModel: e.target.value })}>
              <option value="">Default ({label(view.defaults.textModel)})</option>
              {MODEL_CHOICES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="small muted">{MODEL_CHOICES.find((m) => m.id === (form.textModel || view.defaults.textModel))?.note}</span>
          </div>
          <div className="field">
            <label htmlFor="ai-effort">Thinking on typed messages</label>
            <select id="ai-effort" value={form.textEffort} onChange={(e) => setForm({ ...form, textEffort: e.target.value })}>
              <option value="">Default ({effortLabel(view.defaults.textEffort)})</option>
              {EFFORT_CHOICES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <span className="small muted">{EFFORT_CHOICES.find((x) => x.id === (form.textEffort || view.defaults.textEffort))?.note}</span>
          </div>
          <div className="field">
            <label htmlFor="ai-voice">Spoken messages</label>
            <select id="ai-voice" value={form.voiceModel} onChange={(e) => setForm({ ...form, voiceModel: e.target.value })}>
              <option value="">Default ({label(view.defaults.voiceModel)})</option>
              {MODEL_CHOICES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="small muted">
              {MODEL_CHOICES.find((m) => m.id === (form.voiceModel || view.defaults.voiceModel))?.note}
            </span>
          </div>
          <div className="field">
            <label htmlFor="ai-voice-effort">Thinking on spoken messages</label>
            <select id="ai-voice-effort" value={form.voiceEffort} onChange={(e) => setForm({ ...form, voiceEffort: e.target.value })}>
              <option value="">Default ({effortLabel(view.defaults.voiceEffort)})</option>
              {EFFORT_CHOICES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <span className="small muted">
              {EFFORT_CHOICES.find((x) => x.id === (form.voiceEffort || view.defaults.voiceEffort))?.note} More thinking means a longer pause before Barnabas starts speaking.
            </span>
          </div>
          </div>
          <div className="field">
            <label htmlFor="ai-tone">
              Tone: {toneLabel(tone ?? view.defaults.tone)}
              {tone === null && <span className="muted small"> (default)</span>}
            </label>
            <input id="ai-tone" type="range" min={0} max={1} step={0.05} value={tone ?? view.defaults.tone} onChange={(e) => setTone(Number(e.target.value))} />
            <div className="row small muted" style={{ justifyContent: "space-between" }}>
              <span>Plain and steady</span>
              <span>Very warm</span>
            </div>
            <span className="small muted">
              How warm and encouraging his words are, typed and spoken. He stays honest, never flatters, and is always gentle in hard moments. Takes effect from his next reply.
              {tone !== null && (
                <>
                  {" "}
                  <button type="button" className="linklike" onClick={() => setTone(null)}>
                    Use his usual tone
                  </button>
                </>
              )}
            </span>
          </div>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="label" style={{ fontWeight: 700 }}>The web</legend>
            <label className="check">
              <input id="ai-web" type="checkbox" checked={web.on} onChange={(e) => setWeb({ ...web, on: e.target.checked })} />
              Let Barnabas search the web and read web pages
            </label>
            <span className="small muted">
              For current or outside information: a resource, a song&apos;s details, a local organization. He names his sources, never puts anyone&apos;s name or private details into a search, and always quotes scripture from the Bible, not websites. Searches cost about $10 per 1,000.
            </span>
            {web.on && (
              <div className="field">
                <label htmlFor="ai-web-domains">Only these sites (optional)</label>
                <textarea id="ai-web-domains" rows={3} value={web.domains} onChange={(e) => setWeb({ ...web, domains: e.target.value })} placeholder={"mountgreylockbaptist.com\nbiblegateway.com\nccli.com"} />
                <span className="small muted">One per line. Leave empty to allow any site.</span>
              </div>
            )}
          </fieldset>
          {state && (
            <p className={`notice small ${state.ok ? "success" : "notice-danger"}`} role="status">
              {state.text}
            </p>
          )}
          <div className="row">
            <button type={embedded ? "button" : "submit"} className="btn btn-primary" disabled={saving} onClick={embedded ? () => void save() : undefined}>
              {saving ? "Saving…" : "Save for everyone"}
            </button>
            {view.updatedBy && (
              <span className="small muted">
                Last changed by {view.updatedBy}
                {view.updatedAt ? ` on ${new Date(view.updatedAt).toLocaleDateString()}` : ""}
              </span>
            )}
          </div>
        </Form>
      )}
    </Wrap>
  );
}

/**
 * Settings → Barnabas and voice → Barnabas's voice (admins): how steady and how expressive
 * his voice is, for everyone in the church. Saves on its own, apart from the profile form.
 */
export function VoiceTuning() {
  const [defaults, setDefaults] = useState<{ stability: number; style: number } | null>(null);
  // null = use the default (Vercel's value or the built-in one)
  const [voice, setVoice] = useState<{ stability: number | null; style: number | null }>({ stability: null, style: null });
  const [savedVoice, setSavedVoice] = useState(voice);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "saving" | "playing">("");

  const load = (v: AiSettingsView) => {
    setDefaults({ stability: v.defaults.voiceStability, style: v.defaults.voiceStyle });
    const next = { stability: v.chosen.voiceStability ? v.voiceStability : null, style: v.chosen.voiceStyle ? v.voiceStyle : null };
    setVoice(next);
    setSavedVoice(next);
  };

  useEffect(() => {
    fetch("/api/admin/ai")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && load(v))
      .catch(() => {});
  }, []);

  if (!defaults) return null;
  const changed = voice.stability !== savedVoice.stability || voice.style !== savedVoice.style;

  async function save() {
    setBusy("saving");
    setState(null);
    const res = await fetch("/api/admin/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceStability: voice.stability, voiceStyle: voice.style }),
    });
    setBusy("");
    if (res.ok) {
      load(await res.json());
      setState({ ok: true, text: "Saved. Barnabas sounds like this for everyone in the church from his next reply." });
    } else {
      setState({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save." });
    }
  }

  async function play() {
    setBusy("playing");
    try {
      const res = await fetch("/api/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Good morning! It sounds like a full week, and you've got a wonderful team around you. Want me to look at who's serving Sunday?" }) });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } finally {
      setBusy("");
    }
  }

  const slider = (key: "stability" | "style", title: string, help: string) => (
    <div className="field">
      <label htmlFor={`voice-${key}`}>
        {title}: {(voice[key] ?? defaults[key]).toFixed(2)}
        {voice[key] === null && <span className="muted small"> (default)</span>}
      </label>
      <input id={`voice-${key}`} type="range" min={0} max={1} step={0.01} value={voice[key] ?? defaults[key]} onChange={(e) => setVoice({ ...voice, [key]: Number(e.target.value) })} />
      <span className="small muted">
        {help}
        {voice[key] !== null && (
          <>
            {" "}
            <button type="button" className="linklike" onClick={() => setVoice({ ...voice, [key]: null })}>
              Use default ({defaults[key].toFixed(2)})
            </button>
          </>
        )}
      </span>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 12 }}>
      <span className="small muted">Administrators: these two change Barnabas&apos;s voice for everyone in the church, and save on their own.</span>
      {slider("stability", "Stability", "Lower is more expressive and varied; higher is steadier and more even.")}
      {slider("style", "Style", "How much of the recorded speaker\u2019s character and warmth comes through. Small steps make a big difference.")}
      {state && (
        <p className={`notice small ${state.ok ? "success" : "notice-danger"}`} role="status">
          {state.text}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy !== "" || !changed}>
          {busy === "saving" ? "Saving…" : "Save voice"}
        </button>
        <button type="button" className="btn" onClick={() => void play()} disabled={busy !== "" || changed}>
          {busy === "playing" ? "Playing…" : "Preview the voice"}
        </button>
        {changed && <span className="small muted">Save to hear the change.</span>}
      </div>
    </div>
  );
}
