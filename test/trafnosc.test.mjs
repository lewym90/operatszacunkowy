// Sprawdzanie trafności: próba z ostatnich 12 miesięcy, wycena bez własnego aktu, poprawne podsumowanie.
import { sample, checkOne, summary, run } from '../js/trafnosc.js';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK ' : '✗ ') + m); if (!c) bad++; };
const now = Date.UTC(2026, 10, 24), tx = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 900; i++) { const u = i % 30, m2 = 30 + Math.round(rnd() * 50), pm2 = 9000 + u * 120 + (rnd() - .5) * 900, ts = now - Math.round(rnd() * 3 * 365) * 864e5;
  tx.push({ id: 'L' + i + '#T' + i, kat: 'mieszkanie', funkcja: 'mieszkalna', izby: m2 < 45 ? 2 : 3, kond: 2, m2, cena: Math.round(pm2 * m2), ts, data: new Date(ts).toISOString().slice(0, 10), rynek: 'wtorny', ulica: 'Ulica' + u, nr: String(1 + (i % 9)), lat: 51.2 + u * 0.002, lon: 22.5 + (i % 9) * 0.001, pelne: true, wielolokalowa: false, rok: 0 }); }
const s = sample(tx, { n: 40, nowTs: now }); ok(s.length === 40 && s.every(t => t.ts >= now - 366 * 864e5), 'próba: 40 transakcji z ostatnich 12 miesięcy');
// ta sama transakcja zapisana dwa razy (ten sam akt) nie może podpowiedzieć wyniku
const x = s[0], dup = { ...x, id: 'X#' + x.id.split('#')[1], cena: x.cena * 3 }; const r1 = checkOne(tx.concat([dup]), x, { year: 2026 });
ok(r1 && Math.abs(r1.blad) < 0.5, 'lokal z tego samego aktu wyłączony z porównań');
const res = await run(tx, { n: 40, nowTs: now, year: 2026 }); ok(res.ok && res.n >= 20 && res.wPrzedziale >= 0 && res.wPrzedziale <= 1 && res.medBlad < 0.2, `podsumowanie: ${res.n} wycen, w przedziale ${Math.round(res.wPrzedziale * 100)}%, błąd ${(res.medBlad * 100).toFixed(1)}%`);
ok(!summary([null, null], 2).ok, 'za mało wycen → brak oceny zamiast liczby');
if (bad) { console.log('trafnosc: BŁĘDY', bad); process.exit(1); } console.log('trafnosc: OK');
