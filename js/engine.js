import { KAT, pm2Of, POD_TXT } from './rcn.js';
// Silnik szacowania wartości: metoda porównawcza. Czysta logika, bez DOM.
// ZASADY:
//  - brak korekt "z głowy": cechy bez danych porównawczych NIE zmieniają wyniku, tylko są wypisane jako "nieużyte";
//  - wynik = przedział z porównań + liczba porównań + poziom pewności + powody;
//  - brak wystarczających danych = brak wyniku (nie zgadujemy).
// Progi pewności są ORIENTACYJNE, do skalibrowania testem wstecz na prawdziwych transakcjach.

export const THRESH = {
  min_n: 3,                 // poniżej: brak wyniku
  full_range_below_n: 5,    // poniżej: pokazujemy pełny rozrzut (min–max), nie środkowe 50%
  high: { n: 12, spread: 0.22, local: 0.7 },
  mid: { n: 6, spread: 0.40 },
};

const norm = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
  .replace(/^(ul\.|al\.|pl\.|os\.|ulica|aleja|plac|osiedle)\s+/i, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Klucz ulicy: rdzeń nazwy bez typu (ul., al., os.), tytułów i imion: „Ks. Wincentego Granata” = „Granata”.
const MONTHS = new Set(['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'wrzesnia', 'pazdziernika', 'listopada', 'grudnia']);
const ST_TYPE = new Set(['ul', 'al', 'aleja', 'aleje', 'pl', 'plac', 'os', 'osiedle', 'rondo', 'skwer', 'bulwar', 'droga', 'ulica']);
export function streetKey(s) {
  let t = norm(s).split(' ').filter(Boolean);
  while (t.length > 1 && ST_TYPE.has(t[0])) t.shift();
  // numer domu na końcu („Okrzei 12”, „Nałęczowska 16a”) nie należy do nazwy; wyjątek: „Lipca 80”, „3 Maja”
  while (t.length > 1 && /^\d+[a-z]?$/.test(t[t.length - 1]) && !MONTHS.has(t[t.length - 2])) t.pop();
  if (t.length <= 1) return t.join(' ');
  const last = t[t.length - 1];
  if (/^\d+[a-z]?$/.test(last) || /^[ivx]+$/.test(last) || MONTHS.has(last) || last.length <= 2) return t.slice(-2).join(' ');
  return last;
}
export const normStreet = streetKey;
export const normDz = norm;
export const addrKey = (ulica, nr) => streetKey(ulica) + '|' + norm(nr);
// klucz zapisany w starej postaci (pełna nazwa ulicy) -> nowa postać
export const migrateAddrKey = k => { const i = k.lastIndexOf('|'); return i < 0 ? k : streetKey(k.slice(0, i)) + k.slice(i); };


export function wquantile(items, q) {            // items: [{v,w}] — kwantyl ważony (pozycje w połowie wag)
  const a = items.slice().sort((x, y) => x.v - y.v);
  const tot = a.reduce((s, x) => s + x.w, 0); if (!a.length || tot <= 0) return NaN;
  let acc = 0; const p = a.map(x => { const pos = (acc + x.w / 2) / tot; acc += x.w; return pos; });
  if (q <= p[0]) return a[0].v;
  if (q >= p[p.length - 1]) return a[a.length - 1].v;
  for (let i = 0; i < a.length - 1; i++) {
    if (q >= p[i] && q <= p[i + 1]) return a[i].v + (q - p[i]) / Math.max(p[i + 1] - p[i], 1e-12) * (a[i + 1].v - a[i].v);
  }
  return a[a.length - 1].v;
}
const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

function trimOutliers(items) {                    // odrzuca wartości skrajne wg MAD (tylko gdy jest ich dość)
  if (items.length < 8) return { kept: items, dropped: 0 };
  const m = median(items.map(i => i.v)), mad = median(items.map(i => Math.abs(i.v - m))) * 1.4826;
  if (!mad) return { kept: items, dropped: 0 };
  const kept = items.filter(i => Math.abs(i.v - m) <= 3.5 * mad);
  return { kept, dropped: items.length - kept.length };
}

const floorClass = p => p == null ? null : p === 0 ? 0 : p <= 2 ? 1 : p <= 4 ? 2 : 3;
const sizeScore = (a, b) => Math.max(0, 1 - Math.abs(a - b) / b / 0.4);
const roomScore = (a, b) => a === b ? 1 : Math.abs(a - b) === 1 ? 0.6 : 0;
const floorScore = (a, b) => { const x = floorClass(a), y = floorClass(b); return x == null || y == null ? 0.95 : x === y ? 1 : Math.abs(x - y) === 1 ? 0.85 : 0.7; };
export const yearBand = r => r == null ? null : r < 1945 ? 0 : r < 1990 ? 1 : r < 2010 ? 2 : 3;
export const YEAR_BANDS = ['przed 1945', '1945–1989', '1990–2009', '2010 i nowsze'];
function yearScore(subjRok, compRok) {
  if (subjRok == null) return 1;                  // nie podano roku: nie filtrujemy
  if (compRok == null) return 0.9;                // porównanie bez znanego roku: lekko niżej
  return yearBand(subjRok) === yearBand(compRok) ? 1 : 0.55;
}

export function haversine(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function confidence(n, spread, localShare, extra = []) {
  const why = [];
  let lvl = 'niska';
  if (n >= THRESH.high.n && spread <= THRESH.high.spread && localShare >= THRESH.high.local) lvl = 'wysoka';
  else if (n >= THRESH.mid.n && spread <= THRESH.mid.spread) lvl = 'średnia';
  why.push(`${n} porównań (próg dla pewności średniej: ${THRESH.mid.n}, wysokiej: ${THRESH.high.n})`);
  why.push(`rozrzut cen: ${(spread * 100).toFixed(0)}% (średnia: do ${THRESH.mid.spread * 100}%, wysoka: do ${THRESH.high.spread * 100}%)`);
  why.push(`porównań z bliskiej lokalizacji: ${(localShare * 100).toFixed(0)}%`);
  return { level: lvl, score: { niska: 1, 'średnia': 2, wysoka: 3 }[lvl], why: why.concat(extra) };
}

function summarize(scored, subject, label, ctx) {
  const { kept, dropped } = trimOutliers(scored.map(s => ({ v: s.pm2, w: s.w, s })));
  const n = kept.length;
  if (n < THRESH.min_n) return { ok: false, reason: `Za mało porównań (${n}, minimum ${THRESH.min_n}). Dodaj więcej danych albo poszerz kryteria.`, n, dropped };
  const items = kept.map(k => ({ v: k.v, w: k.w }));
  const fullRange = n < THRESH.full_range_below_n;
  const q50 = wquantile(items, 0.5);
  const lo = fullRange ? Math.min(...items.map(i => i.v)) : wquantile(items, 0.25);
  const hi = fullRange ? Math.max(...items.map(i => i.v)) : wquantile(items, 0.75);
  const spread = (wquantile(items, 0.75) - wquantile(items, 0.25)) / q50;
  const totW = kept.reduce((s, k) => s + k.w, 0);
  const localW = kept.filter(k => k.s.local).reduce((s, k) => s + k.w, 0);
  const conf = confidence(n, spread, localW / totW, ctx.confExtra || []);
  const m2 = subject.m2;
  return {
    ok: true, label, n, dropped,
    pm2: { lo, mid: q50, hi }, total: { lo: lo * m2, mid: q50 * m2, hi: hi * m2 },
    rangeKind: fullRange ? 'pełny rozrzut porównań (min–max)' : 'środkowe 50% porównań',
    confidence: conf,
    comps: kept.map(k => k.s).sort((a, b) => b.w - a.w),
    notes: ctx.notes || [], unused: ctx.unused || [],
  };
}

// ---------- SEGMENTY I MIERZONE PREMIE (najem) ----------
// Segment rozpoznajemy ze słów w TYTULE ogłoszenia (deterministycznie, bez AI). Ogłoszenie bez takich słów mogło być
// nowe/luksusowe mimo to, więc zmierzona premia jest raczej dolną granicą prawdziwej różnicy.
const nz = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
export function segmentTags(title) {
  const t = nz(title);
  return {
    nowe: /nowe|nowy|nowa inwest|nowo wybud|inwestycj|pierwszy wynajem|nigdy nie zamiesz|deweloper|osiedle/.test(t) ? 1 : 0,
    wysoki: /apartament|luksus|premium|prestiz|wysoki standard|nowoczesn|design|elegan/.test(t) ? 1 : 0,
  };
}
function solve(A, b) {                                   // eliminacja Gaussa z wyborem elementu głównego
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / d; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let v = M[i][n]; for (let k = i + 1; k < n; k++) v -= M[i][k] * x[k]; x[i] = v / (M[i][i] || 1e-12); }
  return x;
}
function ridge(X, y, lam) {
  const d = X[0].length, A = Array.from({ length: d }, () => new Array(d).fill(0)), b = new Array(d).fill(0);
  for (let i = 0; i < X.length; i++) { const x = X[i]; for (let j = 0; j < d; j++) { b[j] += x[j] * y[i]; for (let k = j; k < d; k++) A[j][k] += x[j] * x[k]; } }
  for (let j = 0; j < d; j++) { for (let k = 0; k < j; k++) A[j][k] = A[k][j]; if (j) A[j][j] += lam; }
  return solve(A, b);
}
const pctile = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
// Cechy ofert oznaczane przy imporcie z filtrem portalu (1 = oferta była na liście z tym filtrem; 0 = oferta z tego samego dnia, której na liście nie było).
export const ATTRS = [['meble', 'Umeblowane (opis zawiera „umeblowane")'], ['klima', 'Klimatyzacja'], ['winda', 'Winda'], ['balkon', 'Balkon'], ['taras', 'Taras'], ['ogrod', 'Ogród'], ['garaz', 'Garaż']];
const ATTR_MIN = 15;                                  // minimum ofert Z cechą i minimum BEZ cechy (znanych), żeby ją zmierzyć
let _memo = null;
// Uczy się z bazy ofert, o ile droższe są oferty z daną cechą przy tym samym metrażu, pokojach i dzielnicy (jeden model dla wszystkich cech naraz).
// Zwraca przedziały (bootstrap 90%) i test wsteczny (10-krotna walidacja krzyżowa). Premia jest „istotna" tylko gdy cały przedział leży
// po jednej stronie zera i jest dość ofert z cechą i bez niej.
export function learnPremiums(pool) {
  const key = pool.length + '|' + (pool[0]?.id) + '|' + (pool[pool.length - 1]?.id) + '|' + pool.reduce((a, o) => a + (o.attrs ? Object.values(o.attrs).reduce((x, v) => x + v + 1, 0) : 0), 0);
  if (_memo && _memo.key === key) return _memo.val;
  const out = { n: pool.length, ok: false, attr: {} };
  if (pool.length >= 60) {
    const cnt = {}; pool.forEach(o => { const d = nz(o.dzielnica); cnt[d] = (cnt[d] || 0) + 1; });
    const dzs = Object.keys(cnt).filter(d => d && cnt[d] >= 8).sort();
    const sup = ATTRS.map(([k]) => k).filter(k => pool.filter(o => o.attrs && o.attrs[k] === 1).length >= ATTR_MIN && pool.filter(o => o.attrs && o.attrs[k] === 0).length >= ATTR_MIN);
    for (const [k] of ATTRS) { const n1 = pool.filter(o => o.attrs && o.attrs[k] === 1).length, n0 = pool.filter(o => o.attrs && o.attrs[k] === 0).length; out.attr[k] = { n1, n0, supported: sup.includes(k) }; }
    const feat = o => { const t = o.tags || segmentTags(o.tytul), d = nz(o.dzielnica);
      const f = [1, Math.log(o.m2 / 40), o.pokoje - 2, ...dzs.map(x => x === d ? 1 : 0), t.nowe, t.wysoki];
      for (const k of sup) { const v = o.attrs ? o.attrs[k] : undefined; f.push(v === 1 ? 1 : 0, v === undefined ? 1 : 0); }
      return f; };
    const X = pool.map(feat), y = pool.map(o => Math.log(o.cena / o.m2)), n = pool.length, d = X[0].length;
    const iNowe = 3 + dzs.length, iWys = iNowe + 1;
    let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const W = []; for (let it = 0; it < 150; it++) { const ix = Array.from({ length: n }, () => Math.floor(rnd() * n)); W.push(ridge(ix.map(i => X[i]), ix.map(i => y[i]), 3)); }
    const mk = (j, name, nTag, nOther) => {
      const bs = W.map(w => w[j]), lo = pctile(bs, 0.05), hi = pctile(bs, 0.95), mid = pctile(bs, 0.5);
      const sig = nTag >= ATTR_MIN && nOther >= ATTR_MIN && (lo > 0 || hi < 0);
      return { name, nTag, beta: mid, lo, hi, pct: Math.exp(mid) - 1, pctLo: Math.exp(lo) - 1, pctHi: Math.exp(hi) - 1, sig,
        used: sig ? (lo > 0 ? lo : hi) : 0 };           // stosujemy koniec przedziału NAJBLIŻSZY zera (ostrożnie)
    };
    const c1 = j => X.filter(r => r[j] === 1).length;
    out.nowe = mk(iNowe, 'nowe', c1(iNowe), n - c1(iNowe)); out.wysoki = mk(iWys, 'wysoki', c1(iWys), n - c1(iWys));
    sup.forEach((k, i) => { const j = iWys + 1 + 2 * i, a = out.attr[k]; Object.assign(a, mk(j, k, a.n1, a.n0), { supported: true, prev: a.n1 / (a.n1 + a.n0) }); });
    // test wsteczny: 10-krotna walidacja krzyżowa modelu vs. zwykła mediana
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => ((a * 7919) % 1009) - ((b * 7919) % 1009)), errM = [], errB = [];
    for (let f = 0; f < 10; f++) {
      const te = new Set(idx.filter((_, i) => i % 10 === f)), tr = idx.filter(i => !te.has(i));
      const w = ridge(tr.map(i => X[i]), tr.map(i => y[i]), 3), med = median(tr.map(i => y[i]));
      te.forEach(i => { errM.push(Math.abs(Math.exp(y[i] - X[i].reduce((s, v, k) => s + v * w[k], 0)) - 1)); errB.push(Math.abs(Math.exp(y[i] - med) - 1)); });
    }
    out.cv = { model: median(errM), base: median(errB), p80: pctile(errM, 0.8) }; out.ok = true;
  }
  _memo = { key, val: out }; return out;
}

// ---------- MODEL CEN NAJMU (regresja grzbietowa z częściowym uśrednianiem dzielnic i ulic) ----------
// Uczy się z CAŁEJ bazy ofert (żadna oferta nie wypada z powodu braku słów w tytule). Dzielnice i ulice z małą liczbą ofert są
// „ściągane” do średniej miasta (kara λ), więc dzielnica z 10 ofertami nie wnioskuje sama z siebie. Błąd modelu jest mierzony
// 10-krotną walidacją krzyżową (test wsteczny), a przedział wyniku bierze się z tych rzeczywistych błędów.
const RM_CFG = { lf: 1, ld: 10, ls: 2 };
const ydBand = r => !r ? 0 : r < 1990 ? 1 : r < 2008 ? 2 : r < 2018 ? 3 : 4;
const RM_ATTRS = ['klima', 'winda', 'balkon', 'taras', 'ogrod'];
function rmSolve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / d; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let v = M[i][n]; for (let k = i + 1; k < n; k++) v -= M[i][k] * x[k]; x[i] = v / (M[i][i] || 1e-12); }
  return x;
}
// cechy „podstawowe” jednej oferty lub wycenianego mieszkania (wartości nieznane = null)
function rmBase(o, prev) {
  const b = ydBand(o.rok), a = o.attrs || {}, v = k => (a[k] === 1 || a[k] === 0) ? a[k] : (prev ? prev[k] : 0);
  const wys = o.wysoki != null ? o.wysoki : segmentTags(o.tytul).wysoki;
  return [1, Math.log(o.m2 / 45), Math.min(4, Math.max(1, o.pokoje || 2)) - 2, o.pietro === 0 ? 1 : 0, o.pietro >= 5 ? 1 : 0,
    b === 1 ? 1 : 0, b === 2 ? 1 : 0, b === 3 ? 1 : 0, b === 4 ? 1 : 0, wys, v('klima'), v('winda'), v('balkon'), v('taras'), v('ogrod'), a.garaz === 1 ? 1 : (a.garaz === 0 ? 0 : (prev ? prev.garaz : 0)),
    prev && prev.useMeble ? (a.meble === 1 ? 1 : a.meble === 0 ? 0 : prev.meble) : 0];
}
const RM_NB = 17;
function rmFit(train, prev) {
  const dzs = [...new Set(train.map(o => norm(o.dzielnica)).filter(Boolean))].sort();
  const cnt = new Map(); for (const o of train) { const k = streetKey(o.ulica || ''); if (k) cnt.set(k, (cnt.get(k) || 0) + 1); }
  const sts = [...cnt.entries()].filter(([, c]) => c >= 2).map(([k]) => k).sort();
  const dzI = new Map(dzs.map((d, i) => [d, RM_NB + i])), stI = new Map(sts.map((d, i) => [d, RM_NB + dzs.length + i])), k = RM_NB + dzs.length + sts.length;
  const feat = o => { const f = rmBase(o, prev), idx = []; const d = dzI.get(norm(o.dzielnica)); if (d != null) idx.push(d); const st = stI.get(streetKey(o.ulica || '')); if (st != null) idx.push(st); return { f, idx }; };
  const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (const o of train) {
    const { f, idx } = feat(o), y = Math.log(o.cena / o.m2), col = []; f.forEach((v, j) => { if (v) col.push([j, v]); }); idx.forEach(j => col.push([j, 1]));
    for (const [j, vj] of col) { b[j] += vj * y; for (const [l, vl] of col) A[j][l] += vj * vl; }
  }
  for (let j = 1; j < RM_NB; j++) A[j][j] += RM_CFG.lf;
  for (let j = RM_NB; j < RM_NB + dzs.length; j++) A[j][j] += RM_CFG.ld;
  for (let j = RM_NB + dzs.length; j < k; j++) A[j][j] += RM_CFG.ls;
  const w = rmSolve(A, b);
  return o => { const { f, idx } = feat(o); let z = 0; f.forEach((v, j) => { z += v * w[j]; }); idx.forEach(j => { z += w[j]; }); return Math.exp(z) * o.m2; };
}
let _rm = null;
export function rentModel(pool) {
  const key = pool.length + '|' + pool.reduce((a, o) => a + o.cena + o.m2 * 3 + (o.rok || 0) + (o.attrs ? Object.values(o.attrs).reduce((x, v) => x + v + 1, 0) : 0) + (o.tytul ? o.tytul.length : 0), 0);
  if (_rm && _rm.key === key) return _rm.val;
  let val = null;
  if (pool.length >= 60) {
    const prev = {}; for (const k of [...RM_ATTRS, 'garaz']) { const kn = pool.filter(o => o.attrs && (o.attrs[k] === 1 || o.attrs[k] === 0)); prev[k] = kn.length ? kn.filter(o => o.attrs[k] === 1).length / kn.length : 0; }
    { const k1 = pool.filter(o => o.attrs && o.attrs.meble === 1).length, k0 = pool.filter(o => o.attrs && o.attrs.meble === 0).length; prev.useMeble = k1 >= ATTR_MIN && k0 >= ATTR_MIN; prev.meble = k1 + k0 ? k1 / (k1 + k0) : 0; }
    const wysPrev = pool.reduce((s, o) => s + segmentTags(o.tytul).wysoki, 0) / pool.length;
    const order = pool.map((o, i) => i).sort((i, j) => String(pool[i].id).localeCompare(String(pool[j].id)));
    const foldOf = new Map(order.map((i, r) => [i, (r * 7919) % 10]));
    const res = [];                                       // błędy poza próbą: ln(rzeczywista / przewidziana)
    for (let f = 0; f < 10; f++) {
      const tr = pool.filter((_, i) => foldOf.get(i) !== f), fn = rmFit(tr, prev);
      pool.forEach((o, i) => { if (foldOf.get(i) === f) res.push({ e: Math.log(o.cena / fn(o)), m2: o.m2 }); });
    }
    const fit = rmFit(pool, prev), ae = res.map(r => Math.exp(Math.abs(r.e)) - 1).sort((a, b) => a - b);
    val = { n: pool.length, prev, wysPrev, res, mape: ae[Math.floor(ae.length / 2)], predict: s => fit({ ...s, wysoki: s.wysoki }) };
  }
  _rm = { key, val }; return val;
}
const qOf = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

// ---------- NAJEM (oferty z list) ----------
export function estimateRent(offers, subject) {
  const notes = [], unused = [], ask = [];
  const pool = offers.filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0);
  const excludedFlag = offers.length - pool.length;
  // cechy podmiotu: znane (0/1) albo nieznane (null)
  const sNowe = subject.rok == null ? null : subject.rok >= 2018 ? 1 : 0;
  const sWys = subject.standard ? (subject.standard === 'wysoki' ? 1 : 0) : null;
  const sAttr = {}; for (const [k] of ATTRS) { const v = k === 'meble' ? (subject.meble === 'tak' ? 1 : subject.meble === 'nie' ? 0 : null) : (subject.attrs ? subject.attrs[k] ?? null : null); sAttr[k] = v; }
  const L = learnPremiums(pool);
  const use = { nowe: L.ok && L.nowe.sig && sNowe != null, wysoki: L.ok && L.wysoki.sig && sWys != null };
  const useA = {}; for (const [k] of ATTRS) useA[k] = L.ok && L.attr[k] && L.attr[k].sig && sAttr[k] != null;
  const build = (sizeTol, dzOnly) => pool.map(o => {
    if (Math.abs(o.m2 - subject.m2) / subject.m2 > sizeTol) return null;
    if (Math.abs(o.pokoje - subject.pokoje) > 1) return null;
    const sameDz = subject.dzielnica && norm(o.dzielnica) === norm(subject.dzielnica);
    if (dzOnly && !sameDz) return null;
    const sameSt = subject.ulica && o.ulica && streetKey(o.ulica) === streetKey(subject.ulica);
    const loc = sameSt ? 1 : sameDz ? 0.9 : 0.35;
    let w = loc * sizeScore(o.m2, subject.m2) * roomScore(o.pokoje, subject.pokoje) * floorScore(o.pietro, subject.pietro);
    const t = o.tags || segmentTags(o.tytul); let adj = 0, mism = false;
    for (const k of ['nowe', 'wysoki']) {
      const sv = k === 'nowe' ? sNowe : sWys; if (sv == null) continue;
      if (t[k] !== sv) { mism = true; if (use[k]) adj += (sv - t[k]) * L[k].used; }
    }
    for (const [k] of ATTRS) {                       // cechy z filtrów: znana wartość oferty, a gdy nieznana — oczekiwana (udział w bazie)
      if (!useA[k]) continue; const cv = o.attrs && o.attrs[k] !== undefined ? o.attrs[k] : L.attr[k].prev;
      adj += (sAttr[k] - cv) * L.attr[k].used;
    }
    if (mism) w *= (use.nowe || use.wysoki) && Math.abs(adj) > 0 ? 0.85 : 0.6;   // inny segment: niższa waga
    if (o.own) w *= 2;                              // własna umowa biura: największa waga
    if (w < 0.12) return null;
    const pm2raw = o.cena / o.m2, pm2 = pm2raw * Math.exp(adj);
    return { id: o.id, kind: 'oferta', url: o.url || null, pm2, pm2raw, adjPct: Math.exp(adj) - 1, tags: t, cena: o.cena, czynsz: o.czynsz, m2: o.m2, pokoje: o.pokoje, pietro: o.pietro,
      opis: [o.ulica || '', o.dzielnica || ''].filter(Boolean).join(', '), tytul: o.tytul, sprzedawca: o.sprzedawca, own: !!o.own, meble: o.meble, w, local: sameDz || sameSt, src: o.own ? 'własna umowa' : 'ogłoszenia (ceny ofertowe)' };
  }).filter(Boolean).sort((a, b) => b.w - a.w).slice(0, 30);
  let sc = build(0.3, true);
  if (sc.length < 8) { sc = build(0.45, false); if (subject.dzielnica) notes.push('Za mało ofert w tej dzielnicy: poszerzono do całego miasta (niższa waga ofert spoza dzielnicy).'); }
  if (excludedFlag) notes.push(`Pominięto ${excludedFlag} ofert oznaczonych jako podejrzane lub wyłączonych ręcznie.`);
  notes.push('To ceny OFERTOWE z ogłoszeń, nie zawartych umów. Faktyczny czynsz może być niższy; brak danych, by to policzyć.');
  const pc = p => `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(0)}%`;
  const applied = [];
  if (L.ok) {
    for (const [k, lbl, sv] of [['nowe', 'nowe budownictwo', sNowe], ['wysoki', 'wysoki standard', sWys]]) {
      const P = L[k], rng = `${pc(P.pct)} (przedział ${pc(P.pctLo)} do ${pc(P.pctHi)}, ${P.nTag} ofert z tą cechą w tytule)`;
      if (use[k]) { applied.push({ k, label: lbl, pct: P.pct, used: Math.exp(P.used) - 1 }); notes.push(`Korekta segmentu „${lbl}": zmierzona różnica w bazie ${rng}. Do korekty użyto ostrożniejszego końca przedziału (${pc(Math.exp(P.used) - 1)}).${k === 'nowe' ? ' Rok budowy od 2018 traktowany jako nowe budownictwo.' : ''}`); }
      else if (!P.sig) unused.push(`${lbl}: zbyt mało ofert z tą cechą, by uczciwie zmierzyć różnicę (${P.nTag} ofert)`);
      else if (sv == null) ask.push({ k, text: `${k === 'nowe' ? 'Rok budowy' : 'Standard'}: w tej bazie ${lbl} oznacza czynsz za m² o około ${pc(P.pct)} (przedział ${pc(P.pctLo)} do ${pc(P.pctHi)}). Podaj ${k === 'nowe' ? 'rok budowy' : 'standard'}, żeby to uwzględnić.` });
    }
    for (const [k, lbl] of ATTRS) {
      const A = L.attr[k]; const nm = lbl.split(' (')[0].toLowerCase();
      if (useA[k]) { applied.push({ k, label: nm, pct: A.pct, used: Math.exp(A.used) - 1, has: sAttr[k] === 1 }); notes.push(`Cecha „${nm}": zmierzona różnica w bazie ${pc(A.pct)} (przedział ${pc(A.pctLo)} do ${pc(A.pctHi)}; ${A.n1} ofert z cechą, ${A.n0} bez). Użyto ostrożniejszego końca (${pc(Math.exp(A.used) - 1)}).`); }
      else if (A && A.supported && !A.sig) unused.push(`${nm}: w bazie nie widać wyraźnej różnicy cen (${A.n1} z cechą, ${A.n0} bez)`);
      else if (A && !A.supported) unused.push(`${nm}: za mało oznaczonych ofert (${A.n1} z cechą, ${A.n0} bez; trzeba co najmniej ${ATTR_MIN} z cechą i ${ATTR_MIN} bez). Wgraj listę z filtrem w zakładce Dane.`);
      else if (A && A.sig && sAttr[k] == null) ask.push({ k, text: `${nm}: w tej bazie ta cecha oznacza czynsz za m² o około ${pc(A.pct)}. Zaznacz, czy mieszkanie ją ma.` });
    }
    notes.push('Segmenty „nowe" i „wysoki standard" są rozpoznawane ze słów w tytułach ogłoszeń, więc zmierzone premie są raczej ostrożnym minimum.');
  } else unused.push('cechy mieszkania: za mało ofert w bazie, by zmierzyć różnice (minimum 60)');
  const r = summarize(sc, subject, 'Szacunkowy czynsz najmu', { notes, unused });
  // HYBRYDA: model z całej bazy (częściowe uśrednianie dzielnic i ulic) + najbliższe porównania; przedział z rzeczywistych błędów w teście wstecznym
  const RM = rentModel(pool);
  if (r.ok && RM) {
    const sub = { m2: subject.m2, pokoje: subject.pokoje, pietro: subject.pietro, rok: subject.rok, dzielnica: subject.dzielnica, ulica: subject.ulica,
      attrs: { ...(subject.attrs || {}), ...(subject.meble === 'tak' ? { meble: 1 } : subject.meble === 'nie' ? { meble: 0 } : {}) }, wysoki: subject.standard === 'wysoki' ? 1 : subject.standard ? 0 : RM.wysPrev };
    const pB = RM.predict(sub), pA = r.total.mid, wB = 0.6, ag = Math.abs(Math.log(pA / pB));
    const ctr = Math.exp(wB * Math.log(pB) + (1 - wB) * Math.log(pA));
    const near = RM.res.filter(x => Math.abs(Math.log(x.m2 / subject.m2)) < 0.3), R = (near.length >= 40 ? near : RM.res).map(x => x.e), widen = ag > 0.15 ? 1.25 : 1;
    const lo = ctr * Math.exp(qOf(R, 0.25) * widen), mid = ctr * Math.exp(qOf(R, 0.5)), hi = ctr * Math.exp(qOf(R, 0.75) * widen), m2 = subject.m2;
    r.compsTotal = r.total; r.total = { lo, mid, hi }; r.pm2 = { lo: lo / m2, mid: mid / m2, hi: hi / m2 };
    r.rangeKind = 'przedział typowego błędu metody (środkowe 50% dopasowań w teście wstecznym)';
    r.model = { pA, pB, wB, agreement: ag, mape: RM.mape, n: RM.n };
    r.confidence.why.push(`metoda hybrydowa: model z ${RM.n} ofert (${Math.round(pB)} zł) i najbliższe porównania (${Math.round(pA)} zł); typowy błąd w teście wstecznym ${(RM.mape * 100).toFixed(0)}%`);
    if (ag > 0.15) r.confidence.why.push(`model i porównania różnią się o ${(ag * 100).toFixed(0)}%: przedział poszerzono`);
    if (ag > 0.2 && r.confidence.score > 1) { r.confidence.score -= 1; r.confidence.level = r.confidence.score === 1 ? 'niska' : 'średnia'; }
  }
  if (r.ok) {
    const cz = sc.filter(s => s.czynsz != null).map(s => s.czynsz / s.m2);
    r.adminPm2 = cz.length >= 3 ? median(cz) : null;
    if (r.adminPm2 != null) r.adminTotal = r.adminPm2 * subject.m2;
    r.ask = ask; r.premiums = L.ok ? L : null; r.applied = applied; r.adjusted = applied.length > 0;
    if (L.ok) r.confidence.why.push(`test wsteczny na ${L.n} ofertach: typowy błąd modelu ${(L.cv.model * 100).toFixed(0)}% (zwykła mediana: ${(L.cv.base * 100).toFixed(0)}%); 8 z 10 ofert mieści się w błędzie do ${(L.cv.p80 * 100).toFixed(0)}%`);
  }
  return r;
}

// ---------- SPRZEDAŻ (transakcje RCN) ----------
// rcn: { cols:[...], rows:[[...]] } -> obiekty (patrz rcn.js: rcnToObjects)
export function estimateSale(tx, subject, opts = {}) {
  const now = opts.year || new Date().getFullYear();
  const notes = [], unused = [];
  const yearOfBuilding = opts.yearOf || (() => null);
  const base = tx.filter(t => t.funkcja === 'mieszkalna' && t.izby > 0 && t.m2 >= 12 && t.m2 <= 250 && t.cena > 0 && !t.wielolokalowa && t.pelne);
  const excluded = tx.length - base.length;
  // współrzędne podmiotu: z RCN po adresie (ten sam budynek), inaczej środek ulicy
  let subLL = subject.latlon || null, llKind = subLL ? 'podane' : null;
  if (!subLL && subject.ulica) {
    const k = addrKey(subject.ulica, subject.nr);
    const same = tx.filter(t => t.lat != null && addrKey(t.ulica, t.nr) === k);
    if (same.length) { subLL = avgLL(same); llKind = 'ten sam budynek w RCN'; }
    else {
      const st = tx.filter(t => t.lat != null && streetKey(t.ulica) === streetKey(subject.ulica));
      if (st.length >= 3) { subLL = avgLL(st); llKind = 'środek ulicy wg RCN (przybliżone)'; }
    }
  }
  const nowTs = opts.nowTs || Date.now();
  // wiek transakcji w latach: z daty aktu (jeśli jest i nie z przyszłości), inaczej z roku w numerze aktu
  const ageOf = t => (t.ts && t.ts <= nowTs) ? (nowTs - t.ts) / 31557600000 : Math.max(0, now - t.rok);
  const build = (years, sizeTol) => base.map(t => {
    const ageY = ageOf(t);
    if (ageY > years) return null;
    if (Math.abs(t.m2 - subject.m2) / subject.m2 > sizeTol) return null;
    if (Math.abs(t.izby - subject.pokoje) > 1) return null;
    if (subject.rynek && t.rynek && t.rynek !== subject.rynek) return null;
    let loc, local = false, same = false;
    if (subLL && t.lat != null) {
      const d = haversine(subLL, [t.lat, t.lon]);
      loc = d < 0.3 ? 1 : d < 0.8 ? 0.85 : d < 1.5 ? 0.65 : d < 3 ? 0.4 : 0.15; local = d < 1.5;
      same = subject.ulica && addrKey(t.ulica, t.nr) === addrKey(subject.ulica, subject.nr);
    } else if (subject.ulica) { same = streetKey(t.ulica) === streetKey(subject.ulica); loc = same ? 1 : 0.3; local = same; }
    else loc = 0.3;
    const rec = ageY <= 1 ? 1 : ageY <= 2 ? 0.85 : ageY <= 3 ? 0.7 : 0.55;
    const ybuild = yearOfBuilding(addrKey(t.ulica, t.nr));
    const w = loc * sizeScore(t.m2, subject.m2) * roomScore(t.izby, subject.pokoje) * floorScore(t.kond, subject.pietro) * rec * yearScore(subject.rok, ybuild);
    if (w < 0.08) return null;
    return { id: t.id, kind: 'transakcja', pm2: t.cena / t.m2, cena: t.cena, m2: t.m2, pokoje: t.izby, pietro: t.kond, rok: t.rok, data: t.ts ? new Date(t.ts).toISOString().slice(0, 10) : null, rozdzielona: !!t.rozdzielona, sprz: t.sprz, rodzaj: t.rodzaj, rynek: t.rynek,
      opis: [t.ulica, t.nr].filter(Boolean).join(' '), lat: t.lat, lon: t.lon, w, local, sameBuilding: !!same, rokBudowy: ybuild, src: 'RCN (ceny z aktów notarialnych)' };
  }).filter(Boolean).sort((a, b) => b.w - a.w).slice(0, 40);
  let sc = build(3, 0.3), win = 3;
  if (sc.length < 10) { sc = build(5, 0.4); win = 5; notes.push('Za mało transakcji z ostatnich 3 lat: poszerzono okno do 5 lat (starsze transakcje mają niższą wagę).'); }
  notes.push(`Okno czasu: ostatnie ${win} lat (data aktu). Cena z aktu notarialnego, nie z ogłoszenia.`);
  if (excluded) notes.push(`Odrzucono ${excluded} rekordów RCN, w których cena nie dotyczy jednego pełnego lokalu mieszkalnego (garaże, lokale usługowe, udziały, kilka lokali w jednej transakcji bez osobnej ceny lokalu).`);
  if (llKind) notes.push(`Lokalizacja podmiotu: ${llKind}.`); else notes.push('Nie ustalono współrzędnych podmiotu: lokalizację oceniono tylko po nazwie ulicy.');
  if (subject.rok != null) {
    const known = sc.filter(s => s.rokBudowy != null).length;
    notes.push(`Rok budowy podmiotu: ${subject.rok} (${YEAR_BANDS[yearBand(subject.rok)]}). Rok budowy znamy dla ${known} z ${sc.length} porównań; pozostałe mają niższą wagę, ale nie są odrzucone.`);
  } else unused.push('rok budowy (nie podano)');
  if (subject.standard) unused.push('standard wykończenia (RCN go nie zawiera)');
  if (subject.meble != null) unused.push('wyposażenie (RCN go nie zawiera)');
  const ce = [];
  if (!subLL) ce.push('brak współrzędnych podmiotu');
  const r = summarize(sc, subject, 'Szacunkowa wartość rynkowa', { notes, unused, confExtra: ce });
  if (r.ok) { r.subLL = subLL; r.llKind = llKind; r.window = win; }
  return r;
}

// ---------- SPRZEDAŻ: pozostałe kategorie (dom, działka, lokal użytkowy, obiekt/hala, garaż) ----------
// Ta sama metoda co dla mieszkań (porównawcza, ważona), ale wagi zależą od kategorii: powierzchnia (skala logarytmiczna), podtyp
// (przeznaczenie działki, funkcja lokalu, rodzaj budynku), położenie i wiek transakcji. Cena odnosi się do m² powierzchni tej kategorii:
// użytkowa lokalu/budynku albo powierzchnia działki. Dla domu cena zawiera działkę.
const sizeLog = (a, b, f) => Math.max(0, 1 - Math.abs(Math.log(a / b)) / Math.log(f));
const SIZE_F = { dom: 1.8, dzialka: 2.5, lokal: 2, obiekt: 2.5, garaz: 1.6 };
export function estimateSaleKat(tx, subject, opts = {}) {
  const kat = subject.kat, K = KAT[kat], notes = [], unused = [];
  const nowTs = opts.nowTs || Date.now(), geo = opts.geo || tx;
  const own = tx.filter(t => t.kat === kat), base = own.filter(t => pm2Of(t) != null), excluded = own.length - base.length;
  let subLL = subject.latlon || null, llKind = subLL ? 'podane' : null;
  if (!subLL && subject.ulica) {
    const k = addrKey(subject.ulica, subject.nr), same = geo.filter(t => t.lat != null && addrKey(t.ulica, t.nr) === k);
    if (same.length) { subLL = avgLL(same); llKind = 'ten sam adres w RCN'; }
    else { const st = geo.filter(t => t.lat != null && streetKey(t.ulica) === streetKey(subject.ulica)); if (st.length >= 3) { subLL = avgLL(st); llKind = 'środek ulicy wg RCN (przybliżone)'; } }
  }
  const ageOf = t => { const w = (t.ts && t.ts <= nowTs) ? t.ts : (t.rok ? Date.UTC(t.rok, 6, 1) : null); return w == null ? 99 : Math.max(0, (nowTs - w) / 31557600000); };
  const build = (years) => base.map(t => {
    const ageY = ageOf(t); if (ageY > years) return null;
    const sz = sizeLog(t.m2, subject.m2, SIZE_F[kat] || 2); if (sz <= 0) return null;
    if (subject.rynek && t.rynek && t.rynek !== subject.rynek) return null;
    let loc = 0.3, local = false, same = false;
    if (subLL && t.lat != null) {
      const d = haversine(subLL, [t.lat, t.lon]);
      loc = d < 0.3 ? 1 : d < 0.8 ? 0.85 : d < 1.5 ? 0.65 : d < 3 ? 0.4 : d < 6 ? 0.25 : d < 12 ? 0.15 : 0.08; local = d < 1.5;
      same = !!subject.ulica && addrKey(t.ulica, t.nr) === addrKey(subject.ulica, subject.nr);
    } else if (subject.ulica) { same = streetKey(t.ulica) === streetKey(subject.ulica); loc = same ? 1 : 0.3; local = same; }
    const rec = ageY <= 1 ? 1 : ageY <= 2 ? 0.85 : ageY <= 3 ? 0.7 : ageY <= 5 ? 0.55 : 0.4;
    const pod = subject.pod && t.pod ? (subject.pod === t.pod ? 1 : 0.5) : 0.9;
    const plot = kat === 'dom' && subject.dzm2 && t.dzm2 ? 0.6 + 0.4 * sizeLog(t.dzm2, subject.dzm2, 3) : 1;
    const wiecz = subject.wieczyste != null && t.wieczyste != null && !!subject.wieczyste !== !!t.wieczyste ? 0.6 : 1;
    const w = loc * (0.3 + 0.7 * sz) * rec * pod * plot * wiecz; if (w < 0.08) return null;
    const lab = kat === 'dzialka' ? (POD_TXT[t.pod] || t.pod || '') : (POD_TXT[t.pod] || '');
    return { id: t.id, kind: 'transakcja', pm2: t.cena / t.m2, cena: t.cena, m2: t.m2, pokoje: null, pietro: null, rok: t.rok, data: t.ts ? new Date(t.ts).toISOString().slice(0, 10) : null, sprz: t.sprz, rodzaj: t.rodzaj, rynek: t.rynek,
      opis: [[t.ulica, t.nr].filter(Boolean).join(' ') || 'okolice Lublina (bez adresu w RCN)', lab].filter(Boolean).join(' · '), lat: t.lat, lon: t.lon, w, local, sameBuilding: same, dzm2: t.dzm2 || null, pod: t.pod, src: 'RCN (ceny z aktów notarialnych)' };
  }).filter(Boolean).sort((a, b) => b.w - a.w).slice(0, 40);
  let sc = [], win = 3;
  for (const y of [3, 5, 8]) { sc = build(y); win = y; if (sc.length >= 10) break; if (y < 8) notes.push(`Za mało transakcji z ostatnich ${y} lat: poszerzono okno do ${y === 3 ? 5 : 8} lat (starsze transakcje mają niższą wagę).`); }
  notes.push(`Okno czasu: ostatnie ${win} lat (data aktu). Cena z aktu notarialnego, nie z ogłoszenia.`);
  if (kat === 'dom') notes.push(`Cena domu obejmuje działkę. Wynik to cena za m² powierzchni użytkowej budynku; RCN podaje tę powierzchnię tylko w części aktów (użyto ${fmtN(base.length)} z ${fmtN(own.length)} transakcji domów).`);
  if (kat === 'dzialka') notes.push('Cena za m² gruntu. Przeznaczenie działki wg planu miejscowego (jeśli RCN je zna) ma wpływ na wagę porównania.');
  if (kat === 'garaz' || kat === 'lokal') notes.push('Dane dotyczą lokali (garaży i lokali użytkowych) sprzedawanych w Lublinie i okolicy; lokali tego typu jest w RCN znacznie mniej niż mieszkań.');
  if (excluded) notes.push(`Pominięto ${fmtN(excluded)} rekordów tej kategorii: kilka nieruchomości w jednym akcie, udział w prawie, brak lub niejednoznaczna powierzchnia (RCN podaje grunt raz w m², raz w hektarach) albo cena za m² poza rozsądnym zakresem.`);
  if (llKind) notes.push(`Lokalizacja podmiotu: ${llKind}.`); else notes.push('Nie ustalono współrzędnych podmiotu: lokalizację oceniono tylko po nazwie ulicy, więc wynik dotyczy rynku całej okolicy Lublina.');
  if (subject.rok != null) unused.push('rok budowy (RCN go nie zawiera dla tej kategorii)');
  if (subject.standard) unused.push('standard wykończenia (RCN go nie zawiera)');
  const ce = []; if (!subLL) ce.push('brak współrzędnych podmiotu');
  const r = summarize(sc, subject, 'Szacunkowa wartość rynkowa', { notes, unused, confExtra: ce });
  if (r.ok) { r.subLL = subLL; r.llKind = llKind; r.window = win; }
  return r;
}
const fmtN = n => Math.round(n).toLocaleString('pl-PL');

// Miejsce postojowe wynajmowane osobno: opłata z ofert, które ją podają wprost (stan „dodatkowo” + kwota). Poniżej 5 takich ofert kwoty nie podajemy.
export function parkingExtra(offers) {
  const v = offers.filter(o => o.wlaczone !== false && o.parking && o.parking.stan === 'dodatkowo' && o.parking.kwota > 0).map(o => o.parking.kwota);
  if (v.length < 5) return { ok: false, n: v.length };
  return { ok: true, n: v.length, lo: pctile(v, .25), mid: median(v), hi: pctile(v, .75) };
}

const avgLL = a => [a.reduce((s, x) => s + x.lat, 0) / a.length, a.reduce((s, x) => s + x.lon, 0) / a.length];

// Orientacyjna rentowność brutto: roczny najem / wartość. Tylko przy obu wynikach.
export function grossYield(sale, rent) {
  if (!sale?.ok || !rent?.ok) return null;
  const f = (r, s) => (r * 12) / s * 100;
  return { lo: f(rent.total.lo, sale.total.hi), mid: f(rent.total.mid, sale.total.mid), hi: f(rent.total.hi, sale.total.lo) };
}

// ---------- KONTROLA CZYNSZU ZE SPRZEDAŻĄ ----------
// Nie zakładamy stałej rentowności. MIERZYMY w danych, ile wynosi stosunek czynszu do wartości (za m²) i jak dobrze cena kupna
// tłumaczy czynsz między miejscami. Metoda główna: DZIELNICE (dość ofert i transakcji w każdej). Transakcje RCN nie mają dzielnicy,
// więc przypisujemy ją po najbliższej ulicy, dla której dzielnicę znamy z ofert najmu (do 2,5 km). Gdy dzielnic jest za mało: ulice.
// Wynik: czynsz ≈ szacunkowa wartość × zmierzony stosunek (dla dzielnicy mieszkania, ściągnięty ku średniej miasta).
const q = (a, x) => { const s = a.slice().sort((m, n) => m - n); return s[Math.min(s.length - 1, Math.max(0, Math.round(x * (s.length - 1))))]; };
function fitLog(pairs) {
  const n = pairs.length, xs = pairs.map(p => Math.log(p.sale)), ys = pairs.map(p => Math.log(p.rent));
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), syy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  return { slope: sxx > 0 ? sxy / sxx : null, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : null };
}
export function crossCheckRent(offers, tx, subject, rentRes, opts = {}) {
  const nowTs = opts.nowTs || Date.now(), nowY = new Date(nowTs).getFullYear();
  if (!tx || !tx.length) return { ok: false, reason: 'Brak danych RCN (zakładka Dane).' };
  const age = t => (t.ts && t.ts <= nowTs) ? (nowTs - t.ts) / 31557600000 : Math.max(0, nowY - t.rok);
  const sales = tx.filter(t => t.funkcja === 'mieszkalna' && t.izby > 0 && t.m2 >= 12 && t.m2 <= 250 && t.cena > 0 && !t.wielolokalowa && t.pelne && age(t) <= 3);
  const rents = offers.filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0);
  const out = { ok: false };
  // --- standaryzacja metrażu: cena/m² zależy od metrażu (czynsz silnie, cena sprzedaży słabiej). Obie strony przeliczamy do metrażu wycenianego mieszkania.
  const slope = pts => { const n = pts.length; if (n < 60) return 0; const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n; const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0); return sxx > 0 ? Math.max(-0.9, Math.min(0.2, pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx)) : 0; };
  const bR = slope(rents.map(o => [Math.log(o.m2), Math.log(o.cena / o.m2)])), bS = slope(sales.map(t => [Math.log(t.m2), Math.log(t.cena / t.m2)]));
  const stdR = o => (o.cena / o.m2) * Math.pow(subject.m2 / o.m2, bR), stdS = t => (t.cena / t.m2) * Math.pow(subject.m2 / t.m2, bS);
  out.sizeEffect = { rent: bR, sale: bS };
  // --- przypisanie dzielnic transakcjom: punkty (ulica -> środek wg RCN) z dzielnicą znaną z ofert
  const streetPts = new Map();
  for (const t of sales) if (t.ulica && t.lat != null) { const k = streetKey(t.ulica), p = streetPts.get(k) || streetPts.set(k, { la: 0, lo: 0, n: 0 }).get(k); p.la += t.lat; p.lo += t.lon; p.n++; }
  const known = []; const seenSt = new Set();
  for (const o of rents) if (o.ulica && o.dzielnica) { const k = streetKey(o.ulica), d = norm(o.dzielnica), key = k + '|' + d, p = streetPts.get(k); if (p && p.n >= 2 && !seenSt.has(key)) { seenSt.add(key); known.push({ la: p.la / p.n, lo: p.lo / p.n, d }); } }
  const D = new Map(), get = d => D.get(d) || D.set(d, { rent: [], sale: [] }).get(d);
  for (const o of rents) if (o.dzielnica) get(norm(o.dzielnica)).rent.push(stdR(o));
  let assigned = 0;
  if (known.length >= 5) for (const t of sales) {
    if (t.lat == null) continue;
    let best = null, bd = 1e9; for (const k of known) { const d = haversine([t.lat, t.lon], [k.la, k.lo]); if (d < bd) { bd = d; best = k; } }
    if (best && bd <= 2.5) { get(best.d).sale.push(stdS(t)); assigned++; }
  }
  const dp = []; for (const [d, v] of D) if (v.rent.length >= 5 && v.sale.length >= 30) dp.push({ d, rent: median(v.rent), sale: median(v.sale), nr: v.rent.length, ns: v.sale.length, rq: [q(v.rent, .25), q(v.rent, .75)], sq: [q(v.sale, .25), q(v.sale, .75)] });
  let ratioMid, ratioLo, ratioHi, unit, pairs, subjSalePm2 = null;
  if (dp.length >= 8) {
    unit = 'dzielnic'; pairs = dp;
    const gr = pairs.map(p => p.rent / p.sale), gmid = q(gr, .5);
    const f = fitLog(pairs); Object.assign(out, f);
    const mine = subject.dzielnica ? pairs.find(p => p.d === norm(subject.dzielnica)) : null;
    if (mine) {
      const w = mine.nr / (mine.nr + 6), r = mine.rent / mine.sale;                  // ściągnięcie ku średniej miasta, gdy mało ofert
      ratioMid = w * r + (1 - w) * gmid; ratioLo = ratioMid * mine.rq[0] / mine.rent; ratioHi = ratioMid * mine.rq[1] / mine.rent;
      out.basis = `dzielnica ${subject.dzielnica} (${mine.nr} ofert najmu, ${mine.ns} transakcji)`; subjSalePm2 = [mine.sq[0], mine.sale, mine.sq[1]];
    } else {
      ratioMid = gmid; ratioLo = q(gr, .25); ratioHi = q(gr, .75); out.basis = 'średnia miasta (dzielnica mieszkania nie ma dość danych)';
    }
  } else {
    // zapasowo: ulice (wymaga ulicy w ofertach i transakcjach)
    const S = new Map(), R = new Map();
    for (const t of sales) if (t.ulica) { const k = streetKey(t.ulica); (S.get(k) || S.set(k, []).get(k)).push(stdS(t)); }
    for (const o of rents) if (o.ulica) { const k = streetKey(o.ulica); (R.get(k) || R.set(k, []).get(k)).push(stdR(o)); }
    pairs = []; for (const [k, rs] of R) { const ss = S.get(k); if (ss && ss.length >= 3 && rs.length >= 2) pairs.push({ d: k, rent: median(rs), sale: median(ss), nr: rs.length, ns: ss.length }); }
    unit = 'ulic';
    if (pairs.length < 8) { out.pairs = pairs.length; out.unit = unit; out.reason = `Za mało miejsc, w których mamy jednocześnie oferty najmu i transakcje, żeby zmierzyć związek czynszu z ceną kupna (dzielnic: ${dp.length}, ulic: ${pairs.length}; minimum 8). Dodawaj oferty najmu, najlepiej z ulicą.`; return out; }
    const gr = pairs.map(p => p.rent / p.sale); ratioMid = q(gr, .5); ratioLo = q(gr, .25); ratioHi = q(gr, .75); Object.assign(out, fitLog(pairs)); out.basis = 'średnia z ulic';
  }
  Object.assign(out, { unit, pairs: pairs.length, assigned, ratio: { lo: ratioLo, mid: ratioMid, hi: ratioHi }, grossYieldPct: ratioMid * 12 * 100 });
  // wartość mieszkania: z adresu (RCN), a bez ulicy z mediany dzielnicy
  let sale = null;
  if (subject.ulica) { sale = estimateSale(tx, { tryb: 'sprzedaz', ulica: subject.ulica, nr: subject.nr || '', m2: subject.m2, pokoje: subject.pokoje, pietro: subject.pietro, rok: subject.rok || null, rynek: null }, { nowTs }); if (!sale.ok) sale = null; }
  if (!sale && subjSalePm2) { sale = { ok: true, total: { lo: subjSalePm2[0] * subject.m2, mid: subjSalePm2[1] * subject.m2, hi: subjSalePm2[2] * subject.m2 }, byDistrict: true }; }
  if (!sale) { out.reason = 'Nie ustalono wartości mieszkania z RCN (podaj ulicę z numerem albo dzielnicę z dużą liczbą transakcji).'; return out; }
  out.sale = sale; out.ok = true;
  const mid = sale.total.mid * ratioMid, wr = Math.log(ratioHi / ratioLo) / 2, ws = Math.log(sale.total.hi / sale.total.lo) / 2, w = Math.sqrt(wr * wr + ws * ws);
  out.implied = { lo: mid * Math.exp(-w), mid, hi: mid * Math.exp(w) };
  if (rentRes && rentRes.ok) {
    const a = rentRes.total, b = out.implied;
    out.overlap = Math.max(a.lo, b.lo) <= Math.min(a.hi, b.hi);
    out.diffPct = (b.mid - a.mid) / a.mid * 100;
    const ad = Math.abs(out.diffPct); out.agreement = ad <= 15 ? 'zgodne' : ad <= 30 ? 'częściowo zgodne' : 'rozbieżne';
  }
  return out;
}

// ---------- DZIELNICA Z ULICY ----------
// 1) oferty z tą samą ulicą (dzielnica większościowa); 2) położenie ulicy wg RCN i najbliższe ulice, dla których dzielnicę znamy z ofert.
export function inferDistrict(offers, tx, ulica) {
  const k = streetKey(ulica); if (!k) return null;
  const names = new Map(); const label = d => { const n = norm(d); if (!names.has(n)) names.set(n, d); return n; };
  const same = offers.filter(o => o.ulica && o.dzielnica && streetKey(o.ulica) === k);
  if (same.length) {
    const c = new Map(); same.forEach(o => { const n = label(o.dzielnica); c.set(n, (c.get(n) || 0) + 1); });
    const [top, cnt] = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    if (cnt / same.length >= 0.6) return { name: names.get(top), source: 'oferty', n: same.length, share: cnt / same.length };
  }
  if (!tx || !tx.length) return null;
  const mine = tx.filter(t => t.lat != null && streetKey(t.ulica) === k);
  if (mine.length < 2) return null;
  const ctr = [mine.reduce((a, t) => a + t.lat, 0) / mine.length, mine.reduce((a, t) => a + t.lon, 0) / mine.length];
  const pts = new Map();
  for (const t of tx) if (t.lat != null && t.ulica) { const kk = streetKey(t.ulica), p = pts.get(kk) || pts.set(kk, { la: 0, lo: 0, n: 0 }).get(kk); p.la += t.lat; p.lo += t.lon; p.n++; }
  const known = []; const seen = new Set();
  for (const o of offers) if (o.ulica && o.dzielnica) { const kk = streetKey(o.ulica), key = kk + '|' + norm(o.dzielnica), p = pts.get(kk); if (p && p.n >= 2 && !seen.has(key)) { seen.add(key); known.push({ la: p.la / p.n, lo: p.lo / p.n, d: label(o.dzielnica) }); } }
  const near = known.map(x => ({ d: x.d, km: haversine(ctr, [x.la, x.lo]) })).filter(x => x.km <= 2).sort((a, b) => a.km - b.km).slice(0, 5);
  if (!near.length) return null;
  const w = new Map(); near.forEach(x => w.set(x.d, (w.get(x.d) || 0) + 1 / (x.km + 0.2)));
  const tot = [...w.values()].reduce((a, b) => a + b, 0), [top, tw] = [...w.entries()].sort((a, b) => b[1] - a[1])[0];
  if (tw / tot < 0.5) return null;
  return { name: names.get(top), source: 'rcn', n: near.length, share: tw / tot, km: near[0].km };
}
