// Service worker do app dos Admins: recebe o push e abre a tela certa ao tocar.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Lodges", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "Lodges", {
    body: data.body || "",
    tag: data.tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
