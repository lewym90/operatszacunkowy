// Karta oględzin: opis standardu na podstawie oględzin. Kategorie i lista elementów według instrukcji badania rynku wtórnego NBP (BaRN), reguły przypisania są ustaleniem AM Nieruchomości.
// Moduł niczego nie zmienia w wycenie: daje wyłącznie opis, który doradca może sam przenieść do formularza.
export const ODP = {
  stan: [['d', 'Dobry<br>stan'], ['n', 'Drobne<br>naprawy'], ['w', 'Do<br>wymiany'], ['ns', 'Nie<br>sprawdzono']],
  wil: [['b', 'Brak<br>śladów'], ['m', 'Miejscowe<br>ślady'], ['r', 'Rozległe<br>ślady'], ['ns', 'Nie<br>sprawdzono']],
  zap: [['b', 'Brak'], ['m', 'Wyczuwalny'], ['ns', 'Nie<br>sprawdzono']],
  tak: [['t', 'Tak'], ['n', 'Nie'], ['ns', 'Nie<br>sprawdzono']],
};
const E = (id, n, o = {}) => ({ id, n, typ: 'stan', ...o });
export function sekcje(kat = 'mieszkanie') {
  const dom = kat === 'dom';
  return [
    ['Stan ogólny', [E('wilgoc', 'Ślady wilgoci lub pleśni', { typ: 'wil', klucz: 1 }), E('pekn', 'Pęknięcia ścian i sufitów'), E('zapach', 'Zapach stęchlizny', { typ: 'zap' })]],
    ['Pokoje', [E('okna', 'Okna', { p: 1 }), E('podlogi', 'Podłogi', { p: 1, mat: ['Panele', 'Deska', 'Płytki', 'Wykładzina'] }), E('sciany', 'Ściany', { mat: ['Farba', 'Tapeta', 'Inne'] }), E('sufity', 'Sufity'), E('drzwi', 'Drzwi wewnętrzne'), E('drzwiw', 'Drzwi wejściowe')]],
    ['Kuchnia', [E('kmeble', 'Meble kuchenne', { lok: 1, nd: 1 }), E('kblat', 'Blat i ściana nad blatem', { lok: 1, nd: 1 }), E('kagd', 'Sprzęt AGD', { lok: 1, nd: 1 }), E('kpodl', 'Podłoga w kuchni', { lok: 1 })]],
    ['Łazienka', [E('glaz', 'Glazura i terakota', { lok: 1 }), E('arm', 'Armatura i ceramika', { lok: 1 }), E('went', 'Wentylacja', { lok: 1 })]],
    ['Instalacje', [E('iwod', 'Instalacja wodno-kanalizacyjna', { p: 1 }), E('igaz', 'Instalacja gazowa', { p: 1, nd: 1 }), E('ico', 'Ogrzewanie', { p: 1 }), E('iel', 'Instalacja elektryczna')]],
    ['Budynek', [dom ? E('dach', 'Dach', { bud: 1 }) : E('klatka', 'Klatka schodowa', { bud: 1, nd: 1 }), E('elew', 'Elewacja', { bud: 1 }), E('mod', 'Po modernizacji: co najmniej dwie zmiany z trzech (instalacje, okna, ocieplenie)', { typ: 'tak', bud: 1 })]],
    ['Wyposażenie i wykonanie', [E('umeb', 'Umeblowanie', { nd: 1 }), E('klasa', 'Materiały i wykonanie dobrej klasy', { typ: 'tak', info: 1 })]],
  ];
}
export const OPIS = { wysoki: 'materiały dobrej klasy, niska eksploatacja', 'przeciętny': 'można się wprowadzić bez większych inwestycji', niski: 'wymaga kompleksowego remontu', deweloperski: 'bez wykończenia i wyposażenia' };
const short = n => n.split(':')[0];
/** o: { ans: {id: odpowiedź lub 'nd'}, dev: bool } */
export function ocen(o, kat = 'mieszkanie') {
  const S = sekcje(kat), all = S.flatMap(([, l]) => l), ans = o.ans || {}, a = id => ans[id] || 'ns', used = all.filter(e => a(e.id) !== 'nd');
  if (o.dev) return { kat: 'deweloperski', opis: OPIS.deweloperski, wstep: [], atuty: [], popraw: [], nie: [], ile: used.length, spr: used.length, why: 'Oznaczono stan deweloperski.' };
  const spr = used.filter(e => a(e.id) !== 'ns'), nie = used.filter(e => a(e.id) === 'ns').map(e => short(e.n));
  const stan = used.filter(e => e.typ === 'stan' && !e.bud), wymP = stan.filter(e => e.p && a(e.id) === 'w'), wymR = stan.filter(e => !e.p && a(e.id) === 'w'), drob = stan.filter(e => a(e.id) === 'n');
  const wil = a('wilgoc'), zap = a('zapach'), pop = [], atuty = [];
  for (const [nazwa, l] of S) { const ok = l.filter(e => a(e.id) === 'd' && e.typ === 'stan').map(e => e.n.toLowerCase().replace(/^instalacja /, '').replace('agd', 'AGD')); if (ok.length) atuty.push(`${nazwa}: ${ok.join(', ')}`); }
  if (wil === 'b') atuty.push('Bez śladów wilgoci i pleśni');
  if (a('mod') === 't') atuty.push('Budynek po modernizacji');
  if (a('klasa') === 't') atuty.push('Materiały i wykonanie dobrej klasy');
  for (const e of used) { const v = a(e.id); if (e.typ !== 'stan') continue; if (v === 'w') pop.push(`${e.n}: do wymiany`); else if (v === 'n') pop.push(`${e.n}: drobne naprawy`); }
  if (wil === 'r') pop.unshift('Ślady wilgoci lub pleśni: rozległe, sprawdzić przyczynę'); else if (wil === 'm') pop.unshift('Ślady wilgoci lub pleśni: miejscowe');
  if (zap === 'm') pop.push('Wyczuwalny zapach stęchlizny');
  const niski = wymP.length > 0 || wil === 'r' || wymR.length >= 5;
  const brakP = used.filter(e => e.p && a(e.id) === 'ns').map(e => short(e.n)); if (wil === 'ns') brakP.push('ślady wilgoci lub pleśni');
  const base = { atuty, popraw: pop, nie, ile: used.length, spr: spr.length, wstep: brakP.map(x => x.toLowerCase()) };
  if (niski) return { ...base, kat: 'niski', opis: OPIS.niski, why: wil === 'r' ? 'Rozległe ślady wilgoci lub pleśni.' : wymP.length ? `Element podstawowy do wymiany: ${wymP.map(e => short(e.n).toLowerCase()).join(', ')}.` : `Do wymiany ${wymR.length} elementów.` };
  if (spr.length * 2 < used.length) return { ...base, kat: null, opis: '', why: `Sprawdzono ${spr.length} z ${used.length} elementów. Do oceny potrzeba co najmniej połowy.` };
  const lok = used.filter(e => e.lok), wys = !drob.length && !wymR.length && wil === 'b' && zap !== 'm' && a('klasa') === 't' && lok.every(e => a(e.id) === 'd');
  if (wys) return { ...base, kat: 'wysoki', opis: OPIS.wysoki, why: 'Elementy w dobrym stanie, bez śladów wilgoci, materiały i wykonanie dobrej klasy.' };
  const n = drob.length + wymR.length, bo = [];
  if (n) bo.push(n === 1 ? '1 element do naprawy lub wymiany' : `elementy do naprawy lub wymiany: ${n}`);
  if (wil === 'm') bo.push('miejscowe ślady wilgoci lub pleśni'); if (zap === 'm') bo.push('wyczuwalny zapach stęchlizny');
  if (a('klasa') !== 't') bo.push('nie potwierdzono materiałów dobrej klasy'); if (lok.some(e => a(e.id) === 'ns')) bo.push('niesprawdzona kuchnia lub łazienka');
  return { ...base, kat: 'przeciętny', opis: OPIS['przeciętny'], why: `Żaden element podstawowy nie wymaga wymiany.${bo.length ? ` Standard wysoki wyklucza: ${bo.join(', ')}.` : ''}` };
}
export const NOTA = 'Ocena z oględzin wykonanych przez doradcę, według kategorii standardu z badania rynku NBP; przypisanie kategorii według karty AM Nieruchomości. Ocena wizualna, nie jest ekspertyzą techniczną.';
