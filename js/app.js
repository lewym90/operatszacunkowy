import * as store from './store.js';
import { estimateRent, estimateRentKat, estimateSale, estimateSaleKat, parkingExtra, crossCheckRent, inferDistrict, ATTRS, learnPremiums, grossYield, addrKey, migrateAddrKey, normStreet, normDz, YEAR_BANDS, yearBand } from './engine.js';
import { rcnToObjects, inneToObjects, katalog, KAT, KAT_ORDER, POD_TXT } from './rcn.js';
import { linesFromPdf, offersFromLines, offerKey } from './pdfimport.js';
import { flags as offerFlags } from './parseOtodom.js';
import { esc, $, $$, fmt, roundTo, toast, openSheet, closeSheet, countUp, saveFile, ICON, suggest } from './ui.js';
import { buildReport, makePdf } from './report.js';
import { createSync, DEFAULT_URL, encodeCode, decodeCode } from './sync.js';
import { investCalc, sensitivity, TAX, holdCalc, scenarios, whatIf } from './invest.js';
import { qualityOf, compWhy, diffWyceny } from './jakosc.js';
import { sekcje, ocen, ODP, OPIS, NOTA } from './ogledziny.js';
import { LAYERS as OSM, loadPois, loadAll, nearest, osmUrl, okolica, promienie, opisLokalizacji, PROMIENIE, promLbl } from './osm.js';
import { geocode, neighbors, suggest as suggestAddr } from './geokod.js';
import { exposure, trendSeries, yieldByDistrict, districtAssigner, lineChart, barChart, bindCharts } from './rynek.js';
import { createMap, usableSales, buildGrid, streetCenters, placeOffers, makeClasses, median, popupSale, popupOffer, districtCenters } from './mapa.js';

const VERSION = '1.25.2';
const S = { wlasne: [], teczki: [], foto: {}, dokumenty: [],
  offers: [], poza: [], rcn: null, rcnInne: null, tx: [], inne: [], pool: [], stats: {}, streets: [], budynki: {}, wyceny: [], last: {},
  ust: { biuro: 'AM Nieruchomości', haslo: 'Sprawdzone do końca.', agent: '', tel: '', email: '', www: '', rcnUrl: '' },
  form: { tryb: 'sprzedaz', kat: 'mieszkanie', pod: '', dzm2: '', ulica: '', nr: '', dzielnica: '', m2: '', pokoje: 2, pietro: null, rok: '', rynek: '', standard: '', meble: '', zapamietaj: true, ud: [] },
};
// Własne umowy najmu biura -> ta sama postać co oferty, z jawnymi cechami (nie ze słów w tytule) i dużą wagą
const ownToOffer = w => ({ id: 'w' + w.id, own: true, ...(w.kat && w.kat !== 'mieszkanie' ? { kat: w.kat } : {}), ulica: w.ulica, dzielnica: w.dzielnica, miasto: 'Lublin', m2: w.m2, pokoje: w.pokoje, pietro: w.pietro, cena: w.cena, czynsz: w.czynsz || null, meble: w.meble,
  tags: { nowe: w.rok && w.rok >= 2018 ? 1 : 0, wysoki: w.standard === 'wysoki' ? 1 : 0 }, tytul: 'własna umowa', wlaczone: true, flagi: [] });
// Oferty spoza Lublina czekają w S.poza: są zapisywane i synchronizowane, ale nie wchodzą do wycen, rynku, mapy ani list, dopóki aplikacja nie obsłuży innych obszarów.
const lubOK = o => { const m = (o.miasto || '').trim().toLowerCase(); return !m || m === 'lublin'; };
const podziel = all => { S.offers = all.filter(lubOK); S.poza = all.filter(o => !lubOK(o)); };
const wszystkie = () => S.offers.concat(S.poza);
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
  S.wlasne = await store.get('wlasne', []); podziel(await store.get('offers', [])); S.budynki = await store.get('budynki', {}); S.wyceny = await store.get('wyceny', []); S.teczki = await store.get('teczki', []); S.dokumenty = await store.get('dokumenty', []); S.foto = await store.get('foto', {});
  { const m = {}; let ch = false; for (const [k, v] of Object.entries(S.budynki)) { const nk = migrateAddrKey(k); if (nk !== k) ch = true; m[nk] = v; } if (ch) { S.budynki = m; store.set('budynki', m); } }
  S.ust = { ...S.ust, ...(await store.get('ust', {})) }; S.rcn = S.safe ? null : await store.get('rcn', null); S.rcnInne = S.safe ? null : await store.get('rcnInne', null); setTx();
}
// Surowe wiersze RCN zwalniamy po przeliczeniu (zostają w bazie urządzenia): w pamięci były podwójnie, a duże zużycie sprawia, że iPhone szybciej zamyka aplikację w tle.
function setTx() {
  if (!S.rcn) { S.tx = []; S.stA = {}; } else if (S.rcn.rows) { const st = {}; S.tx = rcnToObjects(S.rcn, st); S.stA = st; S.rcn = { meta: S.rcn.meta, nRows: S.rcn.rows.length }; }
  if (!S.rcnInne) { S.inne = []; S.stB = {}; } else if (S.rcnInne.rows) { const st = {}; S.inne = inneToObjects(S.rcnInne, st); S.stB = st; S.rcnInne = { meta: S.rcnInne.meta, nRows: S.rcnInne.rows.length }; }
  const st = {}; for (const part of [S.stA, S.stB]) for (const [k, v] of Object.entries(part)) { const d = st[k] || (st[k] = { rynkowe: 0, nierynkowe: 0 }); d.rynkowe += v.rynkowe || 0; d.nierynkowe += v.nierynkowe || 0; }
  S.stats = st; S.pool = S.tx.concat(S.inne);
  S.streets = [...new Set(S.pool.map(t => t.ulica).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
}
const DEF_UST = JSON.stringify(S.ust);
const raw = {
  offers: () => store.set('offers', wszystkie()), wlasne: () => store.set('wlasne', S.wlasne), budynki: () => store.set('budynki', S.budynki), wyceny: () => store.set('wyceny', S.wyceny), teczki: () => store.set('teczki', S.teczki), dokumenty: () => store.set('dokumenty', S.dokumenty), ust: () => store.set('ust', S.ust),
};
// każdy zapis lokalny uruchamia (z opóźnieniem) synchronizację z serwerem, jeśli urządzenie jest połączone
const save = Object.fromEntries(Object.entries(raw).map(([k, f]) => [k, () => { const r = f(); sync.schedule(); return r; }]));

/* ---------- synchronizacja z serwerem ---------- */
const byId = (list, id = x => x.id) => new Map(list.map(x => [id(x), x]));
const adapters = {
  offers: { read: () => wszystkie().map(o => [o.id, o]), apply: (u, d) => { const m = byId(wszystkie()); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); podziel([...m.values()]); raw.offers(); } },
  wlasne: { read: () => S.wlasne.map(w => [w.id, w]), apply: (u, d) => { const m = byId(S.wlasne); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); S.wlasne = [...m.values()]; raw.wlasne(); } },
  wyceny: { read: () => S.wyceny.filter(e => e.id).map(e => [e.id, e]), apply: (u, d) => { const m = byId(S.wyceny); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); S.wyceny = [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)); raw.wyceny(); } },
  dokumenty: { read: () => S.dokumenty.map(d => [d.id, d]), apply: (u, d) => { const m = byId(S.dokumenty); u.forEach(([id, x]) => m.set(id, x)); d.forEach(id => m.delete(id)); S.dokumenty = [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)); raw.dokumenty(); } },
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
// Na telefonie dolny pasek: Start, Wycena, Mapa, Rynek, Więcej (reszta w menu). Na komputerze boczne menu pokazuje wszystko.
const TABS = [['start', 'Start'], ['wycena', 'Wycena'], ['mapa', 'Mapa'], ['rynek', 'Rynek'], ['oferty', 'Oferty'], ['historia', 'Teczki'], ['dane', 'Dane'], ['ust', 'Ustawienia']];
const MAIN = ['start', 'wycena', 'mapa', 'rynek'];
const MENU = [['ogledziny', 'Karta oględzin', 'wycena'], ['oferty', 'Monitoring ofert', 'oferty'], ['historia', 'Teczki i historia', 'teczki'], ['raporty', 'Raporty PDF', 'raport'], ['kalkulator', 'Kalkulator inwestycyjny', 'kalk'], ['dane', 'Dane i import', 'dane'], ['ust', 'Ustawienia', 'ust']];
function menuSheet() {
  const n = remindN();
  openSheet(`<div class="eyebrow">Więcej</div><div class="menu-list">${MENU.map(([k, l, ic]) => `<a href="#/${k}" class="menu-it">${ICON[ic]}<span>${l}</span>${k === 'historia' && n ? `<i class="nb">${n}</i>` : ''}</a>`).join('')}</div>`, p => $$('a', p).forEach(a => a.addEventListener('click', closeSheet)));
}
function tabs(active) {
  const n = remindN();
  $('#tabs').innerHTML = '<div class="in-tabs"><div class="brand"><img src="icons/logo-am.png" alt=""><b>OPERAT SZACUNKOWY</b><span>AM Nieruchomości</span></div>' + TABS.map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}${MAIN.includes(k) ? '' : ' xtra'}">${ICON[k]}${k === 'historia' && n ? `<i class="nb">${n}</i>` : ''}<span>${l}</span></a>`).join('')
    + `<button type="button" class="more ${MAIN.includes(active) ? '' : 'on'}" data-menu aria-label="Więcej">${ICON.wiecej}${n ? `<i class="nb">${n}</i>` : ''}<span>Więcej</span></button></div>`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-menu]')) menuSheet(); });
function render() {
  const h = location.hash.replace(/^#\/?/, '') || 'start', p = h.split('/');
  let html = '', mount = null, tab = p[0];
  closeSheet(); if (mapCtl) { try { mapCtl.destroy(); } catch { } mapCtl = null; }
  if (p[0] === 'start') [html, mount] = viewStart();
  else if (p[0] === 'raporty') { tab = 'historia'; [html, mount] = viewRaporty(); }
  else if (p[0] === 'mapa') [html, mount] = viewMapa();
  else if (p[0] === 'rynek') [html, mount] = viewRynek();
  else if (p[0] === 'kalkulator') { tab = 'rynek'; [html, mount] = viewKalkulator(); }
  else if (p[0] === 'teczka') { tab = 'historia'; [html, mount] = viewTeczka(p[1]); }
  else if (p[0] === 'ogledziny') { tab = 'historia'; [html, mount] = viewOgledziny(p); }
  else if (p[0] === 'analiza') { tab = 'historia'; [html, mount] = viewAnaliza(p[1]); }
  else if (p[0] === 'wycena') [html, mount] = viewWycena();
  else if (p[0] === 'oferty') [html, mount] = viewOferty();
  else if (p[0] === 'dane') [html, mount] = viewDane();
  else if (p[0] === 'historia') [html, mount] = viewHistoria();
  else if (p[0] === 'ust') [html, mount] = viewUst();
  else if (p[0] === 'wynik') { tab = 'wycena'; [html, mount] = viewWynik(p); }
  else if (p[0] === 'raport') { tab = 'wycena'; [html, mount] = viewRaport(p); }
  else { tab = 'start'; [html, mount] = viewStart(); }
  const v = $('#view'); v.innerHTML = html; v.dataset.view = ['start', 'raporty', 'analiza', 'ogledziny', 'wycena', 'mapa', 'rynek', 'oferty', 'dane', 'historia', 'teczka', 'kalkulator', 'ust', 'wynik', 'raport'].includes(p[0]) ? p[0] : 'start';
  const topEl = v.querySelector(':scope > .top');   // reszta widoku w osobnym bloku: na szerokim ekranie układa się w kolumny
  if (topEl) { const body = document.createElement('div'); body.className = 'body'; while (topEl.nextSibling) body.appendChild(topEl.nextSibling); v.appendChild(body); }
  v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  tabs(tab); window.scrollTo(0, 0); mount && mount(v);
}
const go = h => { location.hash = h; };
let mapCtl = null;

const head = (title, sub, back, line) => `<div class="top">${back ? `<button class="back" data-back aria-label="Wróć">${ICON.back}</button>` : `<button class="back burger" data-menu aria-label="Menu">${ICON.menu}</button>`}<div class="ttl"><h1>${title}</h1>${sub ? `<small class="${line ? 'line' : ''}">${sub}</small>` : ''}</div><img class="mark" src="icons/logo-am.png" alt="AM Nieruchomości"></div>`;

/* ---------- START ---------- */
const TILES = [['sale', 'Wycena sprzedaży', 'sprzedaz'], ['rent', 'Wycena najmu', 'najem'], ['#/rynek', 'Rynek i trendy', 'rynek'], ['#/kalkulator', 'Kalkulator inwestycyjny', 'kalkulator'], ['#/mapa', 'Mapa transakcji', 'mapa'], ['#/oferty', 'Monitoring ofert', 'oferty'], ['tec', 'Teczki i CRM', 'teczki'], ['#/raporty', 'Raporty PDF', 'raporty']];
const odm = (n, a, b, c) => `${fmt(n)} ${n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? b : c}`;
// Krótkie informacje na kafelkach: wyłącznie z danych w aplikacji, przy braku danych opis funkcji
function tileInfo(k) {
  if (k === 'sale') return S.pool.length ? odm(S.pool.length, 'transakcja', 'transakcje', 'transakcji') : 'Ceny z aktów notarialnych';
  if (k === 'rent') { const n = allOffers().length; return n ? odm(n, 'oferta', 'oferty', 'ofert') : 'Oferty i własne umowy'; }
  if (k === '#/rynek') return 'Trendy i rentowność';
  if (k === '#/kalkulator') { const r = investCalc(S.invest); return r.ok ? 'Zwrot netto ' + pct1(r.netPost) : 'Zwrot, IRR, NPV'; }
  if (k === '#/mapa') return 'Lublin i okolice';
  if (k === '#/oferty') { if (!S.offers.length) return 'Zmiany cen i nowe ogłoszenia'; const st = statusFn(), n = S.offers.filter(o => st(o) === 'nowe').length; return n ? odm(n, 'nowa', 'nowe', 'nowych') : 'Bez nowych ogłoszeń'; }
  if (k === 'tec') return S.teczki.length ? odm(S.teczki.length, 'teczka', 'teczki', 'teczek') : 'Nieruchomości i zadania';
  return S.dokumenty.length ? odm(S.dokumenty.length, 'dokument', 'dokumenty', 'dokumentów') : 'Siedem rodzajów raportu';
}
let startMemo = null;
function viewStart() {
  const n = remindN();
  const html = `<div class="home-hero"><img class="hh-img" src="img/start.webp" alt=""><div class="hh-top"><img class="home-logo" src="icons/logo-am.png" alt="AM Nieruchomości"><h1 class="gold">OPERAT<br>SZACUNKOWY</h1><button class="bell" data-act="bell" aria-label="Zadania i przypomnienia${n ? ': ' + n : ''}">${ICON.dzwonek}${n ? `<i class="nb">${n}</i>` : ''}</button></div>
    <div class="hh-stats"><div class="hs"><b id="hs-m">—</b><span>mediana zł/m², mieszkania</span></div><div class="hs"><b id="hs-y">—</b><span>zmiana rok do roku</span></div></div></div>${safeBanner()}
  <div class="tiles"><button type="button" class="tile wide" data-tile="#/ogledziny" style="background-image:url(img/t-ogledziny.webp)"><span class="tl"><b>Karta oględzin</b><small>Ocena standardu, 25 punktów</small></span></button>${TILES.map(([k, l, im]) => `<button type="button" class="tile" data-tile="${k}" style="background-image:url(img/t-${im}.webp)"><span class="tl"><b>${l}</b><small>${esc(tileInfo(k))}</small></span></button>`).join('')}</div>
  <div class="skyline" aria-hidden="true"><img src="img/panorama.webp" alt=""></div>`;
  return [html, v => {
    $$('[data-tile]', v).forEach(b => b.onclick = () => { const k = b.dataset.tile;
      if (k === 'sale' || k === 'rent') { S.form.tryb = k === 'sale' ? 'sprzedaz' : 'najem'; go('#/wycena'); } else if (k === 'tec') { S.histTab = 'teczki'; go('#/historia'); } else go(k); });
    $('[data-act="bell"]', v).onclick = () => { S.histTab = 'zadania'; go('#/historia'); };
    const paint = m => { if (!m) return; const a = $('#hs-m', v), b = $('#hs-y', v); if (a) a.textContent = fmt(m.med); if (b && m.yoy != null) b.textContent = plPct(m.yoy); const r = $('[data-tile="#/rynek"] small', v); if (r && m.yoy != null) r.textContent = plPct(m.yoy) + ' rok do roku'; };
    if (startMemo && startMemo.n === S.pool.length) paint(startMemo); else if (S.pool.length) setTimeout(() => { if (!v.isConnected || v.dataset.view !== 'start') return; try { const T = trendSeries(S.pool, { kat: 'mieszkanie', m2min: 15, m2max: 200, years: 3 }); if (T.ok) { startMemo = { n: S.pool.length, med: T.points[T.points.length - 1].med, yoy: T.yoy ? T.yoy.pct : null }; paint(startMemo); } } catch { } }, 60);
  }];
}
/* ---------- RAPORTY (lista gotowych wycen, z których powstaje raport PDF) ---------- */
function viewRaporty() {
  const cur = ['sprzedaz', 'najem'].map(k => S.last[k]).filter(e => e && e.res.ok && !e.id), ok = S.wyceny.filter(e => e.res.ok);
  const row = (e, href) => { const s = e.subj, sale = s.tryb === 'sprzedaz', st = sale ? 1000 : 10; return `<a class="card" href="${href}" style="display:block;text-decoration:none;color:inherit"><div class="eyebrow">${sale ? 'Sprzedaż' : 'Najem'}${e.ts ? ' · ' + new Date(e.ts).toLocaleDateString('pl-PL') : ' · bieżąca wycena'}</div><h3>${fmt(roundTo(e.res.total.lo, st))} – ${fmt(roundTo(e.res.total.hi, st))} zł</h3><div class="muted small">${esc(subjLine(s))}</div></a>`; };
  const html = head('Raporty PDF', 'Raport powstaje z gotowej wyceny', true) + (cur.length || ok.length ? cur.map(e => row(e, '#/raport/cur/' + e.subj.tryb)).join('') + ok.map(e => row(e, '#/raport/h/' + e.id)).join('') : '<div class="empty"><b>Brak wycen</b>Oszacuj wartość nieruchomości, a stąd przygotujesz dla niej raport PDF.</div><a class="btn" href="#/wycena" style="text-decoration:none">Nowa wycena</a>');
  const docs = S.dokumenty, hist = docs.length ? `<div class="card"><div class="eyebrow">Wygenerowane dokumenty (${docs.length})</div>${docs.slice(0, 50).map(d => `<div class="kv"><span>${esc(d.no)} · ${esc(d.typ)}<br><small>${new Date(d.ts).toLocaleDateString('pl-PL')} · ${esc(d.opis || '')}</small></span>${d.wid && S.wyceny.some(w => w.id === d.wid) ? `<b><a class="clink" href="#/wynik/h/${esc(d.wid)}">wycena ↗</a></b>` : ''}</div>`).join('')}<p class="tiny muted" style="margin:8px 0 0">Plików PDF aplikacja nie przechowuje; tu zostaje numer i data.</p></div>` : '';
  return [html + hist, v => { $('[data-back]', v).onclick = () => go('#/start'); }];
}

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
  const html = head(sale ? 'Wycena sprzedaży' : 'Wycena najmu') + safeBanner() + `
  <div class="seg" data-v="${sale ? 0 : 1}"><i></i><button data-t="sprzedaz" class="${sale ? 'on' : ''}">Sprzedaż</button><button data-t="najem" class="${sale ? '' : 'on'}">Najem</button></div>
  ${katImg(kat) ? `<img class="res-foto sm" src="${katImg(kat)}" alt="">` : ''}<div class="field" style="margin-top:14px"><span>Rodzaj nieruchomości</span><div class="chips" data-katsel>${KAT_ORDER.filter(k => k !== 'zabudowana').map(k => `<button type="button" class="chip ${kat === k ? 'on' : ''}" data-v="${k}">${KAT[k].n}</button>`).join('')}</div></div>
  ${ready ? `<div class="banner"><span>◈</span><span>${stat}. Wynik zawsze jako przedział z oceną pewności.</span></div>`
      : `<div class="banner warn"><span>!</span><span>${sale ? 'Brak danych o transakcjach (RCN).' : 'Brak ofert najmu.'} Najpierw zaimportuj dane w zakładce <b>Dane</b>.</span></div>`}
  <form class="card" id="f" autocomplete="off" novalidate>
    ${sale || !flat ? `<div class="grid3"><label class="field"><span>Ulica${flat ? '' : ' (opcjonalnie)'}</span><input class="in" name="ulica" list="dl-st" value="${esc(f.ulica)}" placeholder="np. Bluszczowa"></label>
      <label class="field"><span>Nr</span><input class="in" name="nr" value="${esc(f.nr)}" inputmode="text" placeholder="13"></label></div>`
      : `<label class="field"><span>Dzielnica (opcjonalnie)</span><input class="in" name="dzielnica" list="dl-dz" value="${esc(f.dzielnica)}" placeholder="np. Śródmieście"></label>
      <div class="grid3"><label class="field"><span>Ulica</span><input class="in" name="ulica" list="dl-st" value="${esc(f.ulica)}" placeholder="np. Granata"></label>
      <label class="field"><span>Nr budynku</span><input class="in" name="nr" value="${esc(f.nr)}" inputmode="text" placeholder="1"></label></div>
      <p class="tiny muted" style="margin:-6px 0 12px">Ulica i numer budynku dają dokładne odległości do przystanków, szkół i innych ważnych miejsc.</p>`}
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
  const c = computeEntry(S.form); if (c.err) return toast(c.err);
  S.last[S.form.tryb] = c.entry; store.set('last', S.last); go('#/wynik/' + S.form.tryb);
}
// Liczy wycenę z danych formularza. Używane przez formularz i przez pełną analizę z teczki.
function computeEntry(f) {
  const kat = f.kat || 'mieszkanie', flat = kat === 'mieszkanie', m2 = parseFloat(String(f.m2).replace(',', '.'));
  const rng = flat ? [10, 400] : KAT[kat].m2;
  if (!(m2 >= rng[0] && m2 <= rng[1])) return { err: `Podaj powierzchnię (${rng[0].toLocaleString('pl-PL')}–${rng[1].toLocaleString('pl-PL')} m²)` };
  const dzm2 = kat === 'dom' && f.dzm2 ? parseFloat(String(f.dzm2).replace(',', '.')) : null;
  if (kat === 'dom' && f.dzm2 && !(dzm2 >= 30)) return { err: 'Powierzchnia działki wygląda błędnie' };
  const rok = f.rok ? parseInt(f.rok, 10) : null;
  if (f.rok && !(rok >= 1700 && rok <= now() + 3)) return { err: 'Rok budowy wygląda błędnie' };
  if (f.tryb === 'sprzedaz' && !S.pool.length) return { err: 'Najpierw zaimportuj dane RCN (zakładka Dane)' };
  if (f.tryb === 'najem' && flat && !S.offers.length && !(S.wlasne || []).length) return { err: 'Najpierw zaimportuj oferty najmu (zakładka Dane)' };
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
  const res = f.tryb === 'najem' ? (flat ? estimateRent(allOffers(), subj) : (kat === 'dom' || kat === 'lokal' || kat === 'obiekt' || kat === 'garaz') ? estimateRentKat(allOffers(), subj) : { ok: false, reason: `Najem nie dotyczy kategorii „${KAT[kat].n}”.` }) : flat ? estimateSale(S.tx, subj, { yearOf }) : estimateSaleKat(S.pool, subj, { geo: S.pool });
  if (f.tryb === 'najem' && flat && res.ok) { try { const baseRent = res.adjusted ? estimateRent(allOffers(), { ...subj, rok: null, standard: null }) : res; res.cross = crossCheckRent(allOffers(), S.tx, subj, baseRent.ok ? baseRent : res); const c = res.cross; if (res.adjusted && baseRent.ok) c.vsBase = baseRent.total; if (c.ok && c.agreement === 'rozbieżne' && c.r2 >= 0.3 && res.confidence.score > 1) { res.confidence.score -= 1; res.confidence.level = res.confidence.score === 1 ? 'niska' : 'średnia'; res.confidence.why.push('obniżono: kontrola ze sprzedażą (wiarygodna, R² ≥ 0,3) daje wyraźnie inny czynsz'); } } catch (e) { res.cross = { ok: false, reason: 'Nie udało się policzyć kontroli: ' + e.message }; } }
  if (subj.parking === 'osobno' && res.ok) res.parking = parkingExtra(allOffers());
  if (dzNote && res.ok) res.notes.unshift(dzNote);
  return { entry: { id: null, ts: Date.now(), ver: VERSION, baza: { rcn: S.pool.length, ofert: allOffers().length }, subj, res } };
}

/* ---------- WYNIK ---------- */
const subjLine = s => { const k = s.kat || 'mieszkanie', fl = k === 'mieszkanie', sale = s.tryb === 'sprzedaz';
  return [fl ? '' : KAT[k].n, sale || !fl ? [s.ulica, s.nr].filter(Boolean).join(' ') : [s.dzielnica, s.ulica].filter(Boolean).join(', '), `${String(s.m2).replace('.', ',')} m²`, fl ? `${s.pokoje} pok.` : '', k === 'dom' && s.dzm2 ? `działka ${String(s.dzm2).replace('.', ',')} m²` : '', s.pod ? (POD_TXT[s.pod] || '') : '',
    fl ? (s.pietro == null ? '' : s.pietro === 0 ? 'parter' : `${s.pietro}. piętro`) : '', s.rok ? `rok ${s.rok}` : ''].filter(Boolean).join(' · '); };
function getEntry(p) {
  if (p[1] === 'h') return S.wyceny.find(w => w.id === p[2]) || null;
  return S.last[p[1]] || null;
}
const KIMG = ['mieszkanie', 'dom', 'dzialka', 'lokal', 'obiekt', 'garaz'], katImg = k => KIMG.includes(k || 'mieszkanie') ? `img/k-${k || 'mieszkanie'}.webp` : '';
// Pewność jako łuk z trzech części: poziom z silnika wyceny, bez procentów, których silnik nie liczy
function confGauge(c) {
  const R = 74, cx = 90, cy = 88, pt = a => `${(cx + R * Math.cos(a)).toFixed(1)} ${(cy - R * Math.sin(a)).toFixed(1)}`, seg = i => { const a0 = Math.PI - i * Math.PI / 3 - .05, a1 = Math.PI - (i + 1) * Math.PI / 3 + .05; return `M${pt(a0)} A${R} ${R} 0 0 1 ${pt(a1)}`; };
  return `<div class="gauge2" role="img" aria-label="Pewność wyceny: ${LV[c.level]}"><svg viewBox="0 0 180 100"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#8A6C2A"/><stop offset="1" stop-color="#F3E3B3"/></linearGradient></defs>${[0, 1, 2].map(i => `<path d="${seg(i)}" fill="none" stroke="${i < c.score ? 'url(#gg)' : '#232329'}" stroke-width="11" stroke-linecap="round"/>`).join('')}</svg><div class="g2t"><b>${LV[c.level]}</b><span>pewność wyceny</span></div></div>`;
}
function viewWynik(p) {
  const e = getEntry(p);
  if (!e) return [head('Wynik', '', true) + '<div class="empty"><b>Brak wyniku</b>Wróć do formularza i oszacuj wartość.</div>', v => $('[data-back]', v).onclick = () => go('#/wycena')];
  const { subj: s, res: r } = e, sale = s.tryb === 'sprzedaz', step = sale ? 1000 : 10, saved = !!e.id;
  let html = head(sale ? 'Wycena sprzedaży' : 'Wycena najmu', r.ok ? '' : esc(subjLine(s)), true, true);
  if (!r.ok) {
    html += `<div class="card"><div class="eyebrow">Brak wyniku</div><h3>Za mało danych</h3><p class="muted">${esc(r.reason)}</p>
      <p class="small muted">Aplikacja nie podaje liczby, gdy nie ma na czym jej oprzeć. Zaimportuj więcej danych w zakładce <b>Dane</b> albo zmień kryteria.</p></div>
      <button class="btn ghost" data-act="back">Zmień dane</button>`;
    return [html, v => { $('[data-back]', v).onclick = () => history.length > 1 ? history.back() : go('#/wycena'); $('[data-act="back"]', v).onclick = () => go('#/wycena'); }];
  }
  const lo = roundTo(r.total.lo, step), hi = roundTo(r.total.hi, step), mid = roundTo(r.total.mid, step);
  const pm = r.comps.map(c => c.pm2), dMin = Math.min(...pm, r.pm2.lo), dMax = Math.max(...pm, r.pm2.hi), span = (dMax - dMin) || 1, X = v => ((v - dMin) / span * 100).toFixed(2);
  const srodek = roundTo((r.total.lo + r.total.hi) / 2, step), foto = (e.teczka && (S.foto[e.teczka] || [])[0]) || katImg(s.kat), podM2 = s.m2 > 0 ? srodek / s.m2 : null;
  html += `${foto ? `<img class="res-foto" src="${foto}" alt="">` : ''}<div class="res-addr"><b>${esc([s.ulica, s.nr].filter(Boolean).join(' ') || s.dzielnica || 'Nieruchomość')}${s.ulica ? ', Lublin' : ''}</b><span>${esc(subjLine(s))}</span></div>
  <div class="card hero"><div class="lbl">${esc(r.label)}</div>
    <div class="big gold"><span data-cu="${srodek}">${fmt(srodek)}</span> zł</div>
    <div class="sub">${podM2 ? fmt(podM2) + ' zł/m²' : ''}${sale ? '' : (podM2 ? ' · ' : '') + 'miesięcznie'}</div>
    ${confGauge(r.confidence)}
    <div class="res-lbl">Przedział wartości:</div><div class="res-rng"><span data-cu="${lo}">${fmt(lo)}</span> – <span data-cu="${hi}">${fmt(hi)}</span> zł</div><div class="sub">${r.rangeKind}</div>
    <button class="btn" type="button" data-act="szcz">Zobacz szczegóły</button></div>
  <div class="card" id="szcz"><div class="eyebrow">Rozkład porównań</div><div class="range"><div class="t" style="left:${X(r.pm2.mid)}%">mediana ${fmt(r.pm2.mid)} zł/m²</div><div class="track"><div class="fill" style="left:${X(r.pm2.lo)}%;width:${Math.max(1, X(r.pm2.hi) - X(r.pm2.lo))}%"></div></div>
      ${r.comps.slice(0, 40).map(c => `<div class="dot" style="left:${X(c.pm2)}%"></div>`).join('')}<div class="mid" style="left:${X(r.pm2.mid)}%"></div>
      <div class="t b" style="left:0;transform:none">${fmt(dMin)}</div><div class="t b" style="left:100%;transform:translateX(-100%)">${fmt(dMax)} zł/m²</div></div></div>
  <div class="stats"><div class="stat"><b>${r.n}</b><span>porównań</span></div><div class="stat"><b>${fmt(mid)}</b><span>wartość centralna, zł</span></div><div class="stat"><b>${fmt(r.pm2.mid)}</b><span>zł za m²</span></div></div>
  <div class="card"><div class="eyebrow">Pewność wyniku</div><div class="conf"><div class="gauge" data-l="${r.confidence.score}">${[1, 2, 3].map(i => `<i class="${i <= r.confidence.score ? 'on' : ''}"></i>`).join('')}</div><b>${LV[r.confidence.level]}</b></div>
    <p class="small muted" style="margin:10px 0 0">${LVTXT[r.confidence.level]}</p>
    <details style="margin-top:8px"><summary class="small" style="color:var(--gold-l);cursor:pointer">Dlaczego tak?</summary><ul class="clean">${r.confidence.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="tiny muted">Progi są orientacyjne i wymagają skalibrowania na prawdziwych transakcjach.</p></details></div>`;
  { const q = qualityOf(r); if (q) html += `<div class="card"><div class="eyebrow">Jakość materiału porównawczego</div><div class="conf"><b>Materiał: ${q.level}</b></div>${q.warn.length ? `<p class="small" style="margin:8px 0 0;color:var(--warn)">Słabe strony: ${esc(q.warn.join(', ').toLowerCase())}. Sprawdź porównania przed podaniem liczby.</p>` : ''}
    <div class="qrows">${q.rows.map(x => `<div class="kv"><span>${x.label}</span><b class="q${x.s}">${esc(x.val)}</b></div>`).join('')}</div><p class="tiny muted" style="margin:8px 0 0">Liczy się podobieństwo, nie sama liczba: kilka bardzo podobnych transakcji jest więcej warte niż kilkadziesiąt przypadkowych. Progi są orientacyjne. Ta ocena nie zmienia wyniku.</p></div>`; }
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
  html += `<div class="card"><div class="eyebrow">Porównania (${r.comps.length})</div><div id="comps">${r.comps.slice(0, 10).map((c, i) => compHTML(c, i, sale, e)).join('')}</div>${r.comps.length > 10 ? '<button class="btn ghost" data-act="more" style="margin-top:10px">Pokaż wszystkie</button>' : ''}</div>
  ${ogledKarta(e)}<div id="okol"></div>
  <div class="row">${saved ? '' : '<button class="btn ghost" data-act="save">Zapisz do historii</button>'}<button class="btn" data-act="report">Raport dla klienta</button></div>
  <div class="gap"></div><button class="btn ghost" data-act="calc">Kalkulator inwestycyjny</button>
  ${saved ? `<div class="gap"></div><button class="btn ghost" data-act="tec">${e.teczka && S.teczki.some(t => t.id === e.teczka) ? 'Teczka: ' + esc(tName(S.teczki.find(t => t.id === e.teczka))) : 'Dodaj do teczki nieruchomości'}</button>` : ''}
  ${saved ? `<div class="gap"></div><button class="btn ghost" data-act="real">${e.real ? 'Zmień cenę rzeczywistą' : 'Wpisz cenę rzeczywistą (do kontroli trafności)'}</button>` : ''}`;
  return [html, v => {
    $('[data-back]', v).onclick = () => (saved ? go('#/historia') : go('#/wycena'));
    $$('[data-cu]', v).forEach(el => countUp(el, +el.dataset.cu));
    $('[data-act="szcz"]', v).onclick = () => $('#szcz', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
    const rmEl = $('#resmap', v); if (rmEl) resMap(rmEl, r, v);
    okolMount(e, v);
    const more = $('[data-act="more"]', v); if (more) more.onclick = () => { $('#comps', v).innerHTML = r.comps.map((c, i) => compHTML(c, i, sale, e)).join(''); more.remove(); };
    $('[data-act="calc"]', v).onclick = () => { if (sale) S.invest.cena = srodek; else S.invest.czynsz = srodek; ls.set('am-invest', JSON.stringify(S.invest)); go('#/kalkulator'); };
    const tcb = $('[data-act="tec"]', v); if (tcb) tcb.onclick = () => teczkaSheet(e);
    const sv = $('[data-act="save"]', v); if (sv) sv.onclick = () => { e.id = uid(); const tc = (S.teczkaNext && S.teczki.find(t => t.id === S.teczkaNext)) || findTeczka(s); S.teczkaNext = null; if (tc) { e.teczka = tc.id; toast('Zapisano w teczce: ' + tName(tc)); } S.wyceny.unshift(e); save.wyceny(); toast('Zapisano w historii'); go('#/wynik/h/' + e.id); };
    $('[data-act="report"]', v).onclick = () => go(saved ? '#/raport/h/' + e.id : '#/raport/cur/' + s.tryb);
    const rl = $('[data-act="real"]', v); if (rl) rl.onclick = () => realSheet(e);
  }];
}
/* ---------- NAJBLIŻSZE OKOLICE (położenie budynku z rejestru adresów PRG) ---------- */
let geoCtl = null;
async function ensureGeo(e, q) {
  if (!q && e.geo && e.geo.ok) return e.geo;
  const r = await geocode({ ulica: q ? q.ulica : e.subj.ulica, nr: q ? q.nr : e.subj.nr });
  if (r.ok) { e.geo = r; e.geoErr = null; } else { e.geoErr = r; if (q) e.geo = null; }
  if (e.id) save.wyceny();
  return r;
}
const okTiles = list => `<div class="okgrid">${list.map(o => `<div class="okt"><span>${esc(o.label)}</span><b>${esc(o.txt)}</b></div>`).join('')}</div>`;
const promHTML = rows => !rows.length ? '' : `<p class="small" style="margin:14px 0 8px">${esc(opisLokalizacji(rows))}</p><div class="prom" role="table"><div class="pr h"><span>W promieniu</span>${PROMIENIE.map(r => `<span>${promLbl(r)}</span>`).join('')}</div>${rows.map(x => `<div class="pr"><span>${esc(x.label)}</span>${x.n.map(n => `<span>${n}</span>`).join('')}</div>`).join('')}</div>`;
async function okolMount(e, v) {
  const box = $('#okol', v); if (!box) return;
  const draw = async (pending) => {
    const g = e.geo && e.geo.ok ? e.geo : null, er = e.geoErr;
    const form = `<div class="grid3" style="margin-top:12px"><label class="field"><span>Ulica</span><input class="in" id="ok-ul" value="${esc((er && er.q && er.q.ulica) ?? e.subj.ulica ?? '')}"></label><label class="field"><span>Nr budynku</span><input class="in" id="ok-nr" value="${esc((er && er.q && er.q.nr) ?? e.subj.nr ?? '')}"></label></div><button class="btn ghost" id="ok-go" type="button">Szukaj budynku</button>`;
    let inner;
    if (pending) inner = '<p class="small muted" style="margin:0">Ustalam położenie budynku w rejestrze adresów…</p>';
    else if (g) {
      let tiles = '';
      try { const L = await loadAll({ url: osmUrl(S.ust.rcnUrl) }), pr = promienie(g.ll, L.layers); tiles = okTiles(okolica(g.ll, L.layers)) + promHTML(pr); } catch (x) { tiles = `<p class="small muted" style="margin:10px 0 0">${esc(x.message)}</p>`; }
      inner = `<p class="small" style="margin:0 0 4px"><b>${esc(g.street)} ${esc(g.number)}</b>, ${esc(g.city || 'Lublin')}${g.code ? ' (' + esc(g.code) + ')' : ''}</p>
        <p class="tiny muted" style="margin:0 0 12px">${g.source === 'prg' ? 'Położenie budynku z urzędowego rejestru adresów (Państwowy Rejestr Granic, GUGiK). Sprawdź, czy to właściwy adres.' : 'Położenie wskazane ręcznie na mapie.'} Odległości w linii prostej.</p>${tiles}
        <details style="margin-top:12px"><summary class="small" style="color:var(--gold-l);cursor:pointer">Zmień adres lub wskaż na mapie</summary>${form}<div class="gap"></div><button class="btn ghost" id="ok-pin" type="button">Wskaż budynek na mapie</button></details>`;
    } else {
      inner = `<p class="small" style="margin:0">${esc(er ? er.message : 'Podaj ulicę i numer budynku.')}</p>${er && er.code === 'niejednoznaczne' ? `<div class="chips" style="margin-top:10px">${er.candidates.map((c, i) => `<button type="button" class="chip" data-cand="${i}">${esc(c.street + ' ' + c.number)}</button>`).join('')}</div>` : ''}
        ${form}${er && er.code === 'nie_znaleziono' ? '<div id="ok-sg" class="small" style="margin-top:12px"></div><div class="gap"></div><button class="btn ghost" id="ok-nb" type="button">Pokaż najbliższe numery w rejestrze</button><div id="ok-nbl" class="tiny muted" style="margin-top:8px"></div>' : ''}<div class="gap"></div><button class="btn ghost" id="ok-pin" type="button">Wskaż budynek na mapie</button>`;
    }
    box.innerHTML = `<div class="card"><div class="eyebrow">Najbliższe okolice</div>${inner}<div id="ok-map"></div></div>`;
    const go1 = $('#ok-go', box); if (go1) go1.onclick = async () => { const q = { ulica: $('#ok-ul', box).value.trim(), nr: $('#ok-nr', box).value.trim() }; await draw(true); const r = await ensureGeo(e, q); if (!r.ok) e.geoErr = { ...r, q }; await draw(); };
    $$('[data-cand]', box).forEach(b => b.onclick = () => { const c = er.candidates[+b.dataset.cand]; e.geo = { ok: true, ll: c.ll, street: c.street, number: c.number, code: c.code, city: 'Lublin', source: 'prg' }; e.geoErr = null; if (e.id) save.wyceny(); draw(); });
    const sgBox = $('#ok-sg', box); if (sgBox) { const q = (er && er.q) || { ulica: e.subj.ulica, nr: e.subj.nr }; suggestAddr({ ...q, known: S.streets || [] }).then(list => { if (!sgBox.isConnected || !list.length) return;
      sgBox.innerHTML = 'Czy chodziło o: ' + list.map((c, i) => `<button type="button" class="chip" data-sg="${i}">${esc(c.street + ' ' + c.number)}</button>`).join(' '); $$('[data-sg]', sgBox).forEach(b3 => b3.onclick = () => { const c = list[+b3.dataset.sg]; e.geo = { ok: true, ll: c.ll, street: c.street, number: c.number, code: c.code, city: c.city || 'Lublin', source: 'prg' }; e.geoErr = null; if (e.id) save.wyceny(); draw(); }); }); }
    const nb = $('#ok-nb', box); if (nb) nb.onclick = async () => { const o = $('#ok-nbl', box); o.textContent = 'Szukam…'; const q = (er && er.q) || { ulica: e.subj.ulica, nr: e.subj.nr }; const list = await neighbors(q); o.innerHTML = list.length ? 'Najbliższe numery w rejestrze: ' + list.map(x => `<button type="button" class="chip" data-nbn="${esc(x.number)}">${esc(x.street + ' ' + x.number)}</button>`).join(' ') : 'Nie znaleziono sąsiednich numerów tej ulicy w rejestrze.'; $$('[data-nbn]', o).forEach(b2 => b2.onclick = async () => { await draw(true); const r2 = await ensureGeo(e, { ulica: q.ulica, nr: b2.dataset.nbn }); if (!r2.ok) e.geoErr = { ...r2, q: { ulica: q.ulica, nr: b2.dataset.nbn } }; draw(); }); };
    const pin = $('#ok-pin', box); if (pin) pin.onclick = async () => {
      const mb = $('#ok-map', box); mb.innerHTML = '<div class="mapbox" id="ok-pm" style="height:300px;margin-top:12px"></div><p class="tiny muted" style="margin:8px 0">Dotknij mapy w miejscu budynku (można przybliżyć). Potem zatwierdź.</p><button class="btn" id="ok-ok" type="button" disabled>Zatwierdź położenie</button>';
      try {
        const center = g ? g.ll : undefined, ctl = await createMap($('#ok-pm', box), { center, zoom: center ? 18 : 12 }); let ll = null, mk = null;
        ctl.map.on('click', ev => { ll = [+ev.latlng.lat.toFixed(6), +ev.latlng.lng.toFixed(6)]; if (mk) mk.remove(); mk = ctl.L.marker(ll).addTo(ctl.map); $('#ok-ok', box).disabled = false; });
        $('#ok-ok', box).onclick = () => { if (!ll) return; const q = (er && er.q) || { ulica: e.subj.ulica, nr: e.subj.nr }; e.geo = { ok: true, ll, street: q.ulica || 'wskazany budynek', number: q.nr || '', code: null, city: 'Lublin', source: 'reczne' }; e.geoErr = null; if (e.id) save.wyceny(); ctl.destroy(); draw(); };
      } catch (x) { mb.innerHTML = `<p class="small muted">Mapa niedostępna: ${esc(x.message)}</p>`; }
    };
  };
  if (e.geo && e.geo.ok) return draw();
  await draw(true); await ensureGeo(e); await draw();
}

const subj_m2 = e => e.subj.m2;
function compHTML(c, i, sale, e) {
  const w = Math.max(6, Math.round(c.w * 100));
  return `<div class="comp" style="animation-delay:${Math.min(i, 12) * 40}ms"><div>${c.url ? `<a class="clink" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(c.opis || '—')}</b> <span class="ext" aria-hidden="true">↗</span></a>` : `<b>${esc(c.opis || '—')}</b>`}${c.sameBuilding ? '<span class="badge g">ten sam budynek</span>' : ''}${c.own ? '<span class="badge g">własna umowa</span>' : ''}<span class="badge">${c.kind}</span></div><div class="p">${fmt(c.cena)} zł</div>
    <div class="m">${String(c.m2).replace('.', ',')} m²${c.pokoje != null ? ' · ' + c.pokoje + ' pok.' : ''}${c.dzm2 ? ' · działka ' + fmt(c.dzm2) + ' m²' : ''}${c.pietro != null ? ' · ' + (c.pietro === 0 ? 'parter' : c.pietro + '. p.') : ''}${c.data ? ' · akt ' + c.data : c.rok ? ' · akt ' + c.rok : ''}${c.rokBudowy ? ' · bud. ' + c.rokBudowy : ''}</div><div class="m r">${fmt(c.pm2raw ?? c.pm2)} zł/m²${c.adjPct && Math.abs(c.adjPct) >= 0.005 ? `<br><small>po korekcie ${fmt(c.pm2)} (${c.adjPct > 0 ? '+' : '−'}${Math.abs(c.adjPct * 100).toFixed(0)}%)</small>` : ''}</div><div class="wbar"><i style="width:${w}%"></i></div>${(() => { const y = compWhy(c, e.res, e.subj); return `<details class="why"><summary>Dlaczego to porównanie · udział ${e.res.model ? 'wśród porównań ' : ''}${y.share.toFixed(1).replace('.', ',')}%</summary><div>${esc(y.reasons.join(' · ') || 'podobny rodzaj nieruchomości')}</div></details>`; })()}</div>`;
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
// Numer dokumentu: AM/rok/kolejny; zużywany dopiero po faktycznym zapisaniu PDF
// Dopisek urządzenia sprawia, że dwa urządzenia bez połączenia nie wystawią tego samego numeru.
const devCode = () => { let c = ls.get('am-dev'); if (!c) { c = Math.random().toString(36).slice(2, 4).toUpperCase().padEnd(2, 'X'); ls.set('am-dev', c); } return c; };
function nextDoc(now = new Date()) { const y = now.getFullYear(), max = S.dokumenty.reduce((m, d) => { const a = /^AM\/(\d+)\/(\d+)/.exec(d.no); return a && +a[1] === y ? Math.max(m, +a[2]) : m; }, 0); return `AM/${y}/${String(max + 1).padStart(4, '0')}-${devCode()}`; }
// Para wycen tej samej nieruchomości: ten sam rodzaj i metraż, ta sama teczka albo (poza teczkami) ten sam adres; najbliższa w czasie, nie starsza niż 180 dni od tej wyceny
function rentPair(e) {
  const other = e.subj.tryb === 'sprzedaz' ? 'najem' : 'sprzedaz', kat = x => x.subj.kat || 'mieszkanie', ts = x => x.ts || 0;
  const same = x => x && x.res?.ok && x.subj.tryb === other && kat(x) === kat(e) && Math.abs((+x.subj.m2 || 0) - (+e.subj.m2 || 0)) <= 0.6 && Math.abs(ts(x) - ts(e)) <= 180 * 864e5
    && (e.teczka && x.teczka ? x.teczka === e.teczka : !!e.subj.ulica && !!e.subj.nr && normStreet(x.subj.ulica || '') === normStreet(e.subj.ulica) && String(x.subj.nr || '').trim() === String(e.subj.nr).trim());
  const o = [S.last[other], ...S.wyceny].filter(same).sort((a, b) => Math.abs(ts(a) - ts(e)) - Math.abs(ts(b) - ts(e)))[0]; if (!o || !e.res.ok) return null;
  const mid = x => (x.res.total.lo + x.res.total.hi) / 2, sal = e.subj.tryb === 'sprzedaz' ? e : o, nj = sal === e ? o : e, w = mid(sal), c = mid(nj);
  return { wartosc: w, czynsz: c, y: c * 12 / w * 100, zDnia: ts(o) };
}
function viewRaport(p) {
  const e = p[1] === 'h' ? S.wyceny.find(w => w.id === p[2]) : S.last[p[2]];
  const back = () => history.length > 1 ? history.back() : go('#/wycena');
  if (!e || !e.res.ok) return [head('Raport', '', true) + '<div class="empty"><b>Brak wyniku</b>Raport powstaje z gotowej wyceny.</div>', v => $('[data-back]', v).onclick = back];
  const VAR = [['short', 'Krótki'], ['full', 'Pełny'], ['market', 'Z wykresami'], ['inwest', 'Inwestycyjny'], ['lokal', 'Lokalizacja'], ['rent', 'Rentowność'], ['rynek', 'Rynek lokalny']];
  let variant = 'full'; try { variant = localStorage.getItem('am-rapvar') || 'full'; } catch { }
  if (!VAR.some(x => x[0] === variant)) variant = 'full';
  const html = head('Raport', 'Dla klienta', true) + `<div class="chips" id="rvar" style="margin-bottom:12px">${VAR.map(([k, n]) => `<button type="button" class="chip ${k === variant ? 'on' : ''}" data-v="${k}">${n}</button>`).join('')}</div>
    <p class="tiny muted" id="rvh" style="margin:-4px 0 12px"></p><div id="rp"><div class="empty"><b>Przygotowuję raport…</b></div></div>
    <div class="row" style="position:sticky;bottom:calc(var(--nav) + var(--sab) + 12px)"><button class="btn" id="pdf" disabled>Udostępnij PDF</button></div>`;
  const HINT = { short: 'Jedna strona: wynik, przedział i pewność oceny. Bez tabeli porównań.', full: 'Wynik, opis metody, tabela porównań przy sprzedaży lub porównanie rynkowe przy najmie i najbliższe okolice (odległości do przystanków, szkół itp., gdy serwer ma dane).', market: 'Jak pełny, a do tego wykres cen transakcyjnych w czasie i rentowność najmu w dzielnicach.', inwest: 'Zwrot, IRR, NPV, wynik po sprzedaży i scenariusze, z danych wpisanych w kalkulatorze.', lokal: 'Odległości od budynku i liczba punktów w promieniach od 300 m do 3 km.', rent: 'Wartość i czynsz tej nieruchomości oraz rentowność brutto na tle dzielnic.', rynek: 'Trend cen, rentowność dzielnic i czas ekspozycji ofert. Bez wyniku wyceny.' };
  return [html, async v => {
    $('[data-back]', v).onclick = back; let pages = [], seq = 0, lastOpts = null, busy = false;
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
      let okol = null, okSrc = '', okMiss = false, prom = null, okOpis = ''; if (variant !== 'short' && variant !== 'rynek' && variant !== 'inwest' && variant !== 'rent') { try { const g = await ensureGeo(e); if (g.ok) { const lay = (await loadAll({ url: osmUrl(S.ust.rcnUrl) })).layers; okol = okolica(g.ll, lay); prom = promienie(g.ll, lay); okOpis = opisLokalizacji(prom); okSrc = g.source === 'prg' ? `Położenie budynku: ${g.street} ${g.number}, ${g.city || 'Lublin'} (Państwowy Rejestr Granic, GUGiK).` : 'Położenie budynku wskazano ręcznie na mapie.'; } else okMiss = true; } catch { okMiss = true; } }
      const extra = { variant, market: ['market', 'rent', 'rynek'].includes(variant) ? market() : null, okolica: okol, okolicaNote: okSrc, promienie: prom, okolicaOpis: okOpis, radii: PROMIENIE.map(promLbl) };
      if (variant === 'rynek' && extra.market) { const X = exposure(S.offers, S.ust.zebrania || []); if (X.ok && X.days) extra.market.exp = X; }
      if (variant === 'full' || variant === 'market') { const og = e.teczka ? ogledLast(S.teczki.find(t => t.id === e.teczka)) : null; if (og && og.w.kat) extra.ogled = { ...og.w, fl: (e.subj.kat || 'mieszkanie') === 'mieszkanie', nota: NOTA }; }
      let brak = '';
      if (variant === 'lokal' && !(okol && okol.length)) brak = okMiss ? 'Brak położenia budynku w rejestrze adresów. Ustal je w wyniku wyceny, w karcie Najbliższe okolice.' : 'Brak danych punktów okolicy z serwera.';
      if (variant === 'rynek' && !extra.market.trend && !extra.market.yield) brak = 'Za mało danych RCN do raportu rynku.';
      if (variant === 'rent') { const p = rentPair(e); extra.pair = p; if (!p) brak = 'Do tego raportu potrzebne są wycena sprzedaży i wycena najmu tej samej nieruchomości. Wykonaj obie, w odstępie do 180 dni, albo użyj pełnej analizy w teczce.'; }
      if (variant === 'inwest') { const p = rentPair(e), I = p ? { ...S.invest, pcc: '', cena: midRange(e.subj.tryb === 'sprzedaz' ? e : { subj: { tryb: 'sprzedaz' }, res: { ok: true, total: { lo: p.wartosc, hi: p.wartosc } } }).mid, czynsz: roundTo(p.czynsz, 10) } : null, h = I ? holdCalc(I) : null; if (h && h.ok) { extra.invest = { inp: I, h, scen: scenarios(I) }; $('#rvh', v).textContent += ` Założenia z kalkulatora, sprawdź czy dotyczą tej nieruchomości: notariusz i wpisy ${fmt(+I.kosztyInne || 0)} zł, remont ${fmt(+I.remont || 0)} zł, koszty ${fmt(+I.oplaty || 0)} zł/mies.`; } else brak = 'Do tego raportu potrzebne są wycena sprzedaży i wycena najmu tej samej nieruchomości, wykonane w odstępie do 180 dni. Wykonaj obie albo użyj pełnej analizy w teczce.'; }
      if (brak) { if (my === seq) { $('#rp', v).innerHTML = `<div class="empty"><b>Nie można przygotować tego raportu</b>${esc(brak)}</div>`; pages = []; } return; }
      lastOpts = extra;
      try { await document.fonts.ready; pages = await buildReport(e, S.ust, extra); } catch (err) { if (my === seq) $('#rp', v).innerHTML = `<div class="empty"><b>Nie udało się zbudować raportu</b>${esc(err.message)}</div>`; return; }
      if (my !== seq) return;
      $('#rp', v).innerHTML = pages.map(c => `<img class="report-img" alt="Strona raportu" src="${c.toDataURL('image/jpeg', .92)}">`).join('');
      if (okMiss) $('#rvh', v).textContent += ' Brak położenia budynku, więc raport nie zawiera odległości do ważnych miejsc (uzupełnisz je w wyniku wyceny).';
      if (variant === 'market' && !market().trend && !market().yield) $('#rvh', v).textContent += ' Brak wystarczających danych RCN do wykresów, więc raport ich nie zawiera.';
      b.disabled = false;
    };
    $('#rvar', v).onclick = ev => { const bt = ev.target.closest('button[data-v]'); if (!bt || busy) return; variant = bt.dataset.v; try { localStorage.setItem('am-rapvar', variant); } catch { } $$('#rvar button', v).forEach(x => x.classList.toggle('on', x === bt)); draw(); };
    const b = $('#pdf', v);
    b.onclick = async () => { busy = true; b.disabled = true; const vr = variant, op = lastOpts; try {
      const docNo = nextDoc(), done = await buildReport(e, S.ust, { ...op, docNo, docWid: e.id || '' }), blob = makePdf(done);
      const nm = 'Analiza-' + ({ short: 'krotka', market: 'rynek', inwest: 'inwestycyjna', lokal: 'lokalizacja', rent: 'rentownosc', rynek: 'rynek-lokalny' }[vr] || 'rynkowa') + '-' + docNo.replace(/\//g, '-') + '.pdf', r = await saveFile(blob, nm);
      if (r !== 'cancel') { S.dokumenty.unshift({ id: uid(), no: docNo, ts: Date.now(), typ: VAR.find(x => x[0] === vr)[1], wid: e.id || null, opis: subjLine(e.subj) }); save.dokumenty(); toast(r === 'share' ? 'Gotowe' : 'Pobrano PDF'); }
    } catch (err) { toast('Nie udało się zapisać PDF'); } finally { busy = false; b.disabled = false; } };
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
  S.offers = wszystkie(); S.poza = [];
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
  podziel(S.offers); S.ust.zebrania = z; save.ust(); save.offers();
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
  const html = head('Monitoring ofert', 'Ogłoszenia najmu w bazie') + safeBanner() + `
  <div class="card"><div id="of-filters">
    <div class="field"><span>Status</span>${chips('status', [['', 'Wszystkie'], ['zmiany', 'Zmiany cen'], ['nowe', 'Nowe ogłoszenia'], ['aktualne', 'Aktualne'], ['nieaktualne', 'Nieaktualne']])}</div>
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
      const rows = all.filter(([o, s]) => (!f.status || (f.status === 'zmiany' ? !!(o.hc && o.hc.length > 1) : s === f.status)) && (f.pokoje === '' || (f.pokoje === '3' ? o.pokoje >= 3 : o.pokoje === +f.pokoje)) && (!f.metraz || (o.m2 >= r0 && o.m2 < r1)) && (!f.dz || o.dzielnica === f.dz)
        && f.attrs.every(k => o.attrs && o.attrs[k] === 1) && (!f.parking || (o.parking && o.parking.stan === f.parking))).sort((a, b) => ord[a[1]] - ord[b[1]] || (b[0].ts || 0) - (a[0].ts || 0));
      const shown = rows.slice(0, f.lim);
      const prevTxt = o => { const h = (o.hc || []).map(x => x[1]).slice(0, -1).reverse(); return h.length ? ` <span class="prev">(poprzednio ${h.map(x => fmt(x) + ' zł').join(', ')})</span>` : ''; };
      const row = ([o, s]) => {
        const title = esc([o.ulica, o.dzielnica].filter(Boolean).join(', ') || 'Oferta najmu'), pk = parkNote(o.parking);
        const meta = `${String(o.m2).replace('.', ',')} m² · ${o.pokoje} pok.${o.pietro != null ? ' · ' + (o.pietro === 0 ? 'parter' : o.pietro + '. p.') : ''}${o.czynsz ? ' · czynsz adm. ' + fmt(o.czynsz) + ' zł' : ''}`;
        const badges = `${s !== 'aktualne' ? `<i class="bd ${s}">${s}</i>` : ''}${pk ? `<i class="bd park">${esc(pk)}</i>` : ''}${o.flagi && o.flagi.length ? '<i class="bd warn">podejrzana</i>' : ''}`;
        const inner = `<div class="t"><b>${title}</b>${o.url ? '<span class="ext" aria-hidden="true">↗</span>' : ''}</div><div class="p">${fmt(o.cena)} zł${prevTxt(o)}</div><div class="m">${meta}</div><div class="b">${badges}</div>`;
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
  <div class="card"><div class="eyebrow">Oferty najmu</div><div class="kv"><span>W bazie</span><b>${fmt(n)}</b></div>${S.poza.length ? `<div class="kv"><span>Spoza Lublina (czekają, poza wycenami)</span><b>${fmt(S.poza.length)}</b></div>` : ''}<div class="kv"><span>Podejrzane (pominięte)</span><b>${fl}</b></div><div class="kv"><span>Wyłączone ręcznie</span><b>${off}</b></div>
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
    $('[data-act="exp"]', v).onclick = async () => { const blob = new Blob([JSON.stringify({ v: 1, offers: wszystkie(), wlasne: S.wlasne, budynki: S.budynki, wyceny: S.wyceny, teczki: S.teczki, dokumenty: S.dokumenty, ust: S.ust })], { type: 'application/json' }); await saveFile(blob, 'kopia-wycena-' + new Date().toISOString().slice(0, 10) + '.json'); };
    const fb = $('#fbak', v); $('[data-act="imp"]', v).onclick = () => fb.click();
    fb.onchange = async () => { try { const d = JSON.parse(await fb.files[0].text()); if (!Array.isArray(d.offers)) throw new Error('to nie jest kopia'); podziel(d.offers); sync.allowMassDelete(); S.wlasne = d.wlasne || []; save.wlasne(); S.budynki = d.budynki || {}; S.wyceny = d.wyceny || []; if (d.teczki) { S.teczki = d.teczki; save.teczki(); } S.ust = { ...S.ust, ...(d.ust || {}) }; save.offers(); save.budynki(); save.wyceny(); save.ust(); toast('Przywrócono'); render(); } catch (e) { toast('Błąd: ' + e.message); } };
    $('[data-act="clear"]', v).onclick = () => { if (confirm(syncOn ? 'Usunąć wszystkie oferty z bazy? Zniknie też z serwera i z pozostałych urządzeń.' : 'Usunąć wszystkie oferty z bazy?')) { S.offers = []; S.poza = []; sync.allowMassDelete(); save.offers(); render(); } };
  }];
}
async function setRcn(pack, quiet) {
  if (!pack || !Array.isArray(pack.cols) || !Array.isArray(pack.rows) || !pack.cols.includes('cena')) throw new Error('nieznany format');
  await store.set('rcn', pack); S.rcn = pack; setTx();
  if (!quiet) { toast(`Wczytano ${fmt(S.tx.length)} transakcji`); render(); }
}
async function setRcnInne(pack, quiet) {
  if (!pack || !Array.isArray(pack.cols) || !Array.isArray(pack.rows) || !pack.cols.includes('nier')) throw new Error('nieznany format pliku domów i gruntów');
  await store.set('rcnInne', pack); S.rcnInne = pack; setTx();
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
  const have = new Set(wszystkie().map(offerKey)); const seen = new Set(); let neu = [], dup = 0;
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
  const w = id ? S.wlasne.find(x => x.id === id) : null, d = { standard: w?.standard || '', meble: w?.meble || '', kat: w?.kat || 'mieszkanie' };
  const chips = (k, items) => `<div class="chips" data-oc="${k}">${items.map(([v, n]) => `<button type="button" class="chip ${d[k] === v ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div>`;
  openSheet(`<h3>Umowa najmu</h3><p class="small muted">Czynsz najmu z umowy (bez czynszu administracyjnego i opłat). Bez danych osobowych.</p>
    <div class="field"><span>Rodzaj nieruchomości</span>${chips('kat', [['mieszkanie', 'Mieszkanie'], ['dom', 'Dom'], ['lokal', 'Lokal użytkowy'], ['obiekt', 'Hala / obiekt'], ['garaz', 'Garaż']])}</div>
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
      const m2 = num('#o-m2'), cena = num('#o-ce'), pk = num('#o-pk'), box = $('#o-live', p); if (d.kat !== 'mieszkanie') { box.textContent = m2 >= 5 && cena >= 100 ? 'Umowa trafi do bazy tej kategorii. Porównanie z modelem jest tylko dla mieszkań.' : ''; return; } if (!(m2 >= 10 && cena >= 200 && pk >= 1)) { box.textContent = ''; return; }
      let dz = $('#o-dz', p).value.trim(); const ul = $('#o-ul', p).value.trim(); if (!dz && ul) { const inf = inferDistrict(allOffers(), S.tx, ul); if (inf) dz = inf.name; }
      const c = ownCheck({ ulica: ul, dzielnica: dz, m2, pokoje: Math.round(pk), pietro: num('#o-pi'), rok: num('#o-rok'), standard: d.standard, meble: d.meble, cena }, w?.id);
      box.innerHTML = c ? `Bez tej umowy aplikacja wyceniłaby to mieszkanie na <b>${fmt(roundTo(c.r.total.lo, 10))}–${fmt(roundTo(c.r.total.hi, 10))} zł</b>. Twoja umowa: <b>${fmt(cena)} zł</b> (${devTxt(c)} od środka) ${c.inR ? '<span class="badge g">w przedziale</span>' : '<span class="badge">poza przedziałem</span>'}` : 'Za mało ofert w bazie, by porównać.';
    };
    let lt = null; $$('input', p).forEach(i => i.addEventListener('input', () => { clearTimeout(lt); lt = setTimeout(live, 600); })); $$('[data-oc] button', p).forEach(b => b.addEventListener('click', () => { clearTimeout(lt); lt = setTimeout(live, 300); })); if (w) setTimeout(live, 200);
    const saveOwn = again => {
      const m2 = num('#o-m2'), cena = num('#o-ce'), pk = num('#o-pk');
      const flat0 = d.kat === 'mieszkanie'; if (!(m2 >= (flat0 ? 10 : 5) && m2 <= (flat0 ? 400 : 20000))) return toast(flat0 ? 'Podaj powierzchnię (10–400 m²)' : 'Podaj powierzchnię (5–20000 m²)'); if (!(cena >= (flat0 ? 200 : 100) && cena <= (flat0 ? 30000 : 500000))) return toast('Podaj czynsz najmu w zł'); if (flat0 && !(pk >= 1 && pk <= 10)) return toast('Podaj liczbę pokoi');
      const rok = num('#o-rok'); if (rok != null && !(rok >= 1700 && rok <= now() + 3)) return toast('Rok budowy wygląda błędnie');
      let dz = $('#o-dz', p).value.trim(), ul = $('#o-ul', p).value.trim();
      if (!dz && ul) { const inf = inferDistrict(allOffers(), S.tx, ul); if (inf) dz = inf.name; }
      const rec = { id: w?.id || uid(), ulica: ul, dzielnica: dz, m2, pokoje: Math.round(pk || 0), pietro: num('#o-pi'), rok, standard: d.standard, meble: d.meble, ...(d.kat !== 'mieszkanie' ? { kat: d.kat } : { kat: undefined }), cena: Math.round(cena), czynsz: num('#o-ca'), ts: w?.ts || Date.now() };
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
  const html = head('Teczki i historia', tab === 'wyceny' ? 'Zapisane wyceny' : tab === 'teczki' ? 'Teczki nieruchomości' : 'Zadania i przypomnienia') + seg + body;
  return [html, v => {
    $$('[data-ht]', v).forEach(b => b.onclick = () => { S.histTab = b.dataset.ht; render(); });
    const c = $('[data-act="clr"]', v); if (c) c.onclick = () => { if (confirm('Usunąć całą historię wycen?')) { S.wyceny = []; save.wyceny(); render(); } };
    const n = $('[data-act="newt"]', v); if (n) n.onclick = () => { const t = newTeczka(null); go('#/teczka/' + t.id); };
  }];
}

async function resizeLogo(file, max = 320) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const d = c.toDataURL('image/png'); if (d.length > 150000) return c.toDataURL('image/jpeg', .85); return d;
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
  <button class="btn" data-act="pelna" type="button">Pełna analiza nieruchomości</button>${t.analiza ? `<div class="gap"></div><a class="btn ghost" href="#/analiza/${t.id}" style="text-decoration:none">Ostatnia analiza: ${new Date(t.analiza.ts).toLocaleDateString('pl-PL')}</a>` : ''}<div class="gap"></div>${kartaOK(t) ? `<a class="btn ghost" href="#/ogledziny/${t.id}" style="text-decoration:none">Karta oględzin</a><div class="gap"></div>${ogledLista(t)}` : ''}
  <div class="card"><div class="eyebrow">Dane nieruchomości</div>${field('nazwa', 'Nazwa teczki (opcj.)', 'np. Granata 12/4')}${field('klient', 'Klient (opcj.)', 'imię lub nazwa')}
    <div class="grid2">${field('ulica', 'Ulica')}${field('nr', 'Numer')}</div>${field('dzielnica', 'Dzielnica')}
    <div class="grid2">${field('m2', 'Powierzchnia (m²)', '', 'decimal')}${field('pokoje', 'Pokoje', '', 'numeric')}</div><div class="grid2">${field('pietro', 'Piętro', '', 'numeric')}${field('rok', 'Rok budowy', '', 'numeric')}</div></div>
  <div class="card"><div class="eyebrow">Postępowanie</div><div class="chips" data-tst>${TSTAT.map(([k, n]) => `<button type="button" class="chip ${t.status === k ? 'on' : ''}" data-v="${k}">${n}</button>`).join('')}</div>
    <label class="field" style="margin-top:12px"><span>Koniec umowy najmu (opcj.)</span><input class="in" type="date" data-tk="koniecUmowy" value="${esc(t.koniecUmowy || '')}"></label>
    <div id="tzad"></div><div class="grid2" style="margin-top:8px"><input class="in" id="tz-txt" placeholder="Nowe zadanie, np. oddzwonić"><input class="in" id="tz-due" type="date"></div><div class="gap"></div><button class="btn ghost" id="tz-add">Dodaj zadanie</button></div>
  <div class="card"><div class="eyebrow">Wartość w czasie</div><div id="tchart"></div></div>
  <div id="tdiff"></div>
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
      $$('[data-tm]', box).forEach(b => b.onclick = () => { mode = b.dataset.tm; drawDiff.a = drawDiff.b = null; drawChart(); drawDiff(); }); bindCharts(box);
    };
    drawChart();
    const drawDiff = () => {
      const box = $('#tdiff', v), pool = ws.filter(e => e.subj.tryb === mode && midRange(e)); if (pool.length < 2) { box.innerHTML = ''; return; }
      const lbl = e => new Date(e.ts).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' · ' + fmt(midRange(e).mid) + ' zł', opt = (sel) => pool.map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(lbl(e))}</option>`).join('');
      let ida = drawDiff.a && pool.some(e => e.id === drawDiff.a) ? drawDiff.a : pool[pool.length - 2].id, idb = drawDiff.b && pool.some(e => e.id === drawDiff.b) ? drawDiff.b : pool[pool.length - 1].id;
      const ea = pool.find(e => e.id === ida), eb = pool.find(e => e.id === idb), [A, B] = (ea.ts || 0) <= (eb.ts || 0) ? [ea, eb] : [eb, ea], d = diffWyceny(A, B), st = mode === 'sprzedaz' ? 1000 : 10;
      box.innerHTML = `<div class="card"><div class="eyebrow">Porównanie wycen (${mode === 'sprzedaz' ? 'sprzedaż' : 'najem'})</div><div class="grid2"><label class="field"><span>Wycena</span><select class="in" id="dfa">${opt(ida)}</select></label><label class="field"><span>Porównaj z</span><select class="in" id="dfb">${opt(idb)}</select></label></div>
        ${A === B ? '<p class="small muted" style="margin:0">Wybierz dwie różne wyceny.</p>' : `<div class="kv"><span>Zmiana wartości</span><b style="color:${d.delta > 0 ? 'var(--ok)' : d.delta < 0 ? 'var(--bad)' : 'inherit'}">${d.delta >= 0 ? '+' : '−'}${fmt(Math.abs(roundTo(d.delta, st)))} zł (${d.pct >= 0 ? '+' : '−'}${Math.abs(d.pct).toFixed(1).replace('.', ',')}%)</b></div><div class="kv"><span>Było i jest</span><b>${fmt(roundTo(d.ma, st))} → ${fmt(roundTo(d.mb, st))} zł</b></div><div class="kv"><span>Przedział teraz</span><b>${fmt(roundTo(d.lo[1], st))} – ${fmt(roundTo(d.hi[1], st))} zł</b></div><div class="kv"><span>Porównań</span><b>${d.na} → ${d.nb}</b></div><div class="kv"><span>Pewność</span><b>${d.conf[0]} → ${d.conf[1]}</b></div><div class="kv"><span>Odstęp</span><b>${d.dni} dni</b></div><div class="eyebrow" style="margin-top:12px">Co się zmieniło</div><ul class="clean">${d.powody.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`}</div>`;
      $('#dfa', box).onchange = ev => { drawDiff.a = ev.target.value; drawDiff.b = idb; drawDiff(); }; $('#dfb', box).onchange = ev => { drawDiff.b = ev.target.value; drawDiff.a = ida; drawDiff(); };
    };
    drawDiff();
    $('[data-act="pelna"]', v).onclick = async ev => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'Analizuję…'; await new Promise(r => setTimeout(r, 30)); let err = null; try { err = await fullAnalysis(t); } catch (x) { err = 'Analiza nie powiodła się: ' + x.message; }
      const tu = location.hash === '#/teczka/' + t.id; if (err) { toast(err); if (b.isConnected) { b.disabled = false; b.textContent = 'Pełna analiza nieruchomości'; } } else if (tu) go('#/analiza/' + t.id); else toast('Pełna analiza gotowa: ' + tName(t)); };
    const prefill = tryb => { Object.assign(S.form, { tryb, kat: t.kat || 'mieszkanie', ulica: t.ulica || '', nr: t.nr || '', dzielnica: t.dzielnica || '', m2: t.m2 ? String(t.m2) : '', pokoje: t.pokoje === '' ? S.form.pokoje : t.pokoje, pietro: t.pietro === '' ? null : t.pietro, rok: t.rok ? String(t.rok) : '' }); S.teczkaNext = t.id; go('#/wycena'); };
    $('[data-act="w-sale"]', v).onclick = () => prefill('sprzedaz'); $('[data-act="w-rent"]', v).onclick = () => prefill('najem');
    const tph = $('#tph', v); $('[data-act="addph"]', v).onclick = () => tph.click();
    tph.onchange = async () => { const list = (S.foto[id] || []).slice(); for (const f of [...tph.files]) { if (list.length >= 12) { toast('Najwyżej 12 zdjęć w teczce'); break; } try { list.push(await resizePhoto(f)); } catch { toast('Nie udało się wczytać zdjęcia'); } } S.foto[id] = list; await store.set('foto', S.foto); render(); };
    $$('[data-ph]', v).forEach(b => b.onclick = () => { const i = +b.dataset.ph; openSheet(`<img src="${fotos[i]}" alt="" style="width:100%;border-radius:14px"><div class="gap"></div><button class="btn danger" id="phdel">Usuń zdjęcie</button>`, p => { $('#phdel', p).onclick = async () => { S.foto[id] = fotos.filter((_, j) => j !== i); await store.set('foto', S.foto); closeSheet(); render(); }; }); });
    $('[data-act="delt"]', v).onclick = async () => { if (!confirm('Usunąć teczkę? Wyceny zostaną w historii, zdjęcia zostaną skasowane.')) return; S.wyceny.forEach(e => { if (e.teczka === id) delete e.teczka; }); save.wyceny(); S.teczki = S.teczki.filter(x => x.id !== id); save.teczki(); delete S.foto[id]; await store.set('foto', S.foto); go('#/historia'); };
  }];
}
/* ---------- KARTA OGLĘDZIN ---------- */
const kartaOK = t => ['mieszkanie', 'dom'].includes(t.kat || 'mieszkanie');
const ogledLast = t => (t?.ogledziny || []).filter(o => o.done && o.w).pop() || null;
const dataPl = ts => new Date(ts).toLocaleDateString('pl-PL');
const ogledLista = t => { const l = (t.ogledziny || []).filter(o => o.done && o.w).reverse(); return l.length ? `<div class="card"><div class="eyebrow">Oględziny (${l.length})</div>${l.map(o => `<a class="off" href="#/ogledziny/${t.id}/w/${o.id}" style="text-decoration:none;color:inherit"><div><b>${o.w.kat ? o.w.kat[0].toUpperCase() + o.w.kat.slice(1) : 'Za mało danych'}</b></div><div class="p" style="font-size:13px">${dataPl(o.ts)}</div><div class="m">sprawdzono ${o.w.spr} z ${o.w.ile} elementów${o.w.wstep.length ? ' · wstępnie' : ''}</div></a>`).join('')}</div>` : ''; };
function ogledKarta(e) {
  const t = e.teczka && S.teczki.find(x => x.id === e.teczka); if (!t || !kartaOK(t)) return '';
  const o = ogledLast(t);
  return `<div class="card"><div class="eyebrow">Standard nieruchomości</div>${o ? `<h3>${o.w.kat ? o.w.kat[0].toUpperCase() + o.w.kat.slice(1) : 'Za mało danych'}</h3><p class="small muted" style="margin:4px 0 10px">Oględziny z ${dataPl(o.ts)}${o.w.wstep.length ? ', wstępnie' : ''}. Nie zmienia wyniku wyceny.</p><a class="btn ghost" href="#/ogledziny/${t.id}/w/${o.id}" style="text-decoration:none">Zobacz oględziny</a>` : `<p class="small muted" style="margin:0 0 10px">Brak oględzin tej nieruchomości.</p><a class="btn ghost" href="#/ogledziny/${t.id}" style="text-decoration:none">Wykonaj oględziny</a>`}</div>`;
}
function wynikOgl(w, zap) {
  const nazwa = w.kat ? w.kat[0].toUpperCase() + w.kat.slice(1) : 'Za mało danych', tick = (l, c, z) => l.map(x => `<div class="tick ${c}"><i>${z}</i><span>${esc(x)}</span></div>`).join('');
  return `<div class="card hero"><div class="lbl">Standard nieruchomości</div><div class="big gold">${nazwa}</div>${w.kat && w.wstep.length ? `<div class="sub" style="color:var(--warn)">wstępnie, nie sprawdzono: ${esc(w.wstep.join(', '))}</div>` : ''}<div class="sub">${esc(w.opis)}</div></div>
  <div class="card"><div class="eyebrow">Dlaczego</div><p class="small muted" style="margin:0">${esc(w.why)}</p>${w.atuty.length ? `<div class="gap"></div>${tick(w.atuty, '', '✓')}` : ''}</div>
  ${w.popraw.length ? `<div class="card"><div class="eyebrow">Do poprawy</div>${tick(w.popraw, 'm', '!')}</div>` : ''}${w.nie.length ? `<div class="card"><div class="eyebrow">Nie sprawdzono</div><p class="small muted" style="margin:0">${esc(w.nie.join(', '))}</p></div>` : ''}
  <p class="tiny muted">${NOTA}</p>`;
}
function viewOgledziny(p) {
  const id = p[1], t = id && S.teczki.find(x => x.id === id);
  if (!id) { const l = S.teczki.filter(kartaOK);
    const html = head('Karta oględzin', 'Wybierz nieruchomość', true) + `<img class="res-foto sm kbanner" src="img/t-ogledziny.webp" alt="">${l.map(x => `<a class="card alink" href="#/ogledziny/${x.id}"><div class="eyebrow">${KAT[x.kat || 'mieszkanie'].n}</div><h3>${esc(tName(x))}</h3>${ogledLast(x) ? `<div class="small muted">Ostatnie oględziny: ${dataPl(ogledLast(x).ts)}</div>` : ''}</a>`).join('') || '<div class="empty"><b>Brak teczek</b>Karta oględzin zapisuje się w teczce nieruchomości.</div>'}<button class="btn" data-act="nowa" type="button">Nowa teczka</button>`;
    return [html, v => { $('[data-back]', v).onclick = () => go('#/start'); $('[data-act="nowa"]', v).onclick = () => { const n = newTeczka(null); go('#/teczka/' + n.id); }; }]; }
  if (!t || !kartaOK(t)) return [head('Karta oględzin', '', true) + '<div class="empty"><b>Niedostępna</b>Karta dotyczy mieszkań i domów.</div>', v => $('[data-back]', v).onclick = () => go('#/ogledziny')];
  const lst = (t.ogledziny ||= []), kat = t.kat || 'mieszkanie';
  if (p[2] === 'w') {
    const o = lst.find(x => x.id === p[3]); if (!o) return [head('Wynik oględzin', '', true) + '<div class="empty"><b>Nie znaleziono</b></div>', v => $('[data-back]', v).onclick = () => go('#/teczka/' + id)];
    const w = o.done && o.w ? o.w : ocen(o, kat), STD = { niski: 'remont', 'przeciętny': 'dobry', wysoki: 'wysoki' }[w.kat];
    const html = head('Wynik oględzin', esc(tName(t)) + ' · ' + dataPl(o.ts), true, true) + wynikOgl(w) + `${o.done ? '' : '<button class="btn" data-act="zap" type="button">Zapisz w teczce i raporcie</button><div class="gap"></div>'}${STD ? '<button class="btn ghost" data-act="uzyj" type="button">Użyj standardu w wycenie</button><div class="gap"></div>' : ''}<button class="btn ghost" data-act="pop" type="button">Popraw odpowiedzi</button><div class="gap"></div><button class="btn danger" data-act="del" type="button">Usuń oględziny</button>`;
    return [html, v => {
      $('[data-back]', v).onclick = () => go(o.done ? '#/teczka/' + id : '#/ogledziny/' + id);
      const z = $('[data-act="zap"]', v); if (z) z.onclick = () => { o.done = true; o.w = ocen(o, kat); o.ts = Date.now(); t.ts = Date.now(); save.teczki(); toast('Zapisano w teczce'); go('#/teczka/' + id); };
      const u = $('[data-act="uzyj"]', v); if (u) u.onclick = () => { Object.assign(S.form, { tryb: S.form.tryb, kat, ulica: t.ulica || '', nr: t.nr || '', dzielnica: t.dzielnica || '', m2: t.m2 ? String(t.m2) : '', pokoje: t.pokoje === '' || t.pokoje == null ? S.form.pokoje : t.pokoje, pietro: t.pietro === '' ? null : t.pietro, rok: t.rok ? String(t.rok) : '', standard: STD }); S.teczkaNext = id; toast('Standard wpisany do formularza'); go('#/wycena'); };
      $('[data-act="pop"]', v).onclick = () => { o.done = false; delete o.w; t.ts = Date.now(); save.teczki(); go('#/ogledziny/' + id); };
      $('[data-act="del"]', v).onclick = () => { if (!confirm('Usunąć te oględziny?')) return; t.ogledziny = lst.filter(x => x !== o); t.ts = Date.now(); save.teczki(); go('#/teczka/' + id); };
    }];
  }
  let o = lst.find(x => !x.done); const nowy = !o; if (nowy) { o = { id: uid(), ts: Date.now(), ans: {}, mat: {}, dev: false }; lst.push(o); t.ts = Date.now(); save.teczki(); }
  const S2 = sekcje(kat), all = S2.flatMap(([, l]) => l), btns = (e) => `<div class="kg n${ODP[e.typ].length}">${ODP[e.typ].map(([k, l]) => `<button type="button" class="chip k2 ${o.ans[e.id] === k ? 'on' : ''}" data-o="${k}">${l}</button>`).join('')}</div>`;
  const elHTML = e => `<div class="ke" data-el="${e.id}"><b>${e.n}</b>${btns(e)}${e.mat ? `<div class="chips kmat">${e.mat.map(m => `<button type="button" class="chip ${(o.mat || {})[e.id] === m ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div>` : ''}${e.nd ? `<div class="chips kmat"><button type="button" class="chip ${o.ans[e.id] === 'nd' ? 'on' : ''}" data-o="nd">Nie dotyczy</button></div>` : ''}</div>`;
  const html = head('Karta oględzin', esc(tName(t)), true, true) + `<img class="res-foto sm kbanner" src="img/t-ogledziny.webp" alt=""><div class="small muted" id="kpro"></div><div class="pg"><i id="kbar"></i></div>
  <div class="card"><label class="check" style="margin:0"><input type="checkbox" id="kdev" ${o.dev ? 'checked' : ''}> Stan deweloperski: bez wykończenia i wyposażenia</label></div>
  <div id="kel">${S2.map(([n, l]) => `<div class="card"><div class="eyebrow">${n}</div>${l.map(elHTML).join('')}</div>`).join('')}</div>
  <button class="btn" data-act="wyn" type="button">Pokaż wynik</button>`;
  return [html, v => {
    const pro = () => { const u = all.filter(e => o.ans[e.id] !== 'nd'), c = u.filter(e => o.ans[e.id] && o.ans[e.id] !== 'ns').length; $('#kpro', v).textContent = `Sprawdzono ${c} z ${u.length} elementów`; $('#kbar', v).style.width = (u.length ? c / u.length * 100 : 0) + '%'; $('#kel', v).style.display = o.dev ? 'none' : ''; };
    const touch = () => { t.ts = Date.now(); save.teczki(); pro(); }; pro();
    $('[data-back]', v).onclick = () => go('#/teczka/' + id);
    $('#kdev', v).onchange = e => { o.dev = e.target.checked; touch(); };
    $$('.ke', v).forEach(el => { const k = el.dataset.el;
      $$('[data-o]', el).forEach(b => b.onclick = () => { o.ans[k] = o.ans[k] === b.dataset.o ? undefined : b.dataset.o; if (o.ans[k] === undefined) delete o.ans[k]; $$('[data-o]', el).forEach(x => x.classList.toggle('on', o.ans[k] === x.dataset.o)); touch(); });
      $$('[data-m]', el).forEach(b => b.onclick = () => { (o.mat ||= {})[k] = o.mat[k] === b.dataset.m ? undefined : b.dataset.m; if (o.mat[k] === undefined) delete o.mat[k]; $$('[data-m]', el).forEach(x => x.classList.toggle('on', o.mat[k] === x.dataset.m)); touch(); }); });
    $('[data-act="wyn"]', v).onclick = () => { t.ts = Date.now(); save.teczki(); go(`#/ogledziny/${id}/w/${o.id}`); };
  }];
}

/* ---------- PEŁNA ANALIZA: jedno kliknięcie w teczce, te same dane, bez ponownego wpisywania ---------- */
async function fullAnalysis(t) {
  const kat = t.kat || 'mieszkanie', flat = kat === 'mieszkanie';
  if (!String(t.ulica || '').trim() || !String(t.nr || '').trim()) return 'Uzupełnij ulicę i numer w teczce';
  if (!(parseFloat(String(t.m2).replace(',', '.')) > 0)) return 'Uzupełnij powierzchnię w teczce';
  if (flat && !(+t.pokoje > 0)) return 'Uzupełnij liczbę pokoi w teczce';
  // Cechy spoza teczki (standard, rynek, wyposażenie itd.) z ostatniej wyceny tej teczki: analiza ma liczyć tę samą nieruchomość co formularz
  const prev = tr => { const w = tWyceny(t.id); return (w.filter(e => e.subj.tryb === tr).pop() || w[w.length - 1] || { subj: {} }).subj; };
  const form = tryb => { const q = prev(tryb), same = q.tryb === tryb; return { tryb, kat, pod: q.pod || '', dzm2: q.dzm2 ? String(q.dzm2) : '', ulica: String(t.ulica).trim(), nr: String(t.nr).trim(), dzielnica: t.dzielnica || (same && q.dzielnica) || '', m2: String(t.m2), pokoje: flat ? +t.pokoje : 2, pietro: t.pietro === '' || t.pietro == null ? null : +t.pietro, rok: t.rok ? String(t.rok) : (q.rok ? String(q.rok) : ''), rynek: q.rynek || '', standard: q.standard || '', meble: same && q.meble ? q.meble : '', zapamietaj: false, ud: same && q.attrs ? Object.keys(q.attrs).filter(k => q.attrs[k] && k !== 'garaz') : [], parking: (same && q.parking) || 'brak' }; };
  const out = { ts: Date.now(), kroki: [] }, krok = (k, ok, txt) => out.kroki.push({ k, ok, txt });
  const run = tryb => { const c = computeEntry(form(tryb)); if (c.err) return { txt: c.err }; const e = c.entry; if (!e.res.ok) return { txt: e.res.reason }; e.id = uid(); e.teczka = t.id; S.wyceny.unshift(e); S.last[tryb] = e; store.set('last', S.last); return { e }; };
  const a = run('sprzedaz'), b = ['dom', 'lokal', 'obiekt', 'garaz', 'mieszkanie'].includes(kat) ? run('najem') : { txt: 'Najem nie dotyczy tej kategorii.' };
  krok('Wycena sprzedaży', !!a.e, a.e ? '' : a.txt); krok('Wycena najmu', !!b.e, b.e ? '' : b.txt);
  if (a.e || b.e) save.wyceny();
  out.saleId = a.e ? a.e.id : null; out.rentId = b.e ? b.e.id : null;
  const eg = a.e || b.e; let geo = null;
  try { const g = await ensureGeo(eg || { subj: form('sprzedaz') }); if (g.ok) { geo = g; if (a.e) a.e.geo = g; if (b.e) b.e.geo = g; if (a.e || b.e) save.wyceny(); krok('Adres w rejestrze', true, `${g.street} ${g.number}, ${g.city || 'Lublin'}`); } else krok('Adres w rejestrze', false, g.message || 'Nie znaleziono budynku.'); } catch (x) { krok('Adres w rejestrze', false, x.message); }
  if (geo) { out.geo = { street: geo.street, number: geo.number, city: geo.city || 'Lublin', source: geo.source };
    try { const L = await loadAll({ url: osmUrl(S.ust.rcnUrl) }), pr = promienie(geo.ll, L.layers); out.okol = okolica(geo.ll, L.layers); out.prom = pr; out.opis = opisLokalizacji(pr); krok('Analiza lokalizacji', true, ''); } catch (x) { krok('Analiza lokalizacji', false, x.message); } }
  else krok('Analiza lokalizacji', false, 'Bez adresu w rejestrze nie liczymy odległości.');
  const m2 = parseFloat(String(t.m2).replace(',', '.'));
  try { const T = trendSeries(S.pool, { kat, m2min: Math.round(m2 * .7), m2max: Math.round(m2 * 1.3), years: 8 }); if (T.ok) { const L = T.points[T.points.length - 1]; out.trend = { med: L.med, yoy: T.yoy ? T.yoy.pct : null, n: T.n }; krok('Trend cen', true, ''); } else krok('Trend cen', false, T.reason); } catch (x) { krok('Trend cen', false, x.message); }
  if (a.e && b.e) { const I = { ...S.invest, pcc: '', cena: midRange(a.e).mid, czynsz: midRange(b.e).mid }, h = holdCalc(I);
    if (h.ok) { out.inw = { gross: h.gross, netPost: h.netPost, coc: h.coc, cfMies: h.cfMies, payback: h.payback, irr: h.irr, roi: h.roi, N: h.N, cena: I.cena, czynsz: I.czynsz }; krok('Rentowność inwestycji', true, ''); } else krok('Rentowność inwestycji', false, h.reason); }
  else krok('Rentowność inwestycji', false, 'Potrzebne są obie wyceny.');
  const T = S.teczki.find(x => x.id === t.id); if (!T) return 'Teczka została usunięta na innym urządzeniu';   // w trakcie analizy mogła przyjść synchronizacja
  if (!a.e && !b.e && T.analiza) return 'Nie udało się policzyć wycen: ' + (a.txt || b.txt);   // nieudana analiza nie kasuje poprzedniej
  T.analiza = out; T.ts = Date.now(); save.teczki(); return null;
}
function viewAnaliza(id) {
  const t = S.teczki.find(x => x.id === id), A = t && t.analiza, backT = () => go(t ? '#/teczka/' + id : '#/historia');
  if (!A) return [head('Analiza', '', true) + '<div class="empty"><b>Brak analizy</b>Uruchom pełną analizę w teczce nieruchomości.</div>', v => $('[data-back]', v).onclick = backT];
  const es = S.wyceny.find(w => w.id === A.saleId), en = S.wyceny.find(w => w.id === A.rentId), p1 = x => x == null ? '—' : pct1(x);
  const html = head('Pełna analiza', esc(tName(t)) + ' · ' + new Date(A.ts).toLocaleDateString('pl-PL'), true, true) + `
  ${katImg(t.kat) ? `<img class="res-foto" src="${katImg(t.kat)}" alt="">` : ''}${es ? `<a class="card hero alink" href="#/wynik/h/${es.id}"><div class="lbl">Szacunkowa wartość</div><div class="big gold">${fmt(midRange(es).mid)} zł</div><div class="sub">${fmt(midRange(es).lo)} – ${fmt(midRange(es).hi)} zł · pewność ${LV[es.res.confidence.level].toLowerCase()}</div></a>` : ''}
  ${en ? `<a class="card alink" href="#/wynik/h/${en.id}"><div class="eyebrow">Szacunkowy czynsz miesięcznie</div><h3>${fmt(midRange(en).mid)} zł</h3><div class="muted small">${fmt(midRange(en).lo)} – ${fmt(midRange(en).hi)} zł · pewność ${LV[en.res.confidence.level].toLowerCase()}</div></a>` : ''}
  ${A.inw ? `<div class="card"><div class="eyebrow">Inwestycja przy cenie ${fmt(A.inw.cena)} zł i czynszu ${fmt(A.inw.czynsz)} zł</div><div class="kv"><span>Zwrot brutto</span><b>${p1(A.inw.gross)}</b></div><div class="kv"><span>Zwrot netto po podatku</span><b>${p1(A.inw.netPost)}</b></div><div class="kv"><span>IRR, ${A.inw.N} lat</span><b>${p1(A.inw.irr)}</b></div><div class="kv"><span>ROI, ${A.inw.N} lat</span><b>${p1(A.inw.roi)}</b></div><div class="kv"><span>Przepływ miesięczny</span><b>${A.inw.cfMies >= 0 ? '+' : '−'}${zl(Math.abs(A.inw.cfMies))}</b></div><p class="tiny muted" style="margin:8px 0 0">Założenia podatku, kosztów, kredytu i wzrostu wartości z kalkulatora. Bez wpisanego wzrostu wartość końcowa równa się cenie zakupu.</p><div class="gap"></div><button class="btn ghost" data-act="dokalk" type="button">Otwórz w kalkulatorze</button></div>` : ''}
  ${A.opis ? `<div class="card"><div class="eyebrow">Lokalizacja</div>${A.geo ? `<p class="small" style="margin:0 0 6px"><b>${esc(A.geo.street)} ${esc(A.geo.number)}, ${esc(A.geo.city)}</b></p>` : ''}<p class="small muted" style="margin:0 0 10px">${esc(A.opis)}</p>${okTiles(A.okol || [])}</div>` : ''}
  ${A.trend ? `<div class="card"><div class="eyebrow">Ceny podobnych nieruchomości w Lublinie</div><div class="kv"><span>Mediana, ostatni okres</span><b>${fmt(A.trend.med)} zł/m²</b></div><div class="kv"><span>Rok do roku</span><b>${A.trend.yoy == null ? '—' : plPct(A.trend.yoy)}</b></div><div class="kv"><span>Podstawa</span><b>${fmt(A.trend.n)} transakcji</b></div></div>` : ''}
  <div class="card"><div class="eyebrow">Przebieg analizy</div>${A.kroki.map(k => `<div class="kv"><span>${esc(k.k)}${k.txt ? `<br><small>${esc(k.txt)}</small>` : ''}</span><b class="${k.ok ? 'q2' : 'q0'}">${k.ok ? 'gotowe' : 'pominięto'}</b></div>`).join('')}</div>
  ${es || en ? `<a class="btn" href="#/raport/h/${(es || en).id}" style="text-decoration:none">Raport dla klienta</a>` : ''}`;
  return [html, v => { $('[data-back]', v).onclick = backT; const k = $('[data-act="dokalk"]', v); if (k) k.onclick = () => { S.invest.cena = A.inw.cena; S.invest.czynsz = A.inw.czynsz; S.invest.pcc = ''; ls.set('am-invest', JSON.stringify(S.invest)); go('#/kalkulator'); }; }];
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
    <div class="card"><div class="eyebrow">Logo w raporcie</div><div id="logobox"></div></div>
    <div class="card" id="synccard"><div class="eyebrow">Synchronizacja urządzeń</div><div id="syncbody"><p class="small muted" style="margin:0">Sprawdzam…</p></div></div>
    <div class="card"><div class="eyebrow">Dziennik błędów</div><div id="errlog"></div></div>
    <div class="card"><div class="eyebrow">O aplikacji</div><div class="kv"><span>Wersja</span><b>${VERSION}</b></div><div class="kv"><span>Dane</span><b>tylko na tym urządzeniu</b></div>
    <div class="gap"></div><button class="btn ghost" data-act="upd">Wymuś aktualizację aplikacji</button><p class="tiny muted" style="margin:8px 0 0">Pobiera najnowszą wersję. Twoje dane (oferty, RCN, historia) zostają.</p>
    <p class="small muted">Szacunek ma charakter orientacyjny i nie zastępuje wyceny rzeczoznawcy majątkowego. Wynik zawsze jest przedziałem z oceną pewności; cechy bez danych porównawczych nie zmieniają go.</p></div>`;
  return [html, v => {
    { const box = $('#logobox', v), draw = () => { box.innerHTML = `<div class="row" style="align-items:center;gap:14px"><div style="width:76px;height:76px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden"><img alt="Logo" src="${S.ust.logo || 'icons/logo-am.png'}" style="max-width:100%;max-height:100%"></div><div style="flex:1"><div class="small">${S.ust.logo ? 'Własne logo biura' : 'Domyślne logo AM'}</div><div class="tiny muted">Pojawia się w nagłówku raportu PDF.</div></div></div><div class="gap"></div><label class="btn ghost" style="display:block;text-align:center">Wgraj własne logo<input type="file" accept="image/*" id="logof" hidden></label>${S.ust.logo ? '<div class="gap"></div><button class="btn ghost" id="logoX">Przywróć domyślne</button>' : ''}`;
        $('#logof', box).onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { S.ust.logo = await resizeLogo(f); save.ust(); draw(); toast('Logo zapisane'); } catch { toast('Nie udało się wczytać obrazu'); } };
        const x = $('#logoX', box); if (x) x.onclick = () => { delete S.ust.logo; save.ust(); draw(); }; }; draw(); }
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
  const m = S.mapa, MODES = [['tx', 'Sprzedaż'], ['najem', 'Najem'], ['grid', 'Ceny okolic'], ['rent', 'Rentowność']];
  const chips = (key, opts) => `<div class="chips" data-mf="${key}">${opts.map(([val, n]) => `<button type="button" class="chip ${String(m[key]) === String(val) ? 'on' : ''}" data-v="${val}">${n}</button>`).join('')}</div>`;
  const metrazF = k => `<div class="field"><span>${M2S[k][0]}</span>${chips('metraz', M2S[k][1])}<p class="tiny muted" style="margin:6px 0 0">Przedział od wartości włącznie do kolejnej wyłącznie: np. „30–40” to od 30,0 do 39,9.</p></div>`;
  const filters = () => m.mode === 'rent' ? '<p class="small muted" style="margin:0">Rentowność liczona dla mieszkań 30–70 m². Ten widok nie ma dodatkowych filtrów.</p>' : m.mode === 'najem'
    ? `<div class="field"><span>Liczba pokoi</span>${chips('pokoje', [['', 'Wszystkie'], ['1', '1 pokój'], ['2', '2 pokoje'], ['3', '3 i więcej']])}</div>${metrazF('mieszkanie')}`
    : `<div class="field"><span>Rodzaj nieruchomości</span>${chips('kat', KAT_ORDER.filter(k => k !== 'zabudowana').map(k => [k, KAT[k].n]))}</div>
      ${['mieszkanie', 'dom', 'obiekt', 'lokal'].includes(m.kat) ? `<div class="field"><span>Rynek</span>${chips('rynek', [['', 'Wszystkie'], ['wtorny', 'Wtórny'], ['pierwotny', 'Pierwotny']])}</div>` : ''}
      <div class="field"><span>Transakcje z ostatnich</span>${chips('lata', [[1, '1 roku'], [3, '3 lat'], [5, '5 lat'], [8, '8 lat']])}</div>${metrazF(m.kat)}`;
  const html = head('Mapa transakcji') + safeBanner() + `
  <div class="seg" data-n="4" data-v="${MODES.findIndex(x => x[0] === m.mode)}"><i></i>${MODES.map(([k, n]) => `<button data-mode="${k}" class="${m.mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  <div class="card mapcard"><div class="mapwrap"><div class="mapbox" id="mapbox"><div class="empty">Ładuję mapę…</div></div><div class="mapfab"><button type="button" data-fab="olay" aria-label="Warstwy">${ICON.warstwy}</button><button type="button" data-fab="mapfilters" aria-label="Filtry">${ICON.ust}</button></div></div><div id="maplegend" style="margin-top:10px"></div><button class="tilesw" id="tilesw" type="button"></button></div>
  <div class="card"><div id="mapstat" class="small muted"></div></div>
  <div class="card"><div class="eyebrow">Filtry</div><div id="mapfilters">${filters()}</div></div>
  <div class="card"><div class="eyebrow">Warstwy z OpenStreetMap</div><div class="chips" data-multi="1" id="olay">${Object.entries(OSM).map(([k, l]) => `<button type="button" class="chip" data-v="${k}">${l.n}</button>`).join('')}</div><div id="olst" class="tiny muted" style="margin-top:10px">Dotknij, aby pokazać na mapie. Dane z OpenStreetMap, odświeżane co tydzień na serwerze.</div></div>`;
  return [html, async v => {
    $$('[data-fab]', v).forEach(b => b.onclick = () => document.getElementById(b.dataset.fab).scrollIntoView({ behavior: 'smooth', block: 'center' }));
    let ctl = null, subj = S.last.sprzedaz?.res?.ok && (S.last.sprzedaz.subj.kat || 'mieszkanie') === 'mieszkanie' ? S.last.sprzedaz.res.subLL : null;
    const stat = t => { $('#mapstat', v).innerHTML = t; };
    const draw = fit => {
      ctl.clear(); let pts = [], cls, unit = '';
      if (m.mode === 'rent') {
        if (!S.tx.length) { $('#maplegend', v).innerHTML = ''; return stat('Brak danych RCN. Pobierz je w zakładce <b>Dane</b>.'); }
        const Y = yieldByDistrict(allOffers(), S.tx); if (!Y.ok) { $('#maplegend', v).innerHTML = ''; return stat(esc(Y.reason)); }
        const dc = districtCenters(allOffers(), centersOf(), normDz), items = Y.rows.map(r => ({ ...dc.get(r.d), r, v: r.y, txt: r.y.toFixed(1).replace('.', ',') + '%' })).filter(x => x.lat != null), pc = x => x.toFixed(1).replace('.', ',') + '%';
        cls = makeClasses(items.map(x => x.v)); unit = 'Rentowność brutto rocznie (%). Punkt to orientacyjny środek dzielnicy.';
        ctl.bubbles(items, cls.color, x => `<b>${esc(x.r.name)}: ${pc(x.r.y)}</b><br>czynsz ${fmt(x.r.rent)} zł/m², cena ${fmt(x.r.sale)} zł/m²<br><span class="tiny">${x.r.nr} ofert, ${x.r.ns} transakcji · środkowe 50%: ${pc(x.r.yLo)}–${pc(x.r.yHi)}</span>`); pts = items.map(x => [x.lat, x.lon]);
        stat(`<b>${items.length}</b> dzielnic z ${Y.rows.length} mających dość danych, całe miasto <b>${pc(Y.city.y)}</b>. Brutto, z cen ofertowych: bez podatku, kosztów i pustostanów.`);
      } else if (m.mode === 'najem') {
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
          pts = ctl.dots(sales.map(s => ({ ...s, v: s.pm2 })), cls.color, popupSale, { group: true });
          stat(!sales.length ? `Brak transakcji z kategorii „${KAT[m.kat].n}” dla tych filtrów. Poszerz okres albo przedział powierzchni.` : `Na mapie: <b>${fmt(sales.length)}</b> transakcji (${KAT[m.kat].m}), mediana <b>${fmt(median(sales.map(s => s.pm2)) || 0)} zł/m²</b>. Koło z liczbą to grupa transakcji: dotknij, aby zobaczyć statystyki obszaru. Po zbliżeniu widać pojedyncze sprzedaże.`);
        } else {
          const cells = buildGrid(sales, minN); cls = makeClasses(cells.map(c => c.med)); unit = `Mediana ceny za m² (zł) w kwadracie ok. 500 × 500 m. Pokazane tylko kwadraty z min. ${minN} transakcjami.`;
          ctl.cells(cells, cls.color, c => `<b>${fmt(c.med)} zł/m²</b> (mediana)<br>środkowe 50%: ${fmt(c.p25)}–${fmt(c.p75)} zł/m²<br><span class="tiny">${c.n} transakcji w tym kwadracie</span>`);
          pts = cells.flatMap(c => c.bounds);
          stat(`<b>${fmt(cells.length)}</b> kwadratów z min. ${minN} transakcjami (z ${fmt(sales.length)} transakcji, ${KAT[m.kat].m}). Mediana ceny w kwadracie jest wskazówką, nie wyceną: różni się ${m.kat === 'dzialka' ? 'z przeznaczeniem i wielkością działki' : 'ze standardem i wielkością'}.`);
        }
      }
      $('#maplegend', v).innerHTML = legendHTML(cls, unit);
      { const ls = S.last.sprzedaz; const sj = m.mode === 'rent' ? null : m.mode !== 'najem' && ls?.res?.ok && (ls.subj.kat || 'mieszkanie') === m.kat ? ls.res.subLL : m.mode === 'najem' ? subj : null; ctl.subject(sj, 'Ostatnio wyceniana nieruchomość'); }
      if (fit && pts.length) ctl.fit(pts);
    };
    const redrawFilters = () => { $('#mapfilters', v).innerHTML = filters(); bindFilters(); };
    const bindFilters = () => $$('[data-mf]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { m[g.dataset.mf] = b.dataset.v; if (g.dataset.mf === 'kat') { m.metraz = ''; m.rynek = ''; redrawFilters(); draw(true); return; } $$('button', g).forEach(x => x.classList.toggle('on', x === b)); draw(false); }));
    $$('.seg button', v).forEach(b => b.onclick = () => { m.mode = b.dataset.mode; const sg = $('.seg', v); sg.dataset.v = MODES.findIndex(x => x[0] === m.mode); $$('button', sg).forEach(x => x.classList.toggle('on', x === b)); redrawFilters(); draw(true); });
    const tilesBtn = $('#tilesw', v), applyTiles = () => { const light = ls.get('am-tiles2') !== 'dark'; $('#mapbox', v).classList.toggle('dark-tiles', !light); tilesBtn.textContent = light ? 'Podkład mapy: jasny (zmień na ciemny)' : 'Podkład mapy: ciemny (zmień na jasny)'; };
    tilesBtn.onclick = () => { ls.set('am-tiles2', ls.get('am-tiles2') === 'dark' ? 'light' : 'dark'); applyTiles(); }; applyTiles();
    const olay = {};
    const olStatus = async () => {
      const on = Object.keys(olay).filter(k => olay[k]), box = $('#olst', v); if (!on.length) { box.textContent = 'Dotknij, aby pokazać na mapie. Dane z OpenStreetMap, odświeżane co tydzień na serwerze.'; return; }
      const ls = S.last.sprzedaz; const ll = ls?.res?.ok ? ls.res.subLL : subj; const parts = [];
      if (ll) for (const k of on) { try { const { pts } = await loadPois(k, { url: osmUrl(S.ust.rcnUrl) }); const n = nearest(pts, ll); if (n) parts.push(`${OSM[k].one}: ${n.m < 1000 ? n.m + ' m' : (n.m / 1000).toFixed(1).replace('.', ',') + ' km'}${n.p.name ? ' (' + esc(n.p.name) + ')' : ''}`); } catch { } }
      box.innerHTML = (parts.length ? `Od ostatnio wycenianej nieruchomości (w linii prostej), najbliżej: ${parts.join(', ')}. ` : '') + '© współtwórcy OpenStreetMap.';
    };
    $$('#olay button', v).forEach(b => b.onclick = async () => {
      const k = b.dataset.v; if (!ctl) return;
      if (olay[k]) { olay[k].remove(); olay[k] = null; b.classList.remove('on'); return olStatus(); }
      b.classList.add('on'); $('#olst', v).textContent = 'Pobieram dane…';
      try {
        const { pts } = await loadPois(k, { url: osmUrl(S.ust.rcnUrl) }), g = ctl.L.layerGroup();
        for (const p of pts) ctl.L.circleMarker([p.lat, p.lon], { radius: 4, weight: 1, color: 'rgba(11,11,13,.9)', fillColor: OSM[k].color, fillOpacity: .95 }).bindTooltip(p.name ? esc(p.name) : OSM[k].one).addTo(g);
        g.addTo(ctl.map); olay[k] = g; await olStatus();
      } catch (e) { b.classList.remove('on'); $('#olst', v).textContent = e.message; }
    });
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
const ZK = [['miasto', 'Miasto'], ['dzielnica', 'Dzielnica'], ['promien', 'Promień']];
function viewRynek() {
  const m = S.rynek, zk = m.ulica ? 'promien' : m.dzielnica ? 'dzielnica' : (m.zk || 'miasto'), chips = (key, opts) => `<div class="chips" data-rf="${key}">${opts.map(([val, n]) => `<button type="button" class="chip ${String(m[key]) === String(val) ? 'on' : ''}" data-v="${val}">${n}</button>`).join('')}</div>`;
  const html = head('Rynek i trendy') + safeBanner() + `
  <div class="seg" id="rzk" data-n="3" data-v="${ZK.findIndex(x => x[0] === zk)}"><i></i>${ZK.map(([k, n]) => `<button data-zk="${k}" class="${k === zk ? 'on' : ''}">${n}</button>`).join('')}</div>
  <div class="card"><div class="eyebrow" id="rtt">Trend ceny za m²</div><div id="rtrend"></div></div>
  <div class="okgrid two"><div class="okt"><span>Rentowność najmu</span><b id="kp-y">—</b></div><div class="okt"><span>Czas ekspozycji</span><b id="kp-e">—</b></div></div>
  <button class="btn" type="button" data-act="pelna">Pełna analiza rynku</button><div class="gap"></div>
  <div class="card"><div class="eyebrow">Filtry trendu</div>
    <div class="field"><span>Rodzaj nieruchomości</span>${chips('kat', KAT_ORDER.filter(k => ['mieszkanie', 'dom', 'lokal', 'garaz'].includes(k)).map(k => [k, KAT[k].n]))}</div>
    <div class="field" id="rf-rynek"></div><div class="field" id="rf-metraz"></div>
    <label class="field" id="rw-dz"><span>Dzielnica</span><select class="in" id="rf-dz"><option value="">Cały Lublin</option>${[...new Set(allOffers().map(o => o.dzielnica).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pl')).map(x => `<option value="${esc(x)}"${normDz(x) === normDz(m.dzielnica) ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    <label class="field" id="rw-ul"><span>Ulica (liczymy wokół niej)</span><input class="in" id="rf-ul" value="${esc(m.ulica)}" placeholder="całe miasto" autocomplete="off" autocapitalize="words"></label>
    <div class="field" id="rf-r"></div></div>
  <div class="card" id="rpelna"><div class="eyebrow">Rentowność najmu w dzielnicach</div><div id="ryield"></div></div>
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
      box.innerHTML = `${lineChart(T.points, { label: 'Mediana ceny za m² w czasie' })}<div class="stats" style="margin:12px 0 10px"><div class="stat"><b>${fmt(last.med)}</b><span>zł/m², ostatni okres</span></div>
        <div class="stat"><b>${T.yoy ? plPct(T.yoy.pct) : '—'}</b><span>rok do roku</span></div><div class="stat"><b>${fmt(T.n)}</b><span>transakcji</span></div></div>
        <p class="tiny muted" style="margin:8px 0 0">Linia: mediana ceny transakcyjnej za m² (akty notarialne, RCN) w okresach ${T.step === 12 ? 'rocznych' : T.step === 6 ? 'półrocznych' : 'kwartalnych'}; pasmo: środkowe 50% transakcji. Pokazane tylko okresy z co najmniej 8 transakcjami. ${first.label} → ${last.label}: ${plPct((last.med / first.med - 1) * 100, 0)}.${T.yoy ? ` Rok do roku: mediana z ostatnich 12 miesięcy (${T.yoy.na} transakcji) wobec poprzednich 12 (${T.yoy.nb}).` : ' Rok do roku: za mało transakcji w którymś roku.'} Ceny zmieniają się też ze standardem i metrażem, więc to wskazówka o rynku, nie wycena.</p>`;
      bindCharts(box);
    };
    const drawYield = () => {
      const box = $('#ryield', v);
      if (!S.tx.length) { box.innerHTML = '<p class="small muted" style="margin:0">Brak danych RCN. Pobierz je w zakładce <b>Dane</b>.</p>'; return; }
      const Y = yieldByDistrict(allOffers(), S.tx);
      if (!Y.ok) { box.innerHTML = `<p class="small muted" style="margin:0">${esc(Y.reason)}</p>`; return; }
      $('#kp-y', v).textContent = Y.city.y.toFixed(1).replace('.', ',') + '%';
      box.innerHTML = `<div class="stats" style="margin:0 0 10px"><div class="stat"><b>${Y.city.y.toFixed(1).replace('.', ',')}%</b><span>całe miasto, brutto rocznie</span></div><div class="stat"><b>${Y.rows[0].name}</b><span>najwyższa: ${Y.rows[0].y.toFixed(1).replace('.', ',')}%</span></div><div class="stat"><b>${Y.rows[Y.rows.length - 1].name}</b><span>najniższa: ${Y.rows[Y.rows.length - 1].y.toFixed(1).replace('.', ',')}%</span></div></div>
        ${barChart(Y.rows.map(r => ({ name: r.name, y: r.y, yLo: r.yLo, yHi: r.yHi, sub: `czynsz ${fmt(r.rent)} zł/m² · cena ${fmt(r.sale)} zł/m² · ${r.nr} ofert, ${r.ns} transakcji` })), { ref: Y.city.y, label: 'Rentowność brutto w dzielnicach' })}
        <p class="tiny muted" style="margin:8px 0 0">Roczny czynsz (mediana ofert, bez opłat administracyjnych) do mediany ceny transakcyjnej tego samego metrażu (${Y.range[0]}–${Y.range[1]} m², transakcje z ostatnich ${String(Y.windowYears).replace('.', ',')} roku/lat). Wąs: środkowe 50% czynszów. To rentowność brutto z cen ofertowych: bez podatku, kosztów, remontów i pustostanów; rzeczywisty zwrot jest niższy. Dzielnice transakcjom przypisano po najbliższej ulicy ze znaną dzielnicą (do 2,5 km); pokazane tylko dzielnice z min. 5 ofertami i 30 transakcjami.</p>`;
    };
    const drawExp = () => {
      const box = $('#rexp', v), X = exposure(S.offers, S.ust.zebrania || []);
      if (!X.ok) { box.innerHTML = `<p class="small muted" style="margin:0">${esc(X.reason)}</p><p class="tiny muted" style="margin:8px 0 0">Od tej wersji aplikacja zapamiętuje też zmiany cen ofert między zebraniami, więc po kilku tygodniach pokaże, ile ofert tanieje i o ile.</p>`; return; }
      const d = X.days; if (d) $('#kp-e', v).textContent = Math.round(d.med) + ' dni';
      box.innerHTML = `<div class="stats" style="margin:0 0 10px"><div class="stat"><b>${d ? Math.round(d.med) + ' dni' : '—'}</b><span>typowy czas do zniknięcia oferty</span></div><div class="stat"><b>${X.nGone}</b><span>ofert, które zniknęły</span></div><div class="stat"><b>${X.nChanged ? Math.round(X.nCut / X.nChanged * 100) + '%' : '—'}</b><span>ofert ze zmianą ceny, które staniały</span></div></div>
        <p class="tiny muted" style="margin:0">${d ? `Połowa ofert znikała w ciągu ${Math.round(d.med)} dni (środkowe 50%: ${Math.round(d.p25)}–${Math.round(d.p75)} dni).` : 'Za mało zniknętych ofert (potrzeba co najmniej 10), by podać czas.'} Oferta „znikła”, gdy nie było jej w ostatnim pełnym zebraniu; dokładność to odstęp między zebraniami (${X.spanDays} dni, ${X.collections} zebrań). Zniknięcie oferty nie zawsze oznacza wynajem.${X.cutMed != null ? ` Mediana obniżki: ${(X.cutMed * 100).toFixed(1).replace('.', ',')}%.` : ''}</p>`;
    };
    const paintZk = z => { m.zk = z; $('#rw-dz', v).classList.toggle('hide', z !== 'dzielnica'); $('#rw-ul', v).classList.toggle('hide', z !== 'promien'); $('#rtt', v).textContent = 'Trend ceny za m² – ' + (z === 'dzielnica' && m.dzielnica ? m.dzielnica : z === 'promien' && m.ulica ? 'okolice ul. ' + m.ulica : 'Lublin'); };
    $$('[data-zk]', v).forEach(b => b.onclick = () => { const z = b.dataset.zk; $$('[data-zk]', v).forEach(x => x.classList.toggle('on', x === b)); $('#rzk', v).dataset.v = ZK.findIndex(x => x[0] === z);
      if (z !== 'dzielnica') { m.dzielnica = ''; $('#rf-dz', v).value = ''; } if (z !== 'promien') { m.ulica = ''; $('#rf-ul', v).value = ''; } paintZk(z); paintFilters(); drawTrend(); if (z !== 'miasto') $(z === 'dzielnica' ? '#rw-dz' : '#rw-ul', v).scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('[data-act="pelna"]', v).onclick = () => $('#rpelna', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
    paintZk(zk); paintFilters(); drawTrend(); drawYield(); drawExp();
    const dzI = $('#rf-dz', v); dzI.onchange = () => { m.dzielnica = dzI.value; paintZk('dzielnica'); drawTrend(); };
    const ul = $('#rf-ul', v); suggest(ul, S.streets); ul.onchange = () => { m.ulica = ul.value.trim(); paintZk('promien'); paintFilters(); drawTrend(); };
  }];
}

/* ---------- KALKULATOR INWESTYCYJNY ---------- */
try { S.invest = JSON.parse(ls.get('am-invest') || 'null') || {}; } catch { S.invest = {}; }
S.invest = { rynek: 'wtorny', podatek: 'ryczalt', pustostan: 1, ...S.invest };
const zl = n => fmt(n) + ' zł', pct1 = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(1).replace('.', ',') + '%';
function viewKalkulator() {
  const I = S.invest, f = (k, l, ph = '', hint = '') => `<label class="field"><span>${l}</span><input class="in" data-iv="${k}" inputmode="decimal" value="${I[k] ?? ''}" placeholder="${ph}">${hint ? `<small class="tiny muted">${hint}</small>` : ''}</label>`;
  const ls1 = S.last.sprzedaz?.res?.ok ? S.last.sprzedaz : null, ln = S.last.najem?.res?.ok ? S.last.najem : null;
  const html = head('Kalkulator inwestycyjny', 'Zwrot z inwestycji w najem', true) + `
  ${ls1 || ln ? `<div class="card"><div class="eyebrow">Z ostatnich wycen</div><div class="row">${ls1 ? `<button class="btn ghost" data-act="from-s">Cena: ${fmt(midRange(ls1).mid)} zł</button>` : ''}${ln ? `<button class="btn ghost" data-act="from-n">Czynsz: ${fmt(midRange(ln).mid)} zł</button>` : ''}</div></div>` : ''}
  <div id="ikpi"></div>
  <div class="card"><div class="eyebrow">Zakup</div>${f('cena', 'Cena zakupu (zł)', 'np. 500000')}
    <div class="field"><span>Rynek (od tego zależy PCC)</span><div class="chips" data-ic="rynek">${[['wtorny', 'Wtórny (PCC 2%)'], ['pierwotny', 'Pierwotny (bez PCC)']].map(([v, n]) => `<button type="button" class="chip ${I.rynek === v ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div></div>
    ${f('pcc', 'PCC (zł, opcj.)', 'liczone automatycznie', 'Zostaw puste: 2% ceny na rynku wtórnym, 0 na pierwotnym.')}${f('kosztyInne', 'Notariusz, wpisy, prowizja (zł)', '0', 'Wpisz własne kwoty: nie zakładam żadnych stawek.')}${f('remont', 'Remont i wyposażenie (zł)', '0')}</div>
  <div class="card"><div class="eyebrow">Najem</div>${f('czynsz', 'Czynsz miesięczny (zł)', 'np. 2800', 'Bez opłat administracyjnych płaconych przez najemcę.')}${f('pustostan', 'Pustostany (miesięcy w roku)', '1')}${f('oplaty', 'Koszty właściciela miesięcznie (zł)', '0', 'Fundusz remontowy, ubezpieczenie, drobne naprawy itp.')}${f('zarzad', 'Zarządzanie (% przychodu)', '0')}</div>
  <div class="card"><div class="eyebrow">Podatek (orientacyjnie)</div><div class="chips" data-ic="podatek">${Object.entries(TAX).map(([k, t]) => `<button type="button" class="chip ${I.podatek === k ? 'on' : ''}" data-v="${k}">${k === 'ryczalt' ? 'Ryczałt' : k === 'skala' ? 'Skala' : 'Liniowy'}</button>`).join('')}</div>
    <p class="tiny muted" id="taxnote" style="margin:8px 0 0"></p></div>
  <div class="card"><div class="eyebrow">Kredyt (opcjonalnie)</div>${f('wklad', 'Wkład własny (% ceny)', 'puste = bez kredytu')}${f('oproc', 'Oprocentowanie (% rocznie)', '')}${f('lata', 'Okres (lata)', '25')}</div>
  <div class="card"><div class="eyebrow">Horyzont inwestycji</div>${f('okres', 'Okres inwestycji (lata)', '10')}${f('wzrost', 'Zmiana wartości (% rocznie)', '0', 'Puste: sprzedaż po cenie zakupu. Bez założonego wzrostu.')}${f('wzrostCz', 'Zmiana czynszu i kosztów (% rocznie)', '0')}${f('koszSprz', 'Koszty sprzedaży (% ceny)', '0', 'Prowizja i inne koszty przy sprzedaży.')}${f('dyskonto', 'Stopa dyskontowa do NPV (%)', 'puste = bez NPV', 'Zwrot, jakiego wymagasz od tych pieniędzy.')}</div>
  <div id="ihold"></div><div id="ires"></div>`;
  return [html, v => {
    $('[data-back]', v).onclick = () => history.length > 1 ? history.back() : go('#/rynek');
    const num = s => { const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : ''; };
    const calc = () => {
      ls.set('am-invest', JSON.stringify(I)); $('#taxnote', v).textContent = TAX[I.podatek].n + '. Bez składki zdrowotnej, ulg i kwoty wolnej; to wskazówka, nie porada podatkowa.';
      const r = investCalc(I), box = $('#ires', v), top = $('#ikpi', v);
      if (!r.ok) { $('#ihold', v).innerHTML = ''; top.innerHTML = `<div class="card"><p class="small muted" style="margin:0">${r.reason}</p></div>`; box.innerHTML = ''; return; }
      const sv = sensitivity(I);
      const yrs = r.payback ? r.payback.toFixed(1).replace('.', ',') + ' lat' : '—', cfc = r.cf >= 0 ? 'var(--ok)' : 'var(--bad)';
      top.innerHTML = `<div class="card kpi"><div class="eyebrow">Wyniki inwestycji</div><div class="kv"><span>Zwrot brutto</span><b>${pct1(r.gross)}</b></div><div class="kv"><span>Zwrot netto</span><b data-k="netPost">${pct1(r.netPost)}</b></div><div class="kv"><span>Netto przed podatkiem</span><b>${pct1(r.netPre)}</b></div><div class="kv"><span>Cash-on-cash</span><b>${r.coc != null ? pct1(r.coc) : '—'}</b></div><div class="kv"><span>Okres zwrotu</span><b>${yrs}</b></div><div class="kv"><span>Przepływ miesięczny</span><b style="color:${cfc}">${r.cf >= 0 ? '+' : '−'}${zl(Math.abs(r.cfMies))}</b></div><p class="tiny muted" style="margin:8px 0 0">Zwrot netto po podatku, rocznie od całego poniesionego kosztu ${zl(r.koszt)}.</p></div>`;
      const hd = holdCalc(I), sg = (x, f = zl) => (x >= 0 ? '+' : '−') + f(Math.abs(x)), pc = x => x == null ? '—' : pct1(x);
      $('#ihold', v).innerHTML = hd.ok ? `<div class="card" id="iwyn"><div class="eyebrow">Wynik po ${hd.N} ${hd.N === 1 ? 'roku' : 'latach'}</div><div class="kv"><span>Całkowity koszt zakupu</span><b>${zl(hd.koszt)}</b></div><div class="kv"><span>Własny kapitał na start</span><b>${zl(hd.equity)}</b></div><div class="kv"><span>Gotówka z najmu przez cały okres</span><b>${sg(hd.gotowka)}</b></div><div class="kv"><span>Wartość przy sprzedaży</span><b>${zl(hd.wartosc)}</b></div>${hd.kosztSprz ? `<div class="kv"><span>Koszty sprzedaży</span><b>−${zl(hd.kosztSprz)}</b></div>` : ''}${hd.saldo ? `<div class="kv"><span>Spłata reszty kredytu</span><b>−${zl(hd.saldo)}</b></div>` : ''}<div class="kv"><span>Zysk całkowity</span><b style="color:${hd.zysk >= 0 ? 'var(--ok)' : 'var(--bad)'}" data-k="zysk">${sg(hd.zysk)}</b></div><div class="kv"><span>ROI za cały okres</span><b data-k="roi">${pc(hd.roi)}</b></div><div class="kv"><span>IRR rocznie</span><b data-k="irr">${pc(hd.irr)}</b></div><div class="kv"><span>NPV${hd.dyskonto != null ? ' przy ' + pct1(hd.dyskonto) : ''}</span><b data-k="npv">${hd.npv == null ? 'podaj stopę' : sg(hd.npv)}</b></div><p class="tiny muted" style="margin:8px 0 0">ROI: zysk całkowity do kapitału na start. Przepływy roczne po podatku od najmu i ratach. Bez podatku od sprzedaży (19% dochodu przy sprzedaży przed upływem 5 lat od końca roku zakupu). Wynik zależy od Twoich założeń, to nie prognoza.</p></div>
      <div class="card"><div class="eyebrow">Scenariusze</div><div class="tbl s3"><div class="r h"><span>Scenariusz</span><span>Zwrot netto</span><span>IRR</span><span>Zysk</span></div>${scenarios(I).map(x => `<div class="r"><span>${x.name}<small>${x.opis}</small></span><span>${pc(x.r.netPost)}</span><span>${pc(x.r.irr)}</span><span>${sg(x.r.zysk, n => fmt(n))}</span></div>`).join('')}</div></div>
      <div class="card"><div class="eyebrow">Symulacje jednej zmiany</div><div class="tbl s3"><div class="r h"><span>Gdy</span><span>Zwrot netto</span><span>IRR</span><span>Mies.</span></div>${whatIf(I).map(x => `<div class="r"><span>${x.name}</span><span>${pc(x.netPost)}</span><span>${pc(x.irr)}</span><span>${sg(x.cfMies, n => fmt(n))}</span></div>`).join('')}</div></div>` : '';
      box.innerHTML = `<div class="card"><div class="eyebrow">Rok w liczbach</div><div class="kv"><span>Przychód (czynsz za ${12 - (I.pustostan === '' ? 1 : I.pustostan)} mies.)</span><b>${zl(r.rev)}</b></div><div class="kv"><span>Koszty właściciela i zarządzanie</span><b>−${zl(r.opex)}</b></div><div class="kv"><span>Podatek</span><b>−${zl(r.tax)}</b></div><div class="kv"><span>Zysk po podatku</span><b>${zl(r.taxless)}</b></div>
        ${r.loan ? `<div class="kv"><span>Rata kredytu (${zl(r.rata)} mies.)</span><b>−${zl(r.rata * 12)}</b></div><div class="kv"><span>Przepływ gotówki rocznie</span><b style="color:${r.cf >= 0 ? 'var(--ok)' : 'var(--bad)'}">${r.cf >= 0 ? '' : '−'}${zl(Math.abs(r.cf))}</b></div><div class="kv"><span>Przepływ miesięcznie</span><b style="color:${r.cf >= 0 ? 'var(--ok)' : 'var(--bad)'}">${r.cf >= 0 ? '' : '−'}${zl(Math.abs(r.cfMies))}</b></div><div class="kv"><span>Własny kapitał</span><b>${zl(r.equity)}</b></div><div class="kv"><span>Zwrot z kapitału własnego (gotówka)</span><b>${r.coc != null ? pct1(r.coc) : '—'}</b></div><p class="tiny muted" style="margin:8px 0 0">Odsetki w 1. roku ok. ${zl(r.interestYear1)}; w tym rachunku nie obniżają podatku (przy najmie prywatnym nie są kosztem). Zwrot z kapitału nie wlicza spłaty kapitału kredytu.</p>` : ''}</div>
      <div class="card"><div class="eyebrow">Analiza wrażliwości</div>${barChart(sv.map(x => ({ name: x.name, y: x.y, sub: r.loan ? 'przepływ ' + zl(x.cf / 12) + ' mies.' : 'zysk po podatku ' + zl(x.cf) })), { ref: r.netPost, label: 'Zwrot netto w scenariuszach' }).replace(/miasto /g, 'bazowy ')}<p class="tiny muted" style="margin:8px 0 0">Zwrot netto po podatku w kilku scenariuszach. Czynsz ofertowy bywa wyższy od faktycznie uzyskiwanego, więc sprawdź też wariant −10%.</p></div>`;
    };
    calc();
    $$('[data-iv]', v).forEach(i => i.addEventListener('input', () => { I[i.dataset.iv] = num(i.value); calc(); }));
    $$('[data-ic]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { I[g.dataset.ic] = b.dataset.v; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); calc(); }));
    const fs = $('[data-act="from-s"]', v); if (fs) fs.onclick = () => { I.cena = midRange(ls1).mid; render(); };
    const fn = $('[data-act="from-n"]', v); if (fn) fn.onclick = () => { I.czynsz = midRange(ln).mid; render(); };
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

/* ---------- bez powiększania strony ---------- */
// iPhone potrafi zignorować ustawienie w nagłówku strony, więc gest dwóch palców blokujemy też tutaj. Mapa zachowuje własne przybliżanie.
const naMapie = e => !!e.target.closest?.('.leaflet-container');
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, e => { if (!naMapie(e)) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 && !naMapie(e)) e.preventDefault(); }, { passive: false });

/* ---------- powrót do aplikacji ---------- */
// iPhone zamyka aplikacje z ekranu początkowego w tle i uruchamia je od nowa. Zapisujemy, gdzie użytkownik był, i po ponownym starcie wracamy w to miejsce.
const SESJA = 'am-sesja', SESJA_MS = 12 * 3600e3;
function zapiszSesje() {
  try {
    const v = $('#view'), a = document.activeElement;
    if (v?.dataset.view === 'wycena' && $('#f', v)) readForm(v);
    if (a && a.matches?.('[data-tk]')) a.dispatchEvent(new Event('change', { bubbles: true }));   // wpisane pole teczki zapisuje się dopiero przy wyjściu z pola
    if (viewTeczka.tm) { clearTimeout(viewTeczka.tm); viewTeczka.tm = null; save.teczki(); }
    if (location.hash) ls.set(SESJA, JSON.stringify({ t: Date.now(), h: location.hash, y: Math.round(window.scrollY), form: S.form, mapa: S.mapa, rynek: S.rynek, hist: S.histTab }));
  } catch { }
}
addEventListener('pagehide', zapiszSesje); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') zapiszSesje(); });
async function wznowSesje() {   // tylko przy starcie bez adresu widoku, czyli z ikony; zwraca, ile przewinąć
  if (location.hash) return null;
  try {
    const z = JSON.parse(ls.get(SESJA) || 'null'); if (!z || Date.now() - z.t > SESJA_MS || !z.h) return null;
    Object.assign(S.form, z.form || {}); Object.assign(S.mapa, z.mapa || {}); Object.assign(S.rynek, z.rynek || {}); if (z.hist) S.histTab = z.hist;
    S.last = (await store.get('last', null)) || S.last; history.replaceState(null, '', z.h); return z.y || 0;
  } catch { return null; }
}

/* ---------- start ---------- */
window.addEventListener('hashchange', render);
document.addEventListener('click', e => { const b = e.target.closest('[data-back]'); if (b && !b.onclick) history.length > 1 ? history.back() : go('#/wycena'); });
async function boot() {
  const got = await acquireLock(false);
  await load(); const wznow = await wznowSesje(); render(); if (wznow) setTimeout(() => window.scrollTo(0, wznow), 80);
  if (!got) { sync.freeze(); lockOverlay('Ta aplikacja jest już otwarta w innej karcie lub oknie. Dwie karty naraz mogą wzajemnie psuć dane, więc ta karta nie zapisuje niczego. Zamknij tamtą kartę albo przejmij aplikację tutaj.', true); }
  else { sync.start(); checkRcn(); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && got) checkRcn(); });
  setInterval(() => { if (got && document.visibilityState === 'visible') checkRcn(); }, 30 * 60e3);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const had = !!navigator.serviceWorker.controller; let done = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload(); } });   // nowa wersja przejęła kontrolę: odśwież raz
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => { });
  }
  window.__am = { S, save, render, go, sync, adapters, checkRcn, got, getMap: () => mapCtl, importOffers: (found, opt) => applyCollection(found, opt), statusFn };
}
boot();
