// GTA TBG – service worker: gra działa offline i instaluje się na ekranie głównym.
// Strategia: HTML i main.js network-first (nowa wersja od razu, cache tylko jako fallback
// offline), pozostałe statyki cache-first z odświeżaniem w tle.
const VERSION = 'tb3d-static-v1';
// Pliki, które muszą sprawdzić sieć – inaczej po wdrożeniu widać starą wersję gry.
const NETWORK_FIRST = [/\/main\.js$/, /\/index\.html$/, /\/$/];
const CORE = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './data/tarnobrzeg.json',
  './fonts/fredoka-400.woff',
  './fonts/fredoka-600.woff',
  './fonts/fredoka-700.woff',
  './vendor/three.module.js',
  './vendor/game-libs.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // cache: 'reload' pomija cache HTTP, żeby nie zamrozić starej wersji plików
      await cache.addAll(CORE.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Radio i inne zewnętrzne streamy zostawiamy sieci (bez cache)
  if (url.origin !== self.location.origin) return;

  // Rewalidacja z serwerem (pomija cache HTTP), żeby nowe wdrożenie nie czekało na TTL.
  const revalidate = () => fetch(req, { cache: 'no-cache' });

  if (req.mode === 'navigate' || NETWORK_FIRST.some((re) => re.test(url.pathname))) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await revalidate();
          if (fresh && fresh.ok) {
            const cache = await caches.open(VERSION);
            if (req.mode === 'navigate') cache.put('./index.html', fresh.clone());
            else cache.put(req, fresh.clone());
          }
          return fresh;
        } catch (e) {
          const cache = await caches.open(VERSION);
          return (
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match('./index.html')) ||
            new Response('Gra jest niedostępna offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          );
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) {
        fetch(req)
          .then((res) => { if (res && res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone())); })
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') {
          const cache = await caches.open(VERSION);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })()
  );
});
