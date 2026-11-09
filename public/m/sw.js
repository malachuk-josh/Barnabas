/* The member app's service worker (scope /m/): shows announcement notifications and opens the app. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* network only: the app is always fresh; this handler keeps the app installable on every browser */
});
self.addEventListener("push", (event) => {
  let data = { title: "New announcement", body: "", url: "/m" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    /* plain text or empty */
  }
  const url = typeof data.url === "string" && data.url.startsWith("/m") ? data.url : "/m";
  event.waitUntil(self.registration.showNotification(String(data.title).slice(0, 80), { body: String(data.body).slice(0, 200), icon: "/m/icon/192", badge: "/m/icon/192", data: { url } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/m";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.includes("/m") && "focus" in c) return c.navigate(url).then((w) => w && w.focus());
      return self.clients.openWindow(url);
    }),
  );
});
