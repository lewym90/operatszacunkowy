// Dane RCN w zwartej postaci: { meta:{...}, cols:[...], rows:[[...]] } (bez danych osobowych stron transakcji).
export const RCN_COLS = ['id', 'tran', 'cena', 'rynek', 'rodzaj', 'rok', 'funkcja', 'izby', 'kond', 'm2', 'm2p', 'ulica', 'nr', 'udzial', 'lat', 'lon', 'sprz', 'data', 'cena_nier', 'cena_lok'];

export function rcnToObjects(pack) {
  const idx = Object.fromEntries(pack.cols.map((c, i) => [c, i]));
  const g = (r, c) => r[idx[c]];
  const cnt = new Map(), seen = new Set(), out = [];
  for (const r of pack.rows) { const t = g(r, 'tran'); cnt.set(t, (cnt.get(t) || 0) + 1); }
  for (const r of pack.rows) {
    // Wolny rynek ORAZ rynek pierwotny zapisany jako „sprzedaż bezprzetargowa" (tak RCN zapisuje większość sprzedaży nowych mieszkań).
    // Odrzucamy: bonifikaty, przetargi, egzekucje, cele publiczne, bezprzetargową na rynku wtórnym (sprzedaż z zasobu publicznego).
    const rodz = g(r, 'rodzaj'), rynekR = g(r, 'rynek');
    if (!(rodz === 'wolnyRynek' || (rodz === 'sprzedazBezprzetargowa' && rynekR === 'rynekPierwotny'))) continue;
    const key = g(r, 'id') + '#' + g(r, 'tran'); if (seen.has(key)) continue; seen.add(key);
    const u = g(r, 'udzial');
    // Transakcja z kilkoma lokalami (np. mieszkanie + garaż): gdy RCN podaje OSOBNĄ cenę nieruchomości niższą niż cena całego aktu,
    // używamy jej (cena samego lokalu). Gdy cena nieruchomości = cena całego aktu, nie wiadomo, co obejmuje: rekord zostaje wyłączony.
    const cenaTr = +g(r, 'cena') || 0, cenaN = idx.cena_nier != null ? (+g(r, 'cena_nier') || 0) : 0, multi = cnt.get(g(r, 'tran')) > 1;
    const split = multi && cenaN > 0 && cenaN < cenaTr - 1;
    const ts = idx.data != null && /^\d{4}-\d{2}-\d{2}$/.test(g(r, 'data') || '') ? Date.parse(g(r, 'data')) : null;
    out.push({
      id: key, cena: split ? cenaN : cenaTr, rozdzielona: split, ts, rynek: g(r, 'rynek') === 'rynekPierwotny' ? 'pierwotny' : g(r, 'rynek') === 'rynekWtorny' ? 'wtorny' : null,
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
