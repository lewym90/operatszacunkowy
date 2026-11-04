// Ocena materiału porównawczego i porównanie dwóch wycen. Nic tu nie zmienia wyniku wyceny: to wyłącznie opis danych, z których wynik powstał.
import { haversine } from './engine.js';
const pl = (x, d = 0) => x.toFixed(d).replace('.', ',');
const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ageOf = (c, nowTs) => c.ageY != null ? c.ageY : c.data ? (nowTs - Date.parse(c.data)) / (365.25 * 864e5) : null;
const km = d => d < 1 ? 'ok. ' + Math.max(10, Math.round(d * 100) * 10) + ' m' : 'ok. ' + pl(d, 1) + ' km';
export const SHARE = c => c.w;
export const wTotal = comps => comps.reduce((s, c) => s + (c.w || 0), 0);
// Efektywna liczba porównań: 5 równorzędnych transakcji daje 5, a 40 z jedną dominującą daje niewiele więcej niż 1.
export const neff = comps => { const t = wTotal(comps), q = comps.reduce((s, c) => s + (c.w || 0) ** 2, 0); return q ? t * t / q : 0; };

/** Wiersze: { k, label, val, s } gdzie s: 2 dobrze, 1 uwaga, 0 słabo. Progi są orientacyjne i opisane w aplikacji. */
export function qualityOf(res, opts = {}) {
  if (!res || !res.ok || !res.comps || !res.comps.length) return null;
  const nowTs = opts.nowTs || Date.now(), C = res.comps, rows = [], add = (k, label, val, s) => rows.push({ k, label, val, s }), lvl = (x, a, b) => x <= a ? 2 : x <= b ? 1 : 0;
  const ne = neff(C), sale = C[0].kind === 'transakcja';
  add('n', 'Liczba porównań', `${res.n} użytych, równoważnie ok. ${pl(ne, ne < 10 ? 1 : 0)} w pełni podobnych`, ne >= 8 ? 2 : ne >= 4 ? 1 : 0);
  const ages = C.map(c => ageOf(c, nowTs)).filter(a => a != null && a >= 0);
  if (ages.length >= C.length / 2) { const a = med(ages); add('wiek', 'Aktualność', `połowa nie starsza niż ${a < 1 ? pl(a * 12) + ' mies.' : pl(a, 1) + ' roku'}`, lvl(a, 1.5, 3)); }
  if (sale) { const top = C.slice(0, 10), m = top.reduce((s, c) => s + c.w, 0) / top.length; add('pod', 'Podobieństwo', `średnio ${pl(m * 100)}% dla 10 najbliższych`, m >= 0.5 ? 2 : m >= 0.25 ? 1 : 0); }
  const sp = res.pm2.mid ? (res.pm2.hi - res.pm2.lo) / res.pm2.mid : null;
  if (sp != null) add('rozrzut', 'Rozrzut cen', `${pl(sp * 100)}% wartości środkowej`, lvl(sp, 0.2, 0.35));
  if (res.subLL) { const ds = C.filter(c => c.lat != null).map(c => ({ d: haversine(res.subLL, [c.lat, c.lon]), q: (c.lat >= res.subLL[0] ? 2 : 0) + (c.lon >= res.subLL[1] ? 1 : 0) }));
    if (ds.length >= 3) { const m = med(ds.map(x => x.d)), q = new Set(ds.map(x => x.q)).size; add('miejsce', 'Rozmieszczenie', `połowa w promieniu ${km(m)}, ${q} z 4 stron`, m <= 1 ? 2 : m <= 3 ? 1 : 0); } }
  { const dr = +res.dropped || 0, sh = dr / (res.n + dr); add('odst', 'Wartości odstające', dr ? `odrzucono ${dr} (${pl(sh * 100)}%)` : 'nie odrzucono żadnej', lvl(sh, 0.1, 0.25)); }
  if (res.model) add('metody', 'Zgodność metod', `model i porównania różnią się o ${pl(res.model.agreement * 100)}%`, lvl(res.model.agreement, 0.1, 0.2));
  if (res.cross && res.cross.ok && res.cross.agreement) add('kontrola', 'Kontrola ze sprzedażą', res.cross.agreement, res.cross.agreement === 'rozbieżne' ? 0 : res.cross.agreement === 'zgodne' ? 2 : 1);
  const low = rows.filter(r => r.s === 0), mid = rows.filter(r => r.s === 1);
  return { rows, level: low.length >= 2 ? 'słaby' : low.length || mid.length >= 3 ? 'wystarczający' : 'mocny', ne, warn: low.map(r => r.label) };
}

/** Powody, dla których porównanie weszło do wyceny, i jego udział w wyniku. */
export function compWhy(c, res, subj, opts = {}) {
  const nowTs = opts.nowTs || Date.now(), t = wTotal(res.comps), out = [];
  if (c.sameBuilding) out.push('ten sam budynek');
  else if (res.subLL && c.lat != null) out.push(km(haversine(res.subLL, [c.lat, c.lon])) + ' od wycenianej nieruchomości');
  if (subj.m2 && c.m2) { const d = (c.m2 / subj.m2 - 1) * 100; out.push(Math.abs(d) < 1 ? 'taki sam metraż' : `metraż ${d > 0 ? '+' : '−'}${pl(Math.abs(d))}%`); }
  if (c.pokoje != null && subj.pokoje != null) out.push(c.pokoje === subj.pokoje ? 'ta sama liczba pokoi' : `liczba pokoi: ${c.pokoje}`);
  if (c.pietro != null && subj.pietro != null) out.push(c.pietro === subj.pietro ? 'to samo piętro' : `piętro: ${c.pietro === 0 ? 'parter' : c.pietro}`);
  const a = ageOf(c, nowTs); if (a != null && a >= 0) out.push(a < 1 ? `akt sprzed ${Math.max(1, Math.round(a * 12))} mies.` : `akt sprzed ${pl(a, 1)} roku`);
  if (c.pm2raw != null && Math.abs(c.pm2 / c.pm2raw - 1) >= 0.005) out.push(`korekta czasu ${c.pm2 > c.pm2raw ? '+' : '−'}${pl(Math.abs(c.pm2 / c.pm2raw - 1) * 100, 1)}%`);
  if (c.own) out.push('własna umowa (podwójna waga)');
  return { share: t ? c.w / t * 100 : 0, reasons: out };
}

const FIELDS = [['m2', 'metraż'], ['pokoje', 'liczba pokoi'], ['pietro', 'piętro'], ['rok', 'rok budowy'], ['standard', 'standard'], ['rynek', 'rynek'], ['meble', 'wyposażenie'], ['parking', 'parking']];
/** Porównanie starszej wyceny a z nowszą b tej samej nieruchomości (ten sam tryb). Podaje tylko fakty z zapisanych danych. */
export function diffWyceny(a, b) {
  if (!a?.res?.ok || !b?.res?.ok) return null;
  const mid = e => (e.res.total.lo + e.res.total.hi) / 2, ma = mid(a), mb = mid(b), ids = e => new Set(e.res.comps.map(c => c.id)), ia = ids(a), ib = ids(b);
  const nowe = b.res.comps.filter(c => !ia.has(c.id)), ubyly = a.res.comps.filter(c => !ib.has(c.id)).length, zmiany = FIELDS.filter(([k]) => (a.subj[k] ?? null) !== (b.subj[k] ?? null)).map(([, n]) => n);
  const pow = []; if (zmiany.length) pow.push('Zmieniono dane nieruchomości: ' + zmiany.join(', ') + '.');
  if (nowe.length || ubyly) pow.push(`Zmienił się zestaw porównań: ${nowe.length} nowych, ${ubyly} odpadło.`);
  if (a.ver && b.ver && a.ver !== b.ver) pow.push(`Inna wersja aplikacji: ${a.ver} i ${b.ver}, metoda mogła się różnić.`);
  if (a.baza && b.baza && a.baza.rcn !== b.baza.rcn) pow.push(`Baza transakcji: ${a.baza.rcn} i ${b.baza.rcn} rekordów.`);
  if (a.baza && b.baza && a.baza.ofert !== b.baza.ofert) pow.push(`Baza ofert: ${a.baza.ofert} i ${b.baza.ofert}.`);
  if (a.res.window !== b.res.window && a.res.window && b.res.window) pow.push(`Okno czasu: ${a.res.window} i ${b.res.window} lat.`);
  if (a.res.timeAdj != null && b.res.timeAdj != null && Math.abs(a.res.timeAdj - b.res.timeAdj) >= 0.005) pow.push(`Korekta czasu: ${pl(a.res.timeAdj * 100, 1)}% i ${pl(b.res.timeAdj * 100, 1)}% rok do roku.`);
  if (!pow.length) pow.push('Dane i zestaw porównań są takie same.');
  return { ma, mb, delta: mb - ma, pct: ma ? (mb / ma - 1) * 100 : 0, na: a.res.n, nb: b.res.n, conf: [a.res.confidence.level, b.res.confidence.level], lo: [a.res.total.lo, b.res.total.lo], hi: [a.res.total.hi, b.res.total.hi], nowe: nowe.length, ubyly, zmiany, powody: pow, dni: Math.round(((b.ts || 0) - (a.ts || 0)) / 864e5) };
}
