"use client";

import { useEffect } from "react";
import { registration } from "@/lib/notifications/client";

/** Registers the leader app's service worker (/sw.js, scope /) so this device can get notifications. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    registration().catch(() => {});
  }, []);
  return null;
}
