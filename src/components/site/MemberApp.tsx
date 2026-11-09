"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MemberApp } from "@/lib/site/types";

const ic = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const ICONS = {
  home: (
    <svg {...ic}>
      <path d="M4 10.5 12 4l8 6.5V20h-5.5v-5h-5v5H4Z" />
    </svg>
  ),
  events: (
    <svg {...ic}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  sermons: (
    <svg {...ic}>
      <path d="M12 6.5C10.3 5.2 7.8 4.5 4 4.5v13c3.8 0 6.3.7 8 2 1.7-1.3 4.2-2 8-2v-13c-3.8 0-6.3.7-8 2Z" />
      <path d="M12 6.5v13" />
    </svg>
  ),
  give: (
    <svg {...ic}>
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
    </svg>
  ),
  connect: (
    <svg {...ic}>
      <path d="M4 6.5h16v10H9l-5 4Z" />
    </svg>
  ),
};

export function MemberTabs({ tabs }: { tabs: MemberApp["tabs"] }) {
  const pathname = usePathname();
  const items = [
    { href: "/m", label: "Home", icon: ICONS.home, on: true },
    { href: "/m/events", label: "Events", icon: ICONS.events, on: tabs.events },
    { href: "/m/sermons", label: "Sermons", icon: ICONS.sermons, on: tabs.sermons },
    { href: "/m/give", label: "Give", icon: ICONS.give, on: tabs.give },
    { href: "/m/connect", label: "Connect", icon: ICONS.connect, on: tabs.connect },
  ].filter((t) => t.on);
  return (
    <nav className="ma-tabs" aria-label="App" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={(t.href === "/m" ? pathname === "/m" : pathname.startsWith(t.href)) ? "page" : undefined}>
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Registers the member app's service worker (scope /m/), which shows announcement notifications. */
export function MemberServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/m/sw.js", { scope: "/m/" }).catch(() => undefined);
  }, []);
  return null;
}

/** "Notify me about announcements". Hidden when push isn't configured (no VAPID public key). */
export function PushButton({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<"unknown" | "unsupported" | "off" | "on" | "denied" | "busy">("unknown");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!vapidKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off")).catch(() => setState("off"));
  }, [vapidKey]);
  if (!vapidKey || state === "unknown") return null;
  if (state === "unsupported") return <p className="cs-small cs-muted">To get notifications on iPhone, add this app to your home screen first (Share, then Add to Home Screen).</p>;
  if (state === "denied") return <p className="cs-small cs-muted">Notifications are turned off for this app in your browser settings.</p>;
  async function toggle() {
    setError(null);
    const was = state;
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      if (was === "on") {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/s/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unsubscribe: true, endpoint: sub.endpoint }) });
          await sub.unsubscribe();
        }
        setState("off");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) });
      const res = await fetch("/api/s/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't turn on notifications.");
      setState("on");
    } catch (err) {
      setError((err as Error).message);
      setState(was === "busy" ? "off" : was);
    }
  }
  return (
    <div>
      <button type="button" className="cs-btn cs-btn-secondary cs-btn-small" onClick={toggle} disabled={state === "busy"} aria-pressed={state === "on"}>
        {state === "on" ? "Notifications on (turn off)" : "Notify me about announcements"}
      </button>
      {error && (
        <p className="cs-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** A short "add to home screen" hint, until the app is installed. */
export function InstallHint() {
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    setShow(!standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!show) return null;
  return (
    <div className="cs-card ma-install">
      {prompt ? (
        <button type="button" className="cs-btn cs-btn-primary cs-btn-small" onClick={() => prompt.prompt()}>
          Add this app to your home screen
        </button>
      ) : (
        <p style={{ margin: 0 }}>
          <strong>Keep this app handy:</strong> in your browser&apos;s menu, choose <em>Add to Home Screen</em> (on iPhone, tap Share first).
        </p>
      )}
    </div>
  );
}
