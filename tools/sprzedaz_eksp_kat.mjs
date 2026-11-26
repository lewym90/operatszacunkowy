// Warianty wyceny domów, działek, lokali, garaży (estimateSaleKat) na tej samej próbie; zasada jak tools/sprzedaz_eksp.mjs.
// Podmiot podaje jedno przeznaczenie (jak w formularzu): pierwszy człon przeznaczenia z RCN.
import fs from 'fs';
import { estimateSaleKat } from '../js/engine.js';
import { rcnToObjects, inneToObjects } from '../js/rcn.js';
const A = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, r) => (x.startsWith('--') ? a.push([x.slice(2), r[i + 1] && !r[i + 1].startsWith('--') ? r[i + 1] : '1']) : 0, a), []));
const N = +(A.n || 300), MIES = +(A.mies || 12); let sd = +(A.seed || 11); const rnd = () => (sd = (sd * 1664525 + 1013904223) % 4294967296) / 4294967296;
const med = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const tranOf = t => String(t.id || '').split('#')[1] || String(t.id);
const tx = rcnToObjects(JSON.parse(fs.readFileSync(A.lokale, 'utf8')), {}), inne = inneToObjects(JSON.parse(fs.readFileSync(A.inne, 'utf8')), {}), pool = tx.concat(inne);
const tsMax = tx.reduce((m, t) => t.ts && t.ts <= Date.now() && t.ts > m ? t.ts : m, 0), od = tsMax - MIES * 30.44 * 864e5;
const tok = p => String(p || '').split(';').filter(Boolean);
const V = {
  dzis: {},
  przezn_token: { podW: (s, t) => s && t ? (tok(t).includes(s) ? 1 : 0.15) : 0.9 },
  przezn_token_lagodne: { podW: (s, t) => s && t ? (tok(t).includes(s) ? 1 : 0.4) : 0.9 },
  bliskosc_ostra: { locW: d => d < 0.5 ? 1 : d < 1 ? 0.8 : d < 2 ? 0.55 : d < 4 ? 0.3 : d < 8 ? 0.15 : 0.05 },
  top20: { topN: 20 },
  token_ostra_top20: { podW: (s, t) => s && t ? (tok(t).includes(s) ? 1 : 0.15) : 0.9, locW: d => d < 0.5 ? 1 : d < 1 ? 0.8 : d < 2 ? 0.55 : d < 4 ? 0.3 : d < 8 ? 0.15 : 0.05, topN: 20 },
};
for (const kat of (A.kat || 'dzialka,dom,lokal,garaz').split(',')) {
  const src = kat === 'lokal' || kat === 'garaz' ? tx : inne;
  const all = src.filter(t => t.kat === kat && t.ts >= od && t.lat != null && t.m2 > 0 && t.cena > 0 && t.pelne !== false && !t.wielolokalowa);
  const a = all.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } const sm = a.slice(0, N);
  console.log(`\n${kat.toUpperCase()} (${sm.length} z ${all.length}, ostatnie ${MIES} mies.)`); const out = {};
  for (const [nm, v] of Object.entries(V)) {
    out[nm] = sm.map(x => { const tr = tranOf(x), p = pool.filter(t => t.ts && t.ts < x.ts && tranOf(t) !== tr);
      const r = estimateSaleKat(p, { tryb: 'sprzedaz', kat, pod: tok(x.pod)[0] || null, m2: x.m2, dzm2: x.dzm2 || null, ulica: x.ulica, nr: x.nr, latlon: [x.lat, x.lon], ...(x.msc ? { miasto: x.msc } : {}) }, { geo: p, nowTs: x.ts, ...v });
      if (!r.ok) return null; const mid = (r.total.lo + r.total.hi) / 2; return { e: Math.abs(mid - x.cena) / x.cena, in: x.cena >= r.total.lo && x.cena <= r.total.hi }; });
    const e = out[nm].filter(Boolean); console.log(`  ${nm.padEnd(22)} mediana ${(med(e.map(r => r.e)) * 100).toFixed(1)}%  w przedziale ${(e.filter(r => r.in).length / e.length * 100).toFixed(0)}%  wycen ${e.length}`);
  }
  for (const nm of Object.keys(V).slice(1)) { const idx = sm.map((_, i) => i).filter(i => out.dzis[i] && out[nm][i]); if (idx.length < 20) continue;
    const base = med(idx.map(i => out.dzis[i].e)) - med(idx.map(i => out[nm][i].e));
    const bs = Array.from({ length: 400 }, () => { const s = idx.map(() => idx[Math.floor(rnd() * idx.length)]); return med(s.map(i => out.dzis[i].e)) - med(s.map(i => out[nm][i].e)); }).sort((x, y) => x - y);
    console.log(`    ${nm}: poprawa ${(base * 100).toFixed(1)} pkt, 90%: ${(bs[20] * 100).toFixed(1)} … ${(bs[379] * 100).toFixed(1)} → ${base >= 0.005 && bs[20] > 0 ? 'POMAGA' : 'nie'}`); }
}
