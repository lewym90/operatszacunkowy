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
export const normStreet = norm;
export const addrKey = (ulica, nr) => norm(ulica) + '|' + norm(nr);

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
let _memo = null;
// Uczy się z bazy ofert, o ile droższe są oferty „nowe" i „wysoki standard" przy tym samym metrażu, pokojach i dzielnicy.
// Zwraca przedziały (bootstrap 90%) i test wsteczny (10-krotna walidacja krzyżowa). Premia jest „istotna" tylko gdy
// cały przedział leży po jednej stronie zera i jest dość ofert z daną cechą.
export function learnPremiums(pool) {
  const key = pool.length + '|' + (pool[0]?.id) + '|' + (pool[pool.length - 1]?.id);
  if (_memo && _memo.key === key) return _memo.val;
  const out = { n: pool.length, ok: false };
  if (pool.length >= 60) {
    const cnt = {}; pool.forEach(o => { const d = nz(o.dzielnica); cnt[d] = (cnt[d] || 0) + 1; });
    const dzs = Object.keys(cnt).filter(d => d && cnt[d] >= 8).sort();
    const feat = o => { const t = segmentTags(o.tytul), d = nz(o.dzielnica);
      return [1, Math.log(o.m2 / 40), o.pokoje - 2, ...dzs.map(x => x === d ? 1 : 0), t.nowe, t.wysoki]; };
    const X = pool.map(feat), y = pool.map(o => Math.log(o.cena / o.m2)), n = pool.length, d = X[0].length;
    let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const W = []; for (let it = 0; it < 150; it++) { const ix = Array.from({ length: n }, () => Math.floor(rnd() * n)); W.push(ridge(ix.map(i => X[i]), ix.map(i => y[i]), 3)); }
    const mk = (j, name) => {
      const bs = W.map(w => w[j]), lo = pctile(bs, 0.05), hi = pctile(bs, 0.95), mid = pctile(bs, 0.5);
      const nTag = X.filter(r => r[j] === 1).length;
      const sig = nTag >= 15 && n - nTag >= 15 && (lo > 0 || hi < 0);
      return { name, nTag, beta: mid, lo, hi, pct: Math.exp(mid) - 1, pctLo: Math.exp(lo) - 1, pctHi: Math.exp(hi) - 1, sig,
        used: sig ? (lo > 0 ? lo : hi) : 0 };           // stosujemy koniec przedziału NAJBLIŻSZY zera (ostrożnie)
    };
    out.nowe = mk(d - 2, 'nowe'); out.wysoki = mk(d - 1, 'wysoki');
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

// ---------- NAJEM (oferty z list) ----------
export function estimateRent(offers, subject) {
  const notes = [], unused = [], ask = [];
  const pool = offers.filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0);
  const excludedFlag = offers.length - pool.length;
  // cechy podmiotu: znane (0/1) albo nieznane (null)
  const sNowe = subject.rok == null ? null : subject.rok >= 2018 ? 1 : 0;
  const sWys = subject.standard ? (subject.standard === 'wysoki' ? 1 : 0) : null;
  const L = learnPremiums(pool);
  const use = { nowe: L.ok && L.nowe.sig && sNowe != null, wysoki: L.ok && L.wysoki.sig && sWys != null };
  const build = (sizeTol, dzOnly) => pool.map(o => {
    if (Math.abs(o.m2 - subject.m2) / subject.m2 > sizeTol) return null;
    if (Math.abs(o.pokoje - subject.pokoje) > 1) return null;
    const sameDz = subject.dzielnica && norm(o.dzielnica) === norm(subject.dzielnica);
    if (dzOnly && !sameDz) return null;
    const sameSt = subject.ulica && o.ulica && norm(o.ulica) === norm(subject.ulica);
    const loc = sameSt ? 1 : sameDz ? 0.9 : 0.35;
    let w = loc * sizeScore(o.m2, subject.m2) * roomScore(o.pokoje, subject.pokoje) * floorScore(o.pietro, subject.pietro);
    const t = segmentTags(o.tytul); let adj = 0, mism = false;
    for (const k of ['nowe', 'wysoki']) {
      const sv = k === 'nowe' ? sNowe : sWys; if (sv == null) continue;
      if (t[k] !== sv) { mism = true; if (use[k]) adj += (sv - t[k]) * L[k].used; }
    }
    if (mism) w *= (use.nowe || use.wysoki) && Math.abs(adj) > 0 ? 0.85 : 0.6;   // inny segment: niższa waga
    if (w < 0.12) return null;
    const pm2raw = o.cena / o.m2, pm2 = pm2raw * Math.exp(adj);
    return { id: o.id, kind: 'oferta', pm2, pm2raw, adjPct: Math.exp(adj) - 1, tags: t, cena: o.cena, czynsz: o.czynsz, m2: o.m2, pokoje: o.pokoje, pietro: o.pietro,
      opis: [o.ulica || '', o.dzielnica || ''].filter(Boolean).join(', '), tytul: o.tytul, sprzedawca: o.sprzedawca, w, local: sameDz || sameSt, src: 'ogłoszenia (ceny ofertowe)' };
  }).filter(Boolean).sort((a, b) => b.w - a.w).slice(0, 30);
  let sc = build(0.3, true);
  if (sc.length < 8) { sc = build(0.45, false); if (subject.dzielnica) notes.push('Za mało ofert w tej dzielnicy: poszerzono do całego miasta (niższa waga ofert spoza dzielnicy).'); }
  if (excludedFlag) notes.push(`Pominięto ${excludedFlag} ofert oznaczonych jako podejrzane lub wyłączonych ręcznie.`);
  notes.push('To ceny OFERTOWE z ogłoszeń, nie zawartych umów. Faktyczny czynsz może być niższy; brak danych, by to policzyć.');
  const pc = p => `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(0)}%`;
  if (L.ok) {
    for (const [k, lbl, sv] of [['nowe', 'nowe budownictwo', sNowe], ['wysoki', 'wysoki standard', sWys]]) {
      const P = L[k], rng = `${pc(P.pct)} (przedział ${pc(P.pctLo)} do ${pc(P.pctHi)}, ${P.nTag} ofert z tą cechą w tytule)`;
      if (use[k]) notes.push(`Korekta segmentu „${lbl}": zmierzona różnica w bazie ${rng}. Do korekty użyto ostrożniejszego końca przedziału (${pc(Math.exp(P.used) - 1)}).${k === 'nowe' ? ' Rok budowy od 2018 traktowany jako nowe budownictwo.' : ''}`);
      else if (!P.sig) unused.push(`${lbl}: zbyt mało ofert z tą cechą, by uczciwie zmierzyć różnicę (${P.nTag} ofert)`);
      else if (sv == null) ask.push({ k, text: `${k === 'nowe' ? 'Rok budowy' : 'Standard'}: w tej bazie ${lbl} oznacza czynsz za m² o około ${pc(P.pct)} (przedział ${pc(P.pctLo)} do ${pc(P.pctHi)}). Podaj ${k === 'nowe' ? 'rok budowy' : 'standard'}, żeby to uwzględnić.` });
    }
    notes.push('Segmenty są rozpoznawane ze słów w tytułach ogłoszeń. Oferta bez takich słów też mogła być nowa lub luksusowa, więc zmierzone premie są raczej ostrożnym minimum.');
  } else unused.push('segmenty (nowe / wysoki standard): za mało ofert w bazie, by zmierzyć różnice (minimum 60)');
  if (subject.meble != null) unused.push('wyposażenie/umeblowanie (listy ogłoszeń tego nie zawierają)');
  const r = summarize(sc, subject, 'Szacunkowy czynsz najmu', { notes, unused });
  if (r.ok) {
    const cz = sc.filter(s => s.czynsz != null).map(s => s.czynsz / s.m2);
    r.adminPm2 = cz.length >= 3 ? median(cz) : null;
    if (r.adminPm2 != null) r.adminTotal = r.adminPm2 * subject.m2;
    r.ask = ask; r.premiums = L.ok ? { nowe: L.nowe, wysoki: L.wysoki } : null; r.adjusted = use.nowe || use.wysoki;
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
      const st = tx.filter(t => t.lat != null && norm(t.ulica) === norm(subject.ulica));
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
    } else if (subject.ulica) { same = norm(t.ulica) === norm(subject.ulica); loc = same ? 1 : 0.3; local = same; }
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

const avgLL = a => [a.reduce((s, x) => s + x.lat, 0) / a.length, a.reduce((s, x) => s + x.lon, 0) / a.length];

// Orientacyjna rentowność brutto: roczny najem / wartość. Tylko przy obu wynikach.
export function grossYield(sale, rent) {
  if (!sale?.ok || !rent?.ok) return null;
  const f = (r, s) => (r * 12) / s * 100;
  return { lo: f(rent.total.lo, sale.total.hi), mid: f(rent.total.mid, sale.total.mid), hi: f(rent.total.hi, sale.total.lo) };
}

// ---------- KONTROLA CZYNSZU ZE SPRZEDAŻĄ ----------
// Nie zakładamy stałej rentowności. Dla ulic, na których mamy i oferty najmu, i transakcje sprzedaży, MIERZYMY stosunek
// czynsz/wartość (za m²) oraz to, jak dobrze cena kupna tłumaczy czynsz między ulicami. Potem: czynsz ≈ szacunkowa wartość × zmierzony stosunek.
// To druga, niezależna ocena do porównania z ofertami najmu. Kontrola działa tylko, gdy podano ulicę i jest dość par ulic.
export function crossCheckRent(offers, tx, subject, rentRes, opts = {}) {
  const nowTs = opts.nowTs || Date.now(), nowY = new Date(nowTs).getFullYear();
  if (!subject.ulica) return { ok: false, reason: 'Podaj ulicę, żeby porównać czynsz z cenami sprzedaży w tej okolicy.' };
  if (!tx || !tx.length) return { ok: false, reason: 'Brak danych RCN (zakładka Dane).' };
  const age = t => (t.ts && t.ts <= nowTs) ? (nowTs - t.ts) / 31557600000 : Math.max(0, nowY - t.rok);
  const sales = tx.filter(t => t.funkcja === 'mieszkalna' && t.izby > 0 && t.m2 >= 12 && t.m2 <= 250 && t.cena > 0 && !t.wielolokalowa && t.pelne && age(t) <= 3 && t.ulica);
  const rents = offers.filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0 && o.ulica);
  const S = new Map(), R = new Map();
  for (const t of sales) { const k = norm(t.ulica); (S.get(k) || S.set(k, []).get(k)).push(t.cena / t.m2); }
  for (const o of rents) { const k = norm(o.ulica); (R.get(k) || R.set(k, []).get(k)).push(o.cena / o.m2); }
  const pairs = [];
  for (const [k, rs] of R) { const ss = S.get(k); if (ss && ss.length >= 3 && rs.length >= 2) pairs.push({ street: k, rent: median(rs), sale: median(ss), nr: rs.length, ns: ss.length }); }
  const out = { ok: false, pairs: pairs.length };
  if (pairs.length < 8) { out.reason = `Za mało ulic, na których mamy jednocześnie oferty najmu i transakcje (${pairs.length}, minimum 8), żeby zmierzyć związek czynszu z ceną kupna. Dodawaj oferty najmu z ulicą.`; return out; }
  const ratios = pairs.map(p => p.rent / p.sale).sort((a, b) => a - b);
  const q = x => ratios[Math.min(ratios.length - 1, Math.max(0, Math.round(x * (ratios.length - 1))))];
  const xs = pairs.map(p => Math.log(p.sale)), ys = pairs.map(p => Math.log(p.rent)), n = pairs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), syy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const slope = sxx > 0 ? sxy / sxx : null, r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : null;
  const sale = estimateSale(tx, { tryb: 'sprzedaz', ulica: subject.ulica, nr: subject.nr || '', m2: subject.m2, pokoje: subject.pokoje, pietro: subject.pietro, rok: subject.rok || null, rynek: null }, { nowTs });
  Object.assign(out, { pairs: n, ratio: { lo: q(0.25), mid: q(0.5), hi: q(0.75) }, grossYieldPct: q(0.5) * 12 * 100, slope, r2 });
  if (!sale.ok) { out.reason = 'Brak transakcji w pobliżu tego adresu, żeby oszacować wartość (' + sale.reason + ')'; return out; }
  out.sale = sale; out.ok = true;
  out.implied = { lo: sale.total.lo * out.ratio.lo, mid: sale.total.mid * out.ratio.mid, hi: sale.total.hi * out.ratio.hi };
  if (rentRes && rentRes.ok) {
    const a = rentRes.total, b = out.implied;
    out.overlap = Math.max(a.lo, b.lo) <= Math.min(a.hi, b.hi);
    out.diffPct = (b.mid - a.mid) / a.mid * 100;
  }
  return out;
}
