/**
 * Service Worker — Planta de Asfalto
 * Cachea el app shell para que funcione sin internet.
 */

const CACHE_NAME = 'planta-v5';
const APP_SHELL  = ['/', '/index.html', '/manifest.json', '/sw.js'];

// Instalación: cachear app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activación: borrar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First para app shell, Network-First para Apps Script
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Peticiones a Apps Script: siempre red (nunca cachear datos)
  if (url.includes('script.google.com') || url.includes('script.googleusercontent.com')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ status: 'error', message: 'Sin conexión' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // App shell: Cache-First
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
