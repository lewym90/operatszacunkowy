// Warianty wyceny mieszkań na tej samej próbie (porównanie parami, przedział ufności bootstrapem). Wariant wchodzi do aplikacji
// tylko gdy poprawa mediany błędu ≥ 0,5 pkt i dolna granica 90% przedziału poprawy > 0 — i nie psuje Lublina.
// Użycie: node tools/sprzedaz_eksp.mjs --lokale plik.json [--n 600] [--mies 6]
import fs from 'fs';
import { estimateSale, addrKey } from '../js/engine.js';
import { rcnToObjects } from '../js/rcn.js';
const A = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, r) => (x.startsWith('--') ? a.push([x.slice(2), r[i + 1] && !r[i + 1].startsWith('--') ? r[i + 1] : '1']) : 0, a), []));
const N = +(A.n || 600), MIES = +(A.mies || 6); let sd = +(A.seed || 7); const rnd = () => (sd = (sd * 1664525 + 1013904223) % 4294967296) / 4294967296;
const med = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const tranOf = t => String(t.id || '').split('#')[1] || String(t.id);
const tx = rcnToObjects(JSON.parse(fs.readFileSync(A.lokale, 'utf8')), {});
const tsMax = tx.reduce((m, t) => t.ts && t.ts <= Date.now() && t.ts > m ? t.ts : m, 0), od = tsMax - MIES * 30.44 * 864e5;
const flats = tx.filter(t => t.kat === 'mieszkanie' && t.funkcja === 'mieszkalna' && t.ts >= od && t.lat != null && t.izby > 0 && t.m2 >= 15 && t.m2 <= 200 && t.cena > 50000 && !t.wielolokalowa && t.pelne && (!A.okolice || (t.msc && !/^krak[oó]w$/i.test(t.msc))));
const a = flats.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } const sm = a.slice(0, N);
// rok budowy z RCN: najwcześniejsza sprzedaż z rynku pierwotnego w budynku (tylko akty sprzed wycenianej transakcji)
const firstPrim = new Map(); for (const t of tx.filter(t => t.rynek === 'pierwotny' && t.ts && t.ulica && t.nr).sort((x, y) => x.ts - y.ts)) { const k = (t.msc || '') + '|' + addrKey(t.ulica, t.nr); if (!firstPrim.has(k)) firstPrim.set(k, t.ts); }
const V = A.okolice ? {
  dzis: {},
  daleko_slabiej: { locW: d => d < 0.3 ? 1 : d < 0.8 ? 0.85 : d < 1.5 ? 0.65 : d < 3 ? 0.4 : d < 6 ? 0.08 : 0.02 },
  daleko_slabiej2: { locW: d => d < 0.3 ? 1 : d < 0.8 ? 0.85 : d < 1.5 ? 0.65 : d < 3 ? 0.4 : d < 6 ? 0.15 : 0.04 },
  top25: { topN: 25 },
} : A.potw ? {
  dzis: {},
  top25: { topN: 25 },
  top30: { topN: 30 },
} : {
  dzis: {},
  bliskosc_ostra: { locW: d => d < 0.15 ? 1 : d < 0.3 ? 0.9 : d < 0.6 ? 0.7 : d < 1 ? 0.5 : d < 2 ? 0.3 : 0.1 },
  bliskosc_exp: { locW: d => Math.max(0.05, Math.exp(-d / 0.7)) },
  top25: { topN: 25 },
  top60: { topN: 60 },
  rok_z_rcn: { rok: true },
  rok_z_rcn_ostra: { rok: true, locW: d => d < 0.15 ? 1 : d < 0.3 ? 0.9 : d < 0.6 ? 0.7 : d < 1 ? 0.5 : d < 2 ? 0.3 : 0.1 },
};
const out = {};
for (const [nm, v] of Object.entries(V)) {
  const t0 = Date.now();
  out[nm] = sm.map(x => {
    const tr = tranOf(x), p = tx.filter(t => t.ts && t.ts < x.ts && tranOf(t) !== tr);
    let rok = null, yearOf;
    if (v.rok) { const yr = k => { const ts = firstPrim.get(k); return ts && ts < x.ts ? new Date(ts).getUTCFullYear() : null; }; rok = yr((x.msc || '') + '|' + addrKey(x.ulica, x.nr)); yearOf = k => { for (const m of [x.msc || '', '']) { const y = yr(m + '|' + k); if (y) return y; } return null; }; }
    const r = estimateSale(p, { tryb: 'sprzedaz', kat: 'mieszkanie', ulica: x.ulica, nr: x.nr, m2: x.m2, pokoje: x.izby, pietro: x.kond, rynek: x.rynek, rok, latlon: [x.lat, x.lon], ...(x.msc ? { miasto: x.msc } : {}) }, { nowTs: x.ts, locW: v.locW, topN: v.topN, yearOf });
    if (!r.ok) return null; const mid = (r.total.lo + r.total.hi) / 2; return { e: Math.abs(mid - x.cena) / x.cena, in: x.cena >= r.total.lo && x.cena <= r.total.hi, rynek: x.rynek };
  });
  const e = out[nm].filter(Boolean);
  console.log(`${nm.padEnd(16)} mediana ${(med(e.map(r => r.e)) * 100).toFixed(2)}%  średni ${(e.reduce((s, r) => s + r.e, 0) / e.length * 100).toFixed(2)}%  wtórny ${(med(e.filter(r => r.rynek === 'wtorny').map(r => r.e)) * 100).toFixed(2)}%  w przedziale ${(e.filter(r => r.in).length / e.length * 100).toFixed(1)}%  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
// poprawa względem dziś: bootstrap mediany różnic błędów (te same transakcje)
for (const nm of Object.keys(V).slice(1)) {
  const idx = sm.map((_, i) => i).filter(i => out.dzis[i] && out[nm][i]);
  const st = () => { const d = []; for (let k = 0; k < idx.length; k++) { const i = idx[Math.floor(rnd() * idx.length)]; d.push(out.dzis[i].e - out[nm][i].e); } return d; };
  const base = med(idx.map(i => out.dzis[i].e)) - med(idx.map(i => out[nm][i].e));
  const bs = Array.from({ length: 400 }, () => { const s = idx.map(() => idx[Math.floor(rnd() * idx.length)]); return med(s.map(i => out.dzis[i].e)) - med(s.map(i => out[nm][i].e)); }).sort((x, y) => x - y);
  console.log(`  ${nm}: poprawa mediany ${(base * 100).toFixed(2)} pkt, 90% przedział ${(bs[20] * 100).toFixed(2)} … ${(bs[379] * 100).toFixed(2)} pkt → ${base >= 0.005 && bs[20] > 0 ? 'POMAGA' : 'nie'}`);
}
