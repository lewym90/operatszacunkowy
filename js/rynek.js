// Analizy rynku: trend ceny za m² (RCN) i rentowność najmu w dzielnicach (oferty + RCN), plus wykresy SVG bez bibliotek.
// Wszystko liczone wyłącznie z danych, które aplikacja już ma; za mało danych = brak punktu, nie zgadywanie.
import { streetKey, normDz, haversine } from './engine.js';
import { usableSales } from './mapa.js';
import { esc, fmt } from './ui.js';

const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const MON = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

/* ---------- TREND CENY ZA M² ---------- */
// opts: { kat, rynek, m2min, m2max, center:[lat,lon], radiusKm, years, nowTs }
// Zwraca { ok, points:[{t, label, n, med, p25, p75}], n, step, yoy:{pct, a, b, na, nb}|null, reason }
export function trendSeries(pool, opts = {}) {
  const nowTs = opts.nowTs || Date.now(), years = opts.years || 8, radius = opts.radiusKm || null, center = opts.center || null;
  let sales = usableSales(pool, { years, rynek: opts.rynek || '', m2min: opts.m2min || 0, m2max: opts.m2max || 1e9, kat: opts.kat || 'mieszkanie' }).filter(s => s.ts <= nowTs + 864e5);
  if (center && radius) sales = sales.filter(s => haversine(center, [s.lat, s.lon]) <= radius);
  if (opts.pred) sales = sales.filter(opts.pred);
  if (sales.length < 20) return { ok: false, n: sales.length, reason: `Za mało transakcji dla tych filtrów (${sales.length}; trzeba co najmniej 20). Poszerz okolicę, metraż lub rynek.` };
  const perQuarter = sales.length / (years * 4), step = perQuarter >= 12 ? 3 : perQuarter >= 5 ? 6 : 12, minN = step === 3 ? 8 : step === 6 ? 8 : 10;
  const bucket = new Map();
  for (const s of sales) { const d = new Date(s.ts), k = d.getUTCFullYear() * 12 + Math.floor(d.getUTCMonth() / step) * step; (bucket.get(k) || bucket.set(k, []).get(k)).push(s.pm2); }
  const points = [...bucket.entries()].sort((a, b) => a[0] - b[0]).filter(([, v]) => v.length >= minN).map(([k, v]) => {
    const y = Math.floor(k / 12), m = k % 12, t = Date.UTC(y, m + step / 2 - 0.5, 15);
    return { t, y, m, n: v.length, med: med(v), p25: quant(v, 0.25), p75: quant(v, 0.75), label: step === 12 ? String(y) : `${MON[m]}${step === 3 ? '–' + MON[m + 2] : '–' + MON[m + 5]} ${y}` };
  });
  // zmiana rok do roku: mediana ostatnich 12 miesięcy względem poprzednich 12 (min. 25 transakcji w każdym oknie)
  const y1 = nowTs - 365.25 * 864e5, y2 = nowTs - 2 * 365.25 * 864e5;
  const A = sales.filter(s => s.ts > y1).map(s => s.pm2), B = sales.filter(s => s.ts > y2 && s.ts <= y1).map(s => s.pm2);
  const yoy = A.length >= 25 && B.length >= 25 ? { a: med(A), b: med(B), na: A.length, nb: B.length, pct: (med(A) / med(B) - 1) * 100 } : null;
  if (points.length < 3) return { ok: false, n: sales.length, reason: 'Transakcje są zbyt rozproszone w czasie, by narysować trend. Poszerz okolicę.' };
  return { ok: true, points, n: sales.length, step, yoy };
}

/* ---------- DZIELNICE DLA TRANSAKCJI ---------- */
// Transakcje RCN nie mają dzielnicy. Przypisujemy ją po najbliższej ulicy, dla której dzielnicę znamy z ofert (do 2,5 km). Zwraca funkcję (lat, lon) -> znormalizowana dzielnica | null.
export function districtAssigner(offers, tx) {
  const pts = new Map();
  for (const t of tx) if (t.ulica && t.lat != null) { const k = streetKey(t.ulica), p = pts.get(k) || pts.set(k, { la: 0, lo: 0, n: 0 }).get(k); p.la += t.lat; p.lo += t.lon; p.n++; }
  const known = [], seen = new Set();
  for (const o of offers) if (o.ulica && o.dzielnica) { const k = streetKey(o.ulica), d = normDz(o.dzielnica), key = k + '|' + d, p = pts.get(k); if (p && p.n >= 2 && !seen.has(key)) { seen.add(key); known.push({ la: p.la / p.n, lo: p.lo / p.n, d }); } }
  const cache = new Map(), K = Math.cos(51.25 * Math.PI / 180);
  const fn = (lat, lon) => {
    const ck = lat.toFixed(4) + ',' + lon.toFixed(4); if (cache.has(ck)) return cache.get(ck);
    let best = null, bd = 1e9; for (const k of known) { const dy = (lat - k.la) * 111.2, dx = (lon - k.lo) * 111.2 * K, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } }
    const v = best && bd <= 6.25 ? best.d : null; cache.set(ck, v); return v;
  };
  fn.known = known.length; return fn;
}

/* ---------- RENTOWNOŚĆ W DZIELNICACH ---------- */
// Czynsz ofertowy za m² (mediana z ofert w dzielnicy) do mediany ceny transakcyjnej za m² w tej samej dzielnicy (RCN, 1,5–3 lata). Obie strony dla mieszkań 30–70 m²,
// żeby porównywać podobne. Transakcje RCN nie mają dzielnicy: przypisujemy po najbliższej ulicy ze znaną dzielnicą (do 2,5 km), tak jak w kontroli ze sprzedażą.
export function yieldByDistrict(offers, tx, opts = {}) {
  const nowTs = opts.nowTs || Date.now(), lo = opts.m2min ?? 30, hi = opts.m2max ?? 70;
  const base = tx.filter(t => t.funkcja === 'mieszkalna' && t.izby > 0 && t.m2 >= lo && t.m2 <= hi && t.cena > 50000 && !t.wielolokalowa && t.pelne && t.lat != null);
  const inWin = yrs => base.filter(t => (t.ts ?? (t.rok ? Date.UTC(t.rok, 6, 1) : 0)) >= nowTs - yrs * 365.25 * 864e5);
  // ceny rosną, więc im świeższe transakcje, tym uczciwsza rentowność (czynsz jest dzisiejszy): 1,5 roku, a gdy za mało danych, 3 lata
  let win = 1.5, sales = inWin(win); if (sales.length < 400) { win = 3; sales = inWin(win); }
  const rents = offers.filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 >= lo && o.m2 <= hi && o.cena > 0 && o.dzielnica);
  if (sales.length < 100 || rents.length < 30) return { ok: false, reason: `Do porównania potrzeba co najmniej 100 transakcji RCN i 30 ofert najmu z dzielnicą (jest ${sales.length} i ${rents.length}).` };
  const pts = new Map();
  for (const t of sales) if (t.ulica) { const k = streetKey(t.ulica), p = pts.get(k) || pts.set(k, { la: 0, lo: 0, n: 0 }).get(k); p.la += t.lat; p.lo += t.lon; p.n++; }
  const known = [], seen = new Set(), label = new Map();
  for (const o of rents) if (o.ulica) { const k = streetKey(o.ulica), d = normDz(o.dzielnica), key = k + '|' + d, p = pts.get(k); if (!label.has(d)) label.set(d, o.dzielnica); if (p && p.n >= 2 && !seen.has(key)) { seen.add(key); known.push({ la: p.la / p.n, lo: p.lo / p.n, d }); } }
  if (known.length < 5) return { ok: false, reason: 'Za mało ulic ze znaną dzielnicą w ofertach, by przypisać dzielnice transakcjom.' };
  const D = new Map(), get = d => D.get(d) || D.set(d, { rent: [], sale: [] }).get(d);
  for (const o of rents) { const d = normDz(o.dzielnica); if (!label.has(d)) label.set(d, o.dzielnica); get(d).rent.push(o.cena / o.m2); }
  for (const t of sales) { let best = null, bd = 1e9; for (const k of known) { const d = haversine([t.lat, t.lon], [k.la, k.lo]); if (d < bd) { bd = d; best = k; } } if (best && bd <= 2.5) get(best.d).sale.push(t.cena / t.m2); }
  const rows = [];
  for (const [d, v] of D) {
    if (v.rent.length < 5 || v.sale.length < 30) continue;
    const r = med(v.rent), s = med(v.sale);
    rows.push({ d, name: label.get(d) || d, rent: r, sale: s, nr: v.rent.length, ns: v.sale.length, y: r * 12 / s * 100, yLo: quant(v.rent, 0.25) * 12 / s * 100, yHi: quant(v.rent, 0.75) * 12 / s * 100 });
  }
  rows.sort((a, b) => b.y - a.y);
  if (rows.length < 3) return { ok: false, reason: `Tylko ${rows.length} dzielnic ma dość danych (min. 5 ofert najmu i 30 transakcji). Dodawaj oferty najmu.` };
  const all = { rent: med(rents.map(o => o.cena / o.m2)), sale: med(sales.map(t => t.cena / t.m2)) }; all.y = all.rent * 12 / all.sale * 100;
  return { ok: true, rows, city: all, nSales: sales.length, nRents: rents.length, range: [lo, hi], windowYears: win };
}

/* ---------- WYKRESY SVG ---------- */
const GOLD = '#C8A44D', GOLDL = '#E6CE94', ASH = '#9A978F', LINE = 'rgba(232,229,222,.10)';
const niceTicks = (min, max, n = 4) => {
  const span = max - min || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const a = Math.floor(min / step) * step, out = []; for (let v = a; v <= max + step * 0.5; v += step) out.push(v); return out;
};

// Wykres liniowy z pasmem (środkowe 50%) i punktami; dotyk/najechanie pokazuje odczyt. points: [{t,label,med,p25,p75,n}]
export function lineChart(points, o = {}) {
  const W = 420, H = o.h || 250, R = 12, T = 12, B = 28, unit = o.unit || 'zł/m²';
  const vals = points.flatMap(p => [p.p25 ?? p.med, p.p75 ?? p.med, p.med]), vmin = Math.min(...vals), vmax = Math.max(...vals);
  const ticks = niceTicks(vmin - (vmax - vmin) * 0.05, vmax + (vmax - vmin) * 0.05, 4), y0 = ticks[0], y1 = ticks[ticks.length - 1], L = 14 + 6.3 * Math.max(...ticks.map(v => fmt(v).length));
  const t0 = points[0].t, t1 = points[points.length - 1].t, X = t => L + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const hasBand = points.every(p => p.p25 != null && p.p75 != null);
  const band = hasBand ? `<path d="M${points.map(p => `${X(p.t).toFixed(1)},${Y(p.p75).toFixed(1)}`).join(' L')} L${[...points].reverse().map(p => `${X(p.t).toFixed(1)},${Y(p.p25).toFixed(1)}`).join(' L')} Z" fill="${GOLD}" opacity=".13"/>` : '';
  const line = `<path d="M${points.map(p => `${X(p.t).toFixed(1)},${Y(p.med).toFixed(1)}`).join(' L')}" fill="none" stroke="${GOLD}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
  const grid = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${LINE}"/><text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" fill="${ASH}" font-size="11">${fmt(v)}</text>`).join('');
  // etykiety osi X: lata
  let lastX = -99; const years = [...new Set(points.map(p => new Date(p.t).getUTCFullYear()))].filter(y => { const x = X(Math.max(t0, Math.min(t1, Date.UTC(y, 0, 1)))); if (x - lastX < 34) return false; lastX = x; return true; }), xl = years.map(y => { const tt = Date.UTC(y, 0, 1), x = X(Math.max(t0, Math.min(t1, tt))); return `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${x < L + 12 ? 'start' : 'middle'}" fill="${ASH}" font-size="11">${y}</text>`; }).join('');
  const dots = points.map((p, i) => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.med).toFixed(1)}" r="${(2.6 + Math.min(3, Math.sqrt(p.n || 0) / 8)).toFixed(1)}" fill="#0B0B0D" stroke="${GOLDL}" stroke-width="1.6" data-i="${i}"/>`).join('');
  const data = esc(JSON.stringify(points.map(p => ({ x: +X(p.t).toFixed(1), l: p.label, m: Math.round(p.med), a: p.p25 != null ? Math.round(p.p25) : null, b: p.p75 != null ? Math.round(p.p75) : null, n: p.n ?? null }))));
  return `<div class="chart" data-chart="${data}" data-unit="${esc(unit)}" data-med="${esc(o.medLabel || 'mediana')}" data-band="${esc(o.bandLabel || 'środkowe 50%')}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Wykres')}" preserveAspectRatio="xMidYMid meet">${grid}${band}${line}${dots}${xl}<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="${GOLDL}" stroke-width="1" opacity="0" stroke-dasharray="3 3"/></svg><div class="chart-read" aria-live="polite">Dotknij wykresu, aby zobaczyć wartość.</div></div>`;
}

// Słupki poziome: rows [{name, y, yLo, yHi, sub}]; wąsy = środkowe 50% czynszów. ref: linia odniesienia (np. średnia miasta)
export function barChart(rows, o = {}) {
  const W = 400, rowH = 50, L = 92, R = 50, T = 10, H = T + rows.length * rowH + 22, max = Math.max(...rows.map(r => r.yHi ?? r.y)) * 1.08, X = v => L + v / max * (W - L - R);
  const ref = o.ref != null ? `<line x1="${X(o.ref).toFixed(1)}" x2="${X(o.ref).toFixed(1)}" y1="${T - 4}" y2="${H - 22}" stroke="${GOLDL}" stroke-dasharray="4 4" opacity=".7"/><text x="${X(o.ref).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="${GOLDL}" font-size="11">miasto ${o.ref.toFixed(1).replace('.', ',')}%</text>` : '';
  const g = rows.map((r, i) => {
    const y = T + i * rowH, cy = y + 14;
    return `<text x="${L - 10}" y="${cy + 5}" text-anchor="end" fill="#E8E5DE" font-size="12.5">${esc(r.name.length > 13 ? r.name.slice(0, 12) + '…' : r.name)}</text>
      <rect x="${L}" y="${cy - 9}" width="${Math.max(2, X(r.y) - L).toFixed(1)}" height="18" rx="4" fill="url(#bg)"/>
      ${r.yLo != null ? `<line x1="${X(r.yLo).toFixed(1)}" x2="${X(r.yHi).toFixed(1)}" y1="${cy}" y2="${cy}" stroke="#0B0B0D" stroke-width="2.2" opacity=".75"/><line x1="${X(r.yLo).toFixed(1)}" x2="${X(r.yLo).toFixed(1)}" y1="${cy - 5}" y2="${cy + 5}" stroke="#0B0B0D" stroke-width="2.2" opacity=".75"/><line x1="${X(r.yHi).toFixed(1)}" x2="${X(r.yHi).toFixed(1)}" y1="${cy - 5}" y2="${cy + 5}" stroke="#0B0B0D" stroke-width="2.2" opacity=".75"/>` : ''}
      <text x="${(X(r.yHi ?? r.y) + 8).toFixed(1)}" y="${cy + 5}" fill="${GOLDL}" font-size="13" font-weight="700">${r.y.toFixed(1).replace('.', ',')}%</text>
      <text x="${L}" y="${cy + 24}" fill="${ASH}" font-size="10">${esc(r.sub || '')}</text>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Wykres słupkowy')}"><defs><linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="#6E5721"/><stop offset="1" stop-color="${GOLD}"/></linearGradient></defs>${g}${ref}</svg></div>`;
}

// Interakcja: odczyt wartości po dotknięciu/najechaniu. Wywołać po wstawieniu HTML do dokumentu.
export function bindCharts(root) {
  root.querySelectorAll('[data-chart]').forEach(el => {
    let pts; try { pts = JSON.parse(el.dataset.chart); } catch { return; }
    const svg = el.querySelector('svg'), line = el.querySelector('.xh'), out = el.querySelector('.chart-read'), vb = svg.viewBox.baseVal;
    const show = ev => {
      const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * vb.width; let best = pts[0];
      for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
      line.setAttribute('x1', best.x); line.setAttribute('x2', best.x); line.setAttribute('opacity', '.8');
      out.innerHTML = `<b>${esc(best.l)}</b>: ${esc(el.dataset.med)} <b class="gold">${fmt(best.m)}</b> ${esc(el.dataset.unit)}${best.a != null ? ` · ${esc(el.dataset.band)}: ${fmt(best.a)}–${fmt(best.b)}` : ''}${best.n != null ? ` · ${best.n} transakcji` : ''}`;
    };
    svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show);
  });
}
