// Warstwy mapy z OpenStreetMap: przystanki, szkoły, przedszkola, sklepy, parki, przychodnie, uczelnie (dane © współtwórcy OpenStreetMap, ODbL).
import * as store from './store.js';
import { haversine } from './engine.js';
export const LAYERS = {
  przystanki: { n: 'Przystanki', color: '#4C8DC2', q: 'node["highway"="bus_stop"]', one: 'przystanek', rep: 'Przystanek autobusowy' },
  szkoly: { n: 'Szkoły', color: '#E9CB57', q: 'nwr["amenity"="school"]', one: 'szkoła', rep: 'Szkoła' },
  przedszkola: { n: 'Przedszkola', color: '#E2795C', q: 'nwr["amenity"="kindergarten"]', one: 'przedszkole', rep: 'Przedszkole' },
  sklepy: { n: 'Sklepy', color: '#A5CF7E', q: 'nwr["shop"="supermarket"]', one: 'supermarket', rep: 'Sklep (supermarket)' },
  parki: { n: 'Parki', color: '#5EB1A5', q: 'nwr["leisure"="park"]', one: 'park', rep: 'Park' },
  zdrowie: { n: 'Przychodnie', color: '#B58BD6', one: 'przychodnia lub szpital', rep: 'Przychodnia lub szpital' },
  uczelnie: { n: 'Uczelnie', color: '#E6A15A', one: 'uczelnia', rep: 'Uczelnia' },
};
const BBOX = '51.15,22.38,51.33,22.73', TTL = 864e5;
// Dane punktów przygotowuje serwer (osm_lublin.json, odświeżany co tydzień), aplikacja tylko go czyta i zapamiętuje na 24 h.
export const osmUrl = rcnUrl => rcnUrl ? rcnUrl.replace(/[^/]*$/, 'osm_lublin.json') : '';
export async function loadAll({ url, force = false, fetchFn = fetch } = {}) {
  const c = await store.get('osm-file');
  if (!force && c && c.ts && Date.now() - c.ts < TTL && c.layers) return { layers: c.layers, meta: c.meta, cached: true };
  let err = null;
  if (!url) err = 'brak adresu danych (Dane → adres pliku z serwera)';
  else try { const r = await fetchFn(url, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status === 404 ? 'serwer nie ma jeszcze pliku z otoczeniem (uruchom install_osm.sh)' : 'HTTP ' + r.status); const j = await r.json(); if (!j || !j.layers) throw new Error('zły format pliku'); await store.set('osm-file', { ts: Date.now(), layers: j.layers, meta: j.meta }); return { layers: j.layers, meta: j.meta, cached: false }; }
  catch (e) { err = e.message; }
  if (c && c.layers) return { layers: c.layers, meta: c.meta, cached: true, stale: true };
  throw new Error('Dane otoczenia niedostępne: ' + err + '.');
}
export async function loadPois(key, opts = {}) {
  if (!LAYERS[key]) throw new Error('nieznana warstwa');
  const { layers } = await loadAll(opts); const pts = (layers[key] || []).map(p => ({ lat: p[0], lon: p[1] }));
  if (!pts.length) throw new Error('brak punktów tej warstwy w pliku z serwera');
  return { pts };
}
export function nearest(pts, ll) { let b = null, bd = 1e9; for (const p of pts) { const d = haversine(ll, [p.lat, p.lon]); if (d < bd) { bd = d; b = p; } } return b ? { p: b, m: Math.round(bd * 1000) } : null; }

// Najbliższe punkty każdego rodzaju od podanego punktu (w linii prostej). m = metry (do 1 m), txt = zapis dla panelu, txtR = zapis do raportu (zaokrąglony do 10 m, „ok.”).
const fmtKm = m => (m / 1000).toFixed(2).replace('.', ',') + ' km';
export function okolica(ll, layers) {
  const out = [];
  for (const [k, L] of Object.entries(LAYERS)) { const pts = (layers[k] || []).map(p => ({ lat: p[0], lon: p[1] })); if (!pts.length) continue; const n = nearest(pts, ll); if (!n) continue;
    const m = n.m, r10 = Math.max(10, Math.round(m / 10) * 10);
    out.push({ key: k, label: L.rep || L.n, m, txt: m < 1000 ? m + ' m' : fmtKm(m), txtR: r10 < 1000 ? 'ok. ' + r10 + ' m' : 'ok. ' + (Math.round(m / 100) / 10).toFixed(1).replace('.', ',') + ' km' }); }
  return out;
}
