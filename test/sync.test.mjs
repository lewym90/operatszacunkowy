// Test synchronizacji na dwóch/trzech "urządzeniach" wobec prawdziwego serwera (server/sync_server.py).
// Uruchom: OPERAT_SYNC_KEY=... OPERAT_SYNC_DB=/tmp/x/sync.db python3 server/sync_server.py &  potem:  node test/sync.test.mjs http://127.0.0.1:8787 KLUCZ
import { createSync, hash } from '../js/sync.js';
import assert from 'node:assert/strict';
const [URL, KEY] = process.argv.slice(2);
let clock = 1_000_000;                       // wspólny zegar sterowany z testu
const tick = (n = 1000) => (clock += n);

function device(name, init = {}) {
  const S = { offers: [], wlasne: [], wyceny: [], budynki: {}, ust: { biuro: 'AM Nieruchomości', haslo: 'Sprawdzone do końca.', rcnUrl: '' }, ...init };
  const DEF = JSON.stringify(S.ust); const mem = new Map();
  const kv = { get: async (k, d) => (mem.has(k) ? mem.get(k) : d), set: async (k, v) => { mem.set(k, v); } };
  const mapApply = (key, sorter) => (u, d) => { const m = new Map(S[key].map(x => [x.id, x])); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); S[key] = [...m.values()]; if (sorter) S[key].sort(sorter); };
  const adapters = {
    offers: { read: () => S.offers.map(o => [o.id, o]), apply: mapApply('offers') },
    wlasne: { read: () => S.wlasne.map(o => [o.id, o]), apply: mapApply('wlasne') },
    wyceny: { read: () => S.wyceny.map(o => [o.id, o]), apply: mapApply('wyceny', (a, b) => b.ts - a.ts) },
    budynki: { read: () => Object.entries(S.budynki), apply: (u, d) => { u.forEach(([k, v]) => { S.budynki[k] = v; }); d.forEach(k => { delete S.budynki[k]; }); } },
    ust: { read: () => [['ust', S.ust]], apply: u => { u.forEach(([, v]) => { S.ust = { ...S.ust, ...v }; }); }, pristine: (id, d) => JSON.stringify(d) === DEF },
  };
  const sy = createSync({ kv, adapters, now: () => clock, hooks: {} });
  return { S, sy, name, kv, edit: fn => { fn(S); sy.schedule(60_000); } };   // schedule z długim opóźnieniem: sync wywołujemy ręcznie
}
const ids = a => a.map(x => x.id).sort().join(',');
const offer = (id, cena) => ({ id, cena, m2: 40, pokoje: 2, ulica: 'Testowa', tags: { nowe: 0 }, wlaczone: true });

// --- A: ma dane, łączy się pierwsza
const A = device('A', { offers: [offer('o1', 2000), offer('o2', 2500), offer('o3', 3000)], wlasne: [{ id: 'w1', cena: 3500, m2: 52 }], budynki: { 'bluszczowa 13': { rok: 1978 } }, ust: { biuro: 'AM Nieruchomości', haslo: 'Sprawdzone do końca.', rcnUrl: 'https://x/rcn.json', agent: 'Jan' } });
await A.sy.connect(URL, KEY); tick();
assert.equal(A.sy.status().state, 'ok', 'A połączone: ' + JSON.stringify(A.sy.status()));

// --- B: pusty laptop, domyślne ustawienia -> dostaje wszystko, ustawienia A nadpisują domyślne
const B = device('B');
await B.sy.connect(URL, KEY); tick();
assert.equal(ids(B.S.offers), 'o1,o2,o3'); assert.equal(ids(B.S.wlasne), 'w1');
assert.equal(B.S.ust.agent, 'Jan'); assert.equal(B.S.ust.rcnUrl, 'https://x/rcn.json'); assert.deepEqual(B.S.budynki['bluszczowa 13'], { rok: 1978 });
console.log('1 OK: pusty laptop dostał oferty, umowy, budynki i ustawienia (ustawienia A nie zostały nadpisane domyślnymi)');
await A.sy.run(); assert.equal(A.S.ust.agent, 'Jan', 'domyślne ustawienia B nie nadpisały A'); assert.equal(A.S.offers.length, 3);
console.log('2 OK: pierwsza synchronizacja pustego urządzenia niczego nie psuje');

// --- B zmienia i usuwa; A widzi
B.edit(S => { S.offers.find(o => o.id === 'o2').wlaczone = false; S.offers = S.offers.filter(o => o.id !== 'o3'); S.offers.push(offer('o4', 4000)); S.wyceny.unshift({ id: 'h1', ts: clock, res: { ok: true } }); });
tick(); await B.sy.run(); tick(); await A.sy.run();
assert.equal(ids(A.S.offers), 'o1,o2,o4'); assert.equal(A.S.offers.find(o => o.id === 'o2').wlaczone, false); assert.equal(ids(A.S.wyceny), 'h1');
console.log('3 OK: edycja, usunięcie, nowy rekord i wycena przeszły z B na A');

// --- konflikt: oba edytują tę samą ofertę offline; nowsza edycja wygrywa niezależnie od kolejności synchronizacji
A.edit(S => { S.offers.find(o => o.id === 'o1').cena = 2111; });   // edycja A w czasie t
tick(5000);
B.edit(S => { S.offers.find(o => o.id === 'o1').cena = 2222; });   // edycja B później
tick(5000);
await A.sy.run(); tick(); await B.sy.run(); tick(); await A.sy.run();   // A wysyła starszą, B nowszą
assert.equal(A.S.offers.find(o => o.id === 'o1').cena, 2222); assert.equal(B.S.offers.find(o => o.id === 'o1').cena, 2222);
console.log('4 OK: konflikt rozstrzygnięty na korzyść nowszej edycji (2222), na obu urządzeniach to samo');

// --- ta sama sytuacja, ale starsza edycja synchronizuje się PÓŹNIEJ (urządzenie było offline)
B.edit(S => { S.offers.find(o => o.id === 'o1').cena = 2999; });   // B edytuje, ale nie synchronizuje
tick(60_000);
A.edit(S => { S.offers.find(o => o.id === 'o1').cena = 3111; });   // A edytuje później i od razu synchronizuje
await A.sy.run(); tick();
await B.sy.run();                                                    // B wysyła starszą (2999) po fakcie
await A.sy.run();
assert.equal(A.S.offers.find(o => o.id === 'o1').cena, 3111); assert.equal(B.S.offers.find(o => o.id === 'o1').cena, 3111);
console.log('5 OK: stara edycja z urządzenia offline nie nadpisała nowszej');

// --- trzecie urządzenie, dużo rekordów (stronicowanie > 2000)
const big = Array.from({ length: 4500 }, (_, i) => offer('b' + i, 1000 + i));
A.edit(S => { S.offers.push(...big); }); tick(); await A.sy.run(); tick();
assert.equal(A.sy.status().state, 'ok', JSON.stringify(A.sy.status()));
const C = device('C'); await C.sy.connect(URL, KEY);
assert.equal(C.S.offers.length, A.S.offers.length, `C ma ${C.S.offers.length}, A ma ${A.S.offers.length}`);
console.log('6 OK: 4500 ofert przeszło paczkami, trzecie urządzenie ma komplet (' + C.S.offers.length + ')');

// --- usunięcie wszystkiego na C propaguje się; ponowna synchronizacja nic nie wskrzesza
C.edit(S => { S.offers = []; }); C.sy.allowMassDelete(); tick(); await C.sy.run(); tick(); await A.sy.run(); tick(); await B.sy.run(); await A.sy.run();
assert.equal(A.S.offers.length, 0); assert.equal(B.S.offers.length, 0); assert.equal(C.S.offers.length, 0);
console.log('7 OK: usunięcie wszystkich ofert przeszło na pozostałe urządzenia i nic nie wróciło');

// --- ochrona: urządzenie z nieaktualnym stanem (puste, choć baza mówi inaczej) nie kasuje ofert innych
const P = device('P'); P.S.offers = Array.from({ length: 60 }, (_, i) => offer('p' + i, 1500 + i));
await P.sy.connect(URL, KEY); tick(); await P.sy.run(); tick();
const Q = device('Q'); await Q.sy.connect(URL, KEY); tick(); assert.equal(Q.S.offers.length, 60);
P.S.offers = [];                                   // „nieaktualna pamięć”: ids są w bazie synchronizacji, lecz nie ma ich lokalnie
P.sy.schedule(60_000); tick(); await P.sy.run(); tick();
assert.equal(P.S.offers.length, 60, 'P odtworzył oferty z serwera zamiast je usunąć');
await Q.sy.run(); assert.equal(Q.S.offers.length, 60, 'Q nadal ma oferty');
const R = device('R'); await R.sy.connect(URL, KEY); assert.equal(R.S.offers.length, 60, 'serwer nadal ma oferty');
console.log('7b OK: masowe usunięcie z nieaktualnego urządzenia zostało wycofane, oferty zostały wszędzie');

// --- błędy
const bad = device('X'); let msg = ''; try { await bad.sy.connect(URL, 'zlyklucz1234567890'); } catch (e) { msg = e.message; }
assert.match(msg, /klucz/i);
const off = device('Y'); try { await off.sy.connect('http://127.0.0.1:9', KEY); assert.fail('powinno rzucić'); } catch (e) { assert.match(e.message, /połączenia/i); }
console.log('8 OK: zły klucz i brak serwera dają czytelne komunikaty');
console.log('TESTY SYNC OK');
