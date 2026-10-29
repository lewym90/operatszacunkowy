// Kategorie nieruchomości: nazwy, jednostka powierzchni i rozsądny przedział ceny za m² (do wykrywania błędów w danych, nie do „poprawiania" cen).
// m2 = powierzchnia, do której odnosimy cenę (mieszkanie/lokal/garaż: użytkowa lokalu; dom i obiekt: użytkowa budynku; działka: powierzchnia działki).
export const KAT = {
  mieszkanie: { n: 'Mieszkanie', m: 'mieszkania', m2: [12, 250], pm2: [2000, 30000] },
  dom: { n: 'Dom', m: 'domy', m2: [30, 1000], pm2: [1500, 40000], plotNote: true },
  dzialka: { n: 'Działka', m: 'działki', m2: [30, 3e6], pm2: [3, 8000] },
  lokal: { n: 'Lokal użytkowy', m: 'lokale użytkowe', m2: [5, 3000], pm2: [500, 40000] },
  obiekt: { n: 'Obiekt / hala', m: 'obiekty i hale', m2: [20, 60000], pm2: [300, 40000] },
  garaz: { n: 'Garaż', m: 'garaże', m2: [8, 120], pm2: [1000, 40000] },
  zabudowana: { n: 'Zabudowana (bez danych budynku)', m: 'zabudowane bez danych budynku', m2: null, pm2: null },
};
export const KAT_ORDER = ['mieszkanie', 'dom', 'dzialka', 'lokal', 'obiekt', 'garaz', 'zabudowana'];
export const POD_TXT = { handlowoUslugowa: 'handlowo-usługowy', handlowoUslugowy: 'handlowo-usługowy', biurowa: 'biurowy', biurowy: 'biurowy', produkcyjna: 'produkcyjny', przemyslowy: 'przemysłowy', inna: 'inny', mieszkalny: 'mieszkalny',
  transportuILacznosci: 'transport i łączność', pozostaleNiemieszkalne: 'inny niemieszkalny', zbiornikiSilosyMagazyny: 'magazyn / silos / zbiornik', gospodarczy: 'gospodarczy', oswiatyISportu: 'oświata i sport', szpitale: 'szpital / opieka',
  budownictwoMieszkanioweJednorodzinne: 'zabudowa jednorodzinna', budownictwoMieszkanioweWielorodzinne: 'zabudowa wielorodzinna', terenZabudowyUslugowej: 'zabudowa usługowa', terenObiektowProdukcyjnychSkladowIMagazynow: 'produkcja, składy, magazyny',
  terenZabudowyZagrodowejGospodarstwRolnych: 'zabudowa zagrodowa', terenRolniczy: 'rolna', terenDrogWewnetrznych: 'drogi wewnętrzne', terenDrogPublicznych: 'drogi publiczne', innyNiewymieniony: 'inne', brakMPZPLubWZ: 'brak planu / WZ' };
export const katLokal = f => f === 'mieszkalna' ? 'mieszkanie' : f === 'garaz' ? 'garaz' : 'lokal';
const stat = (st, k) => st[k] || (st[k] = { rynkowe: 0, nierynkowe: 0 });

// Dane RCN w zwartej postaci: { meta:{...}, cols:[...], rows:[[...]] } (bez danych osobowych stron transakcji).
export const RCN_COLS = ['id', 'tran', 'cena', 'rynek', 'rodzaj', 'rok', 'funkcja', 'izby', 'kond', 'm2', 'm2p', 'ulica', 'nr', 'udzial', 'lat', 'lon', 'sprz', 'data', 'cena_nier', 'cena_lok'];

export function rcnToObjects(pack, stats) {
  const idx = Object.fromEntries(pack.cols.map((c, i) => [c, i]));
  const g = (r, c) => r[idx[c]];
  const cnt = new Map(), seen = new Set(), out = [];
  for (const r of pack.rows) { const t = g(r, 'tran'); cnt.set(t, (cnt.get(t) || 0) + 1); }
  for (const r of pack.rows) {
    // Wolny rynek ORAZ rynek pierwotny zapisany jako „sprzedaż bezprzetargowa" (tak RCN zapisuje większość sprzedaży nowych mieszkań).
    // Odrzucamy: bonifikaty, przetargi, egzekucje, cele publiczne, bezprzetargową na rynku wtórnym (sprzedaż z zasobu publicznego).
    const rodz = g(r, 'rodzaj'), rynekR = g(r, 'rynek'), kat = katLokal(g(r, 'funkcja'));
    if (!(rodz === 'wolnyRynek' || (rodz === 'sprzedazBezprzetargowa' && rynekR === 'rynekPierwotny'))) { if (stats) stat(stats, kat).nierynkowe++; continue; }
    const key = g(r, 'id') + '#' + g(r, 'tran'); if (seen.has(key)) continue; seen.add(key);
    if (stats) stat(stats, kat).rynkowe++;
    const u = g(r, 'udzial');
    // Transakcja z kilkoma lokalami (np. mieszkanie + garaż): gdy RCN podaje OSOBNĄ cenę nieruchomości niższą niż cena całego aktu,
    // używamy jej (cena samego lokalu). Gdy cena nieruchomości = cena całego aktu, nie wiadomo, co obejmuje: rekord zostaje wyłączony.
    const cenaTr = +g(r, 'cena') || 0, cenaN = idx.cena_nier != null ? (+g(r, 'cena_nier') || 0) : 0, multi = cnt.get(g(r, 'tran')) > 1;
    const split = multi && cenaN > 0 && cenaN < cenaTr - 1;
    const ts = idx.data != null && /^\d{4}-\d{2}-\d{2}$/.test(g(r, 'data') || '') ? Date.parse(g(r, 'data')) : null;
    out.push({
      id: key, kat, pod: kat === 'lokal' ? g(r, 'funkcja') : null, cena: split ? cenaN : cenaTr, rozdzielona: split, ts, rynek: g(r, 'rynek') === 'rynekPierwotny' ? 'pierwotny' : g(r, 'rynek') === 'rynekWtorny' ? 'wtorny' : null,
      rok: +g(r, 'rok') || 0, funkcja: g(r, 'funkcja'), izby: +g(r, 'izby') || 0,
      kond: g(r, 'kond') == null || g(r, 'kond') === '' ? null : (+g(r, 'kond') < 0 ? null : +g(r, 'kond')),
      m2: +g(r, 'm2') || 0, ulica: g(r, 'ulica') || '', nr: g(r, 'nr') || '',
      lat: g(r, 'lat') ?? null, lon: g(r, 'lon') ?? null,
      rodzaj: rodz, sprz: idx.sprz != null ? g(r, 'sprz') : null, data: idx.data != null ? g(r, 'data') : null,
      wielolokalowa: multi && !split,
      pelne: u == null || u === '' || /^1(\/1|\.0+)?$/.test(String(u).trim()),
    });
  }
  return out;
}

// ---------- domy, obiekty niemieszkalne i grunty (plik rcn_inne.json z warstw budynki + dzialki) ----------
const TS_MIN = Date.UTC(2005, 0, 1);
const okTs = (s, nowTs) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null; const t = Date.parse(s); return t >= TS_MIN && t <= nowTs + 864e5 ? t : null; };   // błędne daty z RCN (rok 0204, przyszłość) odrzucamy
const isMarket = (rodz, rynek) => rodz === 'wolnyRynek' || (rodz === 'sprzedazBezprzetargowa' && rynek === 'rynekPierwotny');
// RCN podaje powierzchnię gruntu raz w m², raz w hektarach (np. 0,1872). Jednostkę ustalamy po tym, czy cena za m² mieści się w rozsądnym przedziale;
// gdy pasują obie albo żadna, powierzchni nie używamy (zamiast zgadywać).
export function areaM2(v, cena, band) {
  v = +v; if (!(v > 0) || !(cena > 0)) return null;
  const ok = [v, v * 1e4].filter(a => a >= 30 && cena / a >= band[0] && cena / a <= band[1]);
  return ok.length === 1 ? ok[0] : null;
}
const plotM2 = v => { v = +v; return v > 0 && v < 1 ? v * 1e4 : v >= 30 ? v : null; };   // działka przy domu: tylko jednoznaczne wartości (poniżej 1 = hektary, od 30 = m²)

export function inneToObjects(pack, stats, nowTs = Date.now()) {
  const idx = Object.fromEntries(pack.cols.map((c, i) => [c, i])), g = (r, c) => r[idx[c]], out = [];
  for (const r of pack.rows) {
    const nier = g(r, 'nier'), bud = g(r, 'bud_rodz'), rodz = g(r, 'rodzaj'), rynekR = g(r, 'rynek');
    const kat = nier === 'nieruchomoscGruntowaNiezabudowana' ? 'dzialka' : !bud ? 'zabudowana' : bud === 'mieszkalny' ? 'dom' : 'obiekt';
    if (!isMarket(rodz, rynekR)) { if (stats) stat(stats, kat).nierynkowe++; continue; }
    if (stats) stat(stats, kat).rynkowe++;
    const cena = +g(r, 'cena') || 0, wiele = !!g(r, 'wiele'), u = g(r, 'udzial');
    const dz = g(r, 'dz_m2') ?? g(r, 'pow_gr'), przezn = (g(r, 'dz_przezn') || '').split(';')[0] || null;
    let m2 = null, dzm2 = null;
    if (kat === 'dzialka') m2 = areaM2(dz, cena, KAT.dzialka.pm2);
    else { const b = +g(r, 'bud_m2'); m2 = b >= 10 ? b : null; dzm2 = plotM2(dz); }
    out.push({
      id: 'I#' + g(r, 'tran'), kat, pod: kat === 'dzialka' ? przezn : bud || null, cena, ts: okTs(g(r, 'data'), nowTs), rynek: rynekR === 'rynekPierwotny' ? 'pierwotny' : rynekR === 'rynekWtorny' ? 'wtorny' : null,
      rok: +g(r, 'rok') || 0, funkcja: null, izby: 0, kond: null, m2: m2 || 0, dzm2, przezn, sposob: g(r, 'dz_sposob') || null, wieczyste: g(r, 'prawo') === 'uzytkowanieWieczyste',
      ulica: g(r, 'ulica') || '', nr: g(r, 'nr') || '', lat: g(r, 'lat') ?? null, lon: g(r, 'lon') ?? null, rodzaj: rodz, sprz: idx.sprz != null ? g(r, 'sprz') : null,
      data: g(r, 'data') || null, wielolokalowa: wiele, pelne: u == null || u === '' || /^1(\/1|\.0+)?$/.test(String(u).trim()), nBud: g(r, 'n_bud') || 0, nDz: g(r, 'n_dz') || 0,
    });
  }
  return out;
}

// Cena za m² transakcji, jeśli rekord nadaje się do wyceny swojej kategorii (jedna nieruchomość, pełna własność, sensowna powierzchnia i cena); inaczej null.
export function pm2Of(t) {
  const k = KAT[t.kat]; if (!k || !k.m2 || !t.m2 || !(t.cena > 0) || t.wielolokalowa || !t.pelne) return null;
  if (t.m2 < k.m2[0] || t.m2 > k.m2[1]) return null;
  const p = t.cena / t.m2; return p >= k.pm2[0] && p <= k.pm2[1] ? p : null;
}

// Katalog: ile jest czego (wszystkie rynkowe, użyteczne do wyceny, z ostatnich 3 lat, nierynkowe odrzucone)
export function katalog(objs, stats, nowTs = Date.now()) {
  const from = nowTs - 3 * 365.25 * 864e5, o = {};
  for (const k of KAT_ORDER) o[k] = { rynkowe: stats?.[k]?.rynkowe || 0, nierynkowe: stats?.[k]?.nierynkowe || 0, uzyteczne: 0, trzyLata: 0, bezWsp: 0 };
  for (const t of objs) {
    const c = o[t.kat]; if (!c) continue;
    if (t.lat == null) c.bezWsp++;
    if (t.kat !== 'mieszkanie' ? pm2Of(t) != null : (t.izby > 0 && t.m2 >= 12 && t.m2 <= 250 && t.cena > 0 && !t.wielolokalowa && t.pelne)) {
      c.uzyteczne++; const w = t.ts ?? (t.rok ? Date.UTC(t.rok, 6, 1) : null); if (w != null && w >= from) c.trzyLata++;
    }
  }
  return o;
}
