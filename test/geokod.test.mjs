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
console.log('OK geokod');
