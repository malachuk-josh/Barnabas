"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cardDismissed, deniedHelp, deviceStatus, dismissCard, enableOnThisDevice, type DeviceStatus } from "@/lib/notifications/client";

/**
 * On Today: when notifications are on for this leader but this device isn't subscribed yet. Browsers only
 * let a page ask for permission from a tap, so this is the tap. Dismiss hides it on this device for 14 days.
 */
export function NotificationsCard({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [status, setStatus] = useState<DeviceStatus>("loading");
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setHidden(cardDismissed());
    deviceStatus().then(setStatus).catch(() => setStatus("unsupported"));
  }, []);

  if (hidden || status === "loading" || status === "subscribed" || status === "unsupported") return null;

  async function enable() {
    setBusy(true);
    setError("");
    try {
      setStatus(await enableOnThisDevice(vapidPublicKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again from Settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="push-card" aria-labelledby="push-card-title">
      <div className="push-card-text">
        <strong id="push-card-title">Turn on notifications</strong>
        {status === "ios-home-screen" ? (
          <span>
            So Barnabas can let you know when someone needs you, add Barnabas to your Home Screen first: tap Share, then <strong>Add to Home Screen</strong>, and open Barnabas from there.
          </span>
        ) : status === "denied" ? (
          <span>{deniedHelp()}</span>
        ) : (
          <span>Turn on notifications so Barnabas can let you know when someone needs you.</span>
        )}
        {error && <span className="error small">{error}</span>}
      </div>
      <div className="push-card-actions">
        {status === "not-subscribed" && (
          <button className="btn btn-primary" type="button" onClick={() => void enable()} disabled={busy}>
            {busy ? "Turning on…" : "Turn on"}
          </button>
        )}
        <button
          className="btn"
          type="button"
          onClick={() => {
            dismissCard();
            setHidden(true);
          }}
        >
          Dismiss
        </button>
        <Link className="small" href="/settings#notifications">
          Settings
        </Link>
      </div>
    </section>
  );
}
