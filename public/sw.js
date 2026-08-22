// DóndeHay service worker — hand-rolled, no dependencies.
// Strategy summary:
//   navigations            -> network-first, cache fallback, shell last resort
//   /api/availability|products -> network-first, cache fallback
//   immutable _next/static -> cache-first
const CACHE = "dh-v2";
const SHELL = ["/", "/reportar", "/como-funciona"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.allSettled(SHELL.map((url) => caches.open(CACHE).then((c) => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Freshness-critical data endpoints.
  if (url.pathname === "/api/availability" || url.pathname === "/api/products") {
    event.respondWith(networkFirst(req));
    return;
  }

  // OSM tiles: cache-first — the city gets stored, revisits cost 0 data.
  if (url.hostname === "tile.openstreetmap.org") {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Immutable build assets.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(cacheFirst(req));
    return;
  }

  // App navigation: serve the app even during apagones using the last shell.
  if (req.mode === "navigate") {
    event.respondWith(
      networkFirst(req).catch(async () => {
        const cache = await caches.open(CACHE);
        return (
          (await cache.match(url.pathname)) ||
          (await cache.match("/")) ||
          new Response("<h1>Sin conexión</h1><p>Abre la app de nuevo cuando vuelva internet.</p>", {
            headers: { "content-type": "text/html; charset=utf-8" },
            status: 200,
          })
        );
      })
    );
  }
});
