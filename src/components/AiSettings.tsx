"use client";

import { useEffect, useState } from "react";
import { EFFORT_CHOICES, MODEL_CHOICES, type AiSettingsView } from "@/lib/ai/choices";

const label = (id: string) => MODEL_CHOICES.find((m) => m.id === id)?.label ?? id;
const effortLabel = (id: string) => EFFORT_CHOICES.find((e) => e.id === id)?.label ?? id;

/** Settings → Barnabas AI (admins): which Claude model answers typed and spoken messages. */
export function AiSettings() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [form, setForm] = useState({ textModel: "", voiceModel: "", textEffort: "", voiceEffort: "" });
  // null = use the default (Vercel's value or the built-in one)
  const [voice, setVoice] = useState<{ stability: number | null; style: number | null }>({ stability: null, style: null });
  const [web, setWeb] = useState({ on: false, domains: "" });
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = (v: AiSettingsView) => {
    setView(v);
    setForm({ textModel: v.chosen.textModel ? v.textModel : "", voiceModel: v.chosen.voiceModel ? v.voiceModel : "", textEffort: v.chosen.textEffort ? v.textEffort : "", voiceEffort: v.chosen.voiceEffort ? v.voiceEffort : "" });
    setVoice({ stability: v.chosen.voiceStability ? v.voiceStability : null, style: v.chosen.voiceStyle ? v.voiceStyle : null });
    setWeb({ on: v.webSearch, domains: v.webDomains.join("\n") });
  };

  useEffect(() => {
    fetch("/api/admin/ai")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && load(v))
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setState(null);
    const res = await fetch("/api/admin/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textModel: form.textModel || null, voiceModel: form.voiceModel || null, textEffort: form.textEffort || null, voiceEffort: form.voiceEffort || null, voiceStability: voice.stability, voiceStyle: voice.style, webSearch: web.on, webDomains: web.domains.split(/[\s,]+/).map((d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean) }),
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
    <section id="ai" className="card stack">
      <h2>Barnabas AI</h2>
      <p className="muted small">Which Claude model answers, for everyone in the church. Only administrators see this.</p>
      {!view && <p className="muted">Loading…</p>}
      {view && (
        <form className="stack" onSubmit={save}>
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
          <div className="field">
            <label htmlFor="ai-stability">
              Voice stability: {(voice.stability ?? view.defaults.voiceStability).toFixed(2)}
              {voice.stability === null && <span className="muted small"> (default)</span>}
            </label>
            <input
              id="ai-stability"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={voice.stability ?? view.defaults.voiceStability}
              onChange={(e) => setVoice({ ...voice, stability: Number(e.target.value) })}
            />
            <span className="small muted">
              Lower is more expressive and varied; higher is steadier and more even.
              {voice.stability !== null && (
                <>
                  {" "}
                  <button type="button" className="linklike" onClick={() => setVoice({ ...voice, stability: null })}>
                    Use default ({view.defaults.voiceStability.toFixed(2)})
                  </button>
                </>
              )}
            </span>
          </div>
          <div className="field">
            <label htmlFor="ai-style">
              Voice style: {(voice.style ?? view.defaults.voiceStyle).toFixed(2)}
              {voice.style === null && <span className="muted small"> (default)</span>}
            </label>
            <input id="ai-style" type="range" min={0} max={1} step={0.01} value={voice.style ?? view.defaults.voiceStyle} onChange={(e) => setVoice({ ...voice, style: Number(e.target.value) })} />
            <span className="small muted">
              How much of the recorded speaker&apos;s character and warmth comes through. Small steps make a big difference.
              {voice.style !== null && (
                <>
                  {" "}
                  <button type="button" className="linklike" onClick={() => setVoice({ ...voice, style: null })}>
                    Use default ({view.defaults.voiceStyle.toFixed(2)})
                  </button>
                </>
              )}
            </span>
          </div>
          <PreviewVoice />
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
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {view.updatedBy && (
              <span className="small muted">
                Last changed by {view.updatedBy}
                {view.updatedAt ? ` on ${new Date(view.updatedAt).toLocaleDateString()}` : ""}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/** Plays a sample in Barnabas's voice with the saved settings (save first to hear a change). */
function PreviewVoice() {
  const [busy, setBusy] = useState(false);
  async function play() {
    setBusy(true);
    try {
      const res = await fetch("/api/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Good morning! It sounds like a full week, and you've got a wonderful team around you. Want me to look at who's serving Sunday?" }) });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } finally {
      setBusy(false);
    }
  }
  return (
    <p className="small muted" style={{ margin: 0 }}>
      Save, then{" "}
      <button type="button" className="btn" onClick={() => void play()} disabled={busy}>
        {busy ? "Playing…" : "Preview the voice"}
      </button>
    </p>
  );
}
