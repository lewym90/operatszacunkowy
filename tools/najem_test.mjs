// Czy dany pomysł poprawia wycenę najmu? Test prawdziwym silnikiem, z chowaniem całych ulic.
// Tylko liczy: niczego nie zapisuje. Na wyjściu są same zbiorcze liczby, bez adresów i ofert.
// Użycie (katalog z js/engine.js i js/rcn.js): node najem_test.mjs oferty.json rcn_lublin.json osm_lublin.json [ust.json]
import fs from 'node:fs';
import { estimateRent, segmentTags, streetKey } from './js/engine.js';
import { rcnToObjects } from './js/rcn.js';

const [fOf, fRcn, fOsm, fUst] = process.argv.slice(2), PROG = 0.5;
const log = m => console.error(m), mean = a => a.reduce((s, v) => s + v, 0) / a.length, med = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const KX = 111.32 * Math.cos(51.2 * Math.PI / 180), dist = (a, b) => Math.hypot((a[0] - b[0]) * 111.32, (a[1] - b[1]) * KX);
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const all = JSON.parse(fs.readFileSync(fOf, 'utf8')), pool = all.filter(o => (!o.kat || o.kat === 'mieszkanie') && o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0);
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
