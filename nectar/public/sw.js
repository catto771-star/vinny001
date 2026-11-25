// Keeps the app shell so Painel opens from the home screen, and shows push
// notifications. Pages are fetched from the network first; data requests
// (Supabase, other sites) are never cached.
const SHELL = 'painel-shell-v6';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add('./')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }
  if (url.pathname.includes('/assets/')) {
    // Built assets have content hashes, so a cached copy never goes stale.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
        return res;
      })),
    );
  }
});

// A push from the notify function: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Painel', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    tag: data.tag,
    lang: 'pt-BR',
    data: { url: data.url || '/' },
  }));
});

// Tapping a notification opens its screen, reusing an open window when there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url.replace(/^\//, '') : '', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) return c.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w));
    }
    return self.clients.openWindow(url);
  }));
});
