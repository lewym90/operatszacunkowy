// Sprawdzanie trafności wycen sprzedaży mieszkań na prawdziwych transakcjach RCN.
// Bierzemy ostatnio sprzedane mieszkania, wyceniamy każde silnikiem aplikacji tak, jakby jego ceny nie było w bazie
// (usuwamy ten akt i inne lokale z tego samego aktu), i porównujemy wynik z ceną z aktu notarialnego.
// Liczby są wyłącznie z tego sprawdzenia; nic tu nie jest szacowane „na oko”.
import { estimateSale } from './engine.js';

const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const tranOf = t => String(t.id || '').split('#')[1] || t.id;

// Próba: mieszkania z ostatnich `months` miesięcy, z adresem, pełnym udziałem i jedną ceną. Wybór równomierny po dacie (ten sam wynik przy tych samych danych).
export function sample(tx, { n = 120, months = 12, nowTs = Date.now() } = {}) {
  const od = nowTs - months * 30.44 * 864e5;
  const ok = tx.filter(t => t.kat === 'mieszkanie' && t.funkcja === 'mieszkalna' && t.ts && t.ts >= od && t.ts <= nowTs && t.ulica && t.nr && t.lat != null && t.m2 >= 20 && t.m2 <= 150 && t.cena > 50000 && t.izby > 0 && !t.wielolokalowa && t.pelne)
    .sort((a, b) => a.ts - b.ts || String(a.id).localeCompare(String(b.id)));
  if (ok.length <= n) return ok;
  const step = ok.length / n, out = [];
  for (let i = 0; i < n; i++) out.push(ok[Math.floor(i * step + step / 2)]);
  return out;
}

// Jedno sprawdzenie. Zwraca { cena, wynik:{lo,mid,hi}, blad (ułamek), wPrzedziale } albo null, gdy silnik nie podał wyniku.
export function checkOne(tx, x, opts = {}) {
  const tr = tranOf(x), pool = tx.filter(t => tranOf(t) !== tr);
  const subj = { tryb: 'sprzedaz', kat: 'mieszkanie', ulica: x.ulica, nr: x.nr, m2: x.m2, pokoje: x.izby, pietro: x.kond, rynek: x.rynek || '', rok: '', standard: '' };
  let r; try { r = estimateSale(pool, subj, { yearOf: opts.yearOf, year: opts.year }); } catch { return null; }
  if (!r || !r.ok) return null;
  const mid = (r.total.lo + r.total.hi) / 2;
  return { id: x.id, ulica: x.ulica, nr: x.nr, m2: x.m2, data: x.data, rynek: x.rynek, cena: x.cena, lo: r.total.lo, hi: r.total.hi, mid, blad: (mid - x.cena) / x.cena, wPrzedziale: x.cena >= r.total.lo && x.cena <= r.total.hi, poziom: r.confidence?.level || '' };
}

export function summary(rows, tested) {
  const ok = rows.filter(Boolean), abs = ok.map(r => Math.abs(r.blad));
  if (ok.length < 20) return { ok: false, n: ok.length, tested, reason: `Za mało wycen do oceny (${ok.length}; potrzeba co najmniej 20).` };
  const by = lv => { const g = ok.filter(r => r.poziom === lv); return g.length ? { n: g.length, w: g.filter(r => r.wPrzedziale).length / g.length, med: med(g.map(r => Math.abs(r.blad))) } : null; };
  return {
    ok: true, n: ok.length, tested,
    wPrzedziale: ok.filter(r => r.wPrzedziale).length / ok.length,
    medBlad: med(abs), do10: abs.filter(a => a <= 0.10).length / ok.length,
    stronniczosc: med(ok.map(r => r.blad)),
    poziomy: { wysoka: by('wysoka'), 'średnia': by('średnia'), niska: by('niska') },
    rows: ok,
  };
}

// Liczenie w kawałkach, żeby nie blokować ekranu. onStep(gotowe, wszystkie). Zwraca podsumowanie.
export async function run(tx, opts = {}) {
  const smp = sample(tx, opts), out = [];
  for (let i = 0; i < smp.length; i++) {
    out.push(checkOne(tx, smp[i], opts));
    if (i % 4 === 3) { opts.onStep && opts.onStep(i + 1, smp.length); await new Promise(r => setTimeout(r, 0)); if (opts.cancel && opts.cancel()) return null; }
  }
  return summary(out, smp.length);
}
