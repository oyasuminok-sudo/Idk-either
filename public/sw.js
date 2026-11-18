const VERSION = 'faceshift-shell-v6';
const SHELL = ['./', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('faceshift-shell-') && key !== VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never intercept model-host requests: browser-inswapper manages its own verified model cache.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request);
    if (cached) {
      fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
      }).catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok && (request.mode === 'navigate' || /[.](?:js|css|svg|webmanifest)$/.test(url.pathname))) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match('./');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
