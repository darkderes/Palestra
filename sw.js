/* Palestra · service worker — soporte offline / PWA instalable.
 *
 * IMPORTANTE: subir CACHE_VERSION en cada deploy que cambie index.html o
 * assets/* para que los clientes reciban la actualización.
 */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `palestra-shell-${CACHE_VERSION}`;
const MEDIA_CACHE = `palestra-media-${CACHE_VERSION}`;
const MEDIA_MAX_ENTRIES = 150;

const SHELL_ASSETS = [
  './',
  './index.html',
  './assets/theme-init.js',
  './assets/app.js',
  './assets/store.js',
  './assets/log.js',
  './assets/log.css',
  './data/exercises.min.json',
  './site.webmanifest',
  './favicon.svg',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('palestra-') && k !== SHELL_CACHE && k !== MEDIA_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Recorta el cache de media a un máximo de entradas (FIFO).
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegación y app-shell → cache primero, revalidando en segundo plano.
  const isMedia = /\/(images|videos)\//.test(url.pathname);

  if (isMedia) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res.ok) {
            cache.put(request, res.clone());
            trimCache(MEDIA_CACHE, MEDIA_MAX_ENTRIES);
          }
          return res;
        } catch (e) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        network; // revalida sin bloquear
        return hit;
      }
      const res = await network;
      if (res) return res;
      if (request.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    })
  );
});

// Permite al cliente forzar la activación del SW nuevo.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
