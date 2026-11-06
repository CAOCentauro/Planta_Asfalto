/**
 * Service Worker â€” Planta de Asfalto  v7
 * PÃ¡ginas del sitio: primero internet (siempre la versiÃ³n nueva) y, sin seÃ±al, la copia guardada.
 * Lo que va al Apps Script (POST) no pasa por aquÃ­.
 */

const CACHE_NAME = 'planta-v27';
const APP_SHELL  = ['/', '/index.html', '/registro.html', '/compras.html', '/pagos.html', '/nomina.html', '/dashboard.html', '/viajes.html',
                    '/usuarios.html', '/sesion.js', '/cobranza.js', '/agregados.js', '/estilo.css', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      // Si falta algÃºn archivo no se cae la instalaciÃ³n
      .then(cache => Promise.all(APP_SHELL.map(u => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copia)); }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch:true }).then(c => c || caches.match('/index.html')))
  );
});
