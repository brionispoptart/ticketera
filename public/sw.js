const CACHE_NAME = "ticketera-static-v1";
const STATIC_ASSET_DESTINATIONS = new Set(["style", "script", "worker", "image", "font"]);
const DISABLE_CACHE_HOSTS = new Set(["localhost", "127.0.0.1"]);

function shouldBypassCaching() {
  return DISABLE_CACHE_HOSTS.has(self.location.hostname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => shouldBypassCaching() || key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (shouldBypassCaching()) {
    return;
  }

  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (STATIC_ASSET_DESTINATIONS.has(request.destination) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }

        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }

        return response;
      })(),
    );
  }
});