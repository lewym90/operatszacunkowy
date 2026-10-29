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

// ---------- NAJEM (oferty z list) ----------
export function estimateRent(offers, subject) {
  const notes = [], unused = [];
  const pool = offers.filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0);
  const excludedFlag = offers.length - pool.length;
  const build = (sizeTol, dzOnly) => pool.map(o => {
    if (Math.abs(o.m2 - subject.m2) / subject.m2 > sizeTol) return null;
    if (Math.abs(o.pokoje - subject.pokoje) > 1) return null;
    const sameDz = subject.dzielnica && norm(o.dzielnica) === norm(subject.dzielnica);
    if (dzOnly && !sameDz) return null;
    const sameSt = subject.ulica && o.ulica && norm(o.ulica) === norm(subject.ulica);
    const loc = sameSt ? 1 : sameDz ? 0.9 : 0.35;
    const w = loc * sizeScore(o.m2, subject.m2) * roomScore(o.pokoje, subject.pokoje) * floorScore(o.pietro, subject.pietro);
    if (w < 0.12) return null;
    return { id: o.id, kind: 'oferta', pm2: o.cena / o.m2, cena: o.cena, czynsz: o.czynsz, m2: o.m2, pokoje: o.pokoje, pietro: o.pietro,
      opis: [o.ulica || '', o.dzielnica || ''].filter(Boolean).join(', '), tytul: o.tytul, sprzedawca: o.sprzedawca, w, local: sameDz || sameSt, src: 'ogłoszenia (ceny ofertowe)' };
  }).filter(Boolean).sort((a, b) => b.w - a.w).slice(0, 30);
  let sc = build(0.3, true);
  if (sc.length < 8) { sc = build(0.45, false); if (subject.dzielnica) notes.push('Za mało ofert w tej dzielnicy: poszerzono do całego miasta (niższa waga ofert spoza dzielnicy).'); }
  if (excludedFlag) notes.push(`Pominięto ${excludedFlag} ofert oznaczonych jako podejrzane lub wyłączonych ręcznie.`);
  notes.push('To ceny OFERTOWE z ogłoszeń, nie zawartych umów. Faktyczny czynsz może być niższy; brak danych, by to policzyć.');
  if (subject.meble != null) unused.push('wyposażenie/umeblowanie (listy ogłoszeń tego nie zawierają)');
  if (subject.rok != null) unused.push('rok budowy (listy ogłoszeń tego nie zawierają)');
  if (subject.standard) unused.push('standard wykończenia (brak danych porównawczych)');
  const r = summarize(sc, subject, 'Szacunkowy czynsz najmu', { notes, unused });
  if (r.ok) {
    const cz = sc.filter(s => s.czynsz != null).map(s => s.czynsz / s.m2);
    r.adminPm2 = cz.length >= 3 ? median(cz) : null;
    if (r.adminPm2 != null) r.adminTotal = r.adminPm2 * subject.m2;
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
  const build = (years, sizeTol) => base.map(t => {
    if (now - t.rok > years) return null;
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
    const age = Math.max(0, now - t.rok), rec = age <= 1 ? 1 : age === 2 ? 0.85 : age === 3 ? 0.7 : 0.55;
    const ybuild = yearOfBuilding(addrKey(t.ulica, t.nr));
    const w = loc * sizeScore(t.m2, subject.m2) * roomScore(t.izby, subject.pokoje) * floorScore(t.kond, subject.pietro) * rec * yearScore(subject.rok, ybuild);
    if (w < 0.08) return null;
    return { id: t.id, kind: 'transakcja', pm2: t.cena / t.m2, cena: t.cena, m2: t.m2, pokoje: t.izby, pietro: t.kond, rok: t.rok, rynek: t.rynek,
      opis: [t.ulica, t.nr].filter(Boolean).join(' '), lat: t.lat, lon: t.lon, w, local, sameBuilding: !!same, rokBudowy: ybuild, src: 'RCN (ceny z aktów notarialnych)' };
  }).filter(Boolean).sort((a, b) => b.w - a.w).slice(0, 40);
  let sc = build(3, 0.3), win = 3;
  if (sc.length < 10) { sc = build(5, 0.4); win = 5; notes.push('Za mało transakcji z ostatnich 3 lat: poszerzono okno do 5 lat (starsze transakcje mają niższą wagę).'); }
  notes.push(`Okno czasu: ostatnie ${win} lat (rok z numeru aktu). Cena z aktu notarialnego, nie z ogłoszenia.`);
  if (excluded) notes.push(`Odrzucono ${excluded} rekordów RCN, w których cena nie dotyczy jednego pełnego lokalu mieszkalnego (garaże, lokale usługowe, udziały, kilka lokali w jednej transakcji).`);
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
