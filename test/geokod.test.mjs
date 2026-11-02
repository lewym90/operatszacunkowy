// Geokodowanie PRG: konwersja współrzędnych, dopasowanie nazw ulic (w tym odrzucenie fałszywych trafień) i obsługa odpowiedzi geokodera na podstawionych danych.
import assert from 'node:assert';
import { fromEpsg2180, streetMatches, streetTokens, geocode } from '../js/geokod.js';
const [la, lo] = fromEpsg2180(748124.91, 376302.7);        // Granata 1, odpowiedź UUG z 2.11.2026
assert(Math.abs(la - 51.19946119) < 2e-6 && Math.abs(lo - 22.55287646) < 2e-6, 'konwersja 2180→WGS84 zgodna z implementacją referencyjną (Python): ' + la + ',' + lo);
// nazwy ulic
assert(streetMatches('Granata', 'Ks. Wincentego Granata'), 'Granata ↔ Ks. Wincentego Granata');
assert(streetMatches('ul. Granata', 'Ks. Wincentego Granata'));
assert(streetMatches('Wincentego Granata', 'Ks. Wincentego Granata'));
assert(streetMatches('Krężnickiej', 'Krężnicka'), 'forma odmieniona: Krężnickiej ↔ Krężnicka');
assert(streetMatches('Kreżnickiej', 'Krężnicka'), 'brak/zamiana polskich znaków diakrytycznych nie przeszkadza');
assert(streetMatches('Aleje Racławickie', 'aleje Racławickie') && streetMatches('Racławickie', 'aleje Racławickie'));
assert(!streetMatches('płk. Władysława Rokickiego', 'Władysława Ruckiego'), 'fałszywe trafienie z kontroli (Rokickiego ≠ Ruckiego) musi być odrzucone');
assert(!streetMatches('Rokickiego', 'Ruckiego'), 'Rokickiego ≠ Ruckiego');
assert(!streetMatches('Zamojska', 'Zamoyskiego') && !streetMatches('Lipowa', 'Lipinskiego'), 'różne ulice o podobnym początku');
assert.deepStrictEqual(streetTokens('ul. Ks. Wincentego Granata'), ['wincentego', 'granata']);
// geokoder (podstawiony)
const reply = (rows) => async () => ({ ok: true, json: async () => ({ results: Object.fromEntries(rows.map((r, i) => [String(i + 1), r])) }) });
const G = { city: 'Lublin', street: 'Ks. Wincentego Granata', number: '1', ulic: '54369', code: '20-489', x: '748124.91', y: '376302.7' };
let r = await geocode({ ulica: 'Granata', nr: '1', fetchFn: reply([G]) });
assert(r.ok && r.street === 'Ks. Wincentego Granata' && Math.abs(r.ll[0] - 51.199461) < 1e-5 && r.source === 'prg', 'Granata 1 znaleziona');
r = await geocode({ ulica: 'Granata', nr: '1', fetchFn: reply([{ ...G, street: 'Al. Wincentego Witosa', ulic: '1' }]) });
assert(!r.ok && r.code === 'nie_znaleziono', 'inna ulica o podobnym numerze odrzucona');
r = await geocode({ ulica: 'Granata', nr: '1', fetchFn: reply([{ ...G, number: '3' }]) });
assert(!r.ok && r.code === 'nie_znaleziono', 'inny numer odrzucony');
r = await geocode({ ulica: 'Granata', nr: '1', fetchFn: reply([{ ...G, city: 'Świdnik' }]) });
assert(!r.ok, 'inna miejscowość odrzucona');
r = await geocode({ ulica: 'Granata', nr: '', fetchFn: reply([G]) }); assert(!r.ok && r.code === 'brak_numeru', 'bez numeru: brak współrzędnych (nie środek ulicy)');
r = await geocode({ ulica: '', nr: '1', fetchFn: reply([G]) }); assert(!r.ok && r.code === 'brak_ulicy');
r = await geocode({ ulica: 'Krężnicka', nr: '275', fetchFn: reply([]) }); assert(!r.ok && r.code === 'nie_znaleziono' && /nie ma budynku/.test(r.message), 'brak adresu w rejestrze: komunikat');
r = await geocode({ ulica: 'Wincentego', nr: '1', fetchFn: reply([G, { ...G, street: 'Wincentego Pola', ulic: '2' }]) }); assert(!r.ok && r.code === 'niejednoznaczne' && r.candidates.length === 2, 'kilka pasujących ulic: wybór');
r = await geocode({ ulica: 'Granata', nr: '1b', fetchFn: reply([{ ...G, number: '1B' }]) }); assert(r.ok, 'numer z literą, wielkość liter bez znaczenia');
r = await geocode({ ulica: 'Granata', nr: '99', fetchFn: async () => { throw new Error('offline'); } }); assert(!r.ok && r.code === 'siec', 'brak sieci i brak pamięci: komunikat o błędzie połączenia, bez współrzędnych');
// literówka: Granta → podpowiedź Granata (tylko gdy numer istnieje), Rokickiego → bez podpowiedzi
import { suggest, nearName, editDistance } from '../js/geokod.js';
assert(editDistance('granta', 'granata') === 1 && nearName('Granta', 'Ks. Wincentego Granata'), 'literówka Granta ≈ Granata');
assert(!nearName('Rokickiego', 'Władysława Ruckiego'), 'Rokickiego nie jest „blisko” Ruckiego');
const byAddr = a => async u => { const q = decodeURIComponent(new URL(u).searchParams.get('address')).replace(/^Lublin,\s*/, ''); const hit = a[q]; return { ok: true, json: async () => ({ results: hit ? Object.fromEntries(hit.map((r, i) => [String(i + 1), r])) : null }) }; };
let sg = await suggest({ ulica: 'Granta', nr: '1', fetchFn: byAddr({ 'Granta': [{ city: 'Lublin', street: 'Ks. Wincentego Granata' }], 'Ks. Wincentego Granata 1': [G] }) });
assert(sg.length === 1 && sg[0].street === 'Ks. Wincentego Granata', 'podpowiedź z geokodera');
sg = await suggest({ ulica: 'Granta', nr: '1', known: ['Granata', 'Zamojska'], fetchFn: byAddr({ 'Granata 1': [G] }) });
assert(sg.length === 1 && sg[0].number === '1', 'podpowiedź z listy ulic aplikacji');
sg = await suggest({ ulica: 'Granta', nr: '777', known: ['Granata'], fetchFn: byAddr({}) }); assert(sg.length === 0, 'brak podpowiedzi, gdy numer nie istnieje w rejestrze');
sg = await suggest({ ulica: 'Rokickiego', nr: '2', known: [], fetchFn: byAddr({ 'Rokickiego': [{ city: 'Lublin', street: 'Władysława Ruckiego' }], 'Władysława Ruckiego 2': [{ ...G, street: 'Władysława Ruckiego', number: '2' }] }) }); assert(sg.length === 0, 'inna ulica nie jest podpowiadana jako literówka');
console.log('OK geokod');
