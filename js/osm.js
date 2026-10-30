// Warstwy mapy z OpenStreetMap (punkt 28): przystanki, szkoły, przedszkola, sklepy, parki. Dane pobiera przeglądarka z publicznego serwisu Overpass
// (dane © współtwórcy OpenStreetMap, licencja ODbL), zapisuje je lokalnie na 30 dni. Nic nie jest wysyłane poza zapytaniem o obszar Lublina.
import * as store from './store.js';
import { haversine } from './engine.js';
export const LAYERS = {
  przystanki: { n: 'Przystanki', color: '#4C8DC2', q: 'node["highway"="bus_stop"]', one: 'przystanek' },
  szkoly: { n: 'Szkoły', color: '#E9CB57', q: 'nwr["amenity"="school"]', one: 'szkoła' },
  przedszkola: { n: 'Przedszkola', color: '#E2795C', q: 'nwr["amenity"="kindergarten"]', one: 'przedszkole' },
  sklepy: { n: 'Sklepy', color: '#A5CF7E', q: 'nwr["shop"="supermarket"]', one: 'supermarket' },
  parki: { n: 'Parki', color: '#5EB1A5', q: 'nwr["leisure"="park"]', one: 'park' },
};
const BBOX = '51.15,22.38,51.33,22.73', TTL = 30 * 864e5, URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export function parseOverpass(j) {
  const out = []; for (const e of (j && j.elements) || []) { const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null || lo == null) continue; out.push({ lat: +la.toFixed(5), lon: +lo.toFixed(5), name: (e.tags && (e.tags.name || e.tags.ref)) || '' }); }
  return out;
}
export async function loadPois(key, { force = false, fetchFn = fetch } = {}) {
  const L = LAYERS[key]; if (!L) throw new Error('nieznana warstwa');
  const c = await store.get('osm-' + key);
  if (!force && c && c.ts && Date.now() - c.ts < TTL && c.pts) return { pts: c.pts, cached: true, ts: c.ts };
  const q = `[out:json][timeout:40];${L.q}(${BBOX});out center tags;`; let lastErr = null;
  for (const u of URLS) {
    try { const r = await fetchFn(u + '?data=' + encodeURIComponent(q)); if (!r.ok) throw new Error('HTTP ' + r.status); const pts = parseOverpass(await r.json()); if (!pts.length) throw new Error('pusta odpowiedź'); await store.set('osm-' + key, { ts: Date.now(), pts }); return { pts, cached: false, ts: Date.now() }; }
    catch (e) { lastErr = e; }
  }
  if (c && c.pts) return { pts: c.pts, cached: true, stale: true, ts: c.ts };
  throw new Error('Nie udało się pobrać danych z OpenStreetMap (' + (lastErr && lastErr.message) + '). Spróbuj za chwilę.');
}
export function nearest(pts, ll) { let b = null, bd = 1e9; for (const p of pts) { const d = haversine(ll, [p.lat, p.lon]); if (d < bd) { bd = d; b = p; } } return b ? { p: b, m: Math.round(bd * 1000) } : null; }
