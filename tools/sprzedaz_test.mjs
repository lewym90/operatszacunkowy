// Test trafności wycen SPRZEDAŻY na prawdziwych transakcjach RCN obszaru (Kraków i okolice, Lublin dla porównania).
// Metoda jak walidacja Lublina (KONTYNUACJA, rozdz. 4): próba transakcji z ostatnich miesięcy, każda wyceniana silnikiem aplikacji
// wyłącznie z transakcji WCZEŚNIEJSZYCH (bez własnego aktu), porównanie środka przedziału z ceną z aktu.
// Podmiot dostaje położenie budynku (w aplikacji daje je rejestr adresów PRG), pokoje, piętro, miejscowość. Rynek: osobno z podanym i bez.
// Użycie: node tools/sprzedaz_test.mjs --lokale rcn_lokale.json [--inne rcn_inne.json] [--n 400] [--mies 6] [--miasto Kraków] [--seed 1]
import fs from 'fs';
import { estimateSale, estimateSaleKat } from '../js/engine.js';
import { rcnToObjects, inneToObjects } from '../js/rcn.js';

const A = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, r) => (x.startsWith('--') ? a.push([x.slice(2), r[i + 1] && !r[i + 1].startsWith('--') ? r[i + 1] : '1']) : 0, a), []));
const N = +(A.n || 400), MIES = +(A.mies || 6), MIASTO = A.miasto || '';
let sd = +(A.seed || 1); const rnd = () => (sd = (sd * 1664525 + 1013904223) % 4294967296) / 4294967296;
const med = a => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pc = x => (x * 100).toFixed(1).replace('.', ',') + '%';
const tranOf = t => String(t.id || '').split('#')[1] || String(t.id || t.tran || '');
const fold = s => String(s || '').toLowerCase();
const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));

const L = load(A.lokale); const tx = rcnToObjects(L, {}); const inne = A.inne ? inneToObjects(load(A.inne), {}) : [];
const pool = tx.concat(inne);
const tsMax = tx.reduce((m, t) => t.ts && t.ts <= Date.now() && t.ts > m ? t.ts : m, 0), od = tsMax - MIES * 30.44 * 864e5;
console.log(`Dane: ${tx.length} lokali, ${inne.length} domów/obiektów/gruntów; najnowsza transakcja ${new Date(tsMax).toISOString().slice(0, 10)}; próba z ostatnich ${MIES} mies.`);

function probka(arr, n) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
function podsum(rows, tytul) {
  const ok = rows.filter(r => r && r.ok), abs = ok.map(r => Math.abs(r.e));
  if (!ok.length) return console.log(`  ${tytul}: brak wycen`);
  console.log(`  ${tytul}: wycen ${ok.length}/${rows.length}, mediana błędu ${pc(med(abs))}, średni ${pc(abs.reduce((s, x) => s + x, 0) / abs.length)}, obciążenie ${pc(med(ok.map(r => r.e)))}, do 10%: ${pc(abs.filter(x => x <= .1).length / ok.length)}, do 20%: ${pc(abs.filter(x => x <= .2).length / ok.length)}, w przedziale ${pc(ok.filter(r => r.in).length / ok.length)}`);
}
function grupy(rows, nazwa, f) { const g = new Map(); rows.forEach(r => { if (!r || !r.ok) return; const k = f(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }); console.log(` ${nazwa}:`); [...g.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => podsum(v, k)); }

// ---------- MIESZKANIA ----------
const flats = tx.filter(t => t.kat === 'mieszkanie' && t.funkcja === 'mieszkalna' && t.ts >= od && t.lat != null && t.izby > 0 && t.m2 >= 15 && t.m2 <= 200 && t.cena > 50000 && !t.wielolokalowa && t.pelne && (!MIASTO || fold(t.msc) === fold(MIASTO)));
const sm = probka(flats, N);
const t0 = Date.now();
const wycen = (x, rynek) => {
  const tr = tranOf(x), p = tx.filter(t => t.ts && t.ts < x.ts && tranOf(t) !== tr);
  const subj = { tryb: 'sprzedaz', kat: 'mieszkanie', ulica: x.ulica, nr: x.nr, m2: x.m2, pokoje: x.izby, pietro: x.kond, rynek: rynek ? x.rynek : null, latlon: [x.lat, x.lon], ...(x.msc ? { miasto: x.msc } : {}) };
  const r = estimateSale(p, subj, { nowTs: x.ts });
  if (!r.ok) return { ok: false };
  const mid = (r.total.lo + r.total.hi) / 2;
  return { ok: true, e: (mid - x.cena) / x.cena, in: x.cena >= r.total.lo && x.cena <= r.total.hi, lv: r.confidence?.level, rynek: x.rynek || '?', miasto: fold(x.msc) === 'kraków' || fold(x.msc) === 'krakow' ? 'Kraków (miasto)' : x.msc ? 'okolice' : '—', m2: x.m2, n: r.n, ta: r.timeAdj };
};
const R1 = sm.map(x => wycen(x, true)), R0 = sm.map(x => wycen(x, false));
console.log(`\nMIESZKANIA (${sm.length} transakcji z ${flats.length}; ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
podsum(R1, 'z podanym rynkiem (pierwotny/wtórny)');
podsum(R0, 'bez rynku');
grupy(R1, 'wg rynku', r => r.rynek);
grupy(R1, 'wg miejsca', r => r.miasto);
grupy(R1, 'wg pewności', r => r.lv);
grupy(R1, 'wg metrażu', r => r.m2 < 40 ? 'do 40 m²' : r.m2 < 60 ? '40–60 m²' : r.m2 < 90 ? '60–90 m²' : '90+ m²');

// ---------- POZOSTAŁE RODZAJE ----------
const KN = { dom: 'DOMY', dzialka: 'DZIAŁKI', lokal: 'LOKALE UŻYTKOWE', garaz: 'GARAŻE', obiekt: 'OBIEKTY / HALE' };
for (const kat of Object.keys(KN)) {
  const src = (kat === 'lokal' || kat === 'garaz') ? tx : inne;
  const all = src.filter(t => t.kat === kat && t.ts >= od && t.lat != null && t.m2 > 0 && t.cena > 0 && t.pelne !== false && !t.wielolokalowa && !t.wiele && (!MIASTO || fold(t.msc) === fold(MIASTO)));
  const s = probka(all, Math.min(N, 250)), t1 = Date.now();
  const R = s.map(x => {
    const tr = tranOf(x), p = pool.filter(t => t.ts && t.ts < x.ts && tranOf(t) !== tr);
    const subj = { tryb: 'sprzedaz', kat, pod: x.pod || null, m2: x.m2, dzm2: x.dzm2 || null, ulica: x.ulica, nr: x.nr, rynek: null, latlon: [x.lat, x.lon], ...(x.msc ? { miasto: x.msc } : {}) };
    const r = estimateSaleKat(p, subj, { geo: p, nowTs: x.ts });
    if (!r.ok) return { ok: false };
    const mid = (r.total.lo + r.total.hi) / 2;
    return { ok: true, e: (mid - x.cena) / x.cena, in: x.cena >= r.total.lo && x.cena <= r.total.hi, lv: r.confidence?.level };
  });
  console.log(`\n${KN[kat]} (${s.length} z ${all.length}; ${((Date.now() - t1) / 1000).toFixed(0)} s)`);
  podsum(R, 'razem'); grupy(R, 'wg pewności', r => r.lv);
}
