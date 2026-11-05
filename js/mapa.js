// Mapa: transakcje RCN, ceny okolic (siatka ok. 500 m) i oferty najmu. Leaflet z katalogu vendor/, podkład OpenStreetMap (wymaga internetu;
// bez niego punkty i tak się rysują, tylko bez ulic pod spodem). Dane: wyłącznie współrzędne transakcji RCN oraz środki ulic wyliczone z nich.
import { normStreet } from './engine.js';
import { esc, fmt } from './ui.js';
import { KAT, POD_TXT, pm2Of } from './rcn.js';

export const PALETTE = ['#7A5F26', '#A6863B', '#C8A44D', '#E0C27A', '#F6EAC6'];   // tanio → drogo: jedna skala złota, od brązu do jasnego szampana
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
export function usableSales(tx, { years = 3, rynek = '', m2min = 0, m2max = 1e9, kat = 'mieszkanie' } = {}) {
  const from = Date.now() - years * 365.25 * 864e5, out = [];
  for (const t of tx) {
    if (t.lat == null) continue;
    let pm2;
    if (kat === 'mieszkanie') {
      if (t.funkcja !== 'mieszkalna' || t.wielolokalowa || !t.pelne || !(t.m2 >= 15 && t.m2 <= 200) || !(t.cena > 50000)) continue;
      pm2 = t.cena / t.m2; if (pm2 < 2000 || pm2 > 30000) continue;
    } else { if (t.kat !== kat) continue; pm2 = pm2Of(t); if (pm2 == null) continue; }
    const when = t.ts ?? (t.rok ? Date.UTC(t.rok, 6, 1) : null); if (when == null || when < from) continue;
    if (rynek && t.rynek !== rynek) continue;
    if (t.m2 < m2min || t.m2 >= m2max) continue;
    out.push({ lat: t.lat, lon: t.lon, cena: t.cena, m2: t.m2, pm2, ts: when, ulica: t.ulica, nr: t.nr, rynek: t.rynek, izby: t.izby, kat: t.kat || 'mieszkanie', pod: t.pod || null, dzm2: t.dzm2 || null });
  }
  return out;
}

// Siatka komórek ok. 500 m × 500 m: mediana ceny za m², tylko komórki z min. 5 transakcjami (mniej = przypadek, nie cena okolicy)
const DLAT = 0.0045, DLON = 0.0072;
export function buildGrid(sales, minN = 5) {   // minN: najmniej transakcji w kwadracie
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
export const popupSale = s => `<b>${esc([s.ulica, s.nr].filter(Boolean).join(' ') || (s.kat && s.kat !== 'mieszkanie' ? KAT[s.kat].n : 'Transakcja'))}</b><br>${fmt(s.cena)} zł · ${String(s.m2).replace('.', ',')} m²${s.izby ? ' · ' + s.izby + ' pok.' : ''}${s.dzm2 ? ' · działka ' + fmt(s.dzm2) + ' m²' : ''}<br><b>${fmt(s.pm2)} zł/m²</b><br><span class="tiny">akt: ${dt(s.ts)}${s.kat === 'mieszkanie' || s.kat === 'dom' || s.kat === 'obiekt' ? ' · rynek ' + rynekTxt(s.rynek) : ''}${s.pod ? ' · ' + esc(POD_TXT[s.pod] || s.pod) : ''}</span>`;
export const popupOffer = (o, approx) => `${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer"><b>${esc([o.ulica, o.dzielnica].filter(Boolean).join(', ') || 'Oferta najmu')}</b> ↗</a>` : `<b>${esc([o.ulica, o.dzielnica].filter(Boolean).join(', ') || 'Oferta najmu')}</b>`}<br>${fmt(o.cena)} zł/mies. · ${String(o.m2).replace('.', ',')} m² · ${o.pokoje} pok.${o.pietro != null ? ' · ' + (o.pietro === 0 ? 'parter' : o.pietro + '. p.') : ''}<br><b>${fmt(o.cena / o.m2)} zł/m²</b>${o.czynsz ? `<br><span class="tiny">czynsz adm. ${fmt(o.czynsz)} zł</span>` : ''}<br><span class="tiny">${approx ? 'położenie przybliżone (środek dzielnicy)' : 'położenie: środek ulicy'}</span>`;

// Środki dzielnic: mediana środków ulic z ofert, które mają ulicę i dzielnicę (min. 2 ulice). Klucz: nazwa dzielnicy po normalizacji przez norm.
export function districtCenters(offers, centers, norm = x => x) {
  const dz = new Map();
  for (const o of offers) if (o.ulica && o.dzielnica) { const c = centers.get(normStreet(o.ulica)), k = norm(o.dzielnica); if (c) { const d = dz.get(k) || dz.set(k, new Map()).get(k); d.set(normStreet(o.ulica), c); } }
  const out = new Map(); for (const [k, m] of dz) if (m.size >= 2) { const v = [...m.values()]; out.set(k, { lat: med(v.map(c => c.lat)), lon: med(v.map(c => c.lon)), ulic: v.length }); }
  return out;
}
// Grupowanie punktów w siatce ekranu: kratka z min. minN punktami to jedna grupa, reszta zostaje pojedynczymi punktami. project(it) daje {x,y} w pikselach.
export function clusterItems(items, project, cell = 58, minN = 3) {
  const g = new Map(); for (const it of items) { const p = project(it), k = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell); (g.get(k) || g.set(k, []).get(k)).push({ it, p }); }
  const groups = [], single = [];
  for (const a of g.values()) { if (a.length < minN) { a.forEach(x => single.push(x)); continue; } const v = a.map(x => x.it.v); groups.push({ n: a.length, x: a.reduce((s, q) => s + q.p.x, 0) / a.length, y: a.reduce((s, q) => s + q.p.y, 0) / a.length, med: med(v), p25: quant(v, .25), p75: quant(v, .75), items: a.map(x => x.it) }); }
  return { groups, single };
}

// Warstwa punktów rysowana na jednej kanwie. Kliknięcie szuka najbliższego punktu w promieniu ok. 14 px.
function DotsLayer(L, items, color, popup, group) {
  const Cls = L.Layer.extend({
    initialize() { this._it = items; this._col = items.map(it => color(it.v)); },
    onAdd(map) {
      this._m = map; this._c = L.DomUtil.create('canvas', 'am-dots leaflet-zoom-hide'); map.getPanes().overlayPane.appendChild(this._c);
      map.on('moveend zoomend resize', this._draw, this); map.on('click', this._click, this); this._draw();
    },
    onRemove(map) { this._c.remove(); map.off('moveend zoomend resize', this._draw, this); map.off('click', this._click, this); },
    _draw() {
      const m = this._m, s = m.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2), c = this._c;
      L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
      c.width = Math.round(s.x * dpr); c.height = Math.round(s.y * dpr); c.style.width = s.x + 'px'; c.style.height = s.y + 'px';
      const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineWidth = .6; x.strokeStyle = 'rgba(11,11,13,.85)'; x.globalAlpha = .82;
      const r = Math.max(2.2, Math.min(5, (m.getZoom() - 8) * .55 + 1.6));
      this._gr = []; this._si = null;
      if (group && m.getZoom() < 15 && this._it.length > 12) {   // przy oddaleniu grupy z liczbą punktów; od zbliżenia 15 pojedyncze transakcje
        const bd = m.getBounds().pad(.1), z = m.getZoom(), o = m.project(m.containerPointToLatLng([0, 0]), z), vis = this._it.filter(it => bd.contains([it.lat, it.lon])), { groups, single } = clusterItems(vis, it => m.project([it.lat, it.lon], z));   // kratki w układzie mapy: grupy nie skaczą przy przesuwaniu
        for (const q of groups) { q.x -= o.x; q.y -= o.y; } for (const q of single) q.p = { x: q.p.x - o.x, y: q.p.y - o.y }; this._si = single.map(q => q.it);
        for (const { it, p } of single) { x.fillStyle = color(it.v); x.beginPath(); x.arc(p.x, p.y, r, 0, 6.2832); x.fill(); x.stroke(); }
        x.font = '700 12px Archivo, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        for (const q of groups) { const rr = Math.min(24, 12 + Math.log2(q.n) * 2); q.r = rr; x.globalAlpha = .9; x.fillStyle = color(q.med); x.beginPath(); x.arc(q.x, q.y, rr, 0, 6.2832); x.fill(); x.globalAlpha = 1; x.lineWidth = 1.5; x.stroke(); x.fillStyle = '#0B0B0D'; x.fillText(q.n > 999 ? String(Math.round(q.n / 100) / 10).replace('.', ',') + ' tys.' : q.n, q.x, q.y + 1); }
        this._gr = groups; return;
      }
      for (let i = 0; i < this._it.length; i++) {
        const it = this._it[i], p = m.latLngToContainerPoint([it.lat, it.lon]); if (p.x < -8 || p.y < -8 || p.x > s.x + 8 || p.y > s.y + 8) continue;
        x.fillStyle = this._col[i]; x.beginPath(); x.arc(p.x, p.y, r, 0, 6.2832); x.fill(); x.stroke();
      }
    },
    _click(e) {
      const m = this._m; let best = null, bd = 14 * 14;
      for (const q of this._gr || []) if ((q.x - e.containerPoint.x) ** 2 + (q.y - e.containerPoint.y) ** 2 <= (q.r + 3) ** 2) {
        const el = L.DomUtil.create('div'); el.innerHTML = `<b>${fmt(q.n)} transakcji</b><br>mediana <b>${fmt(q.med)} zł/m²</b><br>środkowe 50%: ${fmt(q.p25)}–${fmt(q.p75)} zł/m²<br>`;
        const b = L.DomUtil.create('button', 'zoomin', el); b.type = 'button'; b.textContent = 'Przybliż ten obszar'; const ll = L.latLngBounds(q.items.map(i => [i.lat, i.lon]));
        b.onclick = () => { m.closePopup(); m.fitBounds(ll, { padding: [30, 30], maxZoom: 16 }); };
        L.popup().setLatLng(m.containerPointToLatLng([q.x, q.y])).setContent(el).openOn(m); return;
      }
      for (const it of this._si || this._it) { const p = m.latLngToContainerPoint([it.lat, it.lon]), d = (p.x - e.containerPoint.x) ** 2 + (p.y - e.containerPoint.y) ** 2; if (d < bd) { bd = d; best = it; } }
      if (best) L.popup().setLatLng([best.lat, best.lon]).setContent(popup(best)).openOn(m);
    },
  });
  return new Cls();
}

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
    dots(items, color, popup, opt = {}) {   // items: [{lat,lon,v,...}]; opt.group: grupowanie przy oddaleniu
      api.items = items;
      if (opt.group) { new DotsLayer(L, items, color, popup, true).addTo(layer); return items.map(it => [it.lat, it.lon]); }
      if (items.length > 1500) {   // duże zbiory: jedna kanwa zamiast tysięcy osobnych obiektów (mniej pamięci, płynne przesuwanie na tabletach)
        const lyr = new DotsLayer(L, items, color, popup); lyr.addTo(layer); return items.map(it => [it.lat, it.lon]);
      }
      const pts = [];
      for (const it of items) { L.circleMarker([it.lat, it.lon], { radius: it.r || 4.5, weight: it.approx ? 1.2 : .6, dashArray: it.approx ? '2 2' : null, color: it.approx ? color(it.v) : 'rgba(11,11,13,.85)', fillColor: color(it.v), fillOpacity: it.approx ? .35 : .8 }).bindPopup(() => popup(it)).addTo(layer); pts.push([it.lat, it.lon]); }
      return pts;
    },
    cells(cells, color, popup) { for (const c of cells) L.rectangle(c.bounds, { weight: .6, color: 'rgba(11,11,13,.7)', fillColor: color(c.med), fillOpacity: .62 }).bindPopup(() => popup(c)).addTo(layer); },
    bubbles(items, color, popup) { for (const it of items) L.circleMarker([it.lat, it.lon], { radius: 24, weight: 1.5, color: 'rgba(11,11,13,.9)', fillColor: color(it.v), fillOpacity: .78 }).bindPopup(() => popup(it)).bindTooltip(it.txt, { permanent: true, direction: 'center', className: 'bubble-t' }).addTo(layer); },
    subject(ll, label) { if (!ll) return; L.circleMarker(ll, { radius: 11, weight: 2.5, color: '#E6CE94', fillOpacity: 0 }).bindTooltip(label || 'Wyceniane mieszkanie').addTo(layer); L.circleMarker(ll, { radius: 3.5, weight: 0, fillColor: '#E6CE94', fillOpacity: 1 }).addTo(layer); },
    fit(pts, pad = 24) { if (pts && pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [pad, pad], maxZoom: 16 }); else if (pts && pts.length === 1) map.setView(pts[0], 15); },
    destroy() { map.remove(); },
  };
  setTimeout(() => map.invalidateSize(), 50);
  return api;
}
