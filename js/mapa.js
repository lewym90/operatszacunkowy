// Mapa: transakcje RCN, ceny okolic (siatka ok. 500 m) i oferty najmu. Leaflet z katalogu vendor/, podkład OpenStreetMap (wymaga internetu;
// bez niego punkty i tak się rysują, tylko bez ulic pod spodem). Dane: wyłącznie współrzędne transakcji RCN oraz środki ulic wyliczone z nich.
import { normStreet } from './engine.js';
import { esc, fmt } from './ui.js';

export const PALETTE = ['#4C8DC2', '#5EB1A5', '#A5CF7E', '#E9CB57', '#E2795C'];   // tanio → drogo (przejście chłodne → ciepłe, czytelne na ciemnym tle)
export const LUBLIN = [51.2465, 22.5684];

let lp = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (lp) return lp;
  lp = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js'; s.onload = () => res(window.L); s.onerror = () => { lp = null; rej(new Error('Nie udało się wczytać biblioteki mapy')); }; document.head.appendChild(s);
  });
  return lp;
}

const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
export { med as median };

// kolory według kwantyli (5 klas po ok. 20% danych): mapa nie zależy od jednej skrajnej ceny
export function makeClasses(values) {
  const v = values.filter(x => isFinite(x)); if (v.length < 5) return { breaks: [], color: () => PALETTE[2], labels: [] };
  const br = [0.2, 0.4, 0.6, 0.8].map(q => quant(v, q));
  const color = x => PALETTE[br.filter(b => x > b).length];
  const labels = PALETTE.map((c, i) => ({ c, t: i === 0 ? `do ${fmt(br[0])}` : i === 4 ? `od ${fmt(br[3])}` : `${fmt(br[i - 1])}–${fmt(br[i])}` }));
  return { breaks: br, color, labels };
}

// Mieszkania z RCN nadające się do mapy cen: pełny lokal, jedna cena, współrzędne, rozsądna cena za m²
export function usableSales(tx, { years = 3, rynek = '' } = {}) {
  const from = Date.now() - years * 365.25 * 864e5, out = [];
  for (const t of tx) {
    if (t.lat == null || t.funkcja !== 'mieszkalna' || t.wielolokalowa || !t.pelne || !(t.m2 >= 15 && t.m2 <= 200) || !(t.cena > 50000)) continue;
    const when = t.ts ?? (t.rok ? Date.UTC(t.rok, 6, 1) : null); if (when == null || when < from) continue;
    if (rynek && t.rynek !== rynek) continue;
    const pm2 = t.cena / t.m2; if (pm2 < 2000 || pm2 > 30000) continue;
    out.push({ lat: t.lat, lon: t.lon, cena: t.cena, m2: t.m2, pm2, ts: when, ulica: t.ulica, nr: t.nr, rynek: t.rynek, izby: t.izby });
  }
  return out;
}

// Siatka komórek ok. 500 m × 500 m: mediana ceny za m², tylko komórki z min. 5 transakcjami (mniej = przypadek, nie cena okolicy)
const DLAT = 0.0045, DLON = 0.0072;
export function buildGrid(sales, minN = 5) {
  const cells = new Map();
  for (const s of sales) { const i = Math.floor(s.lat / DLAT), j = Math.floor(s.lon / DLON), k = i + ':' + j; (cells.get(k) || cells.set(k, { i, j, v: [] }).get(k)).v.push(s.pm2); }
  return [...cells.values()].filter(c => c.v.length >= minN).map(c => ({ bounds: [[c.i * DLAT, c.j * DLON], [(c.i + 1) * DLAT, (c.j + 1) * DLON]], n: c.v.length, med: med(c.v), p25: quant(c.v, .25), p75: quant(c.v, .75) }));
}

// Środki ulic z pozycji transakcji (mediana współrzędnych)
export function streetCenters(tx) {
  const m = new Map();
  for (const t of tx) if (t.lat != null && t.ulica) { const k = normStreet(t.ulica); (m.get(k) || m.set(k, { la: [], lo: [] }).get(k)).la.push(t.lat), m.get(k).lo.push(t.lon); }
  const out = new Map(); for (const [k, v] of m) if (v.la.length >= 2) out.set(k, { lat: med(v.la), lon: med(v.lo), n: v.la.length });
  return out;
}
const hh = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
function jitter(id, c, meters) {   // stałe przesunięcie (zależne od id), żeby oferty z tej samej ulicy nie leżały w jednym punkcie
  const a = hh(id + 'a') * 2 * Math.PI, r = Math.sqrt(hh(id + 'r')) * meters;
  return [c.lat + (r * Math.cos(a)) / 111320, c.lon + (r * Math.sin(a)) / (111320 * Math.cos(c.lat * Math.PI / 180))];
}
// Oferty najmu nie mają współrzędnych: stawiamy je na środku ulicy (z RCN), a gdy znamy tylko dzielnicę, w jej środku (przybliżenie)
export function placeOffers(offers, centers) {
  const dz = new Map();   // dzielnica → środki ulic z ofert, które mają obie informacje
  for (const o of offers) if (o.ulica && o.dzielnica) { const c = centers.get(normStreet(o.ulica)); if (c) (dz.get(o.dzielnica) || dz.set(o.dzielnica, { la: [], lo: [] }).get(o.dzielnica)).la.push(c.lat), dz.get(o.dzielnica).lo.push(c.lon); }
  const dc = new Map([...dz].filter(([, v]) => v.la.length >= 2).map(([k, v]) => [k, { lat: med(v.la), lon: med(v.lo) }]));
  const out = []; let none = 0;
  for (const o of offers) {
    const sc = o.ulica ? centers.get(normStreet(o.ulica)) : null, d = !sc && o.dzielnica ? dc.get(o.dzielnica) : null;
    if (sc) { const [la, lo] = jitter(String(o.id), sc, 110); out.push({ o, lat: la, lon: lo, approx: false }); }
    else if (d) { const [la, lo] = jitter(String(o.id), d, 650); out.push({ o, lat: la, lon: lo, approx: true }); }
    else none++;
  }
  return { placed: out, none };
}

export const rynekTxt = r => r === 'pierwotny' ? 'pierwotny' : r === 'wtorny' ? 'wtórny' : '—';
const dt = ts => ts ? new Date(ts).toLocaleDateString('pl-PL', { year: 'numeric', month: 'short' }) : '—';
export const popupSale = s => `<b>${esc([s.ulica, s.nr].filter(Boolean).join(' ') || 'Transakcja')}</b><br>${fmt(s.cena)} zł · ${String(s.m2).replace('.', ',')} m²${s.izby ? ' · ' + s.izby + ' pok.' : ''}<br><b>${fmt(s.pm2)} zł/m²</b><br><span class="tiny">akt: ${dt(s.ts)} · rynek ${rynekTxt(s.rynek)}</span>`;
export const popupOffer = (o, approx) => `<b>${esc([o.ulica, o.dzielnica].filter(Boolean).join(', ') || 'Oferta najmu')}</b><br>${fmt(o.cena)} zł/mies. · ${String(o.m2).replace('.', ',')} m² · ${o.pokoje} pok.${o.pietro != null ? ' · ' + (o.pietro === 0 ? 'parter' : o.pietro + '. p.') : ''}<br><b>${fmt(o.cena / o.m2)} zł/m²</b>${o.czynsz ? `<br><span class="tiny">czynsz adm. ${fmt(o.czynsz)} zł</span>` : ''}<br><span class="tiny">${approx ? 'położenie przybliżone (środek dzielnicy)' : 'położenie: środek ulicy'}</span>`;

// Kontroler mapy: jedna mapa, wymienialne warstwy
export async function createMap(el, opts = {}) {
  const L = await loadLeaflet();
  el.innerHTML = '';
  const map = L.map(el, { preferCanvas: true, zoomControl: true, attributionControl: true, minZoom: 9, maxZoom: 18, zoomSnap: 0.5 }).setView(opts.center || LUBLIN, opts.zoom || 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
  let layer = L.layerGroup().addTo(map);
  const api = {
    L, map,
    clear() { layer.remove(); layer = L.layerGroup().addTo(map); },
    dots(items, color, popup) {   // items: [{lat,lon,v,...}]
      const pts = [];
      for (const it of items) { L.circleMarker([it.lat, it.lon], { radius: it.r || 4.5, weight: it.approx ? 1.2 : .6, dashArray: it.approx ? '2 2' : null, color: it.approx ? color(it.v) : 'rgba(11,11,13,.85)', fillColor: color(it.v), fillOpacity: it.approx ? .35 : .8 }).bindPopup(() => popup(it)).addTo(layer); pts.push([it.lat, it.lon]); }
      return pts;
    },
    cells(cells, color, popup) { for (const c of cells) L.rectangle(c.bounds, { weight: .6, color: 'rgba(11,11,13,.7)', fillColor: color(c.med), fillOpacity: .62 }).bindPopup(() => popup(c)).addTo(layer); },
    subject(ll, label) { if (!ll) return; L.circleMarker(ll, { radius: 11, weight: 2.5, color: '#E6CE94', fillOpacity: 0 }).bindTooltip(label || 'Wyceniane mieszkanie').addTo(layer); L.circleMarker(ll, { radius: 3.5, weight: 0, fillColor: '#E6CE94', fillOpacity: 1 }).addTo(layer); },
    fit(pts, pad = 24) { if (pts && pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [pad, pad], maxZoom: 16 }); else if (pts && pts.length === 1) map.setView(pts[0], 15); },
    destroy() { map.remove(); },
  };
  setTimeout(() => map.invalidateSize(), 50);
  return api;
}
