"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Profile } from "@/lib/profile";
import { BIBLE_TRANSLATIONS, type BibleTranslation } from "@/lib/profile/translations";
import { accessSummary, isCheckinOnly, type Access } from "@/lib/auth/roles";
import { CalendarIcon } from "./icons";
import { AiSettings, VoiceTuning } from "./AiSettings";
import { NotificationSettings } from "./NotificationSettings";
import { typesFor } from "@/lib/notifications/types";

type ProviderStatus = {
  id: "google" | "microsoft";
  label: string;
  configured: boolean;
  connection: { account: string; connectedAt: number; push: boolean; lastError?: string } | null;
};
type SyncStatus = { providers: ProviderStatus[]; feed: { https: string; webcal: string } | null };

const SYNC_MESSAGES: Record<string, string> = {
  connected: "Connected. Barnabas will copy its events there and show your events on the Calendar tab.",
  declined: "The connection was cancelled. Nothing was changed.",
  expired: "That sign-in took too long. Try connecting again.",
  failed: "The connection didn't work. Try again, or check with your administrator.",
  "not-configured": "Your administrator hasn't set up this connection yet. See the setup notes below.",
  unknown: "Unknown calendar provider.",
};

function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
  }
}

export function SettingsForm({ initial, access, leaderId, vapidPublicKey = null, pushProblem = null, know = null }: { initial: Profile; access: Access; leaderId: string; vapidPublicKey?: string | null; pushProblem?: string | null ; know?: { answered: number; total: number } | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [p, setP] = useState<Profile>(initial);
  const [ministry, setMinistry] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const zones = useMemo(timezones, []);
  const [voices, setVoices] = useState<{ tts: boolean; stt: boolean; voiceReady: boolean; voiceName: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [word, setWord] = useState("");
  const [sayAs, setSayAs] = useState("");
  // What the Save bar saves (Profile and Barnabas and voice), to tell when there are unsaved changes.
  const saved = (x: Profile) => JSON.stringify([x.name, x.preferredName, x.role, x.ministries, x.timezone, x.replyLanguage, x.bibleTranslation, x.voice, x.pronunciations, x.about]);
  const [savedSnapshot, setSavedSnapshot] = useState(() => saved(initial));
  const dirty = saved(p) !== savedSnapshot;
  const [section, setSection] = useState("profile");

  const syncParam = params.get("sync");
  // Kids check-in volunteers only see their profile and data settings.
  const checkinOnly = isCheckinOnly(access);

  useEffect(() => {
    if (checkinOnly) return;
    fetch("/api/voice/voices")
      .then((r) => (r.ok ? r.json() : null))
      .then(setVoices)
      .catch(() => {});
  }, []);

  async function preview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Good morning, ${p.preferredName}. Your greeters had a wonderful Sunday. Want me to draft them a thank-you?`, lang: p.voice.language.slice(0, 2) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Preview didn't work.");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.playbackRate = p.voice.rate;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Preview didn't work." });
    } finally {
      setPreviewing(false);
    }
  }

  function addPronunciation() {
    if (!word.trim() || !sayAs.trim() || p.pronunciations.length >= 50) return;
    setP({ ...p, pronunciations: [...p.pronunciations.filter((x) => x.word.toLowerCase() !== word.trim().toLowerCase()), { word: word.trim(), sayAs: sayAs.trim() }] });
    setWord("");
    setSayAs("");
  }

  useEffect(() => {
    if (checkinOnly) return;
    fetch("/api/calendar/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSync)
      .catch(() => {});
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        preferredName: p.preferredName,
        role: p.role,
        ministries: p.ministries,
        timezone: p.timezone,
        replyLanguage: p.replyLanguage,
        bibleTranslation: p.bibleTranslation,
        voice: p.voice,
        pronunciations: p.pronunciations,
        about: p.about,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedSnapshot(saved(p));
      setMessage({ ok: true, text: "Saved. Barnabas will use this from your next conversation." });
      router.refresh();
    } else {
      setMessage({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save your settings." });
    }
  }

  function addMinistry() {
    const value = ministry.trim();
    if (value && !p.ministries.includes(value) && p.ministries.length < 12) setP({ ...p, ministries: [...p.ministries, value] });
    setMinistry("");
  }

  async function syncAction(body: Record<string, unknown>) {
    setSyncBusy(true);
    const res = await fetch("/api/calendar/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSyncBusy(false);
    if (res.ok) setSync(await res.json());
  }

  async function copy(text: string, input: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      input?.select();
    }
  }

  async function deleteEverything() {
    const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: deleteText }) });
    if (res.ok) {
      router.push("/signin");
      router.refresh();
    } else {
      setMessage({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't delete your data." });
    }
  }

  const sections = [
    { id: "profile", label: "Profile" },
    ...(!checkinOnly ? [{ id: "barnabas", label: "Barnabas and voice" }] : []),
    ...(!checkinOnly && access.admin ? [{ id: "ai", label: "Barnabas for everyone" }] : []),
    { id: "notifications", label: "Notifications" },
    ...(!checkinOnly ? [{ id: "calendars", label: "Calendars" }] : []),
    { id: "privacy", label: "Privacy and data" },
  ];

  // Highlight the section being read in the menu.
  useEffect(() => {
    const els = sections.map((x) => document.getElementById(x.id)).filter((el): el is HTMLElement => Boolean(el));
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (seen) setSection(seen.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // The sections only change with the leader's role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkinOnly, access.admin]);

  const initialsOf = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map((x) => (
          <a key={x.id} href={`#${x.id}`} aria-current={section === x.id ? "true" : undefined} onClick={() => setSection(x.id)}>
            {x.label}
          </a>
        ))}
      </nav>

      <div className="stack" style={{ gap: 24 }}>
        <div className="settings-me">
          <span className="person-avatar" aria-hidden="true">
            {initialsOf(p.name || p.preferredName || "?")}
          </span>
          <div>
            <strong>{p.name}</strong>
            <span className="small muted">
              {accessSummary(access).label} · {p.email}
            </span>
          </div>
        </div>
        {message && (
          <div className={`notice ${message.ok ? "success" : "notice-danger"}`} role="status">
            {message.text}
          </div>
        )}

        <form className="stack" style={{ gap: 24 }} onSubmit={saveProfile}>
          <section id="profile" className="card">
            <div className="settings-head">
              <h2>Profile</h2>
              <p className="muted small">Who you are, and what Barnabas should always keep in mind.</p>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input id="name" type="text" required maxLength={80} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="preferredName">What Barnabas calls you</label>
                <input id="preferredName" type="text" required maxLength={80} value={p.preferredName} onChange={(e) => setP({ ...p, preferredName: e.target.value })} placeholder="e.g. Pastor Dana" />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="role">Role</label>
                <input id="role" type="text" maxLength={80} value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} placeholder="e.g. Associate pastor" />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={p.email} readOnly aria-describedby="email-note" />
                <span id="email-note" className="small muted">Your sign-in email. Ask your administrator to change it.</span>
              </div>
            </div>
            <div className="field">
              <span className="label" style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.92rem", color: "var(--fg)" }}>Your access</span>
              <span>
                <strong>{accessSummary(access).label}</strong>
                <span className="muted">: {accessSummary(access).description}.</span>
              </span>
              <span className="small muted">
                {access.admin ? (
                  <>
                    You&apos;re an admin: manage people, access and Barnabas AI on the <Link href="/admin">Admin page</Link>.
                  </>
                ) : (
                  "Your church administrator sets this."
                )}
              </span>
            </div>
            <div className="field">
              <label htmlFor="ministry-input">Ministries you lead</label>
              <div className="chips-input">
                {p.ministries.map((m) => (
                  <span key={m} className="tag">
                    {m}
                    <button type="button" aria-label={`Remove ${m}`} onClick={() => setP({ ...p, ministries: p.ministries.filter((x) => x !== m) })}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="ministry-input"
                  type="text"
                  value={ministry}
                  maxLength={60}
                  placeholder={p.ministries.length ? "Add another" : "e.g. Youth, Kids, Worship"}
                  onChange={(e) => setMinistry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addMinistry();
                    }
                  }}
                  onBlur={addMinistry}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="about">What Barnabas should always know about you</label>
              <textarea
                id="about"
                className="plain"
                maxLength={1500}
                value={p.about}
                onChange={(e) => setP({ ...p, about: e.target.value })}
                placeholder="e.g. I'm bivocational and only available evenings. I prefer short answers. Our church is a bilingual congregation."
              />
            </div>
          </section>

          {!checkinOnly && (
          <section id="barnabas" className="card">
            <div className="settings-head">
              <h2>Barnabas and voice</h2>
              <p className="muted small">How Barnabas speaks with you, listens to you and quotes Scripture.</p>
            </div>
            {know && (
              <div className="settings-know">
                <span className="settings-know-text small">
                  <strong>
                    Barnabas knows you: {know.answered} of {know.total}
                  </strong>
                  <span className="muted"> What he&apos;s learned is in your <Link href="/memory">Memory</Link>.</span>
                </span>
                <span className="memory-know-bar" aria-hidden="true">
                  <span style={{ width: `${know.total ? Math.round((Math.min(know.answered, know.total) / know.total) * 100) : 0}%` }} />
                </span>
                {know.answered < know.total && (
                  <Link className="btn btn-sm" href="/?know=1">
                    {know.answered ? "Keep going" : "Let Barnabas get to know you"}
                  </Link>
                )}
              </div>
            )}
            <h3 className="settings-group">Language and time</h3>
            <div className="form-row">
              <div className="field">
                <label htmlFor="timezone">Time zone</label>
                <select id="timezone" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>
                  {!zones.includes(p.timezone) && <option value={p.timezone}>{p.timezone}</option>}
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="replyLanguage">Barnabas replies in</label>
                <select id="replyLanguage" value={p.replyLanguage} onChange={(e) => setP({ ...p, replyLanguage: e.target.value as Profile["replyLanguage"] })}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="ko">한국어</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="bibleTranslation">Bible translation Barnabas quotes</label>
              <select id="bibleTranslation" value={p.bibleTranslation ?? "kjv"} onChange={(e) => setP({ ...p, bibleTranslation: e.target.value as BibleTranslation })}>
                {(Object.entries(BIBLE_TRANSLATIONS) as [BibleTranslation, string][]).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                    {id === "kjv" ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <span className="small muted">You can still ask for another translation in any conversation.</span>
            </div>
            <h3 className="settings-group">Talking with Barnabas</h3>
            <div className="form-row">
              <div className="field">
                <label htmlFor="voiceLang">Language you speak to Barnabas</label>
                <select id="voiceLang" value={p.voice.language} onChange={(e) => setP({ ...p, voice: { ...p.voice, language: e.target.value as Profile["voice"]["language"] } })}>
                  <option value="en-US">English</option>
                  <option value="es-US">Español</option>
                  <option value="ko-KR">한국어</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="rate">Speaking speed: {p.voice.rate.toFixed(1)}×</label>
                <input id="rate" type="range" min={0.7} max={1.4} step={0.1} value={p.voice.rate} onChange={(e) => setP({ ...p, voice: { ...p.voice, rate: Number(e.target.value) } })} />
              </div>
              <div className="field">
                <label htmlFor="pauseMs">
                  Wait before answering: {((p.voice.pauseMs ?? 600) / 1000).toFixed(1)} s
                </label>
                <input
                  id="pauseMs"
                  type="range"
                  min={200}
                  max={2000}
                  step={100}
                  value={p.voice.pauseMs ?? 600}
                  onChange={(e) => setP({ ...p, voice: { ...p.voice, pauseMs: Number(e.target.value) } })}
                />
                <span className="small muted">
                  How long you can pause while talking before Barnabas answers. Shorter feels quicker; longer gives you room to think mid-sentence.
                </span>
              </div>
            </div>
            <div className="switch-list">
              <label className="switch-row" htmlFor="speakReplies">
                <span>
                  <span className="switch-title">Speak replies out loud</span>
                  <span className="small muted">Barnabas reads each answer to you as it arrives.</span>
                </span>
                <input id="speakReplies" className="switch" type="checkbox" checked={p.voice.speakReplies} onChange={(e) => setP({ ...p, voice: { ...p.voice, speakReplies: e.target.checked } })} />
              </label>
              <label className="switch-row" htmlFor="readTyped">
                <span>
                  <span className="switch-title">Also read aloud when I type</span>
                  <span className="small muted">Not just when you talk.</span>
                </span>
                <input id="readTyped" className="switch" type="checkbox" checked={Boolean(p.voice.readTyped)} disabled={!p.voice.speakReplies} onChange={(e) => setP({ ...p, voice: { ...p.voice, readTyped: e.target.checked } })} />
              </label>
              <label className="switch-row" htmlFor="fillers">
                <span>
                  <span className="switch-title">Short sounds while thinking</span>
                  <span className="small muted">&ldquo;Mm.&rdquo; &ldquo;Let me think.&rdquo; so there&apos;s no silence before he answers.</span>
                </span>
                <input id="fillers" className="switch" type="checkbox" checked={p.voice.fillers !== false} disabled={!p.voice.speakReplies} onChange={(e) => setP({ ...p, voice: { ...p.voice, fillers: e.target.checked } })} />
              </label>
              <label className="switch-row" htmlFor="handsFree">
                <span>
                  <span className="switch-title">Start in hands-free mode</span>
                  <span className="small muted">Just talk, and speak over Barnabas to interrupt.</span>
                </span>
                <input
                  id="handsFree"
                  className="switch"
                  type="checkbox"
                  checked={p.voice.handsFree}
                  disabled={!voices?.stt}
                  onChange={(e) => setP({ ...p, voice: { ...p.voice, handsFree: e.target.checked } })}
                />
              </label>
            </div>
            {voices && !voices.stt && <span className="small muted">Hands-free needs the Deepgram listening service. Your administrator adds DEEPGRAM_API_KEY.</span>}

            <h3 className="settings-group">Barnabas&apos;s voice</h3>
            <div className="field">
              {voices?.voiceReady ? (
                <div className="row">
                  <span>{voices.voiceName || "Church voice"}</span>
                  <button className="btn" type="button" onClick={() => void preview()} disabled={previewing}>
                    {previewing ? "Playing…" : "Preview"}
                  </button>
                </div>
              ) : (
                <span className="small muted">
                  Using your device&apos;s built-in voice until Barnabas&apos;s voice is set up (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID).
                </span>
              )}
              {access.admin && (
                <span className="small muted">
                  Administrators: <Link href="/voice-test">compare voice options in the voice test</Link>.
                </span>
              )}
            </div>
            {access.admin && voices?.voiceReady && <VoiceTuning />}


            <h3 className="settings-group">Names he says wrong</h3>
            <div className="field">
              <label htmlFor="pron-word">Pronunciations</label>
              <span className="small muted">Teach Barnabas names it says wrong. Words listed here are also listened for more carefully.</span>
              {p.pronunciations.length > 0 && (
                <div className="row">
                  {p.pronunciations.map((x) => (
                    <span key={x.word} className="tag">
                      {x.word} → {x.sayAs}
                      <button type="button" aria-label={`Remove ${x.word}`} onClick={() => setP({ ...p, pronunciations: p.pronunciations.filter((y) => y.word !== x.word) })}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="copy-row">
                <input id="pron-word" type="text" placeholder="Written as, e.g. Nguyen" value={word} maxLength={40} onChange={(e) => setWord(e.target.value)} />
                <input id="pron-say" type="text" aria-label="Say it as" placeholder="Say it as, e.g. Win" value={sayAs} maxLength={60} onChange={(e) => setSayAs(e.target.value)} />
                <button className="btn" type="button" onClick={addPronunciation} disabled={!word.trim() || !sayAs.trim()}>
                  Add
                </button>
              </div>
            </div>
          </section>
          )}

          <div className={`save-bar${dirty ? " is-dirty" : ""}`}>
            <span className="small" role="status">
              {saving ? "Saving…" : dirty ? "You have unsaved changes to your profile and voice." : "Profile and voice are saved."}
            </span>
            <button className="btn btn-primary" type="submit" disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>

        {access.admin && !checkinOnly && <AiSettings />}

        <NotificationSettings initial={initial.notifications} types={typesFor(access)} vapidPublicKey={vapidPublicKey} setupProblem={access.admin ? pushProblem : null} />

        {!checkinOnly && (
        <section id="calendars" className="card">
          <h2>Calendars</h2>
          <p className="muted">
            Connect your calendar so Barnabas plans around your real schedule and puts its events where you already look. Barnabas only copies the title, time and place of its own events.
          </p>
          {syncParam && SYNC_MESSAGES[syncParam] && (
            <div className={`notice ${syncParam === "connected" ? "success" : ""}`} role="status">
              {SYNC_MESSAGES[syncParam]}
            </div>
          )}
          {!sync && <p className="muted">Loading…</p>}
          {sync?.providers.map((prov) => (
            <div key={prov.id} className="provider">
              <span className="logo" aria-hidden="true" style={{ color: prov.id === "google" ? "#1a73e8" : "#6264a7" }}>
                {prov.id === "google" ? "G" : "O"}
              </span>
              <div className="stack" style={{ gap: 2 }}>
                <strong>{prov.label}</strong>
                {prov.connection ? (
                  <>
                    <span className="small muted">Connected as {prov.connection.account}. Two-way: your events show in Barnabas, and Barnabas&apos;s events are copied there.</span>
                    {prov.connection.lastError && <span className="small error">{prov.connection.lastError}</span>}
                    <label className="check small">
                      <input
                        id={`push-${prov.id}`}
                        type="checkbox"
                        checked={prov.connection.push}
                        disabled={syncBusy}
                        onChange={(e) => void syncAction({ action: "set-push", provider: prov.id, push: e.target.checked })}
                      />
                      Copy Barnabas events to {prov.label}
                    </label>
                  </>
                ) : (
                  <span className="small muted">
                    {prov.configured ? "Two-way sync with your account." : "Not available yet: your administrator needs to register Barnabas with " + (prov.id === "google" ? "Google" : "Microsoft") + "."}
                  </span>
                )}
              </div>
              <div className="actions row">
                {prov.connection ? (
                  <button className="btn btn-danger" type="button" disabled={syncBusy} onClick={() => void syncAction({ action: "disconnect", provider: prov.id })}>
                    Disconnect
                  </button>
                ) : (
                  <a className={`btn ${prov.configured ? "btn-primary" : ""}`} href={`/api/calendar/connect/${prov.id}`} aria-disabled={!prov.configured}>
                    Connect
                  </a>
                )}
              </div>
            </div>
          ))}

          {sync && (
            <div className="provider">
              <span className="logo" aria-hidden="true">
                <CalendarIcon />
              </span>
              <div className="stack" style={{ gap: 6 }}>
                <strong>Apple Calendar (and any calendar app)</strong>
                <span className="small muted">
                  Subscribe with a private link. Barnabas&apos;s events appear in Apple Calendar on your iPhone and Mac, and update about every hour. One-way: change events in Barnabas. The same link works in Google
                  Calendar (Add calendar → From URL) and Outlook (Add calendar → Subscribe from web).
                </span>
                {sync.feed ? (
                  <>
                    <div className="copy-row">
                      <input id="feed-url" type="text" readOnly value={sync.feed.https} aria-label="Private calendar link" onFocus={(e) => e.target.select()} />
                      <button className="btn" type="button" onClick={(e) => void copy(sync.feed!.https, (e.currentTarget.previousElementSibling as HTMLInputElement) ?? null)}>
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <span className="small muted">Anyone with this link can see your Barnabas event titles and times. Reset it if it&apos;s shared by mistake.</span>
                    <div className="row">
                      <a className="btn btn-primary" href={sync.feed.webcal}>
                        Add to Apple Calendar
                      </a>
                      <button className="btn" type="button" disabled={syncBusy} onClick={() => void syncAction({ action: "rotate-feed" })}>
                        Reset link
                      </button>
                      <button className="btn btn-danger" type="button" disabled={syncBusy} onClick={() => void syncAction({ action: "stop-feed" })}>
                        Stop sharing
                      </button>
                    </div>
                  </>
                ) : (
                  <div>
                    <button className="btn btn-primary" type="button" disabled={syncBusy} onClick={() => void syncAction({ action: "create-feed" })}>
                      Create private link
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
        )}



        <section id="privacy" className="card danger-zone">
          <h2>Privacy and data</h2>
          <p className="muted">
            Review or delete what Barnabas remembers on the <a href="/memory">Memory</a> tab. To start over completely, delete all your data: memory, conversations, drafts, calendar events and calendar connections. This
            can&apos;t be undone.
          </p>
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="delete-confirm">Type DELETE to confirm</label>
            <input id="delete-confirm" type="text" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <button className="btn btn-danger" type="button" disabled={deleteText !== "DELETE"} onClick={() => void deleteEverything()}>
              Delete all my data
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
