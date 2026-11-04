import assert from 'node:assert/strict';
import { neff, qualityOf, compWhy, diffWyceny } from '../js/jakosc.js';
import { promienie, opisLokalizacji, plForm } from '../js/osm.js';
import { clusterItems, districtCenters } from '../js/mapa.js';
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);
near(neff([{ w: 1 }, { w: 1 }, { w: 1 }, { w: 1 }, { w: 1 }]), 5); near(neff([{ w: 1 }, ...Array(39).fill({ w: .01 })]), (1.39 ** 2) / (1 + 39 * 1e-4), 1e-6);
const comp = (i, o = {}) => ({ id: 'c' + i, kind: 'transakcja', w: .8, m2: 50, pokoje: 2, pietro: 1, ageY: .5, lat: 51.25 + (i % 2 ? .002 : -.002), lon: 22.57 + (i % 4 < 2 ? .002 : -.002), pm2: 10000, ...o });
const good = { ok: true, n: 12, dropped: 0, pm2: { lo: 9500, mid: 10000, hi: 10500 }, subLL: [51.25, 22.57], comps: Array.from({ length: 12 }, (_, i) => comp(i)) };
const q = qualityOf(good, { nowTs: 0 }); assert.equal(q.level, 'mocny'); assert.deepEqual(q.warn, []); assert.ok(q.rows.find(r => r.k === 'miejsce').val.includes('4 z 4'));
const bad = { ok: true, n: 4, dropped: 3, pm2: { lo: 7000, mid: 10000, hi: 14000 }, subLL: [51.25, 22.57], comps: [comp(0, { w: .1, ageY: 4.5, lat: 51.3 }), comp(1, { w: .1, ageY: 4, lat: 51.3 }), comp(2, { w: .1, ageY: 4, lat: 51.3 }), comp(3, { w: .1, ageY: 4, lat: 51.3 })] };
const qb = qualityOf(bad); assert.equal(qb.level, 'słaby'); assert.ok(qb.warn.includes('Aktualność') && qb.warn.includes('Rozrzut cen') && qb.warn.includes('Rozmieszczenie'));
assert.equal(qualityOf({ ok: false }), null);
const rent = { ok: true, n: 30, dropped: 0, pm2: { lo: 50, mid: 55, hi: 60 }, model: { agreement: .25 }, cross: { ok: true, agreement: 'rozbieżne' }, comps: Array.from({ length: 30 }, (_, i) => ({ id: i, kind: 'oferta', w: 1, m2: 50 })) };
const qr = qualityOf(rent); assert.ok(!qr.rows.find(r => r.k === 'pod') && !qr.rows.find(r => r.k === 'wiek') && qr.warn.includes('Zgodność metod') && qr.warn.includes('Kontrola ze sprzedażą'));
// powody porównania
const wy = compWhy(good.comps[0], good, { m2: 50, pokoje: 2, pietro: 1 }); near(wy.share, 100 / 12); assert.ok(wy.reasons.includes('taki sam metraż') && wy.reasons.includes('ta sama liczba pokoi') && wy.reasons.includes('to samo piętro') && wy.reasons.some(r => /od wycenianej/.test(r)) && wy.reasons.some(r => /mies/.test(r)));
const wy2 = compWhy({ ...comp(0), sameBuilding: true, m2: 60, pokoje: 3, pietro: 0, pm2raw: 9000, pm2: 9900, own: true }, good, { m2: 50, pokoje: 2, pietro: 1 }); assert.ok(wy2.reasons.includes('ten sam budynek') && wy2.reasons.includes('metraż +20%') && wy2.reasons.includes('liczba pokoi: 3') && wy2.reasons.includes('piętro: parter') && wy2.reasons.includes('korekta czasu +10,0%') && wy2.reasons.some(r => /własna/.test(r)));
assert.deepEqual(compWhy({ w: 1, m2: 100, pokoje: null, pietro: null }, { comps: [{ w: 1 }] }, { m2: 100, pokoje: null }).reasons, ['taki sam metraż']);
// porównanie wycen
const E = (lo, hi, ids, o = {}) => ({ ts: o.ts || 0, ver: o.ver, baza: o.baza, subj: { m2: 50, pokoje: 2, ...o.s }, res: { ok: true, n: ids.length, total: { lo, mid: (lo + hi) / 2, hi }, confidence: { level: 'średnia' }, comps: ids.map(id => ({ id })) } });
const d = diffWyceny(E(90, 110, [1, 2, 3], { ver: '1.21.3', baza: { rcn: 100, ofert: 5 } }), E(100, 120, [2, 3, 4, 5], { ts: 10 * 864e5, ver: '1.23.0', baza: { rcn: 120, ofert: 5 }, s: { m2: 52 } }));
near(d.delta, 10); near(d.pct, 10 / 100 * 100, 1e-9); assert.equal(d.nowe, 2); assert.equal(d.ubyly, 1); assert.equal(d.dni, 10); assert.deepEqual(d.zmiany, ['metraż']); assert.equal(d.powody.length, 4);
assert.deepEqual(diffWyceny(E(1, 2, [1]), E(1, 2, [1])).powody, ['Dane i zestaw porównań są takie same.']); assert.equal(diffWyceny({ res: { ok: false } }, E(1, 2, [1])), null);
// lokalizacja
assert.equal(plForm(1, 'abc'.split('')), 'a'); assert.equal(plForm(3, 'abc'.split('')), 'b'); assert.equal(plForm(5, 'abc'.split('')), 'c'); assert.equal(plForm(12, 'abc'.split('')), 'c'); assert.equal(plForm(22, 'abc'.split('')), 'b'); assert.equal(plForm(0, 'abc'.split('')), 'c');
const ll = [51.25, 22.57], D = m => [51.25 + m / 111195, 22.57];
const P = promienie(ll, { przystanki: [D(200), D(400), D(450), D(2500)], parki: [D(1500)], szkoly: [] }); assert.equal(P.length, 2); assert.deepEqual(P[0].n, [1, 3, 3, 3, 4]); assert.deepEqual(P[1].n, [0, 0, 0, 1, 1]); near(P[0].m, 200, 1);
assert.equal(opisLokalizacji(P), 'W promieniu 500 m od budynku: 3 przystanki. Dalej niż 1 km, najbliższe: park: ok. 1,5 km.');
assert.equal(opisLokalizacji(promienie(ll, { parki: [D(1500)] })), 'W promieniu 1 km od budynku nie ma w danych mapowych punktów tych rodzajów.'); assert.equal(opisLokalizacji([]), '');
assert.equal(opisLokalizacji(promienie(ll, { przystanki: [D(100)], sklepy: [D(800), D(900)] })), 'W promieniu 500 m od budynku: 1 przystanek. W promieniu 1 km: 1 przystanek i 2 supermarkety.');
// grupowanie i środki dzielnic
const it = [{ x: 1, y: 1, v: 10 }, { x: 2, y: 2, v: 20 }, { x: 3, y: 3, v: 30 }, { x: 100, y: 100, v: 5 }], cl = clusterItems(it, i => i); assert.equal(cl.groups.length, 1); assert.equal(cl.groups[0].n, 3); assert.equal(cl.groups[0].med, 20); assert.equal(cl.single.length, 1);
const cen = new Map([['a', { lat: 1, lon: 1 }], ['b', { lat: 3, lon: 3 }]]); const dc = districtCenters([{ ulica: 'A', dzielnica: 'X' }, { ulica: 'A', dzielnica: 'X' }, { ulica: 'B', dzielnica: 'X' }, { ulica: 'B', dzielnica: 'Y' }], new Map([...cen].map(([k, v]) => [k.toUpperCase() && k, v])), x => x);
assert.equal(dc.size, 1); near(dc.get('X').lat, 2); console.log('jakosc.test: OK');
