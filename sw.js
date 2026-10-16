const CACHE_NAME = "hookdex-cache-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  // « reload » : la nouvelle version vient du réseau, pas d'un vieux cache du navigateur
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => /^hookdex-cache/.test(k) && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Les tuiles de carte et Leaflet (CDN externe) : on laisse toujours passer par le réseau,
  // pas de mise en cache agressive de ressources tierces changeantes.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // App shell (notre propre domaine) : cache d'abord, réseau en secours, mise à jour silencieuse du cache
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// v5.6 · les notifications : le message arrive chiffré, le navigateur le déchiffre, on l'affiche
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {
    try { d = { b: event.data ? event.data.text() : "" }; } catch (e2) { d = {}; }
  }
  const titre = String(d.t || "HookDex").slice(0, 80);
  const options = {
    body: String(d.b || "").slice(0, 200),
    icon: "icons/icon-192.png",
    tag: d.g ? String(d.g).slice(0, 80) : undefined,
    renotify: !!d.g,
    lang: "fr",
    data: { u: String(d.u || "").slice(0, 120) },
  };
  event.waitUntil(self.registration.showNotification(titre, options));
});

// un appui sur la notification : HookDex s'ouvre (ou revient devant) au bon endroit
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const u = String((event.notification.data && event.notification.data.u) || "").replace(/[^\w:-]/g, "").slice(0, 60);
  const cible = new URL("./" + (u ? "#hookdex=" + u : ""), self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) {
          c.postMessage({ hookdex: "notif", u });
          return c.focus();
        }
      }
      return self.clients.openWindow(cible);
    })
  );
});
