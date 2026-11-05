import assert from 'node:assert/strict';
import { sekcje, ocen } from '../js/ogledziny.js';
const all = k => sekcje(k).flatMap(([, l]) => l), dobre = (k = 'mieszkanie') => { const a = {}; for (const e of all(k)) a[e.id] = e.typ === 'stan' ? 'd' : e.typ === 'wil' || e.typ === 'zap' ? 'b' : 't'; return a; };
assert.equal(all('mieszkanie').length, 25); assert.equal(all('dom').length, 25); assert.ok(all('dom').some(e => e.id === 'dach') && !all('dom').some(e => e.id === 'klatka'));
assert.equal(ocen({ ans: dobre() }).kat, 'wysoki'); assert.deepEqual(ocen({ ans: dobre() }).wstep, []);
assert.equal(ocen({ ans: {}, dev: true }).kat, 'deweloperski');
assert.equal(ocen({ ans: { ...dobre(), klasa: 'n' } }).kat, 'przeciętny', 'bez klasy nie ma wysokiego');
assert.equal(ocen({ ans: { ...dobre(), arm: 'n' } }).kat, 'przeciętny'); assert.equal(ocen({ ans: { ...dobre(), wilgoc: 'm' } }).kat, 'przeciętny', 'miejscowe blokuje wysoki, nie daje niskiego');
assert.equal(ocen({ ans: { ...dobre(), wilgoc: 'r' } }).kat, 'niski'); assert.ok(ocen({ ans: { ...dobre(), wilgoc: 'r' } }).popraw[0].includes('sprawdzić przyczynę'));
assert.equal(ocen({ ans: { ...dobre(), okna: 'w' } }).kat, 'niski', 'element podstawowy do wymiany'); assert.equal(ocen({ ans: { ...dobre(), drzwi: 'w' } }).kat, 'przeciętny');
{ const a = dobre(); for (const k of ['drzwi', 'drzwiw', 'sufity', 'sciany']) a[k] = 'w'; assert.equal(ocen({ ans: a }).kat, 'przeciętny'); a.kmeble = 'w'; assert.equal(ocen({ ans: a }).kat, 'niski', '5 pozostałych do wymiany'); }
{ const r = ocen({ ans: { ...dobre(), iwod: 'ns' } }); assert.deepEqual(r.wstep, ['instalacja wodno-kanalizacyjna']); assert.ok(r.nie.includes('Instalacja wodno-kanalizacyjna')); }
{ const a = dobre(); delete a.wilgoc; assert.ok(ocen({ ans: a }).wstep.includes('ślady wilgoci lub pleśni')); }
assert.equal(ocen({ ans: { okna: 'd' } }).kat, null, 'za mało danych = brak wyniku'); assert.equal(ocen({ ans: { okna: 'w' } }).kat, 'niski');
{ const a = { ...dobre(), igaz: 'nd', klatka: 'nd' }; const r = ocen({ ans: a }); assert.equal(r.kat, 'wysoki'); assert.equal(r.ile, 23); assert.deepEqual(r.wstep, []); }
assert.equal(ocen({ ans: { ...dobre(), elew: 'w' } }).kat, 'wysoki', 'budynek nie wchodzi do standardu lokalu'); assert.ok(ocen({ ans: { ...dobre(), elew: 'w' } }).popraw.some(x => x.startsWith('Elewacja')));
assert.equal(ocen({ ans: { ...dobre(), kmeble: 'ns' } }).kat, 'przeciętny', 'wysoki wymaga sprawdzonej kuchni i łazienki');
assert.equal(ocen({ ans: { ...dobre(), kmeble: 'nd' } }).kat, 'wysoki');
assert.ok(ocen({ ans: { ...dobre(), klasa: 'n' } }).why.includes('dobrej klasy')); assert.ok(ocen({ ans: { ...dobre(), wilgoc: 'm' } }).why.includes('wilgoci'));
assert.ok(ocen({ ans: dobre() }).atuty.some(x => x.includes('sprzęt AGD')));
console.log('ogledziny.test: OK');
