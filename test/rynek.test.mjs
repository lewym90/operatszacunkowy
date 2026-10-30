import assert from 'node:assert/strict';
import { trendSeries, yieldByDistrict, districtAssigner, lineChart, barChart } from '../js/rynek.js';
// deterministyczny generator
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const NOW = Date.UTC(2026, 9, 29), YR = 365.25 * 864e5;
// transakcje: cena m2 rośnie 8% rocznie (od 8000 zł/m² 6 lat temu), 3 "dzielnice" w różnych miejscach
const DZ = [{ n: 'Śródmieście', la: 51.247, lo: 22.568, base: 1.15, st: ['Krakowskie Przedmieście', 'Lipowa', 'Narutowicza'] }, { n: 'Wrotków', la: 51.225, lo: 22.505, base: 0.95, st: ['Granata', 'Wrotkowska', 'Hutnicza'] }, { n: 'Czuby', la: 51.226, lo: 22.53, base: 1.0, st: ['Dworska', 'Rudnicka', 'Wileńska'] }];
const tx = [];
for (let i = 0; i < 4000; i++) {
  const d = DZ[i % 3], age = rnd() * 6 * YR, ts = NOW - age, m2 = 28 + rnd() * 40, pm2 = 8000 * Math.pow(1.08, (6 * YR - age) / YR) * d.base * (0.85 + rnd() * 0.3);
  tx.push({ id: 'T' + i, kat: 'mieszkanie', funkcja: 'mieszkalna', izby: 2, m2, cena: pm2 * m2, ts, rynek: i % 4 ? 'wtorny' : 'pierwotny', lat: d.la + (rnd() - .5) * .01, lon: d.lo + (rnd() - .5) * .01, ulica: d.st[Math.floor(i / 3) % 3], nr: '1', wielolokalowa: false, pelne: true, rok: 0 });
}
const T = trendSeries(tx, { kat: 'mieszkanie', years: 6, nowTs: NOW });
assert.ok(T.ok, T.reason);
assert.ok(T.points.length >= 12, 'punktów: ' + T.points.length);
assert.ok(T.points[T.points.length - 1].med > T.points[0].med * 1.4, 'trend rośnie');
assert.ok(T.yoy && Math.abs(T.yoy.pct - 8) < 3, 'rok do roku ~8%: ' + (T.yoy && T.yoy.pct));
// filtr okolicy: tylko Wrotków (ok. 3 km od Śródmieścia) — niższa cena niż miasto
const W = trendSeries(tx, { kat: 'mieszkanie', years: 6, nowTs: NOW, center: [51.225, 22.505], radiusKm: 1 });
assert.ok(W.ok && W.n < T.n / 2); assert.ok(W.points[W.points.length - 1].med < T.points[T.points.length - 1].med);
// za mało danych → brak wyniku, nie zgadywanie
const few = trendSeries(tx.slice(0, 15), { nowTs: NOW }); assert.equal(few.ok, false);
// rentowność: oferty z dzielnicą; czynsz proporcjonalny do ceny (Śródmieście 5%, Wrotków 6.5%, Czuby 5.5%)
const yld = { Śródmieście: 0.05, Wrotków: 0.065, Czuby: 0.055 }, offers = [];
for (let i = 0; i < 150; i++) { const d = DZ[i % 3], m2 = 30 + rnd() * 35, sale = 8000 * Math.pow(1.08, 6) * d.base; offers.push({ id: 'o' + i, cena: m2 * sale * yld[d.n] / 12 * (0.9 + rnd() * 0.2), m2, pokoje: 2, ulica: d.st[Math.floor(i / 3) % 3], dzielnica: d.n, wlaczone: true, flagi: [] }); }
const Y = yieldByDistrict(offers, tx, { nowTs: NOW });
assert.ok(Y.ok, Y.reason); assert.equal(Y.rows.length, 3);
assert.equal(Y.rows[0].name, 'Wrotków'); const by = Object.fromEntries(Y.rows.map(r => [r.name, r.y]));
for (const k of Object.keys(yld)) assert.ok(Math.abs(by[k] - yld[k] * 100) < 1.3, k + ' ' + by[k]);
assert.equal(yieldByDistrict(offers.slice(0, 10), tx, { nowTs: NOW }).ok, false);
// filtr dzielnicy: przypisanie po najbliższej ulicy ze znaną dzielnicą
const asg = districtAssigner(offers, tx); assert.ok(asg.known >= 5);
const WD = trendSeries(tx, { years: 6, nowTs: NOW, pred: s => asg(s.lat, s.lon) === 'wrotkow' });
assert.ok(WD.ok && Math.abs(WD.n - tx.length / 3) < tx.length * 0.08, 'dzielnica Wrotków ~1/3 transakcji: ' + (WD && WD.n));
assert.ok(WD.points[WD.points.length - 1].med < T.points[T.points.length - 1].med);
// wykresy generują poprawny SVG
const svg = lineChart(T.points); assert.ok(svg.includes('<svg') && svg.includes('data-chart') && !svg.includes('NaN') && !svg.includes('undefined'));
const bar = barChart(Y.rows.map(r => ({ name: r.name, y: r.y, yLo: r.yLo, yHi: r.yHi, sub: 'x' })), { ref: Y.city.y }); assert.ok(bar.includes('<svg') && !bar.includes('NaN'));
console.log('rynek.test: OK', T.points.length, 'punktów, rok do roku', T.yoy.pct.toFixed(1) + '%', Y.rows.map(r => r.name + ' ' + r.y.toFixed(1)).join(', '));
