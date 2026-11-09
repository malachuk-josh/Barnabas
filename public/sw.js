/*
 * The leader app's service worker (scope /): shows Barnabas's push notifications and opens the app when
 * one is tapped. No fetch handler and no caching, so it never changes how pages load. The member app has
 * its own worker at /m/sw.js (scope /m/), which takes over there because its scope is narrower.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const safeUrl = (u) => (typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u : "/");

self.addEventListener("push", (event) => {
  let data = { title: "Barnabas", body: "", url: "/", tag: "barnabas" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    /* plain text or empty */
  }
  event.waitUntil(
    self.registration.showNotification(String(data.title).slice(0, 80), {
      body: String(data.body).slice(0, 200),
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: String(data.tag || "barnabas").slice(0, 64),
      renotify: true,
      data: { url: safeUrl(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => {
        const path = new URL(c.url).pathname;
        return !path.startsWith("/m") && !path.startsWith("/s/") && path !== "/s";
      });
      if (open) return open.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : c)).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    }),
  );
});
