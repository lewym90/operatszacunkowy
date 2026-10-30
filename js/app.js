import * as store from './store.js';
import { estimateRent, estimateSale, estimateSaleKat, parkingExtra, crossCheckRent, inferDistrict, ATTRS, learnPremiums, grossYield, addrKey, migrateAddrKey, normStreet, normDz, YEAR_BANDS, yearBand } from './engine.js';
import { rcnToObjects, inneToObjects, katalog, KAT, KAT_ORDER, POD_TXT } from './rcn.js';
import { linesFromPdf, offersFromLines, offerKey } from './pdfimport.js';
import { flags as offerFlags } from './parseOtodom.js';
import { esc, $, $$, fmt, roundTo, toast, openSheet, closeSheet, countUp, saveFile, ICON, suggest } from './ui.js';
import { buildReport, makePdf } from './report.js';
import { createSync, DEFAULT_URL, encodeCode, decodeCode } from './sync.js';
import { investCalc, sensitivity, TAX } from './invest.js';
import { exposure, trendSeries, yieldByDistrict, districtAssigner, lineChart, barChart, bindCharts } from './rynek.js';
import { createMap, usableSales, buildGrid, streetCenters, placeOffers, makeClasses, median, popupSale, popupOffer } from './mapa.js';

const VERSION = '1.16.0';
const S = { wlasne: [], teczki: [], foto: {},
  offers: [], rcn: null, rcnInne: null, tx: [], inne: [], pool: [], stats: {}, streets: [], budynki: {}, wyceny: [], last: {},
  ust: { biuro: 'AM Nieruchomości', haslo: 'Sprawdzone do końca.', agent: '', tel: '', email: '', www: '', rcnUrl: '' },
  form: { tryb: 'sprzedaz', kat: 'mieszkanie', pod: '', dzm2: '', ulica: '', nr: '', dzielnica: '', m2: '', pokoje: 2, pietro: null, rok: '', rynek: '', standard: '', meble: '', zapamietaj: true, ud: [] },
};
// Własne umowy najmu biura -> ta sama postać co oferty, z jawnymi cechami (nie ze słów w tytule) i dużą wagą
const ownToOffer = w => ({ id: 'w' + w.id, own: true, ulica: w.ulica, dzielnica: w.dzielnica, miasto: 'Lublin', m2: w.m2, pokoje: w.pokoje, pietro: w.pietro, cena: w.cena, czynsz: w.czynsz || null, meble: w.meble,
  tags: { nowe: w.rok && w.rok >= 2018 ? 1 : 0, wysoki: w.standard === 'wysoki' ? 1 : 0 }, tytul: 'własna umowa', wlaczone: true, flagi: [] });
const allOffers = () => S.offers.concat((S.wlasne || []).map(ownToOffer));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().getFullYear();
const LV = { 'niska': 'Niska', 'średnia': 'Średnia', 'wysoka': 'Wysoka' };
const LVTXT = { 'niska': 'Traktuj wynik wyłącznie orientacyjnie: danych jest mało lub są mocno rozrzucone.', 'średnia': 'Dobra podstawa do rozmowy z klientem. Zweryfikuj porównania przed podaniem liczby.', 'wysoka': 'Dużo zbliżonych porównań o podobnej cenie. To nadal szacunek, nie wycena.' };

// Tryb awaryjny: jeśli poprzednie uruchomienie nie dotrwało do końca (przeglądarka padła przy wczytywaniu danych lub mapy), duże dane RCN nie wczytują się same.
// Znacznik zdejmujemy po 20 s pracy albo gdy aplikacja trafi do tła/zostanie zamknięta normalnie.
const BOOT = 'am-boot';
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } }, del: k => { try { localStorage.removeItem(k); } catch { } } };
S.safe = ls.get(BOOT) === '1';
const armBoot = () => { ls.set(BOOT, '1'); setTimeout(() => ls.del(BOOT), 20000); };
armBoot();
addEventListener('pagehide', () => ls.del(BOOT)); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ls.del(BOOT); });
const safeBanner = () => S.safe ? '<div class="banner warn"><span>!</span><span>Poprzednie uruchomienie aplikacji nie zakończyło się poprawnie, więc dane RCN (transakcje) nie zostały wczytane. <button class="chip" data-act="safeoff" style="margin-top:8px">Wczytaj dane RCN</button></span></div>' : '';
async function safeOff() { S.safe = false; armBoot(); S.rcn = await store.get('rcn', null); S.rcnInne = await store.get('rcnInne', null); setTx(); render(); checkRcn(); }
document.addEventListener('click', e => { if (e.target.closest('[data-act="safeoff"]')) safeOff(); });
async function load() {
  S.wlasne = await store.get('wlasne', []); S.offers = await store.get('offers', []); S.budynki = await store.get('budynki', {}); S.wyceny = await store.get('wyceny', []); S.teczki = await store.get('teczki', []); S.foto = await store.get('foto', {});
  { const m = {}; let ch = false; for (const [k, v] of Object.entries(S.budynki)) { const nk = migrateAddrKey(k); if (nk !== k) ch = true; m[nk] = v; } if (ch) { S.budynki = m; store.set('budynki', m); } }
  S.ust = { ...S.ust, ...(await store.get('ust', {})) }; S.rcn = S.safe ? null : await store.get('rcn', null); S.rcnInne = S.safe ? null : await store.get('rcnInne', null); setTx();
}
function setTx() {
  const st = {}; S.tx = S.rcn ? rcnToObjects(S.rcn, st) : [];
  S.inne = S.rcnInne ? inneToObjects(S.rcnInne, st) : []; S.stats = st; S.pool = S.tx.concat(S.inne);
  S.streets = [...new Set(S.pool.map(t => t.ulica).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
}
const DEF_UST = JSON.stringify(S.ust);
const raw = {
  offers: () => store.set('offers', S.offers), wlasne: () => store.set('wlasne', S.wlasne), budynki: () => store.set('budynki', S.budynki), wyceny: () => store.set('wyceny', S.wyceny), teczki: () => store.set('teczki', S.teczki), ust: () => store.set('ust', S.ust),
};
// każdy zapis lokalny uruchamia (z opóźnieniem) synchronizację z serwerem, jeśli urządzenie jest połączone
const save = Object.fromEntries(Object.entries(raw).map(([k, f]) => [k, () => { const r = f(); sync.schedule(); return r; }]));

/* ---------- synchronizacja z serwerem ---------- */
const byId = (list, id = x => x.id) => new Map(list.map(x => [id(x), x]));
const adapters = {
  offers: { read: () => S.offers.map(o => [o.id, o]), apply: (u, d) => { const m = byId(S.offers); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); S.offers = [...m.values()]; raw.offers(); } },
  wlasne: { read: () => S.wlasne.map(w => [w.id, w]), apply: (u, d) => { const m = byId(S.wlasne); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); S.wlasne = [...m.values()]; raw.wlasne(); } },
  wyceny: { read: () => S.wyceny.filter(e => e.id).map(e => [e.id, e]), apply: (u, d) => { const m = byId(S.wyceny); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); S.wyceny = [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)); raw.wyceny(); } },
  teczki: { read: () => S.teczki.map(t => [t.id, t]), apply: (u, d) => { const m = byId(S.teczki); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); S.teczki = [...m.values()]; raw.teczki(); } },
  budynki: { read: () => Object.entries(S.budynki), apply: (u, d) => { u.forEach(([k, v]) => { S.budynki[k] = v; }); d.forEach(k => { delete S.budynki[k]; }); raw.budynki(); } },
  ust: { read: () => [['ust', S.ust]], apply: u => { u.forEach(([, v]) => { S.ust = { ...S.ust, ...v }; }); raw.ust(); }, pristine: (id, d) => JSON.stringify(d) === DEF_UST },
};
let syncOn = false;
const sync = createSync({ kv: store, adapters,
  hooks: {
    onStatus: st => { syncOn = st.state !== 'off'; paintSync(st); },
    onRemote: changed => { if (changed) checkRcn(); if (changed && ['dane', 'historia', 'oferty', 'teczka'].includes(location.hash.replace(/^#\/?/, '').split('/')[0])) render(); },
  } });
const agoTxt = ts => { if (!ts) return ''; const s = Math.round((Date.now() - ts) / 1000); return s < 20 ? 'przed chwilą' : s < 3600 ? Math.round(s / 60) + ' min temu' : new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); };
function paintSync(st) {
  const el = document.getElementById('syncst'); if (!el) return;
  const m = { syncing: 'Synchronizuję…', ok: 'Zsynchronizowano ' + agoTxt(st.last), offline: 'Brak połączenia z serwerem. Spróbuję ponownie.', error: st.error || 'Błąd synchronizacji', idle: 'Połączono', off: '' };
  el.textContent = m[st.state] || ''; el.dataset.s = st.state;
}

/* ---------- router ---------- */
const TABS = [['wycena', 'Wycena'], ['mapa', 'Mapa'], ['rynek', 'Rynek'], ['oferty', 'Oferty'], ['dane', 'Dane'], ['historia', 'Historia'], ['ust', 'Ustawienia']];
function tabs(active) {
  $('#tabs').innerHTML = '<div class="in-tabs"><div class="brand"><img src="icons/logo-am.png" alt=""><b>OPERAT SZACUNKOWY</b><span>AM Nieruchomości</span></div>' + TABS.map(([k, n]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${ICON[k === 'wycena' ? 'wycena' : k]}${k === 'historia' && remindN() ? `<i class="nb">${remindN()}</i>` : ''}<span>${n}</span></a>`).join('') + '</div>';
}
function render() {
  const h = location.hash.replace(/^#\/?/, '') || 'wycena', p = h.split('/');
  let html = '', mount = null, tab = p[0];
  closeSheet(); if (mapCtl) { try { mapCtl.destroy(); } catch { } mapCtl = null; }
  if (p[0] === 'mapa') [html, mount] = viewMapa();
  else if (p[0] === 'rynek') [html, mount] = viewRynek();
  else if (p[0] === 'kalkulator') { tab = 'rynek'; [html, mount] = viewKalkulator(); }
  else if (p[0] === 'teczka') { tab = 'historia'; [html, mount] = viewTeczka(p[1]); }
  else if (p[0] === 'wycena') [html, mount] = viewWycena();
  else if (p[0] === 'oferty') [html, mount] = viewOferty();
  else if (p[0] === 'dane') [html, mount] = viewDane();
  else if (p[0] === 'historia') [html, mount] = viewHistoria();
  else if (p[0] === 'ust') [html, mount] = viewUst();
  else if (p[0] === 'wynik') { tab = 'wycena'; [html, mount] = viewWynik(p); }
  else if (p[0] === 'raport') { tab = 'wycena'; [html, mount] = viewRaport(p); }
  else [html, mount] = viewWycena();
  const v = $('#view'); v.innerHTML = html; v.dataset.view = ['wycena', 'mapa', 'rynek', 'oferty', 'dane', 'historia', 'teczka', 'kalkulator', 'ust', 'wynik', 'raport'].includes(p[0]) ? p[0] : 'wycena';
  const topEl = v.querySelector(':scope > .top');   // reszta widoku w osobnym bloku: na szerokim ekranie układa się w kolumny
  if (topEl) { const body = document.createElement('div'); body.className = 'body'; while (topEl.nextSibling) body.appendChild(topEl.nextSibling); v.appendChild(body); }
  v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  tabs(tab); window.scrollTo(0, 0); mount && mount(v);
}
const go = h => { location.hash = h; };
let mapCtl = null;

const head = (title, sub, back, line) => `<div class="top">${back ? `<button class="back" data-back aria-label="Wróć">${ICON.back}</button>` : '<img class="mark" src="icons/logo-am.png" alt="">'}<div><h1>${title}</h1>${sub ? `<small class="${line ? 'line' : ''}">${sub}</small>` : ''}</div></div>`;

/* ---------- WYCENA (formularz) ---------- */
function stepHTML(id, val, label) { return `<div class="field"><span>${label}</span><div class="step" data-step="${id}"><button type="button" data-d="-1" aria-label="mniej">−</button><output>${val}</output><button type="button" data-d="1" aria-label="więcej">+</button></div></div>`; }
const floorLbl = p => p == null ? '—' : p === 0 ? 'parter' : p;
const POD_OPT = {
  lokal: ['Funkcja lokalu', [['', 'Nie wiem'], ['handlowoUslugowa', 'Handlowo-usługowy'], ['biurowa', 'Biurowy'], ['produkcyjna', 'Produkcyjny'], ['inna', 'Inny']]],
  obiekt: ['Rodzaj obiektu', [['', 'Nie wiem'], ['przemyslowy', 'Przemysłowy'], ['handlowoUslugowy', 'Handlowo-usługowy'], ['biurowy', 'Biurowy'], ['zbiornikiSilosyMagazyny', 'Magazyn / silos'], ['gospodarczy', 'Gospodarczy'], ['pozostaleNiemieszkalne', 'Inny niemieszkalny']]],
  dzialka: ['Przeznaczenie (wg planu miejscowego)', [['', 'Nie wiem'], ['budownictwoMieszkanioweJednorodzinne', 'Jednorodzinna'], ['budownictwoMieszkanioweWielorodzinne', 'Wielorodzinna'], ['terenZabudowyUslugowej', 'Usługowa'], ['terenObiektowProdukcyjnychSkladowIMagazynow', 'Produkcja, składy'], ['terenRolniczy', 'Rolna'], ['terenZabudowyZagrodowejGospodarstwRolnych', 'Zagrodowa'], ['innyNiewymieniony', 'Inne']]],
};
const M2_LBL = { mieszkanie: 'Powierzchnia (m²)', dom: 'Powierzchnia użytkowa budynku (m²)', dzialka: 'Powierzchnia działki (m²)' };
function viewWycena() {
  const f = S.form, sale = f.tryb === 'sprzedaz', kat = f.kat || 'mieszkanie', flat = kat === 'mieszkanie';
  const dz = [...new Set(S.offers.map(o => o.dzielnica).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  const katN = S.pool.filter(t => t.kat === kat).length;
  const ready = sale ? S.pool.length > 0 : S.offers.length > 0;
  const stat = sale ? (S.pool.length ? `Baza RCN: ${fmt(S.pool.length)} transakcji${flat ? '' : `, w tym ${fmt(katN)} z kategorii „${KAT[kat].n}”`}` : '') : (S.offers.length ? `Baza ofert najmu: ${fmt(S.offers.length)}` : '');
  const chipsHTML = (name, opts, cur) => `<div class="chips" data-chips="${name}">${opts.map(([v, n]) => `<button type="button" class="chip ${cur === v ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div>`;
  const po = POD_OPT[kat];
  const html = head('Wycena', 'Szacunek wartości rynkowej') + safeBanner() + `
  <div class="seg" data-v="${sale ? 0 : 1}"><i></i><button data-t="sprzedaz" class="${sale ? 'on' : ''}">Sprzedaż</button><button data-t="najem" class="${sale ? '' : 'on'}">Najem</button></div>
  <div class="field" style="margin-top:14px"><span>Rodzaj nieruchomości</span><div class="chips" data-katsel>${KAT_ORDER.filter(k => k !== 'zabudowana').map(k => `<button type="button" class="chip ${kat === k ? 'on' : ''}" data-v="${k}">${KAT[k].n}</button>`).join('')}</div></div>
  ${ready ? `<div class="banner"><span>◈</span><span>${stat}. Wynik zawsze jako przedział z oceną pewności.</span></div>`
      : `<div class="banner warn"><span>!</span><span>${sale ? 'Brak danych o transakcjach (RCN).' : 'Brak ofert najmu.'} Najpierw zaimportuj dane w zakładce <b>Dane</b>.</span></div>`}
  <form class="card" id="f" autocomplete="off" novalidate>
    ${sale || !flat ? `<div class="grid3"><label class="field"><span>Ulica${flat ? '' : ' (opcjonalnie)'}</span><input class="in" name="ulica" list="dl-st" value="${esc(f.ulica)}" placeholder="np. Bluszczowa"></label>
      <label class="field"><span>Nr</span><input class="in" name="nr" value="${esc(f.nr)}" inputmode="text" placeholder="13"></label></div>`
      : `<label class="field"><span>Dzielnica (opcjonalnie)</span><input class="in" name="dzielnica" list="dl-dz" value="${esc(f.dzielnica)}" placeholder="np. Śródmieście"></label>
      <label class="field"><span>Ulica (opcjonalnie; dzielnica uzupełni się sama)</span><input class="in" name="ulica" list="dl-st" value="${esc(f.ulica)}" placeholder="np. Granata"></label>`}
    <datalist id="dl-st">${S.streets.map(s => `<option value="${esc(s)}">`).join('')}</datalist><datalist id="dl-dz">${dz.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="grid2"><label class="field"><span>${M2_LBL[kat] || 'Powierzchnia użytkowa (m²)'}</span><input class="in" name="m2" inputmode="decimal" value="${esc(f.m2)}" placeholder="${kat === 'dzialka' ? '1000' : '45,5'}"></label>
      ${kat === 'dom' ? `<label class="field"><span>Powierzchnia działki (m²)</span><input class="in" name="dzm2" inputmode="decimal" value="${esc(f.dzm2)}" placeholder="opcjonalnie"></label>` : ['mieszkanie', 'obiekt'].includes(kat) ? `<label class="field"><span>Rok budowy (opcj.)</span><input class="in" name="rok" inputmode="numeric" maxlength="4" value="${esc(f.rok)}" placeholder="np. 1978"></label>` : '<div></div>'}</div>
    ${kat === 'dom' ? `<label class="field"><span>Rok budowy (opcj.)</span><input class="in" name="rok" inputmode="numeric" maxlength="4" value="${esc(f.rok)}" placeholder="np. 1978"></label>` : ''}
    ${flat ? `<div class="grid2">${stepHTML('pokoje', f.pokoje, 'Pokoje')}${stepHTML('pietro', floorLbl(f.pietro), 'Piętro')}</div>` : ''}
    ${po ? `<div class="field"><span>${po[0]}</span>${chipsHTML('pod', po[1], f.pod || '')}</div>` : ''}
    ${sale && ['mieszkanie', 'dom', 'obiekt', 'lokal'].includes(kat) ? `<div class="field"><span>Rynek</span>${chipsHTML('rynek', [['', 'Dowolny'], ['wtorny', 'Wtórny'], ['pierwotny', 'Pierwotny']], f.rynek)}</div>` : ''}
    ${kat === 'garaz' || kat === 'dzialka' ? '' : `<div class="field"><span>Standard (informacyjnie)</span>${chipsHTML('standard', [['', 'Nie wiem'], ['remont', 'Do remontu'], ['dobry', 'Dobry'], ['wysoki', 'Wysoki']], f.standard)}</div>`}
    ${sale || !flat ? '' : `<div class="field"><span>Mieszkanie ma (zaznacz po obejrzeniu)</span><div class="chips" data-multi="ud">${ATTRS.filter(a => a[0] !== 'meble' && a[0] !== 'garaz').map(([k, n]) => `<button type="button" class="chip ${(f.ud || []).includes(k) ? 'on' : ''}" data-v="${k}">${n}</button>`).join('')}</div></div>
    <div class="field"><span>Parking / garaż</span>${chipsHTML('parking', [['brak', 'Brak'], ['wliczony', 'Jest w cenie czynszu'], ['osobno', 'Jest osobno płatny']], f.parking || 'brak')}</div>`}
    ${sale || !flat ? '' : `<div class="field"><span>Wyposażenie</span>${chipsHTML('meble', [['', 'Nie wiem'], ['tak', 'Umeblowane'], ['nie', 'Bez mebli']], f.meble)}</div>`}
    ${sale && flat ? `<label class="check"><input type="checkbox" name="zap" ${f.zapamietaj ? 'checked' : ''}> Zapamiętaj rok budowy dla tego adresu</label>` : ''}
    <p class="tiny muted" style="margin:6px 0 14px">${sale ? (flat ? 'Standard trafia do raportu jako informacja i nie zmienia wyniku.' : 'Dla tej kategorii RCN nie zna standardu ani roku budowy, więc trafiają do raportu jako informacja i nie zmieniają wyniku. Wynik zależy od powierzchni, rodzaju, położenia i daty transakcji.') : (flat ? 'Rok budowy i standard zmieniają wynik tylko wtedy, gdy baza ofert pozwala zmierzyć różnicę z przedziałem pewności. Wyposażenie trafia do raportu jako informacja.' : 'Wycena najmu tej kategorii powstaje z ofert najmu zapisanych w bazie dla tej kategorii.')}</p>
    <button class="btn" type="submit">Oszacuj wartość</button>
  </form>`;
  return [html, v => {
    $$('.seg button', v).forEach(b => b.onclick = () => { readForm(v); S.form.tryb = b.dataset.t; render(); });
    $$('[data-katsel] button', v).forEach(b => b.onclick = () => { readForm(v); if (S.form.kat !== b.dataset.v) { S.form.kat = b.dataset.v; S.form.pod = ''; } render(); });
    $$('[data-step]', v).forEach(st => $$('button', st).forEach(b => b.onclick = () => {
      readForm(v); const id = st.dataset.step, d = +b.dataset.d;
      if (id === 'pokoje') S.form.pokoje = Math.min(8, Math.max(1, S.form.pokoje + d));
      else { const c = S.form.pietro; S.form.pietro = c == null ? (d > 0 ? 0 : null) : (c + d < 0 ? null : Math.min(30, c + d)); }
      $('output', st).textContent = id === 'pokoje' ? S.form.pokoje : floorLbl(S.form.pietro);
    }));
    $$('[data-multi]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { const k = g.dataset.multi, a = S.form[k] || (S.form[k] = []), i = a.indexOf(b.dataset.v); i < 0 ? a.push(b.dataset.v) : a.splice(i, 1); b.classList.toggle('on', i < 0); }));
    $$('[data-chips]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { S.form[g.dataset.chips] = b.dataset.v; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); }));
    const ulI = $('[name="ulica"]', v), dzI = $('[name="dzielnica"]', v);
    if (ulI && dzI) {                                            // najem mieszkania: dzielnica dopisuje się od razu po wpisaniu ulicy
      const hint = document.createElement('small'); hint.className = 'tiny muted'; hint.style.display = 'block'; dzI.parentElement.appendChild(hint);
      const fill = () => {
        const u = ulI.value.trim(); if (!u || (dzI.value.trim() && dzI.dataset.auto !== '1')) return;
        const inf = inferDistrict(allOffers(), S.tx, u);
        if (inf) { dzI.value = inf.name; dzI.dataset.auto = '1'; hint.textContent = 'Dopisano automatycznie z ulicy. Możesz zmienić.'; } else if (dzI.dataset.auto === '1') { dzI.value = ''; dzI.dataset.auto = ''; hint.textContent = ''; }
      };
      ulI.addEventListener('change', fill); ulI.addEventListener('blur', fill); dzI.addEventListener('input', () => { dzI.dataset.auto = ''; hint.textContent = ''; });
      if (ulI.value.trim() && !dzI.value.trim()) fill();
    }
    $('#f', v).onsubmit = e => { e.preventDefault(); readForm(v); submitForm(); };
  }];
}
function readForm(v) {
  const q = n => { const el = $(`[name="${n}"]`, v); return el ? el.value.trim() : undefined; };
  for (const k of ['ulica', 'nr', 'dzielnica', 'm2', 'dzm2', 'rok']) { const x = q(k); if (x !== undefined) S.form[k] = x; }
  const z = $('[name="zap"]', v); if (z) S.form.zapamietaj = z.checked;
}
function submitForm() {
  const f = S.form, kat = f.kat || 'mieszkanie', flat = kat === 'mieszkanie', m2 = parseFloat(String(f.m2).replace(',', '.'));
  const rng = flat ? [10, 400] : KAT[kat].m2;
  if (!(m2 >= rng[0] && m2 <= rng[1])) return toast(`Podaj powierzchnię (${rng[0].toLocaleString('pl-PL')}–${rng[1].toLocaleString('pl-PL')} m²)`);
  const dzm2 = kat === 'dom' && f.dzm2 ? parseFloat(String(f.dzm2).replace(',', '.')) : null;
  if (kat === 'dom' && f.dzm2 && !(dzm2 >= 30)) return toast('Powierzchnia działki wygląda błędnie');
  const rok = f.rok ? parseInt(f.rok, 10) : null;
  if (f.rok && !(rok >= 1700 && rok <= now() + 3)) return toast('Rok budowy wygląda błędnie');
  if (f.tryb === 'sprzedaz' && !S.pool.length) return toast('Najpierw zaimportuj dane RCN (zakładka Dane)');
  if (f.tryb === 'najem' && flat && !S.offers.length && !(S.wlasne || []).length) return toast('Najpierw zaimportuj oferty najmu (zakładka Dane)');
  const subj = { tryb: f.tryb, kat, pod: f.pod || null, dzm2, ulica: f.ulica, nr: f.nr, dzielnica: f.dzielnica, m2, pokoje: flat ? f.pokoje : null, pietro: flat ? f.pietro : null, rok: ['mieszkanie', 'dom', 'obiekt'].includes(kat) ? rok : null, rynek: f.rynek || null, standard: f.standard || null, meble: f.meble === '' ? null : f.meble,
    parking: f.tryb === 'najem' && flat ? (f.parking || 'brak') : null,
    attrs: f.tryb === 'najem' && flat ? { ...Object.fromEntries(ATTRS.filter(a => a[0] !== 'meble' && a[0] !== 'garaz').map(([k]) => [k, (f.ud || []).includes(k) ? 1 : 0])), garaz: f.parking === 'wliczony' ? 1 : 0 } : null };
  let dzNote = null;
  if (f.tryb === 'najem' && flat && subj.ulica) {
    const inf = inferDistrict(allOffers(), S.tx, subj.ulica);
    if (inf) {
      const src = inf.source === 'oferty' ? `ofert z tej ulicy (${inf.n})` : `położenia ulicy wg RCN i najbliższych ulic ze znaną dzielnicą (${inf.n}, najbliższa ${inf.km.toFixed(1).replace('.', ',')} km)`;
      if (!subj.dzielnica) { subj.dzielnica = inf.name; dzNote = `Dzielnica ustalona automatycznie: ${inf.name}, na podstawie ${src}. Sprawdź, czy się zgadza.`; }
      else if (normDz(inf.name) !== normDz(subj.dzielnica) && inf.share >= 0.7) dzNote = `Uwaga: wpisano dzielnicę ${subj.dzielnica}, a ulica ${subj.ulica} wg ${src} leży w dzielnicy ${inf.name}.`;
    }
  }
  if (rok && flat && f.zapamietaj && f.ulica && f.nr && f.tryb === 'sprzedaz') { S.budynki[addrKey(f.ulica, f.nr)] = rok; save.budynki(); }
  const yearOf = k => S.budynki[k] ?? null;
  const res = f.tryb === 'najem' ? (flat ? estimateRent(allOffers(), subj) : { ok: false, reason: `Brak ofert najmu dla kategorii „${KAT[kat].n}”. Baza ofert zawiera dziś tylko mieszkania; najem tej kategorii wyceniam z ofert, więc najpierw trzeba je zaimportować.` }) : flat ? estimateSale(S.tx, subj, { yearOf }) : estimateSaleKat(S.pool, subj, { geo: S.pool });
  if (f.tryb === 'najem' && flat && res.ok) { try { const baseRent = res.adjusted ? estimateRent(allOffers(), { ...subj, rok: null, standard: null }) : res; res.cross = crossCheckRent(allOffers(), S.tx, subj, baseRent.ok ? baseRent : res); const c = res.cross; if (res.adjusted && baseRent.ok) c.vsBase = baseRent.total; if (c.ok && c.agreement === 'rozbieżne' && c.r2 >= 0.3 && res.confidence.score > 1) { res.confidence.score -= 1; res.confidence.level = res.confidence.score === 1 ? 'niska' : 'średnia'; res.confidence.why.push('obniżono: kontrola ze sprzedażą (wiarygodna, R² ≥ 0,3) daje wyraźnie inny czynsz'); } } catch (e) { res.cross = { ok: false, reason: 'Nie udało się policzyć kontroli: ' + e.message }; } }
  if (subj.parking === 'osobno' && res.ok) res.parking = parkingExtra(allOffers());
  if (dzNote && res.ok) res.notes.unshift(dzNote);
  S.last[f.tryb] = { id: null, ts: Date.now(), subj, res };
  go('#/wynik/' + f.tryb);
}

/* ---------- WYNIK ---------- */
const subjLine = s => { const k = s.kat || 'mieszkanie', fl = k === 'mieszkanie', sale = s.tryb === 'sprzedaz';
  return [fl ? '' : KAT[k].n, sale || !fl ? [s.ulica, s.nr].filter(Boolean).join(' ') : [s.dzielnica, s.ulica].filter(Boolean).join(', '), `${String(s.m2).replace('.', ',')} m²`, fl ? `${s.pokoje} pok.` : '', k === 'dom' && s.dzm2 ? `działka ${String(s.dzm2).replace('.', ',')} m²` : '', s.pod ? (POD_TXT[s.pod] || '') : '',
    fl ? (s.pietro == null ? '' : s.pietro === 0 ? 'parter' : `${s.pietro}. piętro`) : '', s.rok ? `rok ${s.rok}` : ''].filter(Boolean).join(' · '); };
function getEntry(p) {
  if (p[1] === 'h') return S.wyceny.find(w => w.id === p[2]) || null;
  return S.last[p[1]] || null;
}
function viewWynik(p) {
  const e = getEntry(p);
  if (!e) return [head('Wynik', '', true) + '<div class="empty"><b>Brak wyniku</b>Wróć do formularza i oszacuj wartość.</div>', v => $('[data-back]', v).onclick = () => go('#/wycena')];
  const { subj: s, res: r } = e, sale = s.tryb === 'sprzedaz', step = sale ? 1000 : 10, saved = !!e.id;
  let html = head(sale ? 'Wartość' : 'Najem', esc(subjLine(s)), true, true);
  if (!r.ok) {
    html += `<div class="card"><div class="eyebrow">Brak wyniku</div><h3>Za mało danych</h3><p class="muted">${esc(r.reason)}</p>
      <p class="small muted">Aplikacja nie podaje liczby, gdy nie ma na czym jej oprzeć. Zaimportuj więcej danych w zakładce <b>Dane</b> albo zmień kryteria.</p></div>
      <button class="btn ghost" data-act="back">Zmień dane</button>`;
    return [html, v => { $('[data-back]', v).onclick = () => history.length > 1 ? history.back() : go('#/wycena'); $('[data-act="back"]', v).onclick = () => go('#/wycena'); }];
  }
  const lo = roundTo(r.total.lo, step), hi = roundTo(r.total.hi, step), mid = roundTo(r.total.mid, step);
  const pm = r.comps.map(c => c.pm2), dMin = Math.min(...pm, r.pm2.lo), dMax = Math.max(...pm, r.pm2.hi), span = (dMax - dMin) || 1, X = v => ((v - dMin) / span * 100).toFixed(2);
  html += `<div class="card hero"><div class="lbl">${esc(r.label)}</div>
    <div class="big gold"><span data-cu="${lo}">${fmt(lo)}</span> – <span data-cu="${hi}">${fmt(hi)}</span> zł</div>
    <div class="sub">${r.rangeKind}${sale ? '' : ' · miesięcznie'}</div>
    <div class="sub" style="margin-top:6px">środek przedziału: <b class="gold" data-cu="${roundTo((r.total.lo + r.total.hi) / 2, step)}">${fmt(roundTo((r.total.lo + r.total.hi) / 2, step))}</b> zł</div>
    <div class="range"><div class="t" style="left:${X(r.pm2.mid)}%">mediana ${fmt(r.pm2.mid)} zł/m²</div><div class="track"><div class="fill" style="left:${X(r.pm2.lo)}%;width:${Math.max(1, X(r.pm2.hi) - X(r.pm2.lo))}%"></div></div>
      ${r.comps.slice(0, 40).map(c => `<div class="dot" style="left:${X(c.pm2)}%"></div>`).join('')}<div class="mid" style="left:${X(r.pm2.mid)}%"></div>
      <div class="t b" style="left:0;transform:none">${fmt(dMin)}</div><div class="t b" style="left:100%;transform:translateX(-100%)">${fmt(dMax)} zł/m²</div></div></div>
  <div class="stats"><div class="stat"><b>${r.n}</b><span>porównań</span></div><div class="stat"><b>${fmt(mid)}</b><span>wartość centralna, zł</span></div><div class="stat"><b>${fmt(r.pm2.mid)}</b><span>zł za m²</span></div></div>
  <div class="card"><div class="eyebrow">Pewność wyniku</div><div class="conf"><div class="gauge" data-l="${r.confidence.score}">${[1, 2, 3].map(i => `<i class="${i <= r.confidence.score ? 'on' : ''}"></i>`).join('')}</div><b>${LV[r.confidence.level]}</b></div>
    <p class="small muted" style="margin:10px 0 0">${LVTXT[r.confidence.level]}</p>
    <details style="margin-top:8px"><summary class="small" style="color:var(--gold-l);cursor:pointer">Dlaczego tak?</summary><ul class="clean">${r.confidence.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="tiny muted">Progi są orientacyjne i wymagają skalibrowania na prawdziwych transakcjach.</p></details></div>`;
  if (!sale && r.ask?.length) html += `<div class="card"><div class="eyebrow">Co poprawi trafność</div><ul class="clean">${r.ask.map(a => `<li>${esc(a.text)}</li>`).join('')}</ul></div>`;
  if (!sale && r.adjusted) html += `<div class="card"><div class="eyebrow">Korekta segmentu</div><p class="small muted" style="margin:0">Porównania z innego segmentu (np. starsze budownictwo) zostały skorygowane o różnicę zmierzoną w bazie ofert. Przy każdym porównaniu widać wartość przed korektą.</p></div>`;
  if (!sale && r.cross) {
    const c = r.cross;
    html += c.ok ? `<div class="card"><div class="eyebrow">Kontrola ze sprzedażą</div>
      <h3>${fmt(roundTo(c.implied.lo, 10))} – ${fmt(roundTo(c.implied.hi, 10))} zł</h3>
      <p class="small muted" style="margin:6px 0 0">Czynsz wyliczony z szacunkowej wartości mieszkania (${fmt(roundTo(c.sale.total.lo, 1000))} – ${fmt(roundTo(c.sale.total.hi, 1000))} zł, RCN) i zmierzonego w Twoich danych stosunku czynszu do wartości: rentowność brutto ok. ${c.grossYieldPct.toFixed(1).replace('.', ',')}% rocznie (zmierzone na ${c.pairs} ${c.unit} z ofertami i transakcjami).</p>
      <div class="kv" style="margin-top:8px"><span>Zgodność z wynikiem z ofert</span><b>${c.agreement || '—'}${c.diffPct != null ? ` (środek ${c.diffPct > 0 ? '+' : '−'}${Math.abs(c.diffPct).toFixed(0)}%)` : ''}</b></div>
      ${c.vsBase ? `<p class="tiny muted" style="margin:8px 0 0">RCN nie zna standardu ani rodzaju budownictwa, więc kontrolę porównano z czynszem BEZ korekty segmentu (${fmt(roundTo(c.vsBase.lo, 10))} – ${fmt(roundTo(c.vsBase.hi, 10))} zł), czyli dla mieszkania przeciętnego standardu.</p>` : ''}
      <p class="tiny muted" style="margin:8px 0 0">Stosunek czynszu do wartości: ${esc(c.basis || '')}. Obie strony przeliczono do metrażu ${String(subj_m2(e)).replace('.', ',')} m² (czynsz za m² zmienia się z metrażem o ${(c.sizeEffect.rent * 100).toFixed(0)}% na każde 100% metrażu, cena sprzedaży o ${(c.sizeEffect.sale * 100).toFixed(0)}%).</p>
      ${c.r2 != null ? `<p class="tiny muted" style="margin:8px 0 0">Czy cena kupna tłumaczy czynsz? Między ${c.unit === 'dzielnic' ? 'dzielnicami' : 'ulicami'}: R² = ${c.r2.toFixed(2).replace('.', ',')}${c.slope != null ? `, czynsz rośnie o ${c.slope.toFixed(2).replace('.', ',')}% na każdy 1% wyższej ceny kupna` : ''}. ${c.r2 < 0.3 ? 'To słaby związek: traktuj kontrolę ostrożnie.' : c.r2 < 0.6 ? 'Związek umiarkowany.' : 'Związek wyraźny.'}</p>` : ''}
      ${c.agreement === 'rozbieżne' ? '<p class="small" style="margin:8px 0 0;color:var(--gold-l)">Obie oceny wyraźnie się różnią: zweryfikuj porównania ręcznie.</p>' : ''}</div>`
      : `<div class="card"><div class="eyebrow">Kontrola ze sprzedażą</div><p class="small muted" style="margin:0">${esc(c.reason || 'Niedostępna.')}</p></div>`;
  }
  if (!sale) {
    const ls = S.last.sprzedaz, y = ls && ls.res.ok && normStreet(ls.subj.ulica) === normStreet(s.ulica) && ls.subj.m2 === s.m2 ? grossYield(ls.res, r) : null;
    if (s.parking === 'osobno') html += `<div class="card"><div class="eyebrow">Parking płatny osobno</div>${r.parking && r.parking.ok ? `<div class="kv"><span>Typowo miesięcznie</span><b>${fmt(roundTo(r.parking.lo, 10))} – ${fmt(roundTo(r.parking.hi, 10))} zł</b></div><div class="kv"><span>Mediana</span><b>${fmt(roundTo(r.parking.mid, 10))} zł</b></div><p class="tiny muted" style="margin:8px 0 0">Z ${r.parking.n} ofert, w których ogłoszenie podaje osobną opłatę. Dolicz do czynszu za mieszkanie.</p>` : `<p class="small muted" style="margin:0">Za mało ofert z podaną opłatą za parking (${r.parking ? r.parking.n : 0} z wymaganych 5). Kwotę ustal z właścicielem.</p>`}</div>`;
    if (r.adminTotal) html += `<div class="card"><div class="kv"><span>Czynsz administracyjny (mediana)</span><b>ok. ${fmt(roundTo(r.adminTotal, 10))} zł</b></div></div>`;
    if (y) html += `<div class="card"><div class="eyebrow">Rentowność brutto (orientacyjnie)</div><h3>${y.lo.toFixed(1)}% – ${y.hi.toFixed(1)}%</h3><p class="small muted">Roczny najem do wartości, z dwóch niezależnych szacunków. Bez podatków i kosztów.</p></div>`;
  } else html += `<div class="card"><div class="kv"><span>Źródło</span><b>RCN (akty notarialne)</b></div><div class="kv"><span>Okno czasu</span><b>ostatnie ${r.window || 3} lat</b></div></div>`;
  html += `<div class="card"><div class="eyebrow">Uwagi do wyniku</div><ul class="clean note-warn">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    ${r.unused.length ? `<div class="eyebrow" style="margin-top:14px">Nie uwzględniono w wycenie</div><ul class="clean">${r.unused.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`;
  const withLL = r.comps.filter(c => c.lat != null);
  if (sale && r.subLL && withLL.length >= 3) html += `<div class="card"><div class="eyebrow">Położenie porównań</div><div class="mapbox sm" id="resmap">${mapSVG(r)}</div><div id="reslegend"></div><p class="tiny muted" style="margin:8px 0 0">Złoty pierścień: lokal wyceniany (${esc(r.llKind || '')}). Większy punkt = większa waga porównania; kolor = cena za m². Dotknij punktu, aby zobaczyć transakcję.</p></div>`;
  html += `<div class="card"><div class="eyebrow">Porównania (${r.comps.length})</div><div id="comps">${r.comps.slice(0, 10).map((c, i) => compHTML(c, i, sale)).join('')}</div>${r.comps.length > 10 ? '<button class="btn ghost" data-act="more" style="margin-top:10px">Pokaż wszystkie</button>' : ''}</div>
  <div class="row">${saved ? '' : '<button class="btn ghost" data-act="save">Zapisz do historii</button>'}<button class="btn" data-act="report">Raport dla klienta</button></div>
  <div class="gap"></div><button class="btn ghost" data-act="calc">Kalkulator inwestycyjny</button>
  ${saved ? `<div class="gap"></div><button class="btn ghost" data-act="tec">${e.teczka && S.teczki.some(t => t.id === e.teczka) ? 'Teczka: ' + esc(tName(S.teczki.find(t => t.id === e.teczka))) : 'Dodaj do teczki nieruchomości'}</button>` : ''}
  ${saved ? `<div class="gap"></div><button class="btn ghost" data-act="real">${e.real ? 'Zmień cenę rzeczywistą' : 'Wpisz cenę rzeczywistą (do kontroli trafności)'}</button>` : ''}`;
  return [html, v => {
    $('[data-back]', v).onclick = () => (saved ? go('#/historia') : go('#/wycena'));
    $$('[data-cu]', v).forEach(el => countUp(el, +el.dataset.cu));
    const rmEl = $('#resmap', v); if (rmEl) resMap(rmEl, r, v);
    const more = $('[data-act="more"]', v); if (more) more.onclick = () => { $('#comps', v).innerHTML = r.comps.map((c, i) => compHTML(c, i, sale)).join(''); more.remove(); };
    $('[data-act="calc"]', v).onclick = () => { if (sale) S.invest.cena = roundTo(r.total.mid, 1000); else S.invest.czynsz = roundTo(r.total.mid, 10); ls.set('am-invest', JSON.stringify(S.invest)); go('#/kalkulator'); };
    const tcb = $('[data-act="tec"]', v); if (tcb) tcb.onclick = () => teczkaSheet(e);
    const sv = $('[data-act="save"]', v); if (sv) sv.onclick = () => { e.id = uid(); const tc = (S.teczkaNext && S.teczki.find(t => t.id === S.teczkaNext)) || findTeczka(s); S.teczkaNext = null; if (tc) { e.teczka = tc.id; toast('Zapisano w teczce: ' + tName(tc)); } S.wyceny.unshift(e); save.wyceny(); toast('Zapisano w historii'); go('#/wynik/h/' + e.id); };
    $('[data-act="report"]', v).onclick = () => go(saved ? '#/raport/h/' + e.id : '#/raport/cur/' + s.tryb);
    const rl = $('[data-act="real"]', v); if (rl) rl.onclick = () => realSheet(e);
  }];
}
const subj_m2 = e => e.subj.m2;
function compHTML(c, i, sale) {
  const w = Math.max(6, Math.round(c.w * 100));
  return `<div class="comp" style="animation-delay:${Math.min(i, 12) * 40}ms"><div>${c.url ? `<a class="clink" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(c.opis || '—')}</b> <span class="ext" aria-hidden="true">↗</span></a>` : `<b>${esc(c.opis || '—')}</b>`}${c.sameBuilding ? '<span class="badge g">ten sam budynek</span>' : ''}${c.own ? '<span class="badge g">własna umowa</span>' : ''}<span class="badge">${c.kind}</span></div><div class="p">${fmt(c.cena)} zł</div>
    <div class="m">${String(c.m2).replace('.', ',')} m²${c.pokoje != null ? ' · ' + c.pokoje + ' pok.' : ''}${c.dzm2 ? ' · działka ' + fmt(c.dzm2) + ' m²' : ''}${c.pietro != null ? ' · ' + (c.pietro === 0 ? 'parter' : c.pietro + '. p.') : ''}${c.data ? ' · akt ' + c.data : c.rok ? ' · akt ' + c.rok : ''}${c.rokBudowy ? ' · bud. ' + c.rokBudowy : ''}</div><div class="m r">${fmt(c.pm2raw ?? c.pm2)} zł/m²${c.adjPct && Math.abs(c.adjPct) >= 0.005 ? `<br><small>po korekcie ${fmt(c.pm2)} (${c.adjPct > 0 ? '+' : '−'}${Math.abs(c.adjPct * 100).toFixed(0)}%)</small>` : ''}</div><div class="wbar"><i style="width:${w}%"></i></div></div>`;
}
function mapSVG(r) {
  const pts = r.comps.filter(c => c.lat != null), [la0, lo0] = r.subLL, k = Math.cos(la0 * Math.PI / 180);
  const dx = p => (p.lon - lo0) * 111.32 * k, dy = p => (p.lat - la0) * 110.57;
  const ext = Math.max(0.3, ...pts.map(p => Math.max(Math.abs(dx(p)), Math.abs(dy(p))))), sc = 95 / ext, km = ext;
  const ring = [0.25, 0.5, 1].map(f => `<circle cx="150" cy="110" r="${(95 * f).toFixed(1)}" fill="none" stroke="rgba(200,164,77,.14)" stroke-dasharray="2 5"/>`).join('');
  return `<svg class="map" viewBox="0 0 300 220" role="img" aria-label="Schemat położenia">${ring}
  ${pts.map(p => `<circle cx="${(150 + dx(p) * sc).toFixed(1)}" cy="${(110 - dy(p) * sc).toFixed(1)}" r="${(2.5 + p.w * 4).toFixed(1)}" fill="#E6CE94" fill-opacity="${(.35 + p.w * .5).toFixed(2)}"/>`).join('')}
  <g transform="translate(150 110)"><circle r="9" fill="none" stroke="#C8A44D" stroke-width="2"/><circle r="3.4" fill="#C8A44D"/></g>
  <text x="292" y="212" text-anchor="end" fill="#9A978F" font-size="10" font-family="Archivo, sans-serif">promień ≈ ${km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km'}</text></svg>`;
}
function realSheet(e) {
  openSheet(`<h3>Cena rzeczywista</h3><p class="small muted">Wpisz faktyczną cenę transakcji lub czynsz z umowy. Dzięki temu zobaczysz, jak trafiał szacunek, i skalibrujesz progi.</p>
    <label class="field"><span>Kwota (zł)</span><input class="in" id="rv" inputmode="numeric" value="${e.real || ''}"></label><button class="btn" id="rs">Zapisz</button>`, p => {
    $('#rs', p).onclick = () => { const v = parseInt($('#rv', p).value.replace(/\D/g, ''), 10); if (!v) return toast('Wpisz kwotę'); e.real = v; save.wyceny(); closeSheet(); render(); toast('Zapisano'); };
  });
}

/* ---------- RAPORT ---------- */
function viewRaport(p) {
  const e = p[1] === 'h' ? S.wyceny.find(w => w.id === p[2]) : S.last[p[2]];
  const back = () => history.length > 1 ? history.back() : go('#/wycena');
  if (!e || !e.res.ok) return [head('Raport', '', true) + '<div class="empty"><b>Brak wyniku</b>Raport powstaje z gotowej wyceny.</div>', v => $('[data-back]', v).onclick = back];
  const VAR = [['short', 'Krótki'], ['full', 'Pełny'], ['market', 'Z wykresami rynku']];
  let variant = 'full'; try { variant = localStorage.getItem('am-rapvar') || 'full'; } catch { }
  if (!VAR.some(x => x[0] === variant)) variant = 'full';
  const html = head('Raport', 'Dla klienta', true) + `<div class="seg" id="rvar" style="margin-bottom:12px">${VAR.map(([k, n]) => `<button data-v="${k}" class="${k === variant ? 'on' : ''}">${n}</button>`).join('')}</div>
    <p class="tiny muted" id="rvh" style="margin:-4px 0 12px"></p><div id="rp"><div class="empty"><b>Przygotowuję raport…</b></div></div>
    <div class="row" style="position:sticky;bottom:calc(var(--nav) + var(--sab) + 12px)"><button class="btn" id="pdf" disabled>Udostępnij PDF</button></div>`;
  const HINT = { short: 'Jedna strona: wynik, przedział i pewność oceny. Bez tabeli porównań.', full: 'Wynik, opis metody i tabela porównań użytych w analizie.', market: 'Jak pełny, a do tego wykres cen transakcyjnych w czasie i rentowność najmu w dzielnicach.' };
  return [html, async v => {
    $('[data-back]', v).onclick = back; let pages = [], seq = 0;
    const market = () => {
      const s = e.subj, kat = s.kat || 'mieszkanie', m2 = +s.m2 || 0, out = {};
      if (S.pool.length && m2) {
        const T = trendSeries(S.pool, { kat, rynek: ['mieszkanie', 'dom', 'lokal'].includes(kat) ? (s.rynek === 'pierwotny' || s.rynek === 'wtorny' ? s.rynek : '') : '', m2min: Math.round(m2 * .7), m2max: Math.round(m2 * 1.3), years: 8 });
        if (T.ok) { out.trend = T; out.trendLabel = `Lublin, ${KAT[kat] ? KAT[kat].n.toLowerCase() : 'mieszkania'} o powierzchni ${Math.round(m2 * .7)}–${Math.round(m2 * 1.3)} m².`; }
      }
      if (kat === 'mieszkanie' && S.tx.length) { try { const Y = yieldByDistrict(allOffers(), S.tx); if (Y.ok) out.yield = Y; } catch { } }
      return out;
    };
    const draw = async () => {
      const my = ++seq, b = $('#pdf', v); b.disabled = true; $('#rvh', v).textContent = HINT[variant];
      $('#rp', v).innerHTML = '<div class="empty"><b>Przygotowuję raport…</b></div>';
      try { await document.fonts.ready; pages = await buildReport(e, S.ust, { variant, market: variant === 'market' ? market() : null }); } catch (err) { if (my === seq) $('#rp', v).innerHTML = `<div class="empty"><b>Nie udało się zbudować raportu</b>${esc(err.message)}</div>`; return; }
      if (my !== seq) return;
      $('#rp', v).innerHTML = pages.map(c => `<img class="report-img" alt="Strona raportu" src="${c.toDataURL('image/jpeg', .92)}">`).join('');
      if (variant === 'market' && !market().trend && !market().yield) $('#rvh', v).textContent += ' Brak wystarczających danych RCN do wykresów, więc raport ich nie zawiera.';
      b.disabled = false;
    };
    $('#rvar', v).onclick = ev => { const bt = ev.target.closest('button[data-v]'); if (!bt) return; variant = bt.dataset.v; try { localStorage.setItem('am-rapvar', variant); } catch { } $$('#rvar button', v).forEach(x => x.classList.toggle('on', x === bt)); draw(); };
    const b = $('#pdf', v);
    b.onclick = async () => { b.disabled = true; try { const blob = makePdf(pages); const nm = 'Analiza-rynkowa-' + (variant === 'short' ? 'krotka-' : variant === 'market' ? 'rynek-' : '') + new Date().toISOString().slice(0, 10) + '.pdf'; const r = await saveFile(blob, nm); if (r !== 'cancel') toast(r === 'share' ? 'Gotowe' : 'Pobrano PDF'); } finally { b.disabled = false; } };
    draw();
  }];
}

// Katalog nieruchomości: ile transakcji każdej kategorii jest w bazie i ile z nich nadaje się do wyceny
function katalogHTML() {
  const k = katalog(S.pool, S.stats), rows = KAT_ORDER.filter(c => k[c].rynkowe || k[c].nierynkowe);
  if (!rows.length) return '';
  const nr = rows.reduce((s, c) => s + k[c].nierynkowe, 0);
  return `<div class="eyebrow" style="margin:14px 0 6px">Katalog nieruchomości</div><div class="cattab"><div class="r h"><span>Kategoria</span><span>Rynkowe</span><span>Do wyceny</span><span>Z 3 lat</span></div>
    ${rows.map(c => `<div class="r"><span>${esc(KAT[c].n)}</span><span>${fmt(k[c].rynkowe)}</span><span>${c === 'zabudowana' ? '—' : fmt(k[c].uzyteczne)}</span><span>${c === 'zabudowana' ? '—' : fmt(k[c].trzyLata)}</span></div>`).join('')}</div>
    <p class="tiny muted" style="margin:8px 0 0">„Rynkowe”: transakcje po cenach rynkowych (wolny rynek, nowe mieszkania od dewelopera). „Do wyceny”: jedna nieruchomość w akcie, pełna własność, znana powierzchnia i sensowna cena. Pominięto ${fmt(nr)} transakcji nierynkowych (bonifikaty, przetargi, egzekucje, sprzedaż z zasobów publicznych).</p>`;
}


/* ---------- OFERTY: zebrania danych, statusy, lista z linkami ---------- */
const zebr = () => S.ust.zebrania || [];
const lastFull = () => { const z = zebr().filter(x => x.pelne); return z.length ? z[z.length - 1] : null; };
// nieaktualne: jest pełny przegląd, a oferty w nim nie było; nowe: pierwszy raz w ostatnim zebraniu (gdy były wcześniejsze)
function statusFn() {
  const z = zebr(), F = lastFull(), L = z[z.length - 1];
  return o => (F && (o.ost || 0) < F.id) ? 'nieaktualne' : (z.length > 1 && o.pierw && o.pierw === L.id) ? 'nowe' : 'aktualne';
}
const parkNote = p => !p ? '' : p.stan === 'wliczony' ? 'parking w czynszu' : p.stan === 'dodatkowo' ? 'parking osobno' + (p.kwota > 0 ? ' +' + fmt(p.kwota) + ' zł' : '') : '';
function applyCollection(found, opt = {}) {
  const t = Date.now(), z = (S.ust.zebrania || []).slice(); let c = z[z.length - 1];
  if (!c || t - c.ts > 12 * 3600000) { c = { id: (c ? c.id : 0) + 1, ts: t, pelne: false, n: 0 }; z.push(c); } else { c = { ...c, ts: t }; z[z.length - 1] = c; }
  if (opt.pelne) c.pelne = true;
  const byP = new Map(), byK = new Map(); for (const o of S.offers) { if (o.portalId) byP.set(String(o.portalId), o); byK.set(offerKey(o), o); }
  const batch = new Set(); let added = 0, updated = 0;
  for (const r of found) {
    const ex = (r.portalId && byP.get(String(r.portalId))) || byK.get(offerKey(r));
    let o;
    if (ex) { o = ex; updated++; if (r.cena != null && r.cena !== o.cena && o.cena > 0) o.hc = (o.hc && o.hc.length ? o.hc : [[o.pierw || 0, o.cena]]).concat([[c.id, r.cena]]); for (const k of ['cena', 'czynsz', 'pokoje', 'm2', 'pietro', 'ulica', 'dzielnica', 'miasto']) if (r[k] != null) o[k] = r[k]; if (r.url) o.url = r.url; if (r.portalId) o.portalId = String(r.portalId); if (r.rokBand) o.rokBand = r.rokBand; if (r.zabudowa) o.zabudowa = r.zabudowa; }
    else { o = { ...r, flagi: r.flagi || offerFlags(r), id: uid(), typ: 'najem', ts: t, wlaczone: true, pierw: c.id }; if (o.portalId) o.portalId = String(o.portalId); S.offers.push(o); added++; if (o.portalId) byP.set(o.portalId, o); byK.set(offerKey(o), o); }
    o.ost = c.id; batch.add(o);
    if (r.parking && r.parking.stan) o.parking = { stan: r.parking.stan, ...(r.parking.kwota > 0 ? { kwota: r.parking.kwota } : {}) };
    if (r.attrs) o.attrs = { ...(o.attrs || {}), ...r.attrs };
  }
  const recent = o => t - (o.ts || 0) < 3 * 86400000;
  for (const k of opt.attrs || []) {
    for (const o of S.offers) {
      const inB = batch.has(o);
      if (k === 'garaz') {                                  // lista z filtrem „Garaż”: stan rozliczenia ustala się z ogłoszenia
        if (inB) { if (!o.parking) o.parking = { stan: 'nieznany' }; } else if ((o.ost === c.id || recent(o)) && !o.parking) o.parking = { stan: 'brak' };
        continue;
      }
      o.attrs = o.attrs || {};
      if (inB) o.attrs[k] = 1; else if ((o.ost === c.id || recent(o)) && o.attrs[k] === undefined) o.attrs[k] = 0;
    }
  }
  for (const o of S.offers) if (o.parking && o.parking.stan !== 'nieznany') { o.attrs = o.attrs || {}; o.attrs.garaz = o.parking.stan === 'wliczony' ? 1 : 0; }
  c.n = S.offers.filter(o => o.ost === c.id).length;
  S.ust.zebrania = z; save.ust(); save.offers();
  return { added, updated, zebranie: c };
}
function zebrania() {
  const z = zebr(), st = statusFn(), cnt = { nowe: 0, aktualne: 0, nieaktualne: 0 }; S.offers.forEach(o => cnt[st(o)]++);
  const d = ts => new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
  return `<div class="kv"><span>Aktualne</span><b>${fmt(cnt.aktualne + cnt.nowe)}</b></div><div class="kv"><span>w tym nowe</span><b>${fmt(cnt.nowe)}</b></div><div class="kv"><span>Nieaktualne (zostają w bazie)</span><b>${fmt(cnt.nieaktualne)}</b></div><div class="kv"><span>Z linkiem do ogłoszenia</span><b>${fmt(S.offers.filter(o => o.url).length)}</b></div>
    ${z.length ? `<div class="eyebrow" style="margin:12px 0 4px">Ostatnie zebrania</div>${z.slice(-4).reverse().map(x => `<div class="kv"><span>${d(x.ts)} · ${x.pelne ? 'pełny przegląd' : 'częściowe'}</span><b>${fmt(x.n)}</b></div>`).join('')}` : '<p class="tiny muted" style="margin:8px 0 0">Brak zapisanych zebrań. Pierwsze zebranie ofert oznaczy wszystkie jako aktualne.</p>'}
    <p class="tiny muted" style="margin:8px 0 0">Oferta „nieaktualna” to taka, której nie było w ostatnim pełnym przeglądzie portalu. Zostaje w bazie i nadal pomaga w wycenie.</p>`;
}
S.of = { status: '', pokoje: '', metraz: '', dz: '', attrs: [], parking: '', lim: 60 };
const PARK_F = [['', 'Dowolny'], ['wliczony', 'W cenie czynszu'], ['dodatkowo', 'Osobno płatny'], ['brak', 'Bez parkingu']];
function viewOferty() {
  const f = S.of, st = statusFn();
  const chips = (key, opts) => `<div class="chips" data-of="${key}">${opts.map(([val, n]) => `<button type="button" class="chip ${String(f[key]) === String(val) ? 'on' : ''}" data-v="${val}">${n}</button>`).join('')}</div>`;
  const dz = [...new Set(S.offers.map(o => o.dzielnica).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  const html = head('Oferty', 'Ogłoszenia najmu w bazie') + safeBanner() + `
  <div class="card"><div id="of-filters">
    <div class="field"><span>Status</span>${chips('status', [['', 'Wszystkie'], ['nowe', 'Nowe'], ['aktualne', 'Aktualne'], ['nieaktualne', 'Nieaktualne']])}</div>
    <div class="field"><span>Liczba pokoi</span>${chips('pokoje', [['', 'Wszystkie'], ['1', '1 pokój'], ['2', '2 pokoje'], ['3', '3 i więcej']])}</div>
    <div class="field"><span>${M2S.mieszkanie[0]}</span>${chips('metraz', M2S.mieszkanie[1])}</div>
    <div class="field"><span>Dzielnica</span><select class="in" id="of-dz"><option value="">Wszystkie</option>${dz.map(d => `<option ${f.dz === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
    <div class="field"><span>Cechy (oferta musi mieć wszystkie zaznaczone)</span><div class="chips" data-ofa>${ATTRS.filter(a => a[0] !== 'garaz').map(([k, n]) => `<button type="button" class="chip ${f.attrs.includes(k) ? 'on' : ''}" data-v="${k}">${n.replace(/ \(.*\)/, '')}</button>`).join('')}</div></div>
    <div class="field"><span>Parking / garaż</span>${chips('parking', PARK_F)}</div>
  </div></div>
  <div class="card" id="of-list"></div>`;
  return [html, v => {
    const draw = () => {
      const [r0, r1] = rangeOf(f.metraz), ord = { nowe: 0, aktualne: 1, nieaktualne: 2 };
      const all = S.offers.map(o => [o, st(o)]);
      const rows = all.filter(([o, s]) => (!f.status || s === f.status) && (f.pokoje === '' || (f.pokoje === '3' ? o.pokoje >= 3 : o.pokoje === +f.pokoje)) && (!f.metraz || (o.m2 >= r0 && o.m2 < r1)) && (!f.dz || o.dzielnica === f.dz)
        && f.attrs.every(k => o.attrs && o.attrs[k] === 1) && (!f.parking || (o.parking && o.parking.stan === f.parking))).sort((a, b) => ord[a[1]] - ord[b[1]] || (b[0].ts || 0) - (a[0].ts || 0));
      const shown = rows.slice(0, f.lim);
      const row = ([o, s]) => {
        const title = esc([o.ulica, o.dzielnica].filter(Boolean).join(', ') || 'Oferta najmu'), pk = parkNote(o.parking);
        const meta = `${String(o.m2).replace('.', ',')} m² · ${o.pokoje} pok.${o.pietro != null ? ' · ' + (o.pietro === 0 ? 'parter' : o.pietro + '. p.') : ''}${o.czynsz ? ' · czynsz adm. ' + fmt(o.czynsz) + ' zł' : ''}`;
        const badges = `${s !== 'aktualne' ? `<i class="bd ${s}">${s}</i>` : ''}${pk ? `<i class="bd park">${esc(pk)}</i>` : ''}${o.flagi && o.flagi.length ? '<i class="bd warn">podejrzana</i>' : ''}`;
        const inner = `<div class="t"><b>${title}</b>${o.url ? '<span class="ext" aria-hidden="true">↗</span>' : ''}</div><div class="p">${fmt(o.cena)} zł</div><div class="m">${meta}</div><div class="b">${badges}</div>`;
        return `<div class="orow ${o.wlaczone === false ? 'dis' : ''}">${o.url ? `<a class="oin" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div class="oin">${inner}</div>`}<button type="button" class="otg" data-id="${o.id}" aria-label="${o.wlaczone === false ? 'Włącz ofertę do wycen' : 'Wyłącz ofertę z wycen'}">${o.wlaczone === false ? 'wyłączona' : 'w wycenach'}</button></div>`;
      };
      $('#of-list', v).innerHTML = S.offers.length ? `<div class="eyebrow">Pokazano ${fmt(shown.length)} z ${fmt(rows.length)} (w bazie ${fmt(S.offers.length)})</div>${shown.map(row).join('') || '<p class="small muted" style="margin:10px 0 0">Żadna oferta nie spełnia filtrów.</p>'}${rows.length > shown.length ? `<div class="gap"></div><button class="btn ghost" id="of-more">Pokaż więcej</button>` : ''}`
        : '<div class="empty"><b>Brak ofert</b><span>Dodaj oferty w zakładce Dane.</span></div>';
      $$('.otg', v).forEach(b => b.onclick = () => { const o = S.offers.find(x => x.id === b.dataset.id); o.wlaczone = o.wlaczone === false; save.offers(); draw(); });
      const more = $('#of-more', v); if (more) more.onclick = () => { f.lim += 60; draw(); };
    };
    $$('[data-of]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { f[g.dataset.of] = b.dataset.v; f.lim = 60; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); draw(); }));
    $$('[data-ofa] button', v).forEach(b => b.onclick = () => { const i = f.attrs.indexOf(b.dataset.v); i < 0 ? f.attrs.push(b.dataset.v) : f.attrs.splice(i, 1); b.classList.toggle('on', i < 0); f.lim = 60; draw(); });
    $('#of-dz', v).onchange = e => { f.dz = e.target.value; f.lim = 60; draw(); };
    draw();
  }];
}

/* ---------- DANE ---------- */
function viewDane() {
  const n = S.offers.length, fl = S.offers.filter(o => o.flagi && o.flagi.length).length, off = S.offers.filter(o => o.wlaczone === false).length;
  const meta = S.rcn?.meta;
  const html = head('Dane', 'Źródła i import') + safeBanner() + `
  <div class="card"><div class="eyebrow">Oferty najmu</div><div class="kv"><span>W bazie</span><b>${fmt(n)}</b></div><div class="kv"><span>Podejrzane (pominięte)</span><b>${fl}</b></div><div class="kv"><span>Wyłączone ręcznie</span><b>${off}</b></div>
    <div class="gap"></div><button class="btn" data-act="pdf">Wgraj PDF z ofertami</button><div class="gap"></div><button class="btn ghost" data-act="paste">Wklej tekst ofert</button>
    <input type="file" id="fpdf" accept="application/pdf" multiple hidden>
    <p class="tiny muted" style="margin:10px 0 0">W Safari: lista ofert → Udostępnij → Drukuj → pinch na podglądzie → Zapisz do Plików. Plik wgrywasz tutaj. Odczyt dzieje się na tym urządzeniu, bez internetu i bez AI.</p></div>
  <div class="card"><div class="eyebrow">Cechy ofert (z filtrów portalu)</div>${attrCard()}</div>
  <div class="card"><div class="eyebrow">Własne umowy najmu</div><p class="small muted" style="margin:0 0 10px">Prawdziwe umowy Twojego biura lub najmy, które znasz z pierwszej ręki. Mają największą wagę w wycenie i pozwalają zmierzyć standard, meble i budynek, których nie ma w ogłoszeniach.</p>
    ${(S.wlasne || []).map(w => `<button class="off" data-own="${w.id}"><div><b>${esc([w.ulica, w.dzielnica].filter(Boolean).join(', ') || 'Najem')}</b></div><div class="p">${fmt(w.cena)} zł</div><div class="m">${w.m2} m² · ${w.pokoje} pok.${w.rok ? ' · rok ' + w.rok : ''}${w.standard ? ' · ' + ({ remont: 'do remontu', dobry: 'dobry', wysoki: 'wysoki' })[w.standard] : ''}${w.meble === 'tak' ? ' · meble' : ''}</div><div class="m" style="text-align:right">${fmt(w.cena / w.m2)} zł/m²</div></button>`).join('')}
    <div class="gap"></div><button class="btn" data-act="own">Dodaj umowę najmu</button>
    ${(S.wlasne || []).length ? '<div class="gap"></div><button class="btn ghost" data-act="ownchk">Sprawdź, jak wycena trafia w moje umowy</button><div id="ownchk" style="margin-top:10px"></div>' : ''}</div>
  <div class="card"><div class="eyebrow">Transakcje (RCN)</div>${meta ? `<div class="kv"><span>Lokale (mieszkania, użytkowe, garaże): rekordów</span><b>${fmt(S.tx.length)}</b></div><div class="kv"><span>Domy, obiekty i grunty: transakcji</span><b>${fmt(S.inne.length)}</b></div><div class="kv"><span>Pobrano</span><b>${esc(meta.pobrano || '—')}</b></div><div class="kv"><span>Bez współrzędnych</span><b>${fmt((meta.bez_wspolrzednych ?? 0) + (S.rcnInne?.meta?.bez_wspolrzednych ?? 0))}</b></div>${katalogHTML()}${S.rcnInne ? '' : '<p class="tiny muted" style="margin:10px 0 0">Brak pliku z domami, obiektami i gruntami. Serwer przygotuje go przy najbliższym odświeżeniu; potem użyj „Sprawdź nowe dane teraz”.</p>'}` : '<p class="muted small" style="margin:0 0 10px">Brak danych. Wygeneruj plik skryptem na serwerze (tools/rcn_export.py) i wgraj poniżej.</p>'}
    ${S.ust.rcnUrl ? '<div class="gap"></div><button class="btn ghost" data-act="rcncheck">Sprawdź nowe dane teraz</button><p class="tiny muted" style="margin:8px 0 0">Aplikacja sama sprawdza nowe dane przy każdym otwarciu (serwer odświeża je codziennie w nocy) i pobiera je na wszystkie urządzenia.</p>' : ''}<div class="gap"></div><label class="field"><span>Adres pliku z serwera</span><input class="in" id="rurl" value="${esc(S.ust.rcnUrl)}" placeholder="https://…/rcn_lublin.json"></label>
    <button class="btn" data-act="rcnurl">Pobierz z serwera</button><div class="gap"></div><button class="btn ghost" data-act="rcnfile">Wczytaj plik JSON</button><input type="file" id="frcn" accept=".json,application/json" hidden></div>
  <div class="card"><div class="eyebrow">Oferty w bazie</div>${zebrania()}<div class="gap"></div><a class="btn ghost" href="#/oferty" style="display:block;text-align:center;text-decoration:none">Pokaż listę ofert (${fmt(n)})</a></div>
  <div class="card"><div class="eyebrow">Kopia zapasowa</div><p class="small muted" style="margin-top:0">Oferty, historia wycen i pamięć lat budowy (bez danych RCN).</p><div class="row"><button class="btn ghost" data-act="exp">Zapisz kopię</button><button class="btn ghost" data-act="imp">Przywróć</button></div><input type="file" id="fbak" accept=".json,application/json" hidden>
    <div class="gap"></div><button class="btn danger" data-act="clear">Usuń wszystkie oferty</button></div>`;
  return [html, v => {
    const pdfIn = $('#fpdf', v);
    $('[data-act="pdf"]', v).onclick = () => pdfIn.click();
    pdfIn.onchange = () => importPdfs([...pdfIn.files]);
    $('[data-act="paste"]', v).onclick = pasteSheet;
    $('[data-act="own"]', v).onclick = () => ownSheet(null);
    $$('[data-own]', v).forEach(b => b.onclick = () => ownSheet(b.dataset.own));
    const oc = $('[data-act="ownchk"]', v); if (oc) oc.onclick = () => { const box = $('#ownchk', v); box.innerHTML = '<p class="small muted" style="margin:0">Liczę…</p>'; setTimeout(() => { box.innerHTML = ownImpactHTML(); }, 30); };
    $('[data-act="rcnurl"]', v).onclick = async () => { const u = $('#rurl', v).value.trim(); if (!u) return toast('Wpisz adres pliku'); S.ust.rcnUrl = u; save.ust(); toast('Pobieram…'); try { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); await setRcn(await r.json(), true); try { const r2 = await fetch(innePath(u), { cache: 'no-store' }); if (r2.ok) await setRcnInne(await r2.json(), true); } catch {} toast(`Wczytano ${fmt(S.tx.length)} lokali${S.inne.length ? ' i ' + fmt(S.inne.length) + ' domów, obiektów i gruntów' : ''}`); render(); } catch (e) { toast('Nie udało się: ' + e.message); } };
    const rc = $('[data-act="rcncheck"]', v); if (rc) rc.onclick = () => checkRcn(true);
    const fr = $('#frcn', v); $('[data-act="rcnfile"]', v).onclick = () => fr.click(); fr.onchange = async () => { try { await setRcn(JSON.parse(await fr.files[0].text())); } catch (e) { toast('Błędny plik: ' + e.message); } };
    $('[data-act="exp"]', v).onclick = async () => { const blob = new Blob([JSON.stringify({ v: 1, offers: S.offers, wlasne: S.wlasne, budynki: S.budynki, wyceny: S.wyceny, teczki: S.teczki, ust: S.ust })], { type: 'application/json' }); await saveFile(blob, 'kopia-wycena-' + new Date().toISOString().slice(0, 10) + '.json'); };
    const fb = $('#fbak', v); $('[data-act="imp"]', v).onclick = () => fb.click();
    fb.onchange = async () => { try { const d = JSON.parse(await fb.files[0].text()); if (!Array.isArray(d.offers)) throw new Error('to nie jest kopia'); S.offers = d.offers; sync.allowMassDelete(); S.wlasne = d.wlasne || []; save.wlasne(); S.budynki = d.budynki || {}; S.wyceny = d.wyceny || []; if (d.teczki) { S.teczki = d.teczki; save.teczki(); } S.ust = { ...S.ust, ...(d.ust || {}) }; save.offers(); save.budynki(); save.wyceny(); save.ust(); toast('Przywrócono'); render(); } catch (e) { toast('Błąd: ' + e.message); } };
    $('[data-act="clear"]', v).onclick = () => { if (confirm(syncOn ? 'Usunąć wszystkie oferty z bazy? Zniknie też z serwera i z pozostałych urządzeń.' : 'Usunąć wszystkie oferty z bazy?')) { S.offers = []; sync.allowMassDelete(); save.offers(); render(); } };
  }];
}
async function setRcn(pack, quiet) {
  if (!pack || !Array.isArray(pack.cols) || !Array.isArray(pack.rows) || !pack.cols.includes('cena')) throw new Error('nieznany format');
  S.rcn = pack; setTx(); await store.set('rcn', pack);
  if (!quiet) { toast(`Wczytano ${fmt(S.tx.length)} transakcji`); render(); }
}
async function setRcnInne(pack, quiet) {
  if (!pack || !Array.isArray(pack.cols) || !Array.isArray(pack.rows) || !pack.cols.includes('nier')) throw new Error('nieznany format pliku domów i gruntów');
  S.rcnInne = pack; setTx(); await store.set('rcnInne', pack);
  if (!quiet) { toast(`Wczytano ${fmt(S.inne.length)} transakcji domów, obiektów i gruntów`); render(); }
}
const innePath = url => url.replace(/[^/]*$/, 'rcn_inne.json');
// Automatyczna aktualizacja RCN: serwer odświeża pliki codziennie i zapisuje mały rcn_meta.json z wersjami danych (mieszkania i lokale + domy, obiekty, grunty).
// Każde urządzenie sprawdza ten mały plik (przy starcie, po powrocie do aplikacji, co kilka godzin) i pobiera duże pliki tylko gdy wersja się zmieniła.
let rcnBusy = false;
async function checkRcn(force) {
  const url = S.ust.rcnUrl; if (!url || rcnBusy || S.safe) return;
  if (!force && S.rcn && S.rcnInne) { if (navigator.connection?.saveData) return; if (Date.now() - (await store.get('rcncheck', 0)) < 3 * 3600e3) return; }
  rcnBusy = true;
  try {
    const r = await fetch(url.replace(/[^/]*$/, 'rcn_meta.json'), { cache: 'no-store' });
    if (!r.ok) throw new Error('serwer nie ma jeszcze pliku z wersją danych (HTTP ' + r.status + ')');
    const m = await r.json(); await store.set('rcncheck', Date.now());
    const needA = !(S.rcn?.meta?.wersja && S.rcn.meta.wersja === m.wersja), needB = !!m.inne && S.rcnInne?.meta?.wersja !== m.inne.wersja;
    if (!needA && !needB) { if (force) toast('Dane RCN są aktualne'); return; }
    toast('Pobieram nowe dane RCN…');
    const before = S.tx.length + S.inne.length;
    if (needA) { const f = await fetch(url, { cache: 'no-store' }); if (!f.ok) throw new Error('HTTP ' + f.status); await setRcn(await f.json(), true); }
    if (needB) { const f = await fetch(innePath(url), { cache: 'no-store' }); if (!f.ok) throw new Error('domy i grunty: HTTP ' + f.status); await setRcnInne(await f.json(), true); }
    const d = S.tx.length + S.inne.length - before;
    toast(`Dane RCN zaktualizowane: ${fmt(S.rcn.meta.rekordow)} lokali${S.rcnInne ? ' + ' + fmt(S.rcnInne.meta.rekordow) + ' domów, obiektów i gruntów' : ''} (${d >= 0 ? '+' : ''}${fmt(d)} użytecznych)`);
    if (location.hash.replace(/^#\/?/, '').split('/')[0] === 'dane') render();
  } catch (e) { if (force) toast('RCN: ' + e.message); }
  finally { rcnBusy = false; }
}
function offerSummary(found) {
  const have = new Set(S.offers.map(offerKey)); const seen = new Set(); let neu = [], dup = 0;
  for (const r of found) { const k = offerKey(r); if (have.has(k) || seen.has(k)) { dup++; continue; } seen.add(k); neu.push(r); }
  return { neu, dup, flagged: neu.filter(r => r.flagi.length).length };
}
const importFilter = new Set();
function confirmImport(found, srcNote) {
  const { neu, dup, flagged } = offerSummary(found);
  importFilter.clear();
  openSheet(`<h3>Wynik odczytu</h3><p class="small muted">${esc(srcNote)}</p><div class="kv"><span>Odczytano ofert</span><b>${found.length}</b></div><div class="kv"><span>Nowych do dodania</span><b>${neu.length}</b></div><div class="kv"><span>Już w bazie (zostaną odświeżone) / powtórzone</span><b>${dup}</b></div><div class="kv"><span>Podejrzane (zostaną pominięte w wycenach)</span><b>${flagged}</b></div>
    <div class="field"><span>Czy ta lista była wyszukana z filtrem? (jeśli tak, zaznacz)</span><div class="chips" id="flt">${ATTRS.map(([k, n]) => `<button type="button" class="chip" data-v="${k}">${n}</button>`).join('')}</div></div>
    <label class="chk" style="display:flex;gap:10px;align-items:flex-start;margin:10px 0"><input type="checkbox" id="full"><span class="small">To pełny przegląd: wszystkie oferty najmu z portalu, bez filtra. Oferty z bazy, których tu nie ma, dostaną status „nieaktualne”.</span></label>
    <p class="tiny muted">Przy filtrze wszystkie oferty z tej listy dostają zaznaczoną cechę, a oferty z bazy z tego samego zebrania, których na liście nie ma, dostają jej brak. Dzięki temu aplikacja może zmierzyć, ile ta cecha jest warta.</p>
    <p class="tiny muted">To ceny ofertowe z ogłoszeń. Aplikacja zapisuje tylko dane techniczne (cena, metraż, pokoje, piętro, lokalizacja), bez zdjęć, opisów i danych kontaktowych.</p>
    <button class="btn" id="ok" ${found.length ? '' : 'disabled'}>Dodaj ${neu.length} ofert do bazy</button><div class="gap"></div><button class="btn ghost" id="no">Anuluj</button>`, p => {
    $('#no', p).onclick = closeSheet;
    const okb = $('#ok', p), lbl = () => { okb.disabled = !found.length; okb.textContent = importFilter.size ? `Oznacz oferty z listy${neu.length ? ' i dodaj ' + neu.length + ' nowych' : ''}` : `Dodaj ${neu.length} ofert do bazy`; };
    $$('#flt button', p).forEach(b => b.onclick = () => { const k = b.dataset.v; importFilter.has(k) ? importFilter.delete(k) : importFilter.add(k); b.classList.toggle('on', importFilter.has(k)); lbl(); });
    $('#ok', p).onclick = () => {
      const r = applyCollection(found, { pelne: $('#full', p).checked && !importFilter.size, attrs: [...importFilter] });
      closeSheet(); toast(`Dodano ${r.added}, odświeżono ${r.updated}`); render();
    };
  });
}
// nagłówek listy ma dwukropek („Mieszkania na wynajem: Lublin…”); linki w stopce strony go nie mają
const isSaleList = lines => lines.some(l => /^\s*(Mieszkania|Kawalerki|Domy) na sprzedaż:/i.test(l)) && !lines.some(l => /^\s*(Mieszkania|Kawalerki|Domy|Pokoje) na wynajem:/i.test(l));
async function importPdfs(files) {
  if (!files.length) return;
  openSheet(`<h3>Odczyt PDF</h3><p class="small muted" id="ps">Przygotowanie…</p><div class="prog"><i id="pb"></i></div>`);
  const all = []; let sale = false;
  try {
    for (let i = 0; i < files.length; i++) {
      const lines = await linesFromPdf(files[i], (pg, tot) => { $('#ps').textContent = `Plik ${i + 1}/${files.length}, strona ${pg}/${tot}`; $('#pb').style.width = ((i + pg / tot) / files.length * 100) + '%'; });
      if (isSaleList(lines)) sale = true;
      all.push(...offersFromLines(lines));
    }
  } catch (e) { closeSheet(); return toast('Nie udało się odczytać PDF: ' + e.message); }
  if (sale) { closeSheet(); return toast('To lista ofert sprzedaży. Tu importujemy tylko najem.'); }
  if (!all.length) { closeSheet(); return toast('Nie znaleziono ofert w tym pliku'); }
  confirmImport(all, `Odczytano ${files.length} plik(ów).`);
}
function attrCard() {
  const pool = S.offers.filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0), L = learnPremiums(pool);
  const pc = p => `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(0)}%`;
  const rows = ATTRS.map(([k, n]) => {
    const n1 = pool.filter(o => o.attrs && o.attrs[k] === 1).length, n0 = pool.filter(o => o.attrs && o.attrs[k] === 0).length, A = L.ok ? L.attr[k] : null;
    const st = A && A.sig ? `<b>${pc(A.pct)}</b> <small>(${pc(A.pctLo)} do ${pc(A.pctHi)})</small>` : A && A.supported ? '<b>brak wyraźnej różnicy</b>' : `<b>${n1 + n0 ? n1 + ' z, ' + n0 + ' bez' : 'brak danych'}</b>`;
    return `<div class="kv"><span>${n}</span>${st}</div>`;
  }).join('');
  return rows + `<p class="tiny muted" style="margin:10px 0 0">Aplikacja mierzy cechę, gdy ma co najmniej 15 ofert z nią i 15 bez niej. Jak oznaczyć: na portalu ustaw filtr (np. Klimatyzacja) i wyeksportuj listę najmu do PDF tak samo jak zwykle. Przy wgrywaniu zaznacz ten filtr. Najlepiej w tym samym dniu co zwykłe listy.</p>`;
}
// Jak wyceniłaby to mieszkanie aplikacja, gdyby nie znała tej umowy (sprawdzenie, czy własne dane zgadzają się z rynkiem ofert)
function ownCheck(w, excludeId) {
  const others = S.offers.concat((S.wlasne || []).filter(x => x.id !== excludeId).map(ownToOffer));
  if (others.length < 20) return null;
  const r = estimateRent(others, { tryb: 'najem', kat: 'mieszkanie', ulica: w.ulica || '', dzielnica: w.dzielnica || '', m2: w.m2, pokoje: w.pokoje, pietro: w.pietro ?? null, rok: w.rok || null, standard: w.standard || null, meble: w.meble || null, attrs: null });
  return r.ok ? { r, dev: (w.cena - r.total.mid) / r.total.mid, inR: w.cena >= r.total.lo && w.cena <= r.total.hi } : null;
}
const devTxt = c => `${c.dev >= 0 ? '+' : '−'}${Math.abs(c.dev * 100).toFixed(0)}%`;
function ownImpactHTML() {
  const rows = (S.wlasne || []).map(w => ({ w, c: ownCheck(w, w.id) })).filter(x => x.c);
  if (rows.length < 1) return '<p class="small muted" style="margin:0">Za mało danych do sprawdzenia (potrzebne co najmniej 20 ofert w bazie i jedna umowa).</p>';
  const ab = rows.map(x => Math.abs(x.c.dev)).sort((a, b) => a - b), medAbs = ab[Math.floor(ab.length / 2)], inR = rows.filter(x => x.c.inR).length, bias = rows.reduce((a, x) => a + x.c.dev, 0) / rows.length;
  return `<div class="kv"><span>Umów sprawdzonych</span><b>${rows.length}</b></div><div class="kv"><span>W przedziale wyceny</span><b>${inR} z ${rows.length}</b></div><div class="kv"><span>Typowa różnica (mediana)</span><b>${(medAbs * 100).toFixed(0)}%</b></div><div class="kv"><span>Średnio względem ofert</span><b>${devTxt({ dev: bias })}</b></div>
    <p class="tiny muted" style="margin:8px 0 0">Dla każdej umowy aplikacja wycenia to samo mieszkanie, NIE znając tej umowy, i porównuje z prawdziwym czynszem. ${bias < -0.04 ? 'Umowy wychodzą niżej niż oferty: ceny ofertowe są zawyżone względem faktycznych najmów.' : bias > 0.04 ? 'Umowy wychodzą wyżej niż oferty: aplikacja może zaniżać ten segment.' : 'Oferty i umowy są zgodne.'} ${rows.length < 8 ? 'Przy małej liczbie umów to tylko wskazówka.' : ''}</p>
    ${rows.map(x => `<div class="kv"><span>${esc([x.w.ulica, x.w.dzielnica].filter(Boolean).join(', ') || 'Najem')} · ${x.w.m2} m²</span><b>${fmt(x.w.cena)} zł <small style="color:${x.c.inR ? 'var(--ok)' : 'var(--warn)'}">${devTxt(x.c)}</small></b></div>`).join('')}`;
}
function ownSheet(id) {
  const w = id ? S.wlasne.find(x => x.id === id) : null, d = { standard: w?.standard || '', meble: w?.meble || '' };
  const chips = (k, items) => `<div class="chips" data-oc="${k}">${items.map(([v, n]) => `<button type="button" class="chip ${d[k] === v ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div>`;
  openSheet(`<h3>Umowa najmu</h3><p class="small muted">Czynsz najmu z umowy (bez czynszu administracyjnego i opłat). Bez danych osobowych.</p>
    <label class="field"><span>Ulica</span><input class="in" id="o-ul" list="o-dl" value="${esc(w?.ulica || '')}" placeholder="np. Granata"></label><datalist id="o-dl">${S.streets.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <label class="field"><span>Dzielnica (uzupełni się z ulicy)</span><input class="in" id="o-dz" value="${esc(w?.dzielnica || '')}"></label>
    <div class="grid2"><label class="field"><span>Powierzchnia (m²)</span><input class="in" id="o-m2" inputmode="decimal" value="${w?.m2 ?? ''}"></label><label class="field"><span>Rok budowy (opcj.)</span><input class="in" id="o-rok" inputmode="numeric" maxlength="4" value="${w?.rok ?? ''}"></label></div>
    <div class="grid2"><label class="field"><span>Pokoje</span><input class="in" id="o-pk" inputmode="numeric" value="${w?.pokoje ?? ''}"></label><label class="field"><span>Piętro (0 = parter)</span><input class="in" id="o-pi" inputmode="numeric" value="${w?.pietro ?? ''}"></label></div>
    <div class="field"><span>Standard</span>${chips('standard', [['', 'Nie wiem'], ['remont', 'Do remontu'], ['dobry', 'Dobry'], ['wysoki', 'Wysoki']])}</div>
    <div class="field"><span>Wyposażenie</span>${chips('meble', [['', 'Nie wiem'], ['tak', 'Umeblowane'], ['nie', 'Bez mebli']])}</div>
    <div class="grid2"><label class="field"><span>Czynsz najmu (zł)</span><input class="in" id="o-ce" inputmode="numeric" value="${w?.cena ?? ''}"></label><label class="field"><span>Czynsz adm. (opcj.)</span><input class="in" id="o-ca" inputmode="numeric" value="${w?.czynsz ?? ''}"></label></div>
    <div id="o-live" class="small muted" style="margin:4px 0 12px"></div>
    <button class="btn" id="o-ok">Zapisz</button>${w ? '' : '<div class="gap"></div><button class="btn ghost" id="o-ok2">Zapisz i dodaj kolejną</button>'}${w ? '<div class="gap"></div><button class="btn danger" id="o-del">Usuń tę umowę</button>' : ''}`, p => {
    $$('[data-oc]', p).forEach(g => $$('button', g).forEach(b => b.onclick = () => { d[g.dataset.oc] = b.dataset.v; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); }));
    const num = x => { const n = parseFloat(String($(x, p).value).replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : null; };
    $('#o-ul', p).onchange = () => { if (!$('#o-dz', p).value.trim()) { const inf = inferDistrict(allOffers(), S.tx, $('#o-ul', p).value.trim()); if (inf) $('#o-dz', p).value = inf.name; } };
    const live = () => {
      const m2 = num('#o-m2'), cena = num('#o-ce'), pk = num('#o-pk'), box = $('#o-live', p); if (!(m2 >= 10 && cena >= 200 && pk >= 1)) { box.textContent = ''; return; }
      let dz = $('#o-dz', p).value.trim(); const ul = $('#o-ul', p).value.trim(); if (!dz && ul) { const inf = inferDistrict(allOffers(), S.tx, ul); if (inf) dz = inf.name; }
      const c = ownCheck({ ulica: ul, dzielnica: dz, m2, pokoje: Math.round(pk), pietro: num('#o-pi'), rok: num('#o-rok'), standard: d.standard, meble: d.meble, cena }, w?.id);
      box.innerHTML = c ? `Bez tej umowy aplikacja wyceniłaby to mieszkanie na <b>${fmt(roundTo(c.r.total.lo, 10))}–${fmt(roundTo(c.r.total.hi, 10))} zł</b>. Twoja umowa: <b>${fmt(cena)} zł</b> (${devTxt(c)} od środka) ${c.inR ? '<span class="badge g">w przedziale</span>' : '<span class="badge">poza przedziałem</span>'}` : 'Za mało ofert w bazie, by porównać.';
    };
    let lt = null; $$('input', p).forEach(i => i.addEventListener('input', () => { clearTimeout(lt); lt = setTimeout(live, 600); })); $$('[data-oc] button', p).forEach(b => b.addEventListener('click', () => { clearTimeout(lt); lt = setTimeout(live, 300); })); if (w) setTimeout(live, 200);
    const saveOwn = again => {
      const m2 = num('#o-m2'), cena = num('#o-ce'), pk = num('#o-pk');
      if (!(m2 >= 10 && m2 <= 400)) return toast('Podaj powierzchnię (10–400 m²)'); if (!(cena >= 200 && cena <= 30000)) return toast('Podaj czynsz najmu (200–30000 zł)'); if (!(pk >= 1 && pk <= 10)) return toast('Podaj liczbę pokoi');
      const rok = num('#o-rok'); if (rok != null && !(rok >= 1700 && rok <= now() + 3)) return toast('Rok budowy wygląda błędnie');
      let dz = $('#o-dz', p).value.trim(), ul = $('#o-ul', p).value.trim();
      if (!dz && ul) { const inf = inferDistrict(allOffers(), S.tx, ul); if (inf) dz = inf.name; }
      const rec = { id: w?.id || uid(), ulica: ul, dzielnica: dz, m2, pokoje: Math.round(pk), pietro: num('#o-pi'), rok, standard: d.standard, meble: d.meble, cena: Math.round(cena), czynsz: num('#o-ca'), ts: w?.ts || Date.now() };
      if (w) Object.assign(w, rec); else S.wlasne.push(rec);
      save.wlasne(); closeSheet(); toast('Zapisano umowę'); render(); if (again) setTimeout(() => ownSheet(null), 350);
    };
    $('#o-ok', p).onclick = () => saveOwn(false); const ok2 = $('#o-ok2', p); if (ok2) ok2.onclick = () => saveOwn(true);
    const del = $('#o-del', p); if (del) del.onclick = () => { S.wlasne = S.wlasne.filter(x => x.id !== w.id); save.wlasne(); closeSheet(); render(); };
  });
}
function pasteSheet() {
  openSheet(`<h3>Wklej tekst ofert</h3><p class="small muted">Zaznacz całą stronę wyników (lista ofert najmu), skopiuj i wklej tutaj.</p><textarea class="in" id="tx" rows="8" placeholder="Wklej tekst…"></textarea><div class="gap"></div><button class="btn" id="go">Odczytaj</button>`, p => {
    $('#go', p).onclick = () => { const l = $('#tx', p).value.split('\n'); if (isSaleList(l)) return toast('To lista ofert sprzedaży. Tu importujemy tylko najem.'); const found = offersFromLines(l); if (!found.length) return toast('Nie znaleziono ofert'); confirmImport(found, 'Odczyt z wklejonego tekstu.'); };
  });
}

/* ---------- HISTORIA i TECZKI ---------- */
S.histTab = 'wyceny';
const tName = t => t.nazwa || [t.ulica, t.nr].filter(Boolean).join(' ') || 'Teczka';
const tWyceny = id => S.wyceny.filter(e => e.teczka === id).sort((a, b) => (a.ts || 0) - (b.ts || 0));
const midRange = e => { const r = e.res, st = e.subj.tryb === 'sprzedaz' ? 1000 : 10; return r && r.ok ? { lo: roundTo(r.total.lo, st), mid: roundTo((r.total.lo + r.total.hi) / 2, st), hi: roundTo(r.total.hi, st) } : null; };
const TSTAT = [['kontakt', 'Kontakt'], ['prezentacja', 'Prezentacja'], ['oferta', 'Oferta'], ['negocjacje', 'Negocjacje'], ['umowa', 'Umowa'], ['zamkniete', 'Zamknięte'], ['utracone', 'Utracone']];
const tStatName = k => (TSTAT.find(x => x[0] === k) || [0, ''])[1];
const todayStr = () => new Date().toLocaleDateString('sv-SE');
const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
// Przypomnienia: otwarte zadania, zbliżający się koniec umowy najmu (90 dni), wycena starsza niż 180 dni. Zamknięte i utracone teczki są pomijane.
function reminders() {
  const t0 = todayStr(), out = [];
  for (const t of S.teczki) {
    if (t.status === 'zamkniete' || t.status === 'utracone') continue;
    for (const z of t.zadania || []) if (!z.done) out.push({ tid: t.id, zid: z.id, kind: 'zadanie', txt: z.txt, due: z.due || '', over: !!z.due && z.due < t0, hot: !!z.due && z.due <= t0 });
    if (t.koniecUmowy) { const d = dayDiff(t.koniecUmowy, t0); if (d <= 90) out.push({ tid: t.id, kind: 'umowa', txt: d < 0 ? `Umowa najmu skończyła się ${-d} dni temu` : d === 0 ? 'Umowa najmu kończy się dziś' : `Umowa najmu kończy się za ${d} dni`, due: t.koniecUmowy, over: d < 0, hot: d <= 30 }); }
    const ws = tWyceny(t.id); if (ws.length) { const age = Math.floor((Date.now() - (ws[ws.length - 1].ts || 0)) / 864e5); if (age >= 180) out.push({ tid: t.id, kind: 'wycena', txt: `Ostatnia wycena ma ${Math.round(age / 30)} mies.: odśwież`, due: '', over: false, hot: false }); }
  }
  return out.sort((x, y) => (y.over - x.over) || ((x.due || '9999') < (y.due || '9999') ? -1 : 1));
}
const remindN = () => reminders().filter(r => r.hot || r.kind === 'wycena').length;
function findTeczka(subj) {
  if (!subj.ulica || !subj.nr) return null; const k = addrKey(subj.ulica, subj.nr);
  return S.teczki.find(t => t.ulica && t.nr && addrKey(t.ulica, t.nr) === k && Math.abs((+t.m2 || 0) - (+subj.m2 || 0)) <= 0.6) || null;
}
function newTeczka(subj, extra = {}) {
  const t = { id: uid(), nazwa: '', klient: '', ulica: subj?.ulica || '', nr: subj?.nr || '', dzielnica: subj?.dzielnica || '', kat: subj?.kat || 'mieszkanie', m2: subj?.m2 || '', pokoje: subj?.pokoje ?? '', pietro: subj?.pietro ?? '', rok: subj?.rok || '', notatki: '', ts: Date.now(), ...extra };
  S.teczki.unshift(t); save.teczki(); return t;
}
function viewHistoria() {
  const tab = S.histTab, SEG = [['wyceny', 'Wyceny'], ['teczki', 'Teczki'], ['zadania', 'Zadania' + (remindN() ? ' (' + remindN() + ')' : '')]];
  const seg = `<div class="seg" data-n="3" data-v="${Math.max(0, SEG.findIndex(x => x[0] === tab))}"><i></i>${SEG.map(([k, n]) => `<button data-ht="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'wyceny') {
    const items = S.wyceny.map(e => { const r = e.res, s = e.subj, sale = s.tryb === 'sprzedaz', st = sale ? 1000 : 10;
      const rng = r.ok ? `${fmt(roundTo(r.total.lo, st))} – ${fmt(roundTo(r.total.hi, st))} zł` : 'brak wyniku';
      let chk = ''; if (e.real && r.ok) { const inR = e.real >= r.total.lo && e.real <= r.total.hi, dv = (e.real - r.total.mid) / r.total.mid * 100; chk = `<span class="badge ${inR ? 'g' : ''}">${inR ? 'w przedziale' : (dv > 0 ? '+' : '') + dv.toFixed(0) + '% od mediany'}</span>`; }
      const tc = e.teczka ? S.teczki.find(t => t.id === e.teczka) : null;
      return `<a class="card" href="#/wynik/h/${e.id}" style="display:block;text-decoration:none;color:inherit"><div class="eyebrow">${sale ? 'Sprzedaż' : 'Najem'} · ${new Date(e.ts).toLocaleDateString('pl-PL')}${r.ok ? ' · pewność ' + LV[r.confidence.level].toLowerCase() : ''}</div><h3>${esc(rng)}</h3><div class="muted small">${esc(subjLine(s))}</div>${chk || tc ? `<div style="margin-top:8px">${chk}${tc ? `<span class="badge">teczka: ${esc(tName(tc))}</span>` : ''}</div>` : ''}</a>`; });
    body = items.length ? items.join('') + '<button class="btn danger" data-act="clr">Wyczyść historię</button>' : '<div class="empty"><b>Pusto</b>Zapisane wyceny pojawią się tutaj. Po zamknięciu transakcji wpisz cenę rzeczywistą, a zobaczysz, jak trafiał szacunek.</div>';
  } else if (tab === 'zadania') {
    const rs = reminders(), t0 = todayStr();
    body = rs.length ? `<div class="card">${rs.map(r => { const t = S.teczki.find(x => x.id === r.tid); return `<a class="off" href="#/teczka/${r.tid}" style="text-decoration:none;color:inherit"><div><b>${esc(r.txt)}</b></div><div class="p" style="color:${r.over ? 'var(--bad)' : r.hot ? 'var(--warn)' : 'var(--gold-l)'};font-size:13px">${r.due ? (r.over ? 'po terminie · ' : r.due === t0 ? 'dziś · ' : '') + new Date(r.due).toLocaleDateString('pl-PL') : ''}</div><div class="m">${esc(tName(t))}${t && t.status ? ' · ' + esc(tStatName(t.status)) : ''}</div></a>`; }).join('')}</div>` : '<div class="empty"><b>Brak zadań</b>Dodaj zadania w teczce nieruchomości. Tu zobaczysz też zbliżający się koniec umów najmu i wyceny, które warto odświeżyć.</div>';
  } else {
    const items = S.teczki.map(t => { const w = tWyceny(t.id), last = w.length ? midRange(w[w.length - 1]) : null, fo = (S.foto[t.id] || []).length;
      return `<a class="card" href="#/teczka/${t.id}" style="display:block;text-decoration:none;color:inherit"><div class="eyebrow">${t.kat && KAT[t.kat] ? KAT[t.kat].n : 'Nieruchomość'}${t.dzielnica ? ' · ' + esc(t.dzielnica) : ''}</div><h3>${esc(tName(t))}</h3><div class="muted small">${[t.m2 ? String(t.m2).replace('.', ',') + ' m²' : '', t.klient ? esc(t.klient) : ''].filter(Boolean).join(' · ') || '&nbsp;'}</div>
        <div style="margin-top:8px">${t.status ? `<span class="badge g">${esc(tStatName(t.status))}</span>` : ''}<span class="badge">${w.length} ${w.length === 1 ? 'wycena' : 'wycen'}</span>${last ? `<span class="badge g">ostatnia: ${fmt(last.mid)} zł${w[w.length - 1].subj.tryb === 'najem' ? '/mies.' : ''}</span>` : ''}${fo ? `<span class="badge">${fo} zdjęć</span>` : ''}</div></a>`; });
    body = (items.length ? items.join('') : '<div class="empty"><b>Brak teczek</b>Teczka zbiera w jednym miejscu wyceny jednej nieruchomości, notatki i zdjęcia oraz pokazuje, jak zmieniała się jej wartość.</div>') + '<button class="btn" data-act="newt">Nowa teczka</button>';
  }
  const html = head('Historia', tab === 'wyceny' ? 'Zapisane wyceny' : tab === 'teczki' ? 'Teczki nieruchomości' : 'Zadania i przypomnienia') + seg + body;
  return [html, v => {
    $$('[data-ht]', v).forEach(b => b.onclick = () => { S.histTab = b.dataset.ht; render(); });
    const c = $('[data-act="clr"]', v); if (c) c.onclick = () => { if (confirm('Usunąć całą historię wycen?')) { S.wyceny = []; save.wyceny(); render(); } };
    const n = $('[data-act="newt"]', v); if (n) n.onclick = () => { const t = newTeczka(null); go('#/teczka/' + t.id); };
  }];
}

/* ---- teczka nieruchomości ---- */
async function resizePhoto(file, max = 1280, q = 0.72) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
function viewTeczka(id) {
  const t = S.teczki.find(x => x.id === id);
  if (!t) return [head('Teczka', '', true) + '<div class="empty"><b>Nie znaleziono teczki</b>Mogła zostać usunięta na innym urządzeniu.</div>', v => $('[data-back]', v).onclick = () => go('#/historia')];
  const ws = tWyceny(id), fotos = S.foto[id] || [], hasBoth = ws.some(e => e.subj.tryb === 'sprzedaz') && ws.some(e => e.subj.tryb === 'najem');
  const field = (k, l, ph = '', mode = 'text') => `<label class="field"><span>${l}</span><input class="in" data-tk="${k}" inputmode="${mode}" value="${esc(t[k] ?? '')}" placeholder="${ph}"></label>`;
  const wl = ws.slice().reverse().map(e => { const m = midRange(e); return `<a class="off" href="#/wynik/h/${e.id}" style="text-decoration:none;color:inherit"><div><b>${e.subj.tryb === 'sprzedaz' ? 'Sprzedaż' : 'Najem'}</b></div><div class="p">${m ? fmt(m.mid) + ' zł' : 'brak wyniku'}</div><div class="m">${new Date(e.ts).toLocaleDateString('pl-PL')}${m ? ` · ${fmt(m.lo)}–${fmt(m.hi)} zł` : ''}${e.real ? ` · rzeczywista ${fmt(e.real)} zł` : ''}</div></a>`; }).join('');
  const html = head(esc(tName(t)), 'Teczka nieruchomości', true) + `
  <div class="card"><div class="eyebrow">Dane nieruchomości</div>${field('nazwa', 'Nazwa teczki (opcj.)', 'np. Granata 12/4')}${field('klient', 'Klient (opcj.)', 'imię lub nazwa')}
    <div class="grid2">${field('ulica', 'Ulica')}${field('nr', 'Numer')}</div>${field('dzielnica', 'Dzielnica')}
    <div class="grid2">${field('m2', 'Powierzchnia (m²)', '', 'decimal')}${field('pokoje', 'Pokoje', '', 'numeric')}</div><div class="grid2">${field('pietro', 'Piętro', '', 'numeric')}${field('rok', 'Rok budowy', '', 'numeric')}</div></div>
  <div class="card"><div class="eyebrow">Postępowanie</div><div class="chips" data-tst>${TSTAT.map(([k, n]) => `<button type="button" class="chip ${t.status === k ? 'on' : ''}" data-v="${k}">${n}</button>`).join('')}</div>
    <label class="field" style="margin-top:12px"><span>Koniec umowy najmu (opcj.)</span><input class="in" type="date" data-tk="koniecUmowy" value="${esc(t.koniecUmowy || '')}"></label>
    <div id="tzad"></div><div class="grid2" style="margin-top:8px"><input class="in" id="tz-txt" placeholder="Nowe zadanie, np. oddzwonić"><input class="in" id="tz-due" type="date"></div><div class="gap"></div><button class="btn ghost" id="tz-add">Dodaj zadanie</button></div>
  <div class="card"><div class="eyebrow">Wartość w czasie</div><div id="tchart"></div></div>
  <div class="card"><div class="eyebrow">Wyceny w teczce (${ws.length})</div>${wl || '<p class="small muted" style="margin:0">Brak. Zapisz wycenę do historii, a w jej wyniku wybierz „Dodaj do teczki”, albo wyceń tę nieruchomość stąd.</p>'}
    <div class="gap"></div><div class="row"><button class="btn" data-act="w-sale">Wyceń sprzedaż</button><button class="btn ghost" data-act="w-rent">Wyceń najem</button></div></div>
  <div class="card"><div class="eyebrow">Zdjęcia</div><div class="photos">${fotos.map((u, i) => `<button class="ph" data-ph="${i}" aria-label="Zdjęcie ${i + 1}"><img src="${u}" alt=""></button>`).join('')}</div>
    <div class="gap"></div><button class="btn ghost" data-act="addph">Dodaj zdjęcie</button><input type="file" id="tph" accept="image/*" multiple hidden>
    <p class="tiny muted" style="margin:8px 0 0">Zdjęcia są pomniejszane i zapisywane tylko na tym urządzeniu: nie synchronizują się z serwerem i nie trafiają do kopii zapasowej.</p></div>
  <div class="card"><div class="eyebrow">Notatki</div><textarea class="in" id="tnote" rows="6" placeholder="Rozmowy, ustalenia, stan lokalu…">${esc(t.notatki || '')}</textarea></div>
  <button class="btn danger" data-act="delt">Usuń teczkę</button>`;
  return [html, v => {
    $('[data-back]', v).onclick = () => go('#/historia');
    const touch = () => { t.ts = Date.now(); save.teczki(); };
    $$('[data-tk]', v).forEach(i => i.onchange = () => { const k = i.dataset.tk; let val = i.value.trim(); if (['m2'].includes(k)) val = val ? parseFloat(val.replace(',', '.')) || '' : ''; if (['pokoje', 'pietro', 'rok'].includes(k)) val = val === '' ? '' : (parseInt(val, 10) || 0); t[k] = val; touch(); if (k === 'ulica' && !t.dzielnica) { const inf = inferDistrict(allOffers(), S.tx, val); if (inf) { t.dzielnica = inf.name; $('[data-tk="dzielnica"]', v).value = inf.name; } } });
    $$('[data-tst] button', v).forEach(b => b.onclick = () => { t.status = t.status === b.dataset.v ? '' : b.dataset.v; $$('[data-tst] button', v).forEach(x => x.classList.toggle('on', x.dataset.v === t.status)); touch(); });
    const drawZ = () => { const z = t.zadania || [], t0 = todayStr(); $('#tzad', v).innerHTML = z.map(x => `<div class="kv" style="align-items:center"><button type="button" class="chip ${x.done ? 'on' : ''}" data-zd="${x.id}" aria-label="Zrobione" style="padding:4px 12px">${x.done ? '✓' : '○'}</button><span style="flex:1;margin:0 10px;${x.done ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(x.txt)}${x.due ? ` <small style="color:${!x.done && x.due < t0 ? 'var(--bad)' : 'var(--ash)'}">${new Date(x.due).toLocaleDateString('pl-PL')}</small>` : ''}</span><button type="button" data-zx="${x.id}" aria-label="Usuń" style="color:var(--ash)">✕</button></div>`).join('');
      $$('[data-zd]', v).forEach(b => b.onclick = () => { const x = z.find(q => q.id === b.dataset.zd); x.done = !x.done; touch(); drawZ(); });
      $$('[data-zx]', v).forEach(b => b.onclick = () => { t.zadania = z.filter(q => q.id !== b.dataset.zx); touch(); drawZ(); }); };
    drawZ();
    $('#tz-add', v).onclick = () => { const txt = $('#tz-txt', v).value.trim(); if (!txt) return toast('Wpisz treść zadania'); (t.zadania ||= []).push({ id: uid(), txt, due: $('#tz-due', v).value || '', done: false }); $('#tz-txt', v).value = ''; $('#tz-due', v).value = ''; touch(); drawZ(); };
    $('#tnote', v).oninput = e => { t.notatki = e.target.value; clearTimeout(viewTeczka.tm); viewTeczka.tm = setTimeout(touch, 700); };
    let mode = ws.length && ws[ws.length - 1].subj.tryb || 'sprzedaz';
    const drawChart = () => {
      const pts = ws.filter(e => e.subj.tryb === mode && midRange(e)).map(e => { const m = midRange(e); return { t: e.ts, label: new Date(e.ts).toLocaleDateString('pl-PL'), med: m.mid, p25: m.lo, p75: m.hi, n: null }; }), box = $('#tchart', v);
      const sw = hasBoth ? `<div class="chips" style="margin-bottom:8px">${[['sprzedaz', 'Sprzedaż'], ['najem', 'Najem']].map(([k, n]) => `<button type="button" class="chip ${mode === k ? 'on' : ''}" data-tm="${k}">${n}</button>`).join('')}</div>` : '';
      if (pts.length < 2) { box.innerHTML = sw + `<p class="small muted" style="margin:0">${pts.length ? 'Jedna wycena: ' + fmt(pts[0].med) + ' zł (' + fmt(pts[0].p25) + '–' + fmt(pts[0].p75) + '). ' : ''}Wykres pojawi się po drugiej wycenie tej nieruchomości (np. za kilka miesięcy).</p>`; }
      else box.innerHTML = sw + lineChart(pts, { unit: 'zł', label: 'Wartość nieruchomości w czasie', medLabel: 'środek przedziału', bandLabel: 'przedział' }) + '<p class="tiny muted" style="margin:8px 0 0">Środek przedziału z kolejnych wycen; pasmo to przedział z wyceny. Różnice mogą wynikać ze zmiany rynku, ale też z nowszych danych i poprawek metody.</p>';
      $$('[data-tm]', box).forEach(b => b.onclick = () => { mode = b.dataset.tm; drawChart(); }); bindCharts(box);
    };
    drawChart();
    const prefill = tryb => { Object.assign(S.form, { tryb, kat: t.kat || 'mieszkanie', ulica: t.ulica || '', nr: t.nr || '', dzielnica: t.dzielnica || '', m2: t.m2 ? String(t.m2) : '', pokoje: t.pokoje === '' ? S.form.pokoje : t.pokoje, pietro: t.pietro === '' ? null : t.pietro, rok: t.rok ? String(t.rok) : '' }); S.teczkaNext = t.id; go('#/wycena'); };
    $('[data-act="w-sale"]', v).onclick = () => prefill('sprzedaz'); $('[data-act="w-rent"]', v).onclick = () => prefill('najem');
    const tph = $('#tph', v); $('[data-act="addph"]', v).onclick = () => tph.click();
    tph.onchange = async () => { const list = (S.foto[id] || []).slice(); for (const f of [...tph.files]) { if (list.length >= 12) { toast('Najwyżej 12 zdjęć w teczce'); break; } try { list.push(await resizePhoto(f)); } catch { toast('Nie udało się wczytać zdjęcia'); } } S.foto[id] = list; await store.set('foto', S.foto); render(); };
    $$('[data-ph]', v).forEach(b => b.onclick = () => { const i = +b.dataset.ph; openSheet(`<img src="${fotos[i]}" alt="" style="width:100%;border-radius:14px"><div class="gap"></div><button class="btn danger" id="phdel">Usuń zdjęcie</button>`, p => { $('#phdel', p).onclick = async () => { S.foto[id] = fotos.filter((_, j) => j !== i); await store.set('foto', S.foto); closeSheet(); render(); }; }); });
    $('[data-act="delt"]', v).onclick = async () => { if (!confirm('Usunąć teczkę? Wyceny zostaną w historii, zdjęcia zostaną skasowane.')) return; S.wyceny.forEach(e => { if (e.teczka === id) delete e.teczka; }); save.wyceny(); S.teczki = S.teczki.filter(x => x.id !== id); save.teczki(); delete S.foto[id]; await store.set('foto', S.foto); go('#/historia'); };
  }];
}
function teczkaSheet(e) {
  const cur = e.teczka ? S.teczki.find(t => t.id === e.teczka) : null;
  openSheet(`<h3>Teczka nieruchomości</h3>${cur ? `<p class="small muted">Ta wycena jest w teczce: <b>${esc(tName(cur))}</b>.</p><a class="btn" href="#/teczka/${cur.id}" style="display:block;text-align:center;text-decoration:none">Otwórz teczkę</a><div class="gap"></div><button class="btn ghost" id="tc-un">Wyjmij z teczki</button><div class="gap"></div>` : ''}
    <button class="btn ${cur ? 'ghost' : ''}" id="tc-new">Nowa teczka z tej wyceny</button>
    ${S.teczki.filter(t => !cur || t.id !== cur.id).map(t => `<div class="gap"></div><button class="off" data-tc="${t.id}"><div><b>${esc(tName(t))}</b></div><div class="m">${[t.dzielnica, t.m2 ? t.m2 + ' m²' : ''].filter(Boolean).join(' · ')}</div></button>`).join('')}`, p => {
    const set = id => { e.teczka = id; save.wyceny(); closeSheet(); toast('Dodano do teczki'); render(); };
    $('#tc-new', p).onclick = () => { const t = newTeczka(e.subj); set(t.id); };
    $$('[data-tc]', p).forEach(b => b.onclick = () => set(b.dataset.tc));
    const un = $('#tc-un', p); if (un) un.onclick = () => { delete e.teczka; save.wyceny(); closeSheet(); render(); };
  });
}

/* ---------- USTAWIENIA ---------- */
function viewUst() {
  const u = S.ust, f = (k, l, ph) => `<label class="field"><span>${l}</span><input class="in" data-k="${k}" value="${esc(u[k])}" placeholder="${ph || ''}"></label>`;
  const html = head('Ustawienia', 'Dane w raporcie') + `<div class="card"><div class="eyebrow">Biuro (nagłówek raportu)</div>${f('biuro', 'Nazwa biura')}${f('haslo', 'Hasło')}${f('agent', 'Sporządził (imię i nazwisko)')}${f('tel', 'Telefon')}${f('email', 'E-mail')}${f('www', 'Strona www')}</div>
    <div class="card" id="synccard"><div class="eyebrow">Synchronizacja urządzeń</div><div id="syncbody"><p class="small muted" style="margin:0">Sprawdzam…</p></div></div>
    <div class="card"><div class="eyebrow">Dziennik błędów</div><div id="errlog"></div></div>
    <div class="card"><div class="eyebrow">O aplikacji</div><div class="kv"><span>Wersja</span><b>${VERSION}</b></div><div class="kv"><span>Dane</span><b>tylko na tym urządzeniu</b></div>
    <div class="gap"></div><button class="btn ghost" data-act="upd">Wymuś aktualizację aplikacji</button><p class="tiny muted" style="margin:8px 0 0">Pobiera najnowszą wersję. Twoje dane (oferty, RCN, historia) zostają.</p>
    <p class="small muted">Szacunek ma charakter orientacyjny i nie zastępuje wyceny rzeczoznawcy majątkowego. Wynik zawsze jest przedziałem z oceną pewności; cechy bez danych porównawczych nie zmieniają go.</p></div>`;
  return [html, v => {
    syncCard(v);
    { let l = []; try { l = JSON.parse(ls.get('am-errlog') || '[]'); } catch { } $('#errlog', v).innerHTML = l.length ? l.slice(0, 8).map(x => `<div class="kv"><span>${new Date(x.t).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(x.v || '')}</span><b style="white-space:normal;text-align:right;font-size:12.5px">${esc(x.k)}: ${esc(x.m)}</b></div>`).join('') + '<div class="gap"></div><button class="btn ghost" data-act="errclr">Wyczyść dziennik</button>' : '<p class="small muted" style="margin:0">Brak błędów. Gdy aplikacja się zawiesi lub zachowa dziwnie, ślad zostanie tutaj (przydatne na tablecie z Androidem).</p>'; const ec = $('[data-act="errclr"]', v); if (ec) ec.onclick = () => { ls.del('am-errlog'); render(); }; }
    $$('[data-k]', v).forEach(i => i.oninput = () => { S.ust[i.dataset.k] = i.value; save.ust(); });
    $('[data-act="upd"]', v).onclick = async () => {
      toast('Aktualizuję…');
      try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) { }
      location.reload();
    };
  }];
}

async function syncCard(v) {
  const box = $('#syncbody', v), cfg = await sync.config();
  const hint = '<p class="tiny muted" style="margin:10px 0 0">Dane (oferty, własne umowy, wyceny, ustawienia) są zapisywane na Twoim serwerze i widoczne na wszystkich połączonych urządzeniach. Dane RCN każde urządzenie pobiera osobno z serwera. Klucz jest tajny: nie wysyłaj go nikomu.</p>';
  if (!cfg) {
    box.innerHTML = `<p class="small muted" style="margin:0 0 12px">Połącz to urządzenie z serwerem, a telefon, tablet i komputer będą miały te same dane.</p>
      <label class="field"><span>Adres serwera</span><input class="in" id="sy-url" value="${esc(DEFAULT_URL)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <label class="field"><span>Klucz</span><input class="in" id="sy-key" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="wklej klucz z serwera"></label>
      <button class="btn" id="sy-go">Połącz i synchronizuj</button>
      <div class="gap"></div><label class="field"><span>Albo wklej kod połączenia z innego urządzenia</span><input class="in" id="sy-code" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="AMSYNC1:…"></label>
      <button class="btn ghost" id="sy-code-go">Użyj kodu</button>
      <div id="syncst" class="small" style="margin-top:12px"></div>${hint}`;
    const go = async (url, key) => { const st = $('#syncst', v); st.textContent = 'Łączę…'; try { await sync.connect(url, key); toast('Połączono'); render(); } catch (e) { st.dataset.s = 'error'; st.textContent = e.message; } };
    $('#sy-go', v).onclick = () => go($('#sy-url', v).value, $('#sy-key', v).value);
    $('#sy-code-go', v).onclick = () => { const c = decodeCode($('#sy-code', v).value); if (!c) return toast('To nie jest kod połączenia'); go(c.url, c.key); };
  } else {
    box.innerHTML = `<div class="kv"><span>Serwer</span><b style="white-space:normal;word-break:break-all">${esc(cfg.url.replace(/^https?:\/\//, ''))}</b></div>
      <div id="syncst" class="small" style="margin:10px 0 12px"></div>
      <button class="btn" id="sy-now">Synchronizuj teraz</button><div class="gap"></div>
      <button class="btn ghost" id="sy-copy">Skopiuj kod połączenia dla nowego urządzenia</button><div class="gap"></div>
      <button class="btn danger" id="sy-off">Odłącz to urządzenie</button>${hint}`;
    paintSync({ state: 'idle', ...sync.status() });
    $('#sy-now', v).onclick = async () => { await sync.run(); toast('Gotowe'); };
    $('#sy-copy', v).onclick = async () => { const code = encodeCode(cfg.url, cfg.key); try { await navigator.clipboard.writeText(code); toast('Skopiowano kod'); } catch { prompt('Skopiuj kod połączenia:', code); } };
    $('#sy-off', v).onclick = async () => { if (confirm('Odłączyć to urządzenie? Dane na tym urządzeniu zostają, na serwerze też.')) { await sync.disconnect(); render(); } };
  }
}


/* ---------- MAPA ---------- */
S.mapa = { mode: 'tx', kat: 'mieszkanie', rynek: '', lata: 3, pokoje: '', metraz: '' };
// Przedziały powierzchni dla filtra mapy (od włącznie do bez): klucz „a-b" lub „a+"
const rangeOf = k => { if (!k) return [0, 1e9]; const [a, b] = String(k).split(/[-+]/); return [+a, String(k).includes('+') ? 1e9 : +b]; };
const M2S = {
  mieszkanie: ['Metraż mieszkania (m²)', [['', 'Wszystkie'], ['0-20', 'do 20'], ['20-30', '20–30'], ['30-40', '30–40'], ['40-50', '40–50'], ['50+', 'powyżej 50']]],
  dom: ['Powierzchnia użytkowa budynku (m²)', [['', 'Wszystkie'], ['0-100', 'do 100'], ['100-150', '100–150'], ['150-200', '150–200'], ['200-300', '200–300'], ['300+', 'powyżej 300']]],
  dzialka: ['Powierzchnia działki (m²)', [['', 'Wszystkie'], ['0-600', 'do 600'], ['600-1000', '600–1000'], ['1000-2000', '1000–2000'], ['2000-5000', '2000–5000'], ['5000+', 'powyżej 5000']]],
  lokal: ['Powierzchnia lokalu (m²)', [['', 'Wszystkie'], ['0-30', 'do 30'], ['30-60', '30–60'], ['60-100', '60–100'], ['100-200', '100–200'], ['200+', 'powyżej 200']]],
  obiekt: ['Powierzchnia obiektu (m²)', [['', 'Wszystkie'], ['0-200', 'do 200'], ['200-500', '200–500'], ['500-1000', '500–1000'], ['1000-3000', '1000–3000'], ['3000+', 'powyżej 3000']]],
  garaz: ['Powierzchnia garażu (m²)', [['', 'Wszystkie'], ['0-15', 'do 15'], ['15-20', '15–20'], ['20-30', '20–30'], ['30+', 'powyżej 30']]],
};
let centersCache = null;
const centersOf = () => { if (!centersCache || centersCache.for !== S.tx) centersCache = { for: S.tx, map: streetCenters(S.tx) }; return centersCache.map; };
const legendHTML = (cls, unit) => cls.labels.length ? `<div class="legend">${cls.labels.map(l => `<span><i style="background:${l.c}"></i>${l.t}</span>`).join('')}</div><p class="tiny muted" style="margin:6px 0 0">${unit}</p>` : '';
async function resMap(el, r, v) {
  try {
    const ctl = await createMap(el, { center: r.subLL, zoom: 15 });
    if (!el.isConnected) { ctl.destroy(); return; }
    mapCtl = ctl;
    const comps = r.comps.filter(c => c.lat != null), cls = makeClasses(comps.map(c => c.pm2raw ?? c.pm2));
    const pts = ctl.dots(comps.map(c => ({ lat: c.lat, lon: c.lon, v: c.pm2raw ?? c.pm2, r: 3.5 + c.w * 6, c })), cls.color,
      it => `<b>${esc(it.c.opis || 'Transakcja')}</b><br>${fmt(it.c.cena)} zł · ${String(it.c.m2).replace('.', ',')} m²<br><b>${fmt(it.c.pm2raw ?? it.c.pm2)} zł/m²</b><br><span class="tiny">${it.c.data ? 'akt: ' + it.c.data : it.c.rok ? 'akt: ' + it.c.rok : ''}${it.c.sameBuilding ? ' · ten sam budynek' : ''} · waga ${Math.round(it.c.w * 100)}%</span>`);
    ctl.subject(r.subLL); ctl.fit([...pts, r.subLL]);
    const lg = $('#reslegend', v); if (lg) lg.innerHTML = legendHTML(cls, 'Cena za m² w porównaniach (zł).');
  } catch (e) { /* zostaje schemat */ }
}
function viewMapa() {
  const m = S.mapa, MODES = [['tx', 'Transakcje'], ['grid', 'Ceny okolic'], ['najem', 'Najem']];
  const chips = (key, opts) => `<div class="chips" data-mf="${key}">${opts.map(([val, n]) => `<button type="button" class="chip ${String(m[key]) === String(val) ? 'on' : ''}" data-v="${val}">${n}</button>`).join('')}</div>`;
  const metrazF = k => `<div class="field"><span>${M2S[k][0]}</span>${chips('metraz', M2S[k][1])}<p class="tiny muted" style="margin:6px 0 0">Przedział od wartości włącznie do kolejnej wyłącznie: np. „30–40” to od 30,0 do 39,9.</p></div>`;
  const filters = () => m.mode === 'najem'
    ? `<div class="field"><span>Liczba pokoi</span>${chips('pokoje', [['', 'Wszystkie'], ['1', '1 pokój'], ['2', '2 pokoje'], ['3', '3 i więcej']])}</div>${metrazF('mieszkanie')}`
    : `<div class="field"><span>Rodzaj nieruchomości</span>${chips('kat', KAT_ORDER.filter(k => k !== 'zabudowana').map(k => [k, KAT[k].n]))}</div>
      ${['mieszkanie', 'dom', 'obiekt', 'lokal'].includes(m.kat) ? `<div class="field"><span>Rynek</span>${chips('rynek', [['', 'Wszystkie'], ['wtorny', 'Wtórny'], ['pierwotny', 'Pierwotny']])}</div>` : ''}
      <div class="field"><span>Transakcje z ostatnich</span>${chips('lata', [[1, '1 roku'], [3, '3 lat'], [5, '5 lat'], [8, '8 lat']])}</div>${metrazF(m.kat)}`;
  const html = head('Mapa', 'Ceny i oferty w Lublinie') + safeBanner() + `
  <div class="seg" data-n="3" data-v="${MODES.findIndex(x => x[0] === m.mode)}"><i></i>${MODES.map(([k, n]) => `<button data-mode="${k}" class="${m.mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  <div class="card"><div id="mapfilters">${filters()}</div></div>
  <div class="card mapcard"><div class="mapbox" id="mapbox"><div class="empty">Ładuję mapę…</div></div><div id="maplegend" style="margin-top:10px"></div><button class="tilesw" id="tilesw" type="button"></button></div>
  <div class="card"><div id="mapstat" class="small muted"></div></div>`;
  return [html, async v => {
    let ctl = null, subj = S.last.sprzedaz?.res?.ok && (S.last.sprzedaz.subj.kat || 'mieszkanie') === 'mieszkanie' ? S.last.sprzedaz.res.subLL : null;
    const stat = t => { $('#mapstat', v).innerHTML = t; };
    const draw = fit => {
      ctl.clear(); let pts = [], cls, unit = '';
      if (m.mode === 'najem') {
        const [r0, r1] = rangeOf(m.metraz), offers = allOffers().filter(o => o.wlaczone !== false && !(o.flagi && o.flagi.length) && o.m2 > 0 && o.cena > 0 && (m.pokoje === '' || (m.pokoje === '3' ? o.pokoje >= 3 : o.pokoje === +m.pokoje)) && o.m2 >= r0 && o.m2 < r1);
        if (!S.tx.length) { $('#maplegend', v).innerHTML = ''; return stat('Do ustawienia ofert na mapie potrzebne są dane RCN: środek ulicy wyliczamy z pozycji transakcji. Pobierz je w zakładce <b>Dane</b>.'); }
        const { placed, none } = placeOffers(offers, centersOf());
        cls = makeClasses(placed.map(p => p.o.cena / p.o.m2)); unit = 'Czynsz najmu za m² miesięcznie (zł). Pełny punkt: środek ulicy; pusta obwódka: środek dzielnicy (przybliżenie).';
        pts = ctl.dots(placed.map(p => ({ lat: p.lat, lon: p.lon, v: p.o.cena / p.o.m2, approx: p.approx, o: p.o, r: 5 })), cls.color, it => popupOffer(it.o, it.approx));
        const md = median(placed.map(p => p.o.cena / p.o.m2));
        stat(placed.length ? `Na mapie: <b>${fmt(placed.length)}</b> z ${fmt(offers.length)} ofert najmu, mediana <b>${fmt(md)} zł/m²</b> miesięcznie. ${fmt(placed.filter(p => p.approx).length)} ofert ma położenie przybliżone do dzielnicy${none ? `, ${fmt(none)} nie ma ani znanej ulicy, ani dzielnicy` : ''}. Położenie ofert to środek ulicy, nie adres.` : 'Brak ofert z rozpoznanym położeniem. Dodaj oferty w zakładce <b>Dane</b>.');
      } else {
        if (!S.pool.length) { $('#maplegend', v).innerHTML = ''; return stat('Brak danych RCN. Pobierz je w zakładce <b>Dane</b>.'); }
        const [r0, r1] = rangeOf(m.metraz), minN = m.kat === 'mieszkanie' ? 5 : 3;
        const sales = usableSales(S.pool, { years: +m.lata, rynek: ['mieszkanie', 'dom', 'obiekt', 'lokal'].includes(m.kat) ? m.rynek : '', m2min: r0, m2max: r1, kat: m.kat });
        if (m.mode === 'tx') {
          cls = makeClasses(sales.map(s => s.pm2)); unit = 'Cena transakcyjna za m² (zł) z aktów notarialnych.';
          pts = ctl.dots(sales.map(s => ({ ...s, v: s.pm2 })), cls.color, popupSale);
          stat(!sales.length ? `Brak transakcji z kategorii „${KAT[m.kat].n}” dla tych filtrów. Poszerz okres albo przedział powierzchni.` : `Na mapie: <b>${fmt(sales.length)}</b> transakcji (${KAT[m.kat].m}), mediana <b>${fmt(median(sales.map(s => s.pm2)) || 0)} zł/m²</b>. Każdy punkt to jedna sprzedaż; dotknij, aby zobaczyć szczegóły.`);
        } else {
          const cells = buildGrid(sales, minN); cls = makeClasses(cells.map(c => c.med)); unit = `Mediana ceny za m² (zł) w kwadracie ok. 500 × 500 m. Pokazane tylko kwadraty z min. ${minN} transakcjami.`;
          ctl.cells(cells, cls.color, c => `<b>${fmt(c.med)} zł/m²</b> (mediana)<br>środkowe 50%: ${fmt(c.p25)}–${fmt(c.p75)} zł/m²<br><span class="tiny">${c.n} transakcji w tym kwadracie</span>`);
          pts = cells.flatMap(c => c.bounds);
          stat(`<b>${fmt(cells.length)}</b> kwadratów z min. ${minN} transakcjami (z ${fmt(sales.length)} transakcji, ${KAT[m.kat].m}). Mediana ceny w kwadracie jest wskazówką, nie wyceną: różni się ${m.kat === 'dzialka' ? 'z przeznaczeniem i wielkością działki' : 'ze standardem i wielkością'}.`);
        }
      }
      $('#maplegend', v).innerHTML = legendHTML(cls, unit);
      { const ls = S.last.sprzedaz; const sj = m.mode !== 'najem' && ls?.res?.ok && (ls.subj.kat || 'mieszkanie') === m.kat ? ls.res.subLL : m.mode === 'najem' ? subj : null; ctl.subject(sj, 'Ostatnio wyceniana nieruchomość'); }
      if (fit && pts.length) ctl.fit(pts);
    };
    const redrawFilters = () => { $('#mapfilters', v).innerHTML = filters(); bindFilters(); };
    const bindFilters = () => $$('[data-mf]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { m[g.dataset.mf] = b.dataset.v; if (g.dataset.mf === 'kat') { m.metraz = ''; m.rynek = ''; redrawFilters(); draw(true); return; } $$('button', g).forEach(x => x.classList.toggle('on', x === b)); draw(false); }));
    $$('.seg button', v).forEach(b => b.onclick = () => { m.mode = b.dataset.mode; const sg = $('.seg', v); sg.dataset.v = MODES.findIndex(x => x[0] === m.mode); $$('button', sg).forEach(x => x.classList.toggle('on', x === b)); redrawFilters(); draw(true); });
    const tilesBtn = $('#tilesw', v), applyTiles = () => { const light = ls.get('am-tiles') === 'light'; $('#mapbox', v).classList.toggle('light-tiles', light); tilesBtn.textContent = light ? 'Podkład mapy: jasny (zmień na ciemny)' : 'Podkład mapy: ciemny (zmień na jasny)'; };
    tilesBtn.onclick = () => { ls.set('am-tiles', ls.get('am-tiles') === 'light' ? 'dark' : 'light'); applyTiles(); }; applyTiles();
    bindFilters();
    try { ctl = await createMap($('#mapbox', v)); } catch (e) { $('#mapbox', v).innerHTML = `<div class="empty"><b>Mapa niedostępna</b>${esc(e.message)}</div>`; return; }
    if (!$('#mapbox', v).isConnected) { ctl.destroy(); return; }
    mapCtl = ctl; draw(true);
  }];
}

/* ---------- RYNEK (wykresy: trend cen i rentowność) ---------- */
S.rynek = { kat: 'mieszkanie', rynek: '', metraz: '', ulica: '', dzielnica: '', promien: 1.5 };
const plPct = (x, d = 1) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d).replace('.', ',') + '%';
let rynekDz = null;
function viewRynek() {
  const m = S.rynek, chips = (key, opts) => `<div class="chips" data-rf="${key}">${opts.map(([val, n]) => `<button type="button" class="chip ${String(m[key]) === String(val) ? 'on' : ''}" data-v="${val}">${n}</button>`).join('')}</div>`;
  const html = head('Rynek', 'Jak zmieniają się ceny i ile daje najem') + safeBanner() + `
  <div class="card"><div class="eyebrow">Trend ceny za m²</div>
    <div class="field"><span>Rodzaj nieruchomości</span>${chips('kat', KAT_ORDER.filter(k => ['mieszkanie', 'dom', 'lokal', 'garaz'].includes(k)).map(k => [k, KAT[k].n]))}</div>
    <div class="field" id="rf-rynek"></div><div class="field" id="rf-metraz"></div>
    <label class="field"><span>Dzielnica (opcjonalnie)</span><select class="in" id="rf-dz"><option value="">Cały Lublin</option>${[...new Set(allOffers().map(o => o.dzielnica).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pl')).map(x => `<option value="${esc(x)}"${normDz(x) === normDz(m.dzielnica) ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    <label class="field"><span>Ulica (opcjonalnie: liczymy wokół niej)</span><input class="in" id="rf-ul" value="${esc(m.ulica)}" placeholder="całe miasto" autocomplete="off" autocapitalize="words"></label>
    <div class="field" id="rf-r"></div>
    <div id="rtrend" style="margin-top:6px"></div></div>
  <div class="card"><div class="eyebrow">Rentowność najmu w dzielnicach</div><div id="ryield"></div></div>
  <div class="card"><div class="eyebrow">Czas ekspozycji ofert najmu</div><div id="rexp"></div></div>
  <a class="btn" href="#/kalkulator" style="display:block;text-align:center;text-decoration:none">Kalkulator inwestycyjny (zwrot netto)</a>`;
  return [html, v => {
    const paintFilters = () => {
      const f = m.kat === 'mieszkanie' || m.kat === 'dom' || m.kat === 'lokal';
      $('#rf-rynek', v).innerHTML = f ? `<span>Rynek</span>${chips('rynek', [['', 'Wszystkie'], ['wtorny', 'Wtórny'], ['pierwotny', 'Pierwotny']])}` : '';
      $('#rf-metraz', v).innerHTML = `<span>${M2S[m.kat][0]}</span>${chips('metraz', M2S[m.kat][1])}`;
      $('#rf-r', v).innerHTML = m.ulica ? `<span>Promień wokół ulicy</span>${chips('promien', [[0.7, '0,7 km'], [1.5, '1,5 km'], [3, '3 km']])}` : '';
      $$('[data-rf]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { m[g.dataset.rf] = b.dataset.v; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); if (g.dataset.rf === 'kat') { m.metraz = ''; m.rynek = ''; paintFilters(); } drawTrend(); }));
    };
    const center = () => {
      if (!m.ulica) return null; const k = normStreet(m.ulica), mine = S.pool.filter(t => t.lat != null && normStreet(t.ulica) === k);
      return mine.length >= 2 ? [mine.reduce((a, t) => a + t.lat, 0) / mine.length, mine.reduce((a, t) => a + t.lon, 0) / mine.length] : null;
    };
    const drawTrend = () => {
      const box = $('#rtrend', v);
      if (!S.pool.length) { box.innerHTML = '<p class="small muted" style="margin:0">Brak danych RCN. Pobierz je w zakładce <b>Dane</b>.</p>'; return; }
      const [r0, r1] = rangeOf(m.metraz), c = center();
      if (m.ulica && !c) { box.innerHTML = `<p class="small muted" style="margin:0">Nie znam położenia ulicy „${esc(m.ulica)}” (za mało transakcji RCN przy tej ulicy). Wybierz ulicę z listy albo wyczyść pole.</p>`; return; }
      let pred = null;
      if (m.dzielnica) {
        const key = S.offers.length + '|' + (S.wlasne || []).length;
        if (!rynekDz || rynekDz.for !== S.tx || rynekDz.key !== key) rynekDz = { for: S.tx, key, fn: districtAssigner(allOffers(), S.tx) };
        const dn = normDz(m.dzielnica); if (!rynekDz.fn.known) { box.innerHTML = '<p class="small muted" style="margin:0">Za mało ulic ze znaną dzielnicą w ofertach, by przypisać dzielnice transakcjom. Dodaj oferty z ulicą i dzielnicą.</p>'; return; }
        pred = s => rynekDz.fn(s.lat, s.lon) === dn;
      }
      const T = trendSeries(S.pool, { pred, kat: m.kat, rynek: ['mieszkanie', 'dom', 'lokal'].includes(m.kat) ? m.rynek : '', m2min: r0, m2max: r1, center: c, radiusKm: c ? +m.promien : null, years: 8 });
      if (!T.ok) { box.innerHTML = `<p class="small muted" style="margin:0">${esc(T.reason)}</p>`; return; }
      const last = T.points[T.points.length - 1], first = T.points[0];
      box.innerHTML = `<div class="stats" style="margin:0 0 10px"><div class="stat"><b>${fmt(last.med)}</b><span>zł/m², ostatni okres</span></div>
        <div class="stat"><b>${T.yoy ? plPct(T.yoy.pct) : '—'}</b><span>rok do roku</span></div><div class="stat"><b>${fmt(T.n)}</b><span>transakcji</span></div></div>
        ${lineChart(T.points, { label: 'Mediana ceny za m² w czasie' })}
        <p class="tiny muted" style="margin:8px 0 0">Linia: mediana ceny transakcyjnej za m² (akty notarialne, RCN) w okresach ${T.step === 12 ? 'rocznych' : T.step === 6 ? 'półrocznych' : 'kwartalnych'}; pasmo: środkowe 50% transakcji. Pokazane tylko okresy z co najmniej 8 transakcjami. ${first.label} → ${last.label}: ${plPct((last.med / first.med - 1) * 100, 0)}.${T.yoy ? ` Rok do roku: mediana z ostatnich 12 miesięcy (${T.yoy.na} transakcji) wobec poprzednich 12 (${T.yoy.nb}).` : ' Rok do roku: za mało transakcji w którymś roku.'} Ceny zmieniają się też ze standardem i metrażem, więc to wskazówka o rynku, nie wycena.</p>`;
      bindCharts(box);
    };
    const drawYield = () => {
      const box = $('#ryield', v);
      if (!S.tx.length) { box.innerHTML = '<p class="small muted" style="margin:0">Brak danych RCN. Pobierz je w zakładce <b>Dane</b>.</p>'; return; }
      const Y = yieldByDistrict(allOffers(), S.tx);
      if (!Y.ok) { box.innerHTML = `<p class="small muted" style="margin:0">${esc(Y.reason)}</p>`; return; }
      box.innerHTML = `<div class="stats" style="margin:0 0 10px"><div class="stat"><b>${Y.city.y.toFixed(1).replace('.', ',')}%</b><span>całe miasto, brutto rocznie</span></div><div class="stat"><b>${Y.rows[0].name}</b><span>najwyższa: ${Y.rows[0].y.toFixed(1).replace('.', ',')}%</span></div><div class="stat"><b>${Y.rows[Y.rows.length - 1].name}</b><span>najniższa: ${Y.rows[Y.rows.length - 1].y.toFixed(1).replace('.', ',')}%</span></div></div>
        ${barChart(Y.rows.map(r => ({ name: r.name, y: r.y, yLo: r.yLo, yHi: r.yHi, sub: `czynsz ${fmt(r.rent)} zł/m² · cena ${fmt(r.sale)} zł/m² · ${r.nr} ofert, ${r.ns} transakcji` })), { ref: Y.city.y, label: 'Rentowność brutto w dzielnicach' })}
        <p class="tiny muted" style="margin:8px 0 0">Roczny czynsz (mediana ofert, bez opłat administracyjnych) do mediany ceny transakcyjnej tego samego metrażu (${Y.range[0]}–${Y.range[1]} m², transakcje z ostatnich ${String(Y.windowYears).replace('.', ',')} roku/lat). Wąs: środkowe 50% czynszów. To rentowność brutto z cen ofertowych: bez podatku, kosztów, remontów i pustostanów; rzeczywisty zwrot jest niższy. Dzielnice transakcjom przypisano po najbliższej ulicy ze znaną dzielnicą (do 2,5 km); pokazane tylko dzielnice z min. 5 ofertami i 30 transakcjami.</p>`;
    };
    const drawExp = () => {
      const box = $('#rexp', v), X = exposure(S.offers, S.ust.zebrania || []);
      if (!X.ok) { box.innerHTML = `<p class="small muted" style="margin:0">${esc(X.reason)}</p><p class="tiny muted" style="margin:8px 0 0">Od tej wersji aplikacja zapamiętuje też zmiany cen ofert między zebraniami, więc po kilku tygodniach pokaże, ile ofert tanieje i o ile.</p>`; return; }
      const d = X.days;
      box.innerHTML = `<div class="stats" style="margin:0 0 10px"><div class="stat"><b>${d ? Math.round(d.med) + ' dni' : '—'}</b><span>typowy czas do zniknięcia oferty</span></div><div class="stat"><b>${X.nGone}</b><span>ofert, które zniknęły</span></div><div class="stat"><b>${X.nChanged ? Math.round(X.nCut / X.nChanged * 100) + '%' : '—'}</b><span>ofert ze zmianą ceny, które staniały</span></div></div>
        <p class="tiny muted" style="margin:0">${d ? `Połowa ofert znikała w ciągu ${Math.round(d.med)} dni (środkowe 50%: ${Math.round(d.p25)}–${Math.round(d.p75)} dni).` : 'Za mało zniknętych ofert (potrzeba co najmniej 10), by podać czas.'} Oferta „znikła”, gdy nie było jej w ostatnim pełnym zebraniu; dokładność to odstęp między zebraniami (${X.spanDays} dni, ${X.collections} zebrań). Zniknięcie oferty nie zawsze oznacza wynajem.${X.cutMed != null ? ` Mediana obniżki: ${(X.cutMed * 100).toFixed(1).replace('.', ',')}%.` : ''}</p>`;
    };
    paintFilters(); drawTrend(); drawYield(); drawExp();
    const dzI = $('#rf-dz', v); dzI.onchange = () => { m.dzielnica = dzI.value; drawTrend(); };
    const ul = $('#rf-ul', v); suggest(ul, S.streets); ul.onchange = () => { m.ulica = ul.value.trim(); paintFilters(); drawTrend(); };
  }];
}

/* ---------- KALKULATOR INWESTYCYJNY ---------- */
try { S.invest = JSON.parse(ls.get('am-invest') || 'null') || {}; } catch { S.invest = {}; }
S.invest = { rynek: 'wtorny', podatek: 'ryczalt', pustostan: 1, ...S.invest };
const zl = n => fmt(n) + ' zł', pct1 = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(1).replace('.', ',') + '%';
function viewKalkulator() {
  const I = S.invest, f = (k, l, ph = '', hint = '') => `<label class="field"><span>${l}</span><input class="in" data-iv="${k}" inputmode="decimal" value="${I[k] ?? ''}" placeholder="${ph}">${hint ? `<small class="tiny muted">${hint}</small>` : ''}</label>`;
  const ls1 = S.last.sprzedaz?.res?.ok ? S.last.sprzedaz : null, ln = S.last.najem?.res?.ok ? S.last.najem : null;
  const html = head('Kalkulator', 'Zwrot z inwestycji w najem', true) + `
  ${ls1 || ln ? `<div class="card"><div class="eyebrow">Z ostatnich wycen</div><div class="row">${ls1 ? `<button class="btn ghost" data-act="from-s">Cena: ${fmt(roundTo(ls1.res.total.mid, 1000))} zł</button>` : ''}${ln ? `<button class="btn ghost" data-act="from-n">Czynsz: ${fmt(roundTo(ln.res.total.mid, 10))} zł</button>` : ''}</div></div>` : ''}
  <div class="card"><div class="eyebrow">Zakup</div>${f('cena', 'Cena zakupu (zł)', 'np. 500000')}
    <div class="field"><span>Rynek (od tego zależy PCC)</span><div class="chips" data-ic="rynek">${[['wtorny', 'Wtórny (PCC 2%)'], ['pierwotny', 'Pierwotny (bez PCC)']].map(([v, n]) => `<button type="button" class="chip ${I.rynek === v ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div></div>
    ${f('pcc', 'PCC (zł, opcj.)', 'liczone automatycznie', 'Zostaw puste: 2% ceny na rynku wtórnym, 0 na pierwotnym.')}${f('kosztyInne', 'Notariusz, wpisy, prowizja (zł)', '0', 'Wpisz własne kwoty: nie zakładam żadnych stawek.')}${f('remont', 'Remont i wyposażenie (zł)', '0')}</div>
  <div class="card"><div class="eyebrow">Najem</div>${f('czynsz', 'Czynsz miesięczny (zł)', 'np. 2800', 'Bez opłat administracyjnych płaconych przez najemcę.')}${f('pustostan', 'Pustostany (miesięcy w roku)', '1')}${f('oplaty', 'Koszty właściciela miesięcznie (zł)', '0', 'Fundusz remontowy, ubezpieczenie, drobne naprawy itp.')}${f('zarzad', 'Zarządzanie (% przychodu)', '0')}</div>
  <div class="card"><div class="eyebrow">Podatek (orientacyjnie)</div><div class="chips" data-ic="podatek">${Object.entries(TAX).map(([k, t]) => `<button type="button" class="chip ${I.podatek === k ? 'on' : ''}" data-v="${k}">${k === 'ryczalt' ? 'Ryczałt' : k === 'skala' ? 'Skala' : 'Liniowy'}</button>`).join('')}</div>
    <p class="tiny muted" id="taxnote" style="margin:8px 0 0"></p></div>
  <div class="card"><div class="eyebrow">Kredyt (opcjonalnie)</div>${f('wklad', 'Wkład własny (% ceny)', 'puste = bez kredytu')}${f('oproc', 'Oprocentowanie (% rocznie)', '')}${f('lata', 'Okres (lata)', '25')}</div>
  <div id="ires"></div>`;
  return [html, v => {
    $('[data-back]', v).onclick = () => history.length > 1 ? history.back() : go('#/rynek');
    const num = s => { const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : ''; };
    const calc = () => {
      ls.set('am-invest', JSON.stringify(I)); $('#taxnote', v).textContent = TAX[I.podatek].n + '. Bez składki zdrowotnej, ulg i kwoty wolnej; to wskazówka, nie porada podatkowa.';
      const r = investCalc(I), box = $('#ires', v);
      if (!r.ok) { box.innerHTML = `<div class="card"><p class="small muted" style="margin:0">${r.reason}</p></div>`; return; }
      const sv = sensitivity(I);
      box.innerHTML = `<div class="card hero"><div class="lbl">Zwrot netto po podatku</div><div class="big gold">${pct1(r.netPost)}</div><div class="sub">rocznie od całego poniesionego kosztu ${zl(r.koszt)}</div></div>
      <div class="stats"><div class="stat"><b>${pct1(r.gross)}</b><span>brutto (czynsz / cena)</span></div><div class="stat"><b>${pct1(r.netPre)}</b><span>netto przed podatkiem</span></div><div class="stat"><b>${r.payback ? r.payback.toFixed(1).replace('.', ',') : '—'}</b><span>lat do zwrotu</span></div></div>
      <div class="card"><div class="eyebrow">Rok w liczbach</div><div class="kv"><span>Przychód (czynsz za ${12 - (I.pustostan === '' ? 1 : I.pustostan)} mies.)</span><b>${zl(r.rev)}</b></div><div class="kv"><span>Koszty właściciela i zarządzanie</span><b>−${zl(r.opex)}</b></div><div class="kv"><span>Podatek</span><b>−${zl(r.tax)}</b></div><div class="kv"><span>Zysk po podatku</span><b>${zl(r.taxless)}</b></div>
        ${r.loan ? `<div class="kv"><span>Rata kredytu (${zl(r.rata)} mies.)</span><b>−${zl(r.rata * 12)}</b></div><div class="kv"><span>Przepływ gotówki rocznie</span><b style="color:${r.cf >= 0 ? 'var(--ok)' : 'var(--bad)'}">${r.cf >= 0 ? '' : '−'}${zl(Math.abs(r.cf))}</b></div><div class="kv"><span>Przepływ miesięcznie</span><b style="color:${r.cf >= 0 ? 'var(--ok)' : 'var(--bad)'}">${r.cf >= 0 ? '' : '−'}${zl(Math.abs(r.cfMies))}</b></div><div class="kv"><span>Własny kapitał</span><b>${zl(r.equity)}</b></div><div class="kv"><span>Zwrot z kapitału własnego (gotówka)</span><b>${r.coc != null ? pct1(r.coc) : '—'}</b></div><p class="tiny muted" style="margin:8px 0 0">Odsetki w 1. roku ok. ${zl(r.interestYear1)}; w tym rachunku nie obniżają podatku (przy najmie prywatnym nie są kosztem). Zwrot z kapitału nie wlicza spłaty kapitału kredytu.</p>` : ''}</div>
      <div class="card"><div class="eyebrow">A gdyby…</div>${barChart(sv.map(x => ({ name: x.name, y: x.y, sub: r.loan ? 'przepływ ' + zl(x.cf / 12) + ' mies.' : 'zysk po podatku ' + zl(x.cf) })), { ref: r.netPost, label: 'Zwrot netto w scenariuszach' }).replace(/miasto /g, 'bazowy ')}<p class="tiny muted" style="margin:8px 0 0">Zwrot netto po podatku w kilku scenariuszach. Czynsz ofertowy bywa wyższy od faktycznie uzyskiwanego, więc sprawdź też wariant −10%.</p></div>`;
    };
    calc();
    $$('[data-iv]', v).forEach(i => i.addEventListener('input', () => { I[i.dataset.iv] = num(i.value); calc(); }));
    $$('[data-ic]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { I[g.dataset.ic] = b.dataset.v; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); calc(); }));
    const fs = $('[data-act="from-s"]', v); if (fs) fs.onclick = () => { I.cena = roundTo(ls1.res.total.mid, 1000); render(); };
    const fn = $('[data-act="from-n"]', v); if (fn) fn.onclick = () => { I.czynsz = roundTo(ln.res.total.mid, 10); render(); };
  }];
}

/* ---------- jedna karta naraz + dziennik błędów ---------- */
// Dwie karty tej samej aplikacji mają wspólną bazę, ale osobną pamięć: nieaktualna karta potrafiła wysłać na serwer „usunięcia”. Blokada (Web Locks) pozwala pisać tylko jednej karcie.
function lockOverlay(msg, steal) {
  document.getElementById('lockov')?.remove(); const d = document.createElement('div'); d.id = 'lockov';
  d.innerHTML = `<div class="lockbox"><h3>Aplikacja jest otwarta w innej karcie</h3><p>${msg}</p>${steal ? '<button class="btn" id="lk-use">Używaj tej karty</button>' : '<button class="btn" id="lk-re">Wczytaj ponownie</button>'}</div>`;
  document.body.appendChild(d); const b = d.querySelector('button'); b.onclick = () => steal ? acquireLock(true).then(() => location.reload()) : location.reload();
}
async function acquireLock(steal = false) {
  if (!navigator.locks) return true;
  return new Promise(res => {
    navigator.locks.request('am-wycena-app', steal ? { steal: true } : { ifAvailable: true }, lock => {
      if (!lock) { res(false); return; }
      document.getElementById('lockov')?.remove(); res(true);
      return new Promise(() => { });                                   // trzymamy blokadę do zamknięcia karty
    }).catch(() => { sync.freeze(); lockOverlay('Inna karta przejęła aplikację, więc ta przestała zapisywać dane. Zamknij ją albo wczytaj ponownie.', false); });
  });
}
function logErr(kind, msg) { try { const l = JSON.parse(ls.get('am-errlog') || '[]'); l.unshift({ t: Date.now(), k: kind, m: String(msg).slice(0, 300), v: VERSION }); ls.set('am-errlog', JSON.stringify(l.slice(0, 30))); } catch { } }
addEventListener('error', e => logErr('błąd', (e.message || '') + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : '')));
addEventListener('unhandledrejection', e => logErr('obietnica', e.reason && (e.reason.message || e.reason)));

/* ---------- start ---------- */
window.addEventListener('hashchange', render);
document.addEventListener('click', e => { const b = e.target.closest('[data-back]'); if (b && !b.onclick) history.length > 1 ? history.back() : go('#/wycena'); });
async function boot() {
  const got = await acquireLock(false);
  await load(); render();
  if (!got) { sync.freeze(); lockOverlay('Ta aplikacja jest już otwarta w innej karcie lub oknie. Dwie karty naraz mogą wzajemnie psuć dane, więc ta karta nie zapisuje niczego. Zamknij tamtą kartę albo przejmij aplikację tutaj.', true); }
  else { sync.start(); checkRcn(); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && got) checkRcn(); });
  setInterval(() => { if (got && document.visibilityState === 'visible') checkRcn(); }, 30 * 60e3);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const had = !!navigator.serviceWorker.controller; let done = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload(); } });   // nowa wersja przejęła kontrolę: odśwież raz
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => { });
  }
  window.__am = { S, save, render, go, sync, checkRcn, got, getMap: () => mapCtl, importOffers: (found, opt) => applyCollection(found, opt), statusFn };
}
boot();
