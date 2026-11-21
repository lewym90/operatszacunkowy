// Czy dany pomysł poprawia wycenę najmu? Test prawdziwym silnikiem, z chowaniem całych ulic.
// Tylko liczy: niczego nie zapisuje. Na wyjściu są same zbiorcze liczby, bez adresów i ofert.
// Użycie (katalog z js/engine.js i js/rcn.js): node najem_test.mjs oferty.json rcn_lublin.json osm_lublin.json [ust.json]
import fs from 'node:fs';
import { estimateRent, estimateRentKat, segmentTags, streetKey } from './js/engine.js';
import { rcnToObjects } from './js/rcn.js';

const [fOf, fRcn, fOsm, fUst] = process.argv.slice(2), PROG = 0.5;
const log = m => console.error(m), mean = a => a.reduce((s, v) => s + v, 0) / a.length, med = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const KX = 111.32 * Math.cos(51.2 * Math.PI / 180), dist = (a, b) => Math.hypot((a[0] - b[0]) * 111.32, (a[1] - b[1]) * KX);
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// Te same pule co w aplikacji (1.26.0+): tylko najem w Lublinie; sprzedaż i oferty spoza Lublina nie biorą udziału.
const lubOK = o => { const m = (o.miasto || '').trim().toLowerCase(); return !m || m === 'lublin'; }, najemOK = o => (o.typ || 'najem') === 'najem';
const dobre = o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0;
const all = JSON.parse(fs.readFileSync(fOf, 'utf8')), pool = all.filter(o => najemOK(o) && lubOK(o) && (!o.kat || o.kat === 'mieszkanie') && dobre(o));
const pomin = { sprzedaz: all.filter(o => !najemOK(o)).length, poza: all.filter(o => najemOK(o) && !lubOK(o)).length, inne: all.filter(o => najemOK(o) && lubOK(o) && o.kat && o.kat !== 'mieszkanie').length };
if (pool.length < 100) { console.log(`Za mało ofert do rzetelnego testu: ${pool.length}, potrzeba co najmniej 100.`); process.exit(1); }
const tx = rcnToObjects(JSON.parse(fs.readFileSync(fRcn, 'utf8'))).filter(t => t.kat === 'mieszkanie' && t.lat != null && t.lon != null);
const osm = JSON.parse(fs.readFileSync(fOsm, 'utf8')), zebr = fUst ? (JSON.parse(fs.readFileSync(fUst, 'utf8')).zebrania || []) : [];
const grupa = o => o.ulica ? 'u:' + streetKey(o.ulica) : 'o:' + o.id;
const subjectOf = o => ({ tryb: 'najem', kat: 'mieszkanie', ulica: o.ulica || '', dzielnica: o.dzielnica || '', m2: o.m2, pokoje: o.pokoje, pietro: o.pietro ?? null, rok: o.rok || null, standard: segmentTags(o.tytul).wysoki ? 'wysoki' : null, meble: o.attrs && o.attrs.meble === 1 ? 'tak' : o.attrs && o.attrs.meble === 0 ? 'nie' : null, attrs: o.attrs || null });

// ---------- dane z RCN i OSM: punkt ulicy, poziom cen, odległość, rok budowy ----------
const naUlicy = new Map(); for (const t of tx) { if (!t.ulica) continue; const k = streetKey(t.ulica); (naUlicy.get(k) || naUlicy.set(k, []).get(k)).push(t); }
const punkt = new Map(); for (const [k, l] of naUlicy) punkt.set(k, [med(l.map(t => t.lat)), med(l.map(t => t.lon))]);
const maxTs = Math.max(...tx.map(t => t.ts || 0)), swieze = tx.filter(t => t.ts && t.ts >= maxTs - 3 * 365.25 * 864e5 && t.pelne && !t.wielolokalowa && t.m2 >= 12 && t.cena > 0).map(t => [t.lat, t.lon, t.cena / t.m2]);
const poziomCen = p => { for (const r of [0.5, 1, 1.5]) { const v = swieze.filter(t => dist(t, p) <= r).map(t => t[2]); if (v.length >= 10) return Math.log(med(v)); } return null; };
const uczelnie = (osm.layers?.uczelnie || []).map(x => Array.isArray(x) ? x : [x.lat, x.lon]);
const doUczelni = p => uczelnie.length ? Math.log(100 + 1000 * Math.min(...uczelnie.map(u => dist(u, p)))) : null;
const rokZpierwotnego = o => {
  const k = o.ulica ? streetKey(o.ulica) : '', l = (naUlicy.get(k) || []).filter(t => t.rynek === 'pierwotny' && t.ts), rokT = t => new Date(t.ts).getUTCFullYear(); if (!l.length) return null;
  const adr = o.nr ? l.filter(t => String(t.nr).trim() === String(o.nr).trim()) : []; if (adr.length) return Math.min(...adr.map(rokT));
  if (l.length < 3) return null; const y = l.map(rokT).sort((a, b) => a - b); return y[Math.floor(y.length * .75)] - y[Math.floor(y.length * .25)] <= 4 ? med(y) : null;   // cała ulica tylko, gdy to jedno osiedle z jednego okresu
};
for (const o of pool) { const p = o.ulica ? punkt.get(streetKey(o.ulica)) : null; o._p = p || null; o._rcn = p ? poziomCen(p) : null; o._ucz = p ? doUczelni(p) : null; o._rokRcn = o.rok ? null : rokZpierwotnego(o); }
const zebrTs = new Map(zebr.map(z => [z.id, z.ts || z.t || +z.id || 0])), ostZebr = Math.max(0, ...zebrTs.values());
const wiszaca = o => { const h = o.hc || [], spadek = h.length > 1 && h[h.length - 1][1] < h[0][1], t0 = zebrTs.get(o.pierw); return spadek || (t0 > 0 && ostZebr - t0 >= 30 * 864e5); };

// ---------- podział na części: ulica zawsze w całości w jednej części ----------
function foldy(lista, k, salt = 0, poUlicy = true) {
  const gr = new Map(); lista.forEach(o => { const g = poUlicy ? grupa(o) : 'o:' + o.id; (gr.get(g) || gr.set(g, []).get(g)).push(o); });
  const kol = [...gr.entries()].sort((a, b) => b[1].length - a[1].length || hash(a[0] + salt) - hash(b[0] + salt)), f = Array.from({ length: k }, () => []);
  for (const [, l] of kol) f.reduce((m, x) => x.length < m.length ? x : m, f[0]).push(...l); return f;
}
const inf = new Map(); let zapisz = false;
const szac = (uczace, o, sub = subjectOf(o)) => { const r = estimateRent(uczace, sub); if (zapisz && r.ok) inf.set(o, { lo: r.total.lo, hi: r.total.hi, pew: r.confidence?.level || 'brak' }); return r.ok && r.total?.mid > 0 ? r.total.mid : null; };
function poza(lista, k, salt, poUlicy, pozmien = x => x, filtr = () => true) {   // wycena każdej oferty z pozostałych części
  const wyn = new Map(), fs_ = foldy(lista, k, salt, poUlicy);
  for (const f of fs_) { const w = new Set(f), ucz = lista.filter(o => !w.has(o) && filtr(o)).map(pozmien); for (const o of f) { const e = szac(ucz, pozmien(o)); if (e) wyn.set(o, e); } }
  return wyn;
}

// ---------- poprawka: mała regresja grzbietowa na błędzie silnika, uczona tylko na części uczącej ----------
function solve(A, b) { const n = A.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-9; for (let r = 0; r < n; r++) { if (r === c) continue; const m = M[r][c] / d; if (m) for (let j = c; j <= n; j++) M[r][j] -= m * M[c][j]; } } return M.map((r, i) => r[n] / (r[i] || 1e-9)); }
function dopasuj(X, y, lam = 10) {
  const p = X[0].length, sr = Array.from({ length: p }, (_, j) => { const v = X.map(x => x[j]).filter(Number.isFinite); return v.length ? mean(v) : 0; }), sd = sr.map((m, j) => { const v = X.map(x => x[j]).filter(Number.isFinite); return v.length > 1 ? Math.sqrt(mean(v.map(q => (q - m) ** 2))) || 1 : 1; });
  const z = x => x.map((v, j) => Number.isFinite(v) ? (v - sr[j]) / sd[j] : 0), q = p + 1, A = Array.from({ length: q }, () => Array(q).fill(0)), b = Array(q).fill(0);
  X.forEach((x, n) => { const r = [...z(x), 1]; for (let i = 0; i < q; i++) { b[i] += r[i] * y[n]; for (let j = 0; j < q; j++) A[i][j] += r[i] * r[j]; } }); for (let i = 0; i < p; i++) A[i][i] += lam;
  const w = solve(A, b); return x => z(x).reduce((s, v, j) => s + w[j] * v, 0) + w[p];
}
const sasiedzi = (o, reszty) => { if (!o._p) return null; const g = grupa(o); let s = 0, W = 0; for (const [q, e] of reszty) { if (!q._p || grupa(q) === g) continue; const d = dist(o._p, q._p); if (d > 1.5) continue; const w = Math.exp(-d / .6); s += w * e; W += w; } return W ? s / (W + 3) : null; };
const CECHY = { rcn: o => o._rcn, ucz: o => o._ucz, sas: (o, r) => sasiedzi(o, r) };
const ZESTAWY = [['Ceny sprzedaży z RCN w okolicy', ['rcn']], ['Oferty z sąsiednich ulic', ['sas']], ['Odległość do uczelni', ['ucz']], ['Te trzy razem', ['rcn', 'sas', 'ucz']]];

// ---------- przebieg główny ----------
const t0 = Date.now(), K = 10, ILE_WEW = 5; log(`Oferty: ${pool.length}, ulice i pojedyncze: ${new Set(pool.map(grupa)).size}. Liczę (zwykle kilka do kilkunastu minut)…`);
const baza = new Map(), popr = Object.fromEntries(ZESTAWY.map(([n]) => [n, new Map()]));
foldy(pool, K, 1).forEach((f, i) => {
  const w = new Set(f), ucz = pool.filter(o => !w.has(o));
  zapisz = true; for (const o of f) { const e = szac(ucz, o); if (e) baza.set(o, e); } zapisz = false;
  const we = poza(ucz, ILE_WEW, 2 + i, true), reszty = [...we].map(([o, e]) => [o, Math.log(o.cena / e)]);
  for (const [n, kl] of ZESTAWY) { const fn = dopasuj(reszty.map(([o]) => kl.map(c => CECHY[c](o, reszty) ?? NaN)), reszty.map(r => r[1])); for (const o of f) if (baza.has(o)) popr[n].set(o, baza.get(o) * Math.exp(fn(kl.map(c => CECHY[c](o, reszty) ?? NaN)))); }
  log(`  część ${i + 1} z ${K}, ${Math.round((Date.now() - t0) / 1000)} s`);
});
const zRokiem = o => o._rokRcn ? { ...o, rok: o._rokRcn } : o, zRok = poza(pool, K, 1, true, zRokiem), bezWisz = poza(pool, K, 1, true, x => x, o => !wiszaca(o)), losowo = poza(pool, K, 1, false);

// ---------- ocena: średni błąd i uczciwy margines (losowanie całych ulic) ----------
const ape = (o, e) => Math.abs(o.cena / e - 1) * 100, grupy = [...new Set(pool.map(grupa))];
function porownaj(mapa, tylko = () => true) {
  const wsp = [...mapa.keys()].filter(o => baza.has(o) && tylko(o)); const po = new Map(); wsp.forEach(o => (po.get(grupa(o)) || po.set(grupa(o), []).get(grupa(o))).push(o)); const gl = [...po.values()]; let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296, z = [];
  for (let b = 0; b < 2000; b++) { let A = 0, B = 0, n = 0; for (let i = 0; i < gl.length; i++) for (const o of gl[Math.floor(rnd() * gl.length)]) { A += ape(o, baza.get(o)); B += ape(o, mapa.get(o)); n++; } z.push((A - B) / n); } z.sort((a, b) => a - b);
  const m = mean(wsp.map(o => ape(o, baza.get(o)))), p = mean(wsp.map(o => ape(o, mapa.get(o)))); return { n: wsp.length, m, p, zm: m - p, lo: z[100], hi: z[1899], me: med(wsp.map(o => ape(o, baza.get(o)))), pe: med(wsp.map(o => ape(o, mapa.get(o)))) };
}
const wer = w => w.lo > 0 && w.zm >= PROG ? 'POMAGA' : w.hi < 0 ? 'SZKODZI' : 'BEZ PEWNEJ RÓŻNICY';
const pl = v => v.toFixed(1).replace('.', ','), zn = v => (v >= 0 ? '+' : '') + pl(v), wiersz = (n, w, x = '') => `${n.padEnd(34)} ${(pl(w.m) + '%').padStart(7)} ${(pl(w.p) + '%').padStart(7)} ${(zn(w.zm)).padStart(6)}  ${(zn(w.lo) + ' do ' + zn(w.hi)).padEnd(16)} ${wer(w)}${x}`;
const lista = [...baza.keys()], jest = c => pool.filter(o => o[c] != null).length, sr = mean(lista.map(o => ape(o, baza.get(o)))), obc = mean(lista.map(o => Math.log(baza.get(o) / o.cena))) * 100;
const wiszN = pool.filter(wiszaca).length, rokN = pool.filter(o => o._rokRcn).length, los = [...losowo.keys()].filter(o => baza.has(o));
console.log(`\nTEST TRAFNOŚCI WYCENY NAJMU  (kod narzędzia: ${new Date().toISOString().slice(0, 10)})`);
console.log(`Pominięte (osobne pule): sprzedaż ${pomin.sprzedaz}, najem spoza Lublina ${pomin.poza}; najem innych rodzajów ${pomin.inne} (osobna tabela na końcu).`);
console.log(`Ofert w teście: ${pool.length}, z wynikiem: ${lista.length}, ulic: ${grupy.filter(g => g[0] === 'u').length}. Pokrycie: ceny RCN ${jest('_rcn')}, uczelnia ${jest('_ucz')}, punkt ulicy ${jest('_p')}.`);
console.log(`Błąd dzisiaj: średni ${pl(sr)}%, mediana ${pl(med(lista.map(o => ape(o, baza.get(o)))))}%, odchylenie w górę/dół ${zn(obc)}%.`);
console.log(`Dla porównania, gdy chowamy pojedyncze oferty, a nie całe ulice: średni ${pl(mean(los.map(o => ape(o, losowo.get(o)))))}%.\n`);
console.log(`${'POMYSŁ'.padEnd(34)} ${'PRZED'.padStart(7)} ${'PO'.padStart(7)} ${'ZYSK'.padStart(6)}  ${'MARGINES (pkt)'.padEnd(16)} WNIOSEK`);
for (const [n] of ZESTAWY) console.log(wiersz(n, porownaj(popr[n])));
console.log(rokN >= 15 ? wiersz('Rok budowy z RCN', porownaj(zRok), `  (uzupełniono ${rokN} ofert)`) : `${'Rok budowy z RCN'.padEnd(34)} za mało danych: uzupełniono tylko ${rokN} ofert`);
console.log(wiszN >= 15 ? wiersz('Pominięcie ofert wiszących', porownaj(bezWisz), `  (takich ofert ${wiszN})`) : `${'Pominięcie ofert wiszących'.padEnd(34)} za mało danych: takich ofert ${wiszN}, potrzeba 15`);
// ---------- tylko oferty z punktem ulicy ----------
const zUlica = o => o._p != null, nU = lista.filter(zUlica).length;
console.log(`\nTYLKO OFERTY Z ULICĄ ZNALEZIONĄ W RCN (${nU}):`); for (const [n] of ZESTAWY) console.log(wiersz(n, porownaj(popr[n], zUlica)));
if (rokN >= 15) console.log(wiersz('Rok budowy z RCN', porownaj(zRok, zUlica)));
// ---------- gdzie są pomyłki ----------
const cenaM2 = lista.map(o => o.cena / o.m2).sort((a, b) => a - b), q = p => cenaM2[Math.floor(p * (cenaM2.length - 1))], rokB = o => !o.rok ? 'rok nieznany' : o.rok >= 2018 ? 'budynek od 2018' : o.rok >= 1990 ? 'budynek 1990-2017' : 'budynek przed 1990';
const POD = [['Razem', () => 'wszystkie oferty'], ['Metraż', o => o.m2 < 35 ? 'do 35 m2' : o.m2 < 50 ? '35-50 m2' : o.m2 < 65 ? '50-65 m2' : o.m2 < 85 ? '65-85 m2' : 'od 85 m2'], ['Pokoje', o => o.pokoje >= 4 ? '4 i więcej' : o.pokoje + ' pok.'], ['Rok budowy', rokB], ['Ulica', o => !o.ulica ? 'oferta bez ulicy' : o._p ? 'ulica w RCN' : 'ulica spoza RCN'], ['Standard w tytule', o => segmentTags(o.tytul).wysoki ? 'tytuł: wysoki standard' : 'tytuł: bez wzmianki'], ['Pewność pokazana w aplikacji', o => 'pewność ' + (inf.get(o)?.pew || 'brak')], ['Dzielnica', o => o.dzielnica || 'bez dzielnicy'], ['Faktyczna cena za m2 (uwaga: grupy wg wyniku)', o => { const v = o.cena / o.m2; return v < q(.25) ? 'najtańsza 1/4' : v < q(.75) ? 'środkowa 1/2' : 'najdroższa 1/4'; }]];
console.log(`\nGDZIE APLIKACJA MYLI SIĘ NAJBARDZIEJ\n${'GRUPA'.padEnd(26)} ${'OFERT'.padStart(5)} ${'ŚREDNI'.padStart(7)} ${'MEDIANA'.padStart(7)} ${'ZAWYŻA'.padStart(7)} ${'>30%'.padStart(5)} ${'W PRZEDZIALE'.padStart(12)}`);
for (const [nag, fn] of POD) { const gr = new Map(); lista.forEach(o => { const k = fn(o); (gr.get(k) || gr.set(k, []).get(k)).push(o); }); console.log(nag); const wyn = [...gr].filter(([, l]) => l.length >= 10).sort((a, b) => b[1].length - a[1].length); for (const [k, l] of wyn) { const e = l.map(o => ape(o, baza.get(o))), za = mean(l.map(o => (baza.get(o) / o.cena - 1) * 100)), wp = l.filter(o => inf.get(o) && o.cena >= inf.get(o).lo && o.cena <= inf.get(o).hi).length / l.length * 100; console.log(`  ${String(k).slice(0, 24).padEnd(24)} ${String(l.length).padStart(5)} ${(pl(mean(e)) + '%').padStart(7)} ${(pl(med(e)) + '%').padStart(7)} ${zn(za).padStart(7)} ${(Math.round(e.filter(x => x > 30).length / l.length * 100) + '%').padStart(5)} ${(Math.round(wp) + '%').padStart(12)}`); } const r = [...gr].filter(([, l]) => l.length < 10).reduce((a, [, l]) => a + l.length, 0); if (r) console.log(`  (pominięto małe grupy, razem ofert: ${r})`); }
console.log('\nZAWYŻA: plus = aplikacja daje za dużo, minus = za mało. >30%: udział ofert z pomyłką ponad 30%. W PRZEDZIALE: ile prawdziwych cen wpadło w pokazywany przedział (cel ok. 50%).');
console.log(`\nZYSK to punkty procentowe mniej błędu. POMAGA tylko, gdy cały margines jest powyżej zera i zysk ma co najmniej ${pl(PROG)} pkt.`);

// ---------- KALIBRACJA (21.11.2026): pewność, poprawka pokoi, stare oferty ----------
// Wszystko uczone wyłącznie na części uczącej (wewnętrzne części z chowaniem ulic), sprawdzane na schowanych ulicach. Nic nie zmienia aplikacji.
const lastFull = zebr.filter(z => z.pelne).map(z => z.id).reduce((a, b) => Math.max(a, b), -Infinity);
const aktualna = o => !Number.isFinite(lastFull) || o.ost == null || o.ost >= lastFull;
const szacR = (u, o) => { const r = estimateRent(u, subjectOf(o)); return r.ok && r.total?.mid > 0 ? r : null; };
const gPok = o => o.pokoje >= 4 ? 4 : o.pokoje || 0;
const cechyR = (r, o) => [Math.log(r.total.hi / r.total.lo), r.model?.agreement ?? 0, Math.log(r.n || 1), r.confidence?.score || 1, Math.abs(Math.log(o.m2 / 50)), o.pokoje >= 4 ? 1 : 0, o.m2 >= 85 ? 1 : 0];
const skala = (lo, mid, hi, k) => [mid * (lo / mid) ** k, mid * (hi / mid) ** k];
const pokryj = (l, R, k = () => 1) => l.length ? l.filter(o => { const r = R.get(o), [a, b] = skala(r.total.lo, r.total.mid, r.total.hi, k(o)); return o.cena >= a && o.cena <= b; }).length / l.length * 100 : NaN;
const Rout = new Map(), nowaEt = new Map(), nowaK = new Map(), pokAll = new Map(), pok1 = new Map(), bezStarych = new Map();
const t1 = Date.now(); log('Kalibracja: liczę (kilka minut)…');
foldy(pool, K, 1).forEach((f, i) => {
  const w = new Set(f), u = pool.filter(o => !w.has(o)), Rin = new Map();
  for (const g of foldy(u, ILE_WEW, 20 + i)) { const ws = new Set(g), uu = u.filter(o => !ws.has(o)); for (const o of g) { const r = szacR(uu, o); if (r) Rin.set(o, r); } }
  const inL = [...Rin.keys()];
  // 1) pewność: przewidywany błąd z cech wyniku, progi z tercyli części uczącej, przedział skalowany do 50% w każdej grupie
  const fn = dopasuj(inL.map(o => cechyR(Rin.get(o), o)), inL.map(o => Math.abs(Math.log(o.cena / Rin.get(o).total.mid))), 5);
  const pin = inL.map(o => fn(cechyR(Rin.get(o), o))).sort((a, b) => a - b), q1 = pin[Math.floor(pin.length / 3)], q2 = pin[Math.floor(pin.length * 2 / 3)];
  const et = p => p <= q1 ? 'wysoka' : p <= q2 ? 'średnia' : 'niska', kEt = {};
  for (const e of ['wysoka', 'średnia', 'niska']) { const l = inL.filter(o => et(fn(cechyR(Rin.get(o), o))) === e); let best = 1, bd = 1e9; for (let k = 0.4; k <= 3.01; k += 0.05) { const d = Math.abs(pokryj(l, Rin, () => k) - 50); if (d < bd) { bd = d; best = k; } } kEt[e] = best; }
  // 2) poprawka pokoi: średnia reszta w grupie, ściągnięta do zera (n/(n+30))
  const c = {}; for (const g of [1, 2, 3, 4]) { const l = inL.filter(o => gPok(o) === g), sm = l.reduce((s, o) => s + Math.log(o.cena / Rin.get(o).total.mid), 0); c[g] = sm / (l.length + 30); }
  const uAkt = u.filter(aktualna);
  for (const o of f) {
    const r = szacR(u, o); if (!r) continue; Rout.set(o, r);
    const e = et(fn(cechyR(r, o))); nowaEt.set(o, e); nowaK.set(o, kEt[e]);
    pokAll.set(o, r.total.mid * Math.exp(c[gPok(o)] || 0)); pok1.set(o, r.total.mid * Math.exp(gPok(o) === 1 ? c[1] : 0));
    if (aktualna(o)) { const r2 = szacR(uAkt, o); if (r2) bezStarych.set(o, r2.total.mid); }
  }
  log(`  kalibracja: część ${i + 1} z ${K}, ${Math.round((Date.now() - t1) / 1000)} s`);
});
{
  const L = [...Rout.keys()], blad = o => Math.abs(o.cena / Rout.get(o).total.mid - 1) * 100;
  const tab = (tyt, grupuj, k) => { console.log(tyt); for (const e of ['wysoka', 'średnia', 'niska']) { const l = L.filter(o => grupuj(o) === e); if (!l.length) { console.log(`  ${e.padEnd(10)} 0`); continue; } const b = l.map(blad); console.log(`  ${e.padEnd(10)} ${String(l.length).padStart(5)} ${(pl(mean(b)) + '%').padStart(7)} ${(pl(med(b)) + '%').padStart(7)} ${(Math.round(b.filter(x => x > 30).length / l.length * 100) + '%').padStart(5)} ${(Math.round(pokryj(l, Rout, k)) + '%').padStart(12)}`); } };
  console.log(`\nKALIBRACJA PEWNOŚCI (${L.length} ofert)\n  ${'POZIOM'.padEnd(10)} ${'OFERT'.padStart(5)} ${'ŚREDNI'.padStart(7)} ${'MEDIANA'.padStart(7)} ${'>30%'.padStart(5)} ${'W PRZEDZIALE'.padStart(12)}`);
  tab('Dziś w aplikacji:', o => Rout.get(o).confidence?.level, () => 1);
  tab('Propozycja (pewność z przewidywanego błędu, przedział dopasowany do poziomu):', o => nowaEt.get(o), o => nowaK.get(o));
  const kk = {}; for (const e of ['wysoka', 'średnia', 'niska']) { const v = L.filter(o => nowaEt.get(o) === e).map(o => nowaK.get(o)); kk[e] = v.length ? pl(med(v)) : '-'; }
  console.log(`  szerokość przedziału względem dzisiejszej: wysoka ×${kk.wysoka}, średnia ×${kk['średnia']}, niska ×${kk.niska}`);
  const zaw = (l, M) => l.length ? zn(mean(l.map(o => (M.get(o) / o.cena - 1) * 100))) : '-';
  const p1 = L.filter(o => gPok(o) === 1), mid = new Map(L.map(o => [o, Rout.get(o).total.mid]));
  console.log(`\nPOPRAWKA WG LICZBY POKOI (uczona na części uczącej)`);
  console.log(wiersz('Tylko 1 pokój', porownaj(pok1)) + `  (1 pok.: zawyżenie ${zaw(p1, mid)}% → ${zaw(p1, pok1)}%)`);
  console.log(wiersz('Wszystkie grupy pokoi', porownaj(pokAll)) + `  (razem: zawyżenie ${zaw(L, mid)}% → ${zaw(L, pokAll)}%)`);
  const akt = L.filter(aktualna), stare = L.filter(o => !aktualna(o));
  console.log(`\nSTARE OFERTY (aktualnych ${akt.length}, nieaktualnych ${stare.length}; ostatnie pełne zebranie nr ${Number.isFinite(lastFull) ? lastFull : '-'})`);
  console.log(`  zawyżenie przy ofertach aktualnych ${zaw(akt, mid)}%, przy nieaktualnych ${zaw(stare, mid)}%`);
  if (bezStarych.size >= 30) console.log(wiersz('Wycena tylko z aktualnych ofert', porownaj(bezStarych, aktualna)) + `  (zawyżenie ${zaw([...bezStarych.keys()], mid)}% → ${zaw([...bezStarych.keys()], bezStarych)}%)`);
  else console.log('  za mało danych o zebraniach do tego porównania');
}

// ---------- najem innych rodzajów (lokale, hale, domy, garaże): ta sama metoda, chowanie całych ulic ----------
const KN = { lokal: 'lokale użytkowe', obiekt: 'hale i magazyny', dom: 'domy', garaz: 'garaże' };
console.log(`\nNAJEM INNYCH RODZAJÓW (Lublin, wycena tylko z ofert tego rodzaju)\n${'RODZAJ'.padEnd(18)} ${'OFERT'.padStart(5)} ${'Z WYNIKIEM'.padStart(10)} ${'ŚREDNI'.padStart(7)} ${'MEDIANA'.padStart(7)} ${'ZAWYŻA'.padStart(7)} ${'>30%'.padStart(5)} ${'W PRZEDZIALE'.padStart(12)}`);
for (const [k, n] of Object.entries(KN)) {
  const pk = all.filter(o => najemOK(o) && lubOK(o) && o.kat === k && dobre(o)), w = new Map();
  if (pk.length < 10) { console.log(`${n.padEnd(18)} ${String(pk.length).padStart(5)}  za mało ofert do testu (potrzeba 10)`); continue; }
  const w2 = new Map(), bs = [];
  for (const f of foldy(pk, Math.min(10, pk.length), 3)) {
    const ws = new Set(f), ucz = pk.filter(o => !ws.has(o)), sub = o => ({ tryb: 'najem', kat: k, ulica: o.ulica || '', dzielnica: o.dzielnica || '', m2: o.m2 });
    const x = ucz.map(o => Math.log(o.m2)), y = ucz.map(o => Math.log(o.cena / o.m2)), mx = mean(x), my = mean(y), b = x.reduce((s, v, j) => s + (v - mx) * (y[j] - my), 0) / (x.reduce((s, v) => s + (v - mx) ** 2, 0) || 1); bs.push(b);
    for (const o of f) {
      const r = estimateRentKat(ucz, sub(o)); if (r.ok && r.total?.mid > 0) w.set(o, r.total);
      const r2 = estimateRentKat(ucz.map(q => ({ ...q, cena: q.cena * (o.m2 / q.m2) ** b })), sub(o)); if (r2.ok && r2.total?.mid > 0) w2.set(o, r2.total);   // cena za m² przeliczona na metraż wycenianego
    }
  }
  const l = [...w.keys()]; if (!l.length) { console.log(`${n.padEnd(18)} ${String(pk.length).padStart(5)}  brak wyników`); continue; }
  const e = l.map(o => Math.abs(o.cena / w.get(o).mid - 1) * 100), za = mean(l.map(o => (w.get(o).mid / o.cena - 1) * 100)), wp = l.filter(o => o.cena >= w.get(o).lo && o.cena <= w.get(o).hi).length / l.length * 100;
  console.log(`${n.padEnd(18)} ${String(pk.length).padStart(5)} ${String(l.length).padStart(10)} ${(pl(mean(e)) + '%').padStart(7)} ${(pl(med(e)) + '%').padStart(7)} ${zn(za).padStart(7)} ${(Math.round(e.filter(x => x > 30).length / l.length * 100) + '%').padStart(5)} ${(Math.round(wp) + '%').padStart(12)}`);
  const l2 = l.filter(o => w2.has(o));
  if (l2.length) {
    const e2 = l2.map(o => Math.abs(o.cena / w2.get(o).mid - 1) * 100), e1 = l2.map(o => Math.abs(o.cena / w.get(o).mid - 1) * 100), za2 = mean(l2.map(o => (w2.get(o).mid / o.cena - 1) * 100)), wp2 = l2.filter(o => o.cena >= w2.get(o).lo && o.cena <= w2.get(o).hi).length / l2.length * 100;
    const gr = new Map(); l2.forEach((o, j) => { const g = grupa(o); (gr.get(g) || gr.set(g, []).get(g)).push(j); }); const gl = [...gr.values()]; let sd = 11; const rnd = () => (sd = (sd * 1664525 + 1013904223) % 4294967296) / 4294967296, z = [];
    for (let t = 0; t < 2000; t++) { let A = 0, B = 0, c = 0; for (let q = 0; q < gl.length; q++) for (const j of gl[Math.floor(rnd() * gl.length)]) { A += e1[j]; B += e2[j]; c++; } z.push((A - B) / c); } z.sort((a, b) => a - b);
    const zys = mean(e1) - mean(e2), w_ = z[100] > 0 && zys >= PROG ? 'POMAGA' : z[1899] < 0 ? 'SZKODZI' : 'BEZ PEWNEJ RÓŻNICY';
    console.log(`  + poprawka metrażu (cena za m² przy 2× większym metrażu: ${zn((2 ** med(bs) - 1) * 100)}%): średni ${(pl(mean(e2)) + '%')}, mediana ${pl(med(e2))}%, zawyża ${zn(za2)}, w przedziale ${Math.round(wp2)}%; zysk ${zn(zys)} pkt (margines ${zn(z[100])} do ${zn(z[1899])}) ${w_}`);
  }
}
console.log('Uwaga: przy innych rodzajach aplikacja zawsze pokazuje pewność niską. Lokale i hale bardzo się różnią przeznaczeniem, więc duży błąd jest tu spodziewany.');
