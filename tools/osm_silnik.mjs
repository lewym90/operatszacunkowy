// Czy otoczenie (OSM) tłumaczy resztę błędu PRAWDZIWEGO silnika wyceny sprzedaży?
// Dla losowych transakcji mieszkań z ostatnich 12 miesięcy liczy wycenę silnikiem aplikacji tylko z transakcji WCZEŚNIEJSZYCH (jak w walidacji z 30.10),
// potem sprawdza walidacją krzyżową, czy poprawka z cech otoczenia zmniejsza błąd tej wyceny.
// Użycie (z katalogu z js/engine.js i js/rcn.js): node osm_silnik.mjs rcn_lublin.json osm_lublin.json [liczba_transakcji]
import fs from 'node:fs';
import { rcnToObjects } from './js/rcn.js';
import { estimateSale } from './js/engine.js';

const rcn = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), osm = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), N = +process.argv[4] || 1500;
const names = osm.meta?.nazwy || {};
const tx = rcnToObjects(rcn).filter(t => t.ts).sort((a, b) => a.ts - b.ts);
const maxTs = tx[tx.length - 1].ts, from = maxTs - 365 * 864e5;
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const cand = tx.map((t, i) => [t, i]).filter(([t]) => t.ts >= from && t.funkcja === 'mieszkalna' && t.pelne && !t.wielolokalowa && t.izby > 0 && t.m2 >= 12 && t.m2 <= 250 && t.cena > 0 && t.lat != null && t.lon != null);
for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
const sample = cand.slice(0, N);
console.log(`Transakcji w ostatnich 12 mies. do wyboru: ${cand.length}, losuję ${sample.length}. Liczę wyceny silnikiem (może potrwać kilka minut)…`);

const recs = []; let skipped = 0, k = 0, t0 = Date.now();
for (const [t, idx] of sample) {
  const pool = tx.slice(0, idx).filter(x => x.id !== t.id && x.ts < t.ts);
  const r = estimateSale(pool, { tryb: 'sprzedaz', kat: 'mieszkanie', ulica: t.ulica, nr: t.nr, m2: t.m2, pokoje: t.izby, pietro: t.kond, rok: null, rynek: null, latlon: [t.lat, t.lon] }, { nowTs: t.ts, year: new Date(t.ts).getFullYear() });
  if (!r.ok) { skipped++; continue; }
  recs.push({ t, est: r.pm2.mid, act: t.cena / t.m2 });
  if (++k % 200 === 0) console.log(`  ${k} wycen, ${Math.round((Date.now() - t0) / 1000)} s`);
}
console.log(`Wycen: ${recs.length}, bez wyniku silnika: ${skipped}`);
if (recs.length < 300) { console.log('Za mało wycen do rzetelnego wniosku.'); process.exit(1); }

// cechy otoczenia
const KX = 111.32 * Math.cos(51.2 * Math.PI / 180), KY = 111.32, CELL = 0.005;
const grids = {};
for (const [key, pts] of Object.entries(osm.layers)) { if (pts.length < 5) continue; const g = new Map(); pts.forEach(([la, lo]) => { const c = Math.floor(la / CELL) + ',' + Math.floor(lo / CELL); (g.get(c) || g.set(c, []).get(c)).push([la, lo]); }); grids[key] = g; }
const dist = (a, b, c, d) => Math.hypot((a - c) * KY, (b - d) * KX);
function feat(g, la, lo) {
  const cy = Math.floor(la / CELL), cx = Math.floor(lo / CELL); let best = 1e9, cnt = 0;
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue; for (const [pa, po] of g.get((cy + dy) + ',' + (cx + dx)) || []) { const d = dist(la, lo, pa, po); if (d < best) best = d; if (d <= .5) cnt++; } }
    if (best < 1e9 && best <= r * CELL * KY * .55) break;
  }
  return [Math.log(best * 1000 + 50), Math.log1p(cnt)];
}
const F = {}; for (const key of Object.keys(grids)) F[key] = recs.map(r => feat(grids[key], r.t.lat, r.t.lon));
const y = recs.map(r => Math.log(r.act / r.est));   // reszta błędu silnika

function solve(A, b) { const n = A.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;[M[c], M[p]] = [M[p], M[c]]; const pv = M[c][c] || 1e-12; for (let j = c; j <= n; j++) M[c][j] /= pv; for (let r = 0; r < n; r++) if (r !== c && M[r][c]) { const f = M[r][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; } } return M.map(r => r[n]); }
function fit(X, t, lam) { const p = X[0].length, mu = Array(p).fill(0), sd = Array(p).fill(0); X.forEach(x => x.forEach((v, j) => mu[j] += v / X.length)); X.forEach(x => x.forEach((v, j) => sd[j] += (v - mu[j]) ** 2 / X.length)); sd.forEach((v, j) => sd[j] = Math.sqrt(v) || 1);
  const q = p + 1, A = Array.from({ length: q }, () => Array(q).fill(0)), b = Array(q).fill(0);
  X.forEach((x, n) => { const z = [...x.map((v, j) => (v - mu[j]) / sd[j]), 1]; for (let i = 0; i < q; i++) { b[i] += z[i] * t[n]; for (let j = 0; j < q; j++) A[i][j] += z[i] * z[j]; } });
  for (let i = 0; i < p; i++) A[i][i] += lam; const w = solve(A, b); return x => x.reduce((s, v, j) => s + w[j] * (v - mu[j]) / sd[j], 0) + w[p]; }
const med = a => { const s = [...a].sort((u, v) => u - v); return s[Math.floor(s.length / 2)]; }, mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const n = recs.length, order = [...Array(n).keys()].sort(() => rnd() - .5), K = 5;
function cv(keys) {
  const pred = Array(n).fill(0);
  if (keys.length) for (let f = 0; f < K; f++) { const te = order.filter((_, i) => i % K === f), tr = order.filter((_, i) => i % K !== f), X = i => keys.flatMap(k => F[k][i]); const m = fit(tr.map(X), tr.map(i => y[i]), 30); te.forEach(i => pred[i] = m(X(i))); }
  else { const m0 = mean(y); pred.fill(m0 * 0); }
  return recs.map((r, i) => Math.abs(Math.exp(y[i] - pred[i]) - 1));
}
const base = cv([]);
console.log(`\nSilnik bez poprawki: typowy błąd (mediana) ${(med(base) * 100).toFixed(2)}%, średni ${(mean(base) * 100).toFixed(2)}%, odchylenie systematyczne ${(Math.exp(mean(y)) * 100 - 100).toFixed(2)}% (dodatnie = wycena zaniżona)`);
console.log(`\n${'Poprawka z otoczenia'.padEnd(36)}${'mediana błędu'.padStart(15)}${'średni błąd'.padStart(13)}${'zmiana średniego'.padStart(18)}${'t'.padStart(7)}  wniosek`);
const rows = [...Object.keys(F).map(k => [names[k] || k, [k]]), ['wszystkie warstwy', Object.keys(F)]];
for (const [nm, keys] of rows) {
  const e = cv(keys), d = base.map((b, i) => b - e[i]), md = mean(d), se = Math.sqrt(mean(d.map(v => (v - md) ** 2)) / n) || 1e-9, tt = md / se;
  console.log(`${nm.padEnd(36)}${(med(e) * 100).toFixed(2).padStart(14)}%${(mean(e) * 100).toFixed(2).padStart(12)}%${((md * 100 >= 0 ? '+' : '') + (md * 100).toFixed(2) + ' pp').padStart(18)}${tt.toFixed(1).padStart(7)}  ${md > .001 && tt > 2.5 ? 'POMAGA' : md < -.001 && tt < -2.5 ? 'szkodzi' : 'bez znaczenia'}`);
}
console.log('\nPoprawka uczona walidacją krzyżową 5-krotną na resztach silnika. „zmiana średniego” dodatnia = średni błąd spada. Wdrażać tylko warstwy z POMAGA i dopiero gdy zysk jest praktycznie istotny (rzędu co najmniej 0,5 pkt).');
