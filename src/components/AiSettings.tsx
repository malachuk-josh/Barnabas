"use client";

import { useEffect, useState } from "react";
import { EFFORT_CHOICES, MODEL_CHOICES, type AiSettingsView } from "@/lib/ai/choices";

const label = (id: string) => MODEL_CHOICES.find((m) => m.id === id)?.label ?? id;
const effortLabel = (id: string) => EFFORT_CHOICES.find((e) => e.id === id)?.label ?? id;

/** Settings → Barnabas AI (admins): which Claude model answers typed and spoken messages. */
export function AiSettings() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [form, setForm] = useState({ textModel: "", voiceModel: "", textEffort: "" });
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = (v: AiSettingsView) => {
    setView(v);
    setForm({ textModel: v.chosen.textModel ? v.textModel : "", voiceModel: v.chosen.voiceModel ? v.voiceModel : "", textEffort: v.chosen.textEffort ? v.textEffort : "" });
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
      body: JSON.stringify({ textModel: form.textModel || null, voiceModel: form.voiceModel || null, textEffort: form.textEffort || null }),
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
              {MODEL_CHOICES.find((m) => m.id === (form.voiceModel || view.defaults.voiceModel))?.note} Spoken replies always think as little as possible, so they start quickly.
            </span>
          </div>
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
