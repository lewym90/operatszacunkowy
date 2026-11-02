// Współrzędne budynku z urzędowego rejestru adresów (Państwowy Rejestr Granic, GUGiK) przez geokoder UUG: https://services.gugik.gov.pl/uug/
// Zasady: wynik tylko dla DOKŁADNEGO numeru budynku; nazwa ulicy w odpowiedzi musi pasować do wpisanej (inaczej odrzucamy, żeby nie wziąć innej ulicy);
// brak adresu = brak współrzędnych (nigdy środek ulicy ani współrzędne z transakcji). Wynik zapamiętywany lokalnie (adres się nie zmienia).
import * as store from './store.js';
export const UUG = 'https://services.gugik.gov.pl/uug/';

// EPSG:2180 (PL-1992) -> WGS84 [szerokość, długość]. x = wschód (easting), y = północ (northing), jak w odpowiedzi UUG.
export function fromEpsg2180(x, y) {
  const a_ = 6378137.0, f = 1 / 298.257222101, k0 = 0.9993, lon0 = 19 * Math.PI / 180, fe = 500000, fn = -5300000;
  const n_ = f / (2 - f), A = a_ / (1 + n_) * (1 + n_ ** 2 / 4 + n_ ** 4 / 64);
  const b = [n_ / 2 - 2 * n_ ** 2 / 3 + 37 * n_ ** 3 / 96 - n_ ** 4 / 360, n_ ** 2 / 48 + n_ ** 3 / 15 - 437 * n_ ** 4 / 1440, 17 * n_ ** 3 / 480 - 37 * n_ ** 4 / 840, 4397 * n_ ** 4 / 161280];
  const xi = (y - fn) / (k0 * A), eta = (x - fe) / (k0 * A);
  let xp = xi, ep = eta; b.forEach((c, i) => { const j = 2 * (i + 1); xp -= c * Math.sin(j * xi) * Math.cosh(j * eta); ep -= c * Math.cos(j * xi) * Math.sinh(j * eta); });
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep)), e2 = f * (2 - f);
  const d = [e2 / 2 + 5 * e2 ** 2 / 24 + e2 ** 3 / 12 + 13 * e2 ** 4 / 360, 7 * e2 ** 2 / 48 + 29 * e2 ** 3 / 240 + 811 * e2 ** 4 / 11520, 7 * e2 ** 3 / 120 + 81 * e2 ** 4 / 1120, 4279 * e2 ** 4 / 161280];
  let lat = chi; d.forEach((c, i) => { lat += c * Math.sin(2 * (i + 1) * chi); });
  const lon = lon0 + Math.atan2(Math.sinh(ep), Math.cos(xp));
  return [lat * 180 / Math.PI, lon * 180 / Math.PI];
}

const fold = s => String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
// tytuły i skróty, które nie identyfikują ulicy (ul., al., ks., gen., płk. itd.)
const TITLES = new Set(['ul', 'ulica', 'al', 'aleja', 'aleje', 'alei', 'pl', 'plac', 'placu', 'os', 'osiedle', 'im', 'imienia', 'ks', 'ksiedza', 'gen', 'generala', 'plk', 'pplk', 'mjr', 'kpt', 'por', 'ppor', 'dr', 'prof', 'bp', 'abp', 'kard', 'sw', 'sw', 'marsz', 'marszalka', 'hm', 'rtm', 'rotmistrza', 'inz', 'mgr']);
export const streetTokens = s => fold(s).split(/[^a-z0-9]+/).filter(t => t && !TITLES.has(t));
// dwie formy tego samego słowa (np. „Krężnickiej” i „Krężnicka”): wspólny początek co najmniej 5 znaków i różnica końcówki do 3 znaków
function sameWord(a, b) {
  if (a === b) return true; let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 5 && i >= Math.min(a.length, b.length) - 3;
}
// Wszystkie słowa wpisane przez użytkownika muszą znaleźć się w oficjalnej nazwie (dodatkowe słowa w nazwie urzędowej, np. imię, nie przeszkadzają).
export function streetMatches(typed, official) {
  const u = streetTokens(typed), o = streetTokens(official); if (!u.length || !o.length) return false;
  return u.every(t => o.some(w => sameWord(t, w)));
}
const normNr = n => fold(n).replace(/\s+/g, '');

const CKEY = 'geokod', DAY = 864e5;
async function cacheGet(k) { const c = await store.get(CKEY, {}); const x = c[k]; return x && Date.now() - x.ts < 180 * DAY ? x.res : null; }
async function cachePut(k, res) { const c = await store.get(CKEY, {}); c[k] = { ts: Date.now(), res }; const keys = Object.keys(c); if (keys.length > 400) keys.sort((a, b) => c[a].ts - c[b].ts).slice(0, keys.length - 400).forEach(x => delete c[x]); await store.set(CKEY, c); }

async function query(miasto, ulica, nr, fetchFn) {
  const r = await fetchFn(UUG + '?' + new URLSearchParams({ request: 'GetAddress', address: `${miasto}, ${ulica} ${nr}`.trim() }));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json(); return Object.values((j && j.results) || {});
}
const pt = x => { const [lat, lon] = fromEpsg2180(+x.x, +x.y); return [+lat.toFixed(6), +lon.toFixed(6)]; };

// Zwraca { ok:true, ll, street, number, code, city, source:'prg' } albo { ok:false, code, message, candidates? }.
export async function geocode({ ulica, nr, miasto = 'Lublin', fetchFn = fetch } = {}) {
  ulica = String(ulica || '').trim(); nr = String(nr || '').trim();
  if (!ulica) return { ok: false, code: 'brak_ulicy', message: 'Podaj ulicę i numer budynku, aby policzyć odległości.' };
  if (!nr) return { ok: false, code: 'brak_numeru', message: 'Podaj numer budynku. Bez numeru nie liczymy odległości, bo położenie byłoby przybliżone.' };
  const key = fold(miasto) + '|' + streetTokens(ulica).join('-') + '|' + normNr(nr);
  let rows;
  try { rows = await query(miasto, ulica, nr, fetchFn); }
  catch (e) { const c = await cacheGet(key); if (c) return { ...c, cached: true }; return { ok: false, code: 'siec', message: 'Nie udało się połączyć z rejestrem adresów (GUGiK). Spróbuj ponownie za chwilę.' }; }
  const good = rows.filter(x => fold(x.city) === fold(miasto) && x.number != null && normNr(x.number) === normNr(nr) && x.x != null && streetMatches(ulica, x.street));
  const streets = new Map(); good.forEach(x => { const id = x.ulic || x.street; if (!streets.has(id)) streets.set(id, x); });
  if (streets.size === 1) {
    const x = [...streets.values()][0], res = { ok: true, ll: pt(x), street: x.street, number: x.number, code: x.code || null, city: x.city, source: 'prg', query: `${ulica} ${nr}` };
    await cachePut(key, res); return res;
  }
  if (streets.size > 1) return { ok: false, code: 'niejednoznaczne', message: 'Pasuje kilka ulic. Wybierz właściwą.', candidates: [...streets.values()].map(x => ({ street: x.street, number: x.number, code: x.code || null, ll: pt(x) })) };
  return { ok: false, code: 'nie_znaleziono', message: `W rejestrze adresów (GUGiK) nie ma budynku „${ulica} ${nr}” w miejscowości ${miasto}. Sprawdź pisownię i numer albo wskaż budynek na mapie.` };
}

// Najbliższe numery tej ulicy, które istnieją w rejestrze (pomoc, gdy wpisany numer nie istnieje). Kilka zapytań, tylko na życzenie.
export async function neighbors({ ulica, nr, miasto = 'Lublin', fetchFn = fetch, span = 4 } = {}) {
  const m = String(nr || '').match(/^(\d+)/); if (!m) return [];
  const base = +m[1], out = [];
  for (let d = 1; d <= span; d++) for (const n of [base - d, base + d]) {
    if (n < 1) continue;
    try { const rows = await query(miasto, ulica, String(n), fetchFn); const x = rows.find(r => fold(r.city) === fold(miasto) && normNr(r.number) === String(n) && streetMatches(ulica, r.street)); if (x) out.push({ number: String(n), street: x.street, ll: pt(x) }); } catch { }
  }
  return out.slice(0, 4);
}

// Podpowiedzi przy literówce („Granta” zamiast „Granata”): ulice o niemal takiej samej nazwie, ale TYLKO te, dla których numer istnieje w rejestrze.
// Użytkownik zawsze widzi oficjalną nazwę i sam ją potwierdza; nic nie jest podstawiane automatycznie.
export function editDistance(a, b) {
  const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
export function nearName(typed, official) {
  const u = streetTokens(typed), o = streetTokens(official); if (!u.length || !o.length) return false;
  return u.every(t => o.some(w => sameWord(t, w) || editDistance(t, w) <= Math.max(1, Math.floor(Math.min(t.length, w.length) / 4))));
}
export async function suggest({ ulica, nr, miasto = 'Lublin', fetchFn = fetch, known = [] } = {}) {
  ulica = String(ulica || '').trim(); nr = String(nr || '').trim(); if (!ulica || !nr) return [];
  const names = new Map();
  try { (await query(miasto, ulica, '', fetchFn)).forEach(x => { if (x.street && nearName(ulica, x.street)) names.set(fold(x.street), x.street); }); } catch { }
  for (const k of known) if (nearName(ulica, k)) names.set(fold(k), k);
  const out = [];
  for (const name of [...names.values()].slice(0, 4)) {
    try { const rows = await query(miasto, name, nr, fetchFn); const x = rows.find(r => fold(r.city) === fold(miasto) && normNr(r.number) === normNr(nr) && streetMatches(name, r.street)); if (x && !out.some(o => fold(o.street) === fold(x.street))) out.push({ street: x.street, number: x.number, code: x.code || null, city: x.city, ll: pt(x), source: 'prg', ok: true }); } catch { }
  }
  return out;
}
