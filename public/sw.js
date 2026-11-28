// Service worker: recebe o push, abre a tela certa ao tocar e guarda o app (HTML + arquivos) para abrir sem internet
// (folha de continuidade). Só arquivos do próprio site; as chamadas ao banco nunca são guardadas.
const SHELL = "shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add("/")).catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js") return;
  if (req.mode === "navigate") {
    // Páginas: internet primeiro; sem internet, o app guardado (o React Router abre a rota).
    event.respondWith(fetch(req).then((res) => { const copy = res.clone(); void caches.open(SHELL).then((c) => c.put("/", copy)); return res; })
      .catch(() => caches.match("/").then((r) => r || Response.error())));
    return;
  }
  if (/^\/(assets\/|fonts\/|icon|favicon|logo|apple-touch|products\/)/.test(url.pathname) || /\.(?:js|css|woff2?|png|jpg|svg)$/.test(url.pathname)) {
    // Arquivos do app: o guardado primeiro; atualiza em segundo plano.
    event.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) void c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

// O Android aceita no máximo 50 notificações abertas por app e descarta as novas em silêncio quando chega no limite.
// Mantemos no máximo 40 abertas: antes de mostrar uma nova, fechamos as mais antigas (tudo continua na tela Notifications do app).
const MAX_OPEN = 40;
async function trimOpenNotifications() {
  const open = await self.registration.getNotifications();
  if (open.length < MAX_OPEN) return;
  open.sort((a, b) => a.timestamp - b.timestamp).slice(0, open.length - (MAX_OPEN - 1)).forEach((n) => n.close());
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Lodges", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(trimOpenNotifications().catch(() => undefined).then(() => self.registration.showNotification(data.title || "Lodges", {
    body: data.body || "",
    tag: data.tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/notifications" },
  })));
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
