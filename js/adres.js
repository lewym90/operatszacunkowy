import { KAT_ORDER } from './rcn.js';

/* Dane nieruchomości przekazane w adresie, np. z Mojej Agencji: #/wycena?tryb=sprzedaz&kat=mieszkanie&ulica=Lipowa&m2=52.5
   Formularz zaczyna od czysta; nieznane i błędne wartości są pomijane. Tylko dane nieruchomości (bez osób). */
export function daneZAdresu(hash) {
  const m = /^#\/?wycena\?(.*)$/.exec(hash || ''); if (!m) return null;
  const q = new URLSearchParams(m[1]), t = k => (q.get(k) || '').trim().slice(0, 80), liczba = k => { const v = t(k).replace(',', '.'); return /^\d{1,6}(\.\d{1,2})?$/.test(v) && +v > 0 ? v : ''; };
  const cal = (k, od, doo) => { const v = t(k); return /^-?\d+$/.test(v) && +v >= od && +v <= doo ? +v : null; };
  const f = { kat: KAT_ORDER.includes(t('kat')) ? t('kat') : 'mieszkanie', pod: '', ulica: t('ulica'), nr: t('nr').slice(0, 12), dzielnica: t('dzielnica'), m2: liczba('m2'), dzm2: liczba('dzm2'), pietro: cal('pietro', 0, 30), rok: String(cal('rok', 1800, 2100) ?? '') };
  if (['sprzedaz', 'najem'].includes(t('tryb'))) f.tryb = t('tryb');
  const pk = cal('pokoje', 1, 8); if (pk != null) f.pokoje = pk;
  // numer oferty w programie, z którego otwarto wycenę (raport PDF można do niej dołączyć)
  const of = t('oferta'); f.oferta = /^\d{1,9}$/.test(of) ? +of : null;
  return f;
}
