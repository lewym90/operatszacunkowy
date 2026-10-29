// Parser list ogłoszeń Otodom (tekst z PDF "Zapisz jako PDF" lub wklejony).
// Czysta funkcja: linie tekstu -> rekordy. Działa w przeglądarce i w Node.
// Nie zgaduje: pole, którego nie ma na liście, zostaje null.
const PRICE = /^(\d[\d\s]*)\s?zł(?:\s*\+\s*czynsz:\s*(\d[\d\s]*)\s?zł\/m(?:iesiąc|sc))?$/i;
const DETAIL = /^(\d+)\s+pok(?:oje|ój|oi|\.)?\s+([\d.,]+)\s*m²(?:\s+(parter|\d+\s*piętro|\d+\s*pietro))?/i;
const LOC = /,\s*lubelskie\s*$/i;
const num = s => parseInt(s.replace(/\s/g, ''), 10);

export function parseLines(rawLines) {
  const L = rawLines.map(s => s.replace(/ /g, ' ').trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < L.length; i++) {
    if (!LOC.test(L[i]) || PRICE.test(L[i])) continue;
    // linia ze szczegółami zaraz po lokalizacji (pomija bloki deweloperskie "od 34 zł/m²")
    let d = null;
    for (let k = i + 1; k <= i + 3 && k < L.length; k++) { d = L[k].match(DETAIL); if (d) break; }
    if (!d) continue;
    // cena: najbliższa linia z ceną wstecz (max 5 linii), tytuł: linia tuż przed lokalizacją
    let price = null, p = -1;
    for (let k = i - 1; k >= Math.max(0, i - 5); k--) { const m = L[k].match(PRICE); if (m) { price = m; p = k; break; } }
    if (!price) continue;
    const title = L[i - 1] && !PRICE.test(L[i - 1]) ? L[i - 1] : null;
    const parts = L[i].split(',').map(s => s.trim());
    const street = /^(ul\.|al\.|pl\.|os\.)/i.test(parts[0]) ? parts[0] : null;
    const district = parts.length >= 4 ? parts[parts.length - 3] : (parts.length === 3 && !street ? parts[0] : null);
    const city = parts[parts.length - 2];
    // sprzedawca: do następnej oferty
    let seller = null;
    for (let k = i + 1; k < Math.min(L.length, i + 9); k++) {
      if (PRICE.test(L[k])) break;
      if (/^Oferta prywatna/i.test(L[k])) { seller = 'prywatna'; break; }
      if (/^Biuro nieruchomości/i.test(L[k])) { seller = 'biuro'; break; }
    }
    const fl = d[3] ? (/parter/i.test(d[3]) ? 0 : parseInt(d[3], 10)) : null;
    out.push({
      cena: num(price[1]), czynsz: price[2] ? num(price[2]) : null,
      pokoje: +d[1], m2: parseFloat(d[2].replace(',', '.')), pietro: fl,
      miasto: city, dzielnica: district, ulica: street, tytul: title, sprzedawca: seller,
    });
  }
  // deduplikacja nakładek "Podbite/Promowane" i powtórzeń
  const seen = new Set();
  return out.filter(r => {
    const key = [r.cena, r.czynsz, r.pokoje, r.m2, r.pietro, r.ulica, r.dzielnica, r.miasto].join('|');
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}

// Kontrole sensowności: nie poprawiają danych, tylko flagują podejrzane rekordy.
export function flags(r) {
  const f = [];
  if (r.m2 < 12 || r.m2 > 250) f.push('metraż_nietypowy');
  const pm2 = r.cena / r.m2;
  if (pm2 < 20 || pm2 > 150) f.push('cena_za_m2_nietypowa');
  if (/pok[oó]j (do|w)|pokoje do wynaj|współlokator|miejsce w pokoju|lokal(u)? (biurow|użytk)|biur(o|owy)/i.test(r.tytul || '')) f.push('to_nie_mieszkanie_całe');
  if (r.czynsz != null && r.czynsz > r.cena) f.push('czynsz_wyższy_niż_najem');
  if (r.pokoje > 1 && r.m2 / r.pokoje < 9) f.push('metraż_na_pokój_za_mały');
  return f;
}
