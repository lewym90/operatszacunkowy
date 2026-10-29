const VERSION = 'am-wycena-v1.10.0';
const ASSETS = ["css/app.css", "fonts/Archivo-400_700.woff2", "fonts/Marcellus-400.woff2", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/logo-am.png", "index.html", "js/app.js", "js/engine.js", "js/mapa.js", "js/parseOtodom.js", "js/pdfimport.js", "js/rcn.js", "js/report.js", "js/store.js", "js/sync.js", "js/ui.js", "manifest.webmanifest", "vendor/leaflet/LICENSE", "vendor/leaflet/images/layers-2x.png", "vendor/leaflet/images/layers.png", "vendor/leaflet/leaflet.css", "vendor/leaflet/leaflet.js", "vendor/pdf.min.mjs", "vendor/pdf.worker.min.mjs", "./"];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => Promise.all(ASSETS.map(a => fetch(new Request(a, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(a); return c.put(a, r); })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); return res; }).catch(() => r.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
