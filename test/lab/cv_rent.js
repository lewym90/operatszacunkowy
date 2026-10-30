// Laboratorium: walidacja krzyżowa wyceny najmu na prawdziwych ofertach (uruchamiane w przeglądarce z aplikacją).
import { estimateRent, segmentTags, rangeFrom } from '../../js/engine.js';
export const subjectOf = o => ({ tryb: 'najem', kat: 'mieszkanie', ulica: o.ulica || '', dzielnica: o.dzielnica || '', m2: o.m2, pokoje: o.pokoje, pietro: o.pietro ?? null, rok: o.rok || null,
  standard: segmentTags(o.tytul).wysoki ? 'wysoki' : null, meble: o.attrs && o.attrs.meble === 1 ? 'tak' : o.attrs && o.attrs.meble === 0 ? 'nie' : null, attrs: o.attrs || null });
// Uruchamia w tle (po jednej warstwie na wywołanie), wynik w window.__cv
export function startCV(offers, folds = 10) {
  const pool = offers.filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0), order = pool.map((o, i) => i).sort((a, b) => String(pool[a].id).localeCompare(String(pool[b].id)));
  const fold = new Map(order.map((i, r) => [i, r % folds])), st = window.__cv = { done: 0, total: folds, recs: [], t0: Date.now(), err: null };
  let f = 0;
  const step = () => {
    try {
      const train = pool.filter((_, i) => fold.get(i) !== f);
      pool.forEach((o, i) => { if (fold.get(i) !== f) return; const r = estimateRent(train, subjectOf(o)); if (!r.ok || !r._hy) return; const h = r._hy;
        st.recs.push({ id: o.id, f, cena: o.cena, m2: o.m2, pokoje: o.pokoje, rok: o.rok || null, tytul: o.tytul, dz: o.dzielnica, ctr: h.ctr, ag: h.ag, pA: h.pA, pB: h.pB, sNowe: h.sNowe, res: h.RM.res, base: r.total }); });
    } catch (e) { st.err = String(e && e.stack || e); return; }
    st.done = ++f; if (f < folds) setTimeout(step, 20); else st.fin = Date.now();
  };
  setTimeout(step, 20); return 'start';
}
const SEG = { 'wszystkie': r => true, 'nowe (rok≥2018)': r => r.rok != null && r.rok >= 2018, 'starsze (rok<2018)': r => r.rok != null && r.rok < 2018, 'rok nieznany': r => r.rok == null,
  'm2<35': r => r.m2 < 35, 'm2 35–50': r => r.m2 >= 35 && r.m2 < 50, 'm2 50–65': r => r.m2 >= 50 && r.m2 < 65, 'm2≥65': r => r.m2 >= 65, 'm2≥60': r => r.m2 >= 60 };
export function evalVariant(recs, mode, P) {
  const rows = recs.map(r => { const x = rangeFrom(r.res, r.ctr, r.ag, r.m2, r.sNowe, mode, P); return { r, x, inR: r.cena >= x.lo && r.cena <= x.hi, w: Math.log(x.hi / x.lo), ape: Math.abs(r.cena / x.mid - 1), bias: r.cena / x.mid - 1 }; });
  const out = {}; for (const [k, f] of Object.entries(SEG)) { const s = rows.filter(z => f(z.r)); if (!s.length) continue; out[k] = { n: s.length, cov: +(s.filter(z => z.inR).length / s.length * 100).toFixed(0), w: +(s.reduce((a, z) => a + z.w, 0) / s.length * 100).toFixed(0), mape: +(s.map(z => z.ape).sort((a, b) => a - b)[s.length >> 1] * 100).toFixed(1), bias: +(s.reduce((a, z) => a + z.bias, 0) / s.length * 100).toFixed(1) }; }
  // zgodność z celem 50% w segmentach: średnie odchylenie bezwzględne (ważone liczebnością) pokrycia od 50
  const sg = Object.entries(out).filter(([k]) => k !== 'wszystkie' && k !== 'm2≥60'), dev = sg.reduce((a, [, v]) => a + Math.abs(v.cov - 50) * v.n, 0) / sg.reduce((a, [, v]) => a + v.n, 0);
  return { out, dev: +dev.toFixed(1) };
}
