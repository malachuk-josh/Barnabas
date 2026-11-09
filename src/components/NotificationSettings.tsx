"use client";

import { useEffect, useState } from "react";
import { deniedHelp, deviceStatus, disableOnThisDevice, enableOnThisDevice, type DeviceStatus } from "@/lib/notifications/client";
import { NOTIFICATION_LABELS, type NotificationSettings as Settings, type NotificationType } from "@/lib/notifications/types";

const STATUS_TEXT: Record<DeviceStatus, string> = {
  loading: "Checking this device…",
  unsupported: "This browser can't get notifications. Try Barnabas on your phone's Home Screen, or in Chrome, Edge, Firefox or Safari.",
  "ios-home-screen": "On iPhone, notifications need Barnabas on your Home Screen: tap Share, then Add to Home Screen, and open Barnabas from there.",
  denied: "",
  "not-subscribed": "Not on yet for this device.",
  subscribed: "On for this device.",
};

const STATUS_PILL: Record<DeviceStatus, { text: string; tone: string }> = {
  loading: { text: "Checking", tone: "pill-ok" },
  unsupported: { text: "Not supported", tone: "pill-watch" },
  "ios-home-screen": { text: "Needs Home Screen", tone: "pill-watch" },
  denied: { text: "Blocked", tone: "pill-high" },
  "not-subscribed": { text: "Not yet", tone: "pill-watch" },
  subscribed: { text: "Subscribed", tone: "pill-ok" },
};

/** Settings → Notifications: the master switch, each type, this device, and a test. Saves as it's flipped. */
export function NotificationSettings({ initial, types, vapidPublicKey }: { initial: Settings; types: NotificationType[]; vapidPublicKey: string | null }) {
  const [s, setS] = useState<Settings>(initial);
  const [status, setStatus] = useState<DeviceStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!vapidPublicKey) return;
    deviceStatus().then(setStatus).catch(() => setStatus("unsupported"));
  }, [vapidPublicKey]);

  async function save(patch: { enabled?: boolean; types?: Partial<Record<NotificationType, boolean>> }) {
    const before = s;
    setS({ enabled: patch.enabled ?? s.enabled, types: { ...s.types, ...(patch.types ?? {}) } });
    setNote(null);
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notifications: patch }) });
    if (res.ok) setS((await res.json()).notifications);
    else {
      setS(before);
      setNote({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save that." });
    }
  }

  async function turnOn() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setNote(null);
    try {
      const next = await enableOnThisDevice(vapidPublicKey);
      setStatus(next);
      if (next === "subscribed") setNote({ ok: true, text: "Notifications are on for this device." });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOffHere() {
    setBusy(true);
    await disableOnThisDevice();
    setStatus("not-subscribed");
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setNote(res.ok ? { ok: true, text: `Sent to ${body.sent} device${body.sent === 1 ? "" : "s"}. It should arrive in a few seconds.` } : { ok: false, text: body.error ?? "The test didn't send." });
  }

  if (!vapidPublicKey) {
    return (
      <section id="notifications" className="card">
        <h2>Notifications</h2>
        <p className="muted">Push notifications aren&apos;t set up yet.</p>
        <ol className="small muted setup-steps">
          <li>
            Generate keys once: <code>npx web-push generate-vapid-keys</code>
          </li>
          <li>
            In Vercel, add <code>VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code> and <code>VAPID_SUBJECT</code> (e.g. <code>mailto:office@yourchurch.org</code>), and <code>CRON_SECRET</code> for the morning briefing.
          </li>
          <li>Redeploy. Notifications then start on for everyone; each leader turns them on for their device.</li>
        </ol>
      </section>
    );
  }

  return (
    <section id="notifications" className="card">
      <h2>Notifications</h2>
      <p className="muted">Barnabas lets you know when someone needs you. Notifications never include health details, confidential needs, pickup codes or giving.</p>

      <label className="switch-row">
        <span>
          <strong>Notifications</strong>
          <span className="small muted">{s.enabled ? "On. Turn off to stop every notification." : "Off. Nothing is sent to you; your devices stay set up."}</span>
        </span>
        <input type="checkbox" role="switch" className="switch" id="notify-enabled" checked={s.enabled} onChange={(e) => void save({ enabled: e.target.checked })} />
      </label>

      {s.enabled && types.length > 0 && (
        <fieldset className="switch-list">
          <legend className="label">What to notify you about</legend>
          {types.map((t) => (
            <label key={t} className="switch-row">
              <span>
                <span className="switch-title">{NOTIFICATION_LABELS[t].label}</span>
                <span className="small muted">{NOTIFICATION_LABELS[t].hint}</span>
              </span>
              <input type="checkbox" role="switch" className="switch" id={`notify-${t}`} checked={s.types[t]} onChange={(e) => void save({ types: { [t]: e.target.checked } })} />
            </label>
          ))}
        </fieldset>
      )}
      {s.enabled && types.length === 0 && <p className="small muted">For the kids check-in role, Barnabas doesn&apos;t send anything on its own yet. Leave this on so you hear when it does.</p>}

      <div className="device-row">
        <div className="stack" style={{ gap: 4 }}>
          <span className="row" style={{ gap: 8 }}>
            <strong>This device</strong>
            <span className={`pill ${STATUS_PILL[status].tone}`} data-status={status}>
              {STATUS_PILL[status].text}
            </span>
          </span>
          <span className="small muted">{status === "denied" ? deniedHelp() : STATUS_TEXT[status]}</span>
        </div>
        <div className="row">
          {status === "not-subscribed" && (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void turnOn()}>
              Turn on for this device
            </button>
          )}
          {status === "subscribed" && (
            <>
              <button className="btn" type="button" disabled={busy || !s.enabled} onClick={() => void test()}>
                Send a test notification
              </button>
              <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void turnOffHere()}>
                Turn off for this device
              </button>
            </>
          )}
        </div>
      </div>
      {note && (
        <div className={`notice ${note.ok ? "success" : "notice-danger"}`} role="status">
          {note.text}
        </div>
      )}
    </section>
  );
}
