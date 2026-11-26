// Obszary pracy aplikacji. Każdy obszar ma osobne dane RCN, otoczenie OSM, oferty, rok budowy z adresów i mapę.
// Lublin działa dokładnie jak dotąd (te same klucze w pamięci urządzenia i te same pliki z serwera).
// Kraków i okolice: pliki z katalogu krakow/ obok plików Lublina na tym samym serwerze (server/obszar_zbuduj.sh krakow).
export const OBSZARY = {
  lublin: {
    k: 'lublin', nazwa: 'Lublin', pelna: 'Lublin i okolice', miasto: 'Lublin', centrum: [51.2465, 22.5684], zoom: 12,
    dir: '', pliki: { rcn: 'rcn_lublin.json', inne: 'rcn_inne.json', meta: 'rcn_meta.json', osm: 'osm_lublin.json' },
    miasta: ['lublin'], opis: 'miasto Lublin i okolice',
  },
  krakow: {
    k: 'krakow', nazwa: 'Kraków', pelna: 'Kraków i okolice', miasto: 'Kraków', centrum: [50.0614, 19.9372], zoom: 11,
    dir: 'krakow/', pliki: { rcn: 'rcn_lokale.json', inne: 'rcn_inne.json', meta: 'rcn_meta.json', osm: 'osm.json' },
    miasta: ['kraków', 'krakow'], opis: 'Kraków i 9 powiatów wokół (krakowski, wielicki, myślenicki, bocheński, wadowicki, chrzanowski, miechowski, proszowicki, olkuski)',
  },
};
export const LISTA = ['lublin', 'krakow'];
export const get = k => OBSZARY[k] || OBSZARY.lublin;

// Klucz w pamięci urządzenia: Lublin bez przedrostka (zgodność z danymi, które już są na urządzeniach), inne obszary z przedrostkiem.
export const klucz = (k, nazwa) => (!k || k === 'lublin') ? nazwa : `${k}:${nazwa}`;

// Adresy plików obszaru liczone od adresu pliku Lublina wpisanego w Ustawieniach/Danych (ten sam serwer, ten sam katalog bazowy).
export function url(k, plik, rcnUrlLublin) {
  if (!rcnUrlLublin) return '';
  if ((!k || k === 'lublin') && plik === 'rcn') return rcnUrlLublin;   // Lublin: dokładnie adres z Ustawień, jak dotąd
  const base = rcnUrlLublin.replace(/[^/]*$/, ''), O = get(k);
  return base + O.dir + O.pliki[plik];
}

// Czy oferta należy do obszaru (po polu miasto z ogłoszenia). Puste miasto = stare oferty Lublina (sprzed zbierania z województwa).
export function ofertaW(k, o) {
  const m = String(o.miasto || '').trim().toLowerCase();
  if (k === 'lublin' || !k) return !m || m === 'lublin';
  return !!m && get(k).miasta.includes(m);
}
