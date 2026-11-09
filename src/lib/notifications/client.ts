"use client";

/**
 * Browser side of the leader app's push notifications: whether this device can get them, asking
 * permission (only from a tap), subscribing this device and telling the server.
 */

export type DeviceStatus = "loading" | "unsupported" | "ios-home-screen" | "denied" | "not-subscribed" | "subscribed";

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  // getRegistration("/") can return the member app's /m/ worker only for /m pages; check the scope.
  if (existing && new URL(existing.scope).pathname === "/") return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function deviceStatus(): Promise<DeviceStatus> {
  if (isIOS() && !isStandalone()) return "ios-home-screen";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      // Keep the server in step (it may have pruned an old copy).
      void saveSubscription(sub);
      return "subscribed";
    }
  } catch {
    /* treat as not yet subscribed */
  }
  return "not-subscribed";
}

function keyBytes(base64: string) {
  const clean = base64.replace(/[^A-Za-z0-9_+/-]/g, "");
  const padded = (clean + "=".repeat((4 - (clean.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveSubscription(sub: PushSubscription) {
  const res = await fetch("/api/push/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save this device.");
}

/** Call from a tap: asks permission, subscribes this device and saves it. Returns the new status. */
export async function enableOnThisDevice(vapidPublicKey: string): Promise<DeviceStatus> {
  if (isIOS() && !isStandalone()) return "ios-home-screen";
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "not-subscribed";
  const reg = await registration();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
  await saveSubscription(sub);
  return "subscribed";
}

export async function disableOnThisDevice() {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscription", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => false);
}

/** How to turn notifications back on after the browser blocked them. */
export function deniedHelp() {
  if (isIOS()) return "Notifications are blocked for Barnabas. On your iPhone, open Settings → Notifications → Barnabas and turn on Allow Notifications, then come back here.";
  return "Notifications are blocked for this site. Open your browser's site settings (the icon next to the address), allow Notifications for Barnabas, then reload this page.";
}

const DISMISS_KEY = "barnabas.pushCard.dismissedAt";
export const DISMISS_DAYS = 14;

export function cardDismissed(now = Date.now()) {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && now - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function dismissCard() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode: the card just comes back next time */
  }
}
