import * as store from './store.js';
import { estimateRent, estimateSale, grossYield, addrKey, normStreet, YEAR_BANDS, yearBand } from './engine.js';
import { rcnToObjects } from './rcn.js';
import { linesFromPdf, offersFromLines, offerKey } from './pdfimport.js';
import { esc, $, $$, fmt, roundTo, toast, openSheet, closeSheet, countUp, saveFile, ICON } from './ui.js';
import { buildReport, makePdf } from './report.js';

const VERSION = '1.0.0';
const S = {
  offers: [], rcn: null, tx: [], streets: [], budynki: {}, wyceny: [], last: {},
  ust: { biuro: 'AM Nieruchomości', haslo: 'Sprawdzone do końca.', agent: '', tel: '', email: '', www: '', rcnUrl: '' },
  form: { tryb: 'sprzedaz', ulica: '', nr: '', dzielnica: '', m2: '', pokoje: 2, pietro: null, rok: '', rynek: '', standard: '', meble: '', zapamietaj: true },
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().getFullYear();
const LV = { 'niska': 'Niska', 'średnia': 'Średnia', 'wysoka': 'Wysoka' };
const LVTXT = { 'niska': 'Traktuj wynik wyłącznie orientacyjnie: danych jest mało lub są mocno rozrzucone.', 'średnia': 'Dobra podstawa do rozmowy z klientem. Zweryfikuj porównania przed podaniem liczby.', 'wysoka': 'Dużo zbliżonych porównań o podobnej cenie. To nadal szacunek, nie wycena.' };

async function load() {
  S.offers = await store.get('offers', []); S.budynki = await store.get('budynki', {}); S.wyceny = await store.get('wyceny', []);
  S.ust = { ...S.ust, ...(await store.get('ust', {})) }; S.rcn = await store.get('rcn', null); setTx();
}
function setTx() {
  S.tx = S.rcn ? rcnToObjects(S.rcn) : [];
  S.streets = [...new Set(S.tx.map(t => t.ulica).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
}
const save = {
  offers: () => store.set('offers', S.offers), budynki: () => store.set('budynki', S.budynki), wyceny: () => store.set('wyceny', S.wyceny), ust: () => store.set('ust', S.ust),
};

/* ---------- router ---------- */
const TABS = [['wycena', 'Wycena'], ['dane', 'Dane'], ['historia', 'Historia'], ['ust', 'Ustawienia']];
function tabs(active) {
  $('#tabs').innerHTML = '<div class="in-tabs">' + TABS.map(([k, n]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${ICON[k === 'wycena' ? 'wycena' : k]}<span>${n}</span></a>`).join('') + '</div>';
}
function render() {
  const h = location.hash.replace(/^#\/?/, '') || 'wycena', p = h.split('/');
  let html = '', mount = null, tab = p[0];
  closeSheet();
  if (p[0] === 'wycena') [html, mount] = viewWycena();
  else if (p[0] === 'dane') [html, mount] = viewDane();
  else if (p[0] === 'historia') [html, mount] = viewHistoria();
  else if (p[0] === 'ust') [html, mount] = viewUst();
  else if (p[0] === 'wynik') { tab = 'wycena'; [html, mount] = viewWynik(p); }
  else if (p[0] === 'raport') { tab = 'wycena'; [html, mount] = viewRaport(p); }
  else [html, mount] = viewWycena();
  const v = $('#view'); v.innerHTML = html; v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  tabs(tab); window.scrollTo(0, 0); mount && mount(v);
}
const go = h => { location.hash = h; };

const head = (title, sub, back, line) => `<div class="top">${back ? `<button class="back" data-back aria-label="Wróć">${ICON.back}</button>` : '<img class="mark" src="icons/logo-am.png" alt="">'}<div><h1>${title}</h1>${sub ? `<small class="${line ? 'line' : ''}">${sub}</small>` : ''}</div></div>`;

/* ---------- WYCENA (formularz) ---------- */
function stepHTML(id, val, label) { return `<div class="field"><span>${label}</span><div class="step" data-step="${id}"><button type="button" data-d="-1" aria-label="mniej">−</button><output>${val}</output><button type="button" data-d="1" aria-label="więcej">+</button></div></div>`; }
const floorLbl = p => p == null ? '—' : p === 0 ? 'parter' : p;
function viewWycena() {
  const f = S.form, sale = f.tryb === 'sprzedaz';
  const dz = [...new Set(S.offers.map(o => o.dzielnica).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  const ready = sale ? S.tx.length > 0 : S.offers.length > 0;
  const stat = sale ? (S.tx.length ? `Baza RCN: ${fmt(S.tx.length)} transakcji` : '') : (S.offers.length ? `Baza ofert najmu: ${fmt(S.offers.length)}` : '');
  const html = head('Wycena', 'Szacunek wartości rynkowej') + `
  <div class="seg" data-v="${sale ? 0 : 1}"><i></i><button data-t="sprzedaz" class="${sale ? 'on' : ''}">Sprzedaż</button><button data-t="najem" class="${sale ? '' : 'on'}">Najem</button></div>
  ${ready ? `<div class="banner"><span>◈</span><span>${stat}. Wynik zawsze jako przedział z oceną pewności.</span></div>`
      : `<div class="banner warn"><span>!</span><span>${sale ? 'Brak danych o transakcjach (RCN).' : 'Brak ofert najmu.'} Najpierw zaimportuj dane w zakładce <b>Dane</b>.</span></div>`}
  <form class="card" id="f" autocomplete="off" novalidate>
    ${sale ? `<div class="grid3"><label class="field"><span>Ulica</span><input class="in" name="ulica" list="dl-st" value="${esc(f.ulica)}" placeholder="np. Bluszczowa"></label>
      <label class="field"><span>Nr</span><input class="in" name="nr" value="${esc(f.nr)}" inputmode="text" placeholder="13"></label></div>`
      : `<label class="field"><span>Dzielnica</span><input class="in" name="dzielnica" list="dl-dz" value="${esc(f.dzielnica)}" placeholder="np. Śródmieście"></label>
      <label class="field"><span>Ulica (opcjonalnie)</span><input class="in" name="ulica" value="${esc(f.ulica)}" placeholder="np. Jasna"></label>`}
    <datalist id="dl-st">${S.streets.map(s => `<option value="${esc(s)}">`).join('')}</datalist><datalist id="dl-dz">${dz.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="grid2"><label class="field"><span>Powierzchnia (m²)</span><input class="in" name="m2" inputmode="decimal" value="${esc(f.m2)}" placeholder="45,5"></label>
      <label class="field"><span>Rok budowy (opcj.)</span><input class="in" name="rok" inputmode="numeric" maxlength="4" value="${esc(f.rok)}" placeholder="np. 1978"></label></div>
    <div class="grid2">${stepHTML('pokoje', f.pokoje, 'Pokoje')}${stepHTML('pietro', floorLbl(f.pietro), 'Piętro')}</div>
    ${sale ? `<div class="field"><span>Rynek</span><div class="chips" data-chips="rynek">${[['', 'Dowolny'], ['wtorny', 'Wtórny'], ['pierwotny', 'Pierwotny']].map(([v, n]) => `<button type="button" class="chip ${f.rynek === v ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div></div>` : ''}
    <div class="field"><span>Standard (informacyjnie)</span><div class="chips" data-chips="standard">${[['', 'Nie wiem'], ['remont', 'Do remontu'], ['dobry', 'Dobry'], ['wysoki', 'Wysoki']].map(([v, n]) => `<button type="button" class="chip ${f.standard === v ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div></div>
    ${sale ? '' : `<div class="field"><span>Wyposażenie (informacyjnie)</span><div class="chips" data-chips="meble">${[['', 'Nie wiem'], ['tak', 'Umeblowane'], ['nie', 'Bez mebli']].map(([v, n]) => `<button type="button" class="chip ${f.meble === v ? 'on' : ''}" data-v="${v}">${n}</button>`).join('')}</div></div>`}
    ${sale ? `<label class="check"><input type="checkbox" name="zap" ${f.zapamietaj ? 'checked' : ''}> Zapamiętaj rok budowy dla tego adresu</label>` : ''}
    <p class="tiny muted" style="margin:6px 0 14px">Standard i wyposażenie trafią do raportu jako informacja. Nie zmieniają wyniku, dopóki w bazie nie ma danych, które pozwolą to uczciwie policzyć.</p>
    <button class="btn" type="submit">Oszacuj wartość</button>
  </form>`;
  return [html, v => {
    $$('.seg button', v).forEach(b => b.onclick = () => { readForm(v); S.form.tryb = b.dataset.t; render(); });
    $$('[data-step]', v).forEach(st => $$('button', st).forEach(b => b.onclick = () => {
      readForm(v); const id = st.dataset.step, d = +b.dataset.d;
      if (id === 'pokoje') S.form.pokoje = Math.min(8, Math.max(1, S.form.pokoje + d));
      else { const c = S.form.pietro; S.form.pietro = c == null ? (d > 0 ? 0 : null) : (c + d < 0 ? null : Math.min(30, c + d)); }
      $('output', st).textContent = id === 'pokoje' ? S.form.pokoje : floorLbl(S.form.pietro);
    }));
    $$('[data-chips]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => { S.form[g.dataset.chips] = b.dataset.v; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); }));
    $('#f', v).onsubmit = e => { e.preventDefault(); readForm(v); submitForm(); };
  }];
}
function readForm(v) {
  const q = n => { const el = $(`[name="${n}"]`, v); return el ? el.value.trim() : undefined; };
  for (const k of ['ulica', 'nr', 'dzielnica', 'm2', 'rok']) { const x = q(k); if (x !== undefined) S.form[k] = x; }
  const z = $('[name="zap"]', v); if (z) S.form.zapamietaj = z.checked;
}
function submitForm() {
  const f = S.form, m2 = parseFloat(String(f.m2).replace(',', '.'));
  if (!(m2 >= 10 && m2 <= 400)) return toast('Podaj powierzchnię (10–400 m²)');
  const rok = f.rok ? parseInt(f.rok, 10) : null;
  if (f.rok && !(rok >= 1700 && rok <= now() + 3)) return toast('Rok budowy wygląda błędnie');
  if (f.tryb === 'sprzedaz' && !S.tx.length) return toast('Najpierw zaimportuj dane RCN (zakładka Dane)');
  if (f.tryb === 'najem' && !S.offers.length) return toast('Najpierw zaimportuj oferty najmu (zakładka Dane)');
  const subj = { tryb: f.tryb, ulica: f.ulica, nr: f.nr, dzielnica: f.dzielnica, m2, pokoje: f.pokoje, pietro: f.pietro, rok, rynek: f.rynek || null, standard: f.standard || null, meble: f.meble === '' ? null : f.meble };
  if (rok && f.zapamietaj && f.ulica && f.nr && f.tryb === 'sprzedaz') { S.budynki[addrKey(f.ulica, f.nr)] = rok; save.budynki(); }
  const yearOf = k => S.budynki[k] ?? null;
  const res = f.tryb === 'najem' ? estimateRent(S.offers, subj) : estimateSale(S.tx, subj, { yearOf });
  S.last[f.tryb] = { id: null, ts: Date.now(), subj, res };
  go('#/wynik/' + f.tryb);
}

/* ---------- WYNIK ---------- */
const subjLine = s => [s.tryb === 'sprzedaz' ? [s.ulica, s.nr].filter(Boolean).join(' ') : [s.dzielnica, s.ulica].filter(Boolean).join(', '), `${String(s.m2).replace('.', ',')} m²`, `${s.pokoje} pok.`, s.pietro == null ? '' : s.pietro === 0 ? 'parter' : `${s.pietro}. piętro`, s.rok ? `rok ${s.rok}` : ''].filter(Boolean).join(' · ');
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
    <div class="range"><div class="t" style="left:${X(r.pm2.mid)}%">mediana ${fmt(r.pm2.mid)} zł/m²</div><div class="track"><div class="fill" style="left:${X(r.pm2.lo)}%;width:${Math.max(1, X(r.pm2.hi) - X(r.pm2.lo))}%"></div></div>
      ${r.comps.slice(0, 40).map(c => `<div class="dot" style="left:${X(c.pm2)}%"></div>`).join('')}<div class="mid" style="left:${X(r.pm2.mid)}%"></div>
      <div class="t b" style="left:0;transform:none">${fmt(dMin)}</div><div class="t b" style="left:100%;transform:translateX(-100%)">${fmt(dMax)} zł/m²</div></div></div>
  <div class="stats"><div class="stat"><b>${r.n}</b><span>porównań</span></div><div class="stat"><b>${fmt(mid)}</b><span>mediana, zł</span></div><div class="stat"><b>${fmt(r.pm2.mid)}</b><span>zł za m²</span></div></div>
  <div class="card"><div class="eyebrow">Pewność wyniku</div><div class="conf"><div class="gauge" data-l="${r.confidence.score}">${[1, 2, 3].map(i => `<i class="${i <= r.confidence.score ? 'on' : ''}"></i>`).join('')}</div><b>${LV[r.confidence.level]}</b></div>
    <p class="small muted" style="margin:10px 0 0">${LVTXT[r.confidence.level]}</p>
    <details style="margin-top:8px"><summary class="small" style="color:var(--gold-l);cursor:pointer">Dlaczego tak?</summary><ul class="clean">${r.confidence.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="tiny muted">Progi są orientacyjne i wymagają skalibrowania na prawdziwych transakcjach.</p></details></div>`;
  if (!sale) {
    const ls = S.last.sprzedaz, y = ls && ls.res.ok && normStreet(ls.subj.ulica) === normStreet(s.ulica) && ls.subj.m2 === s.m2 ? grossYield(ls.res, r) : null;
    if (r.adminTotal) html += `<div class="card"><div class="kv"><span>Czynsz administracyjny (mediana)</span><b>ok. ${fmt(roundTo(r.adminTotal, 10))} zł</b></div></div>`;
    if (y) html += `<div class="card"><div class="eyebrow">Rentowność brutto (orientacyjnie)</div><h3>${y.lo.toFixed(1)}% – ${y.hi.toFixed(1)}%</h3><p class="small muted">Roczny najem do wartości, z dwóch niezależnych szacunków. Bez podatków i kosztów.</p></div>`;
  } else html += `<div class="card"><div class="kv"><span>Źródło</span><b>RCN (akty notarialne)</b></div><div class="kv"><span>Okno czasu</span><b>ostatnie ${r.window || 3} lat</b></div></div>`;
  html += `<div class="card"><div class="eyebrow">Uwagi do wyniku</div><ul class="clean note-warn">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    ${r.unused.length ? `<div class="eyebrow" style="margin-top:14px">Nie uwzględniono w wycenie</div><ul class="clean">${r.unused.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`;
  const withLL = r.comps.filter(c => c.lat != null);
  if (sale && r.subLL && withLL.length >= 3) html += `<div class="card"><div class="eyebrow">Położenie porównań</div>${mapSVG(r)}<p class="tiny muted" style="margin:8px 0 0">Złoty znak: lokal wyceniany (${esc(r.llKind || '')}). Większy punkt = większa waga porównania.</p></div>`;
  html += `<div class="card"><div class="eyebrow">Porównania (${r.comps.length})</div><div id="comps">${r.comps.slice(0, 10).map((c, i) => compHTML(c, i, sale)).join('')}</div>${r.comps.length > 10 ? '<button class="btn ghost" data-act="more" style="margin-top:10px">Pokaż wszystkie</button>' : ''}</div>
  <div class="row">${saved ? '' : '<button class="btn ghost" data-act="save">Zapisz do historii</button>'}<button class="btn" data-act="report">Raport dla klienta</button></div>
  ${saved ? `<div class="gap"></div><button class="btn ghost" data-act="real">${e.real ? 'Zmień cenę rzeczywistą' : 'Wpisz cenę rzeczywistą (do kontroli trafności)'}</button>` : ''}`;
  return [html, v => {
    $('[data-back]', v).onclick = () => (saved ? go('#/historia') : go('#/wycena'));
    $$('[data-cu]', v).forEach(el => countUp(el, +el.dataset.cu));
    const more = $('[data-act="more"]', v); if (more) more.onclick = () => { $('#comps', v).innerHTML = r.comps.map((c, i) => compHTML(c, i, sale)).join(''); more.remove(); };
    const sv = $('[data-act="save"]', v); if (sv) sv.onclick = () => { e.id = uid(); S.wyceny.unshift(e); save.wyceny(); toast('Zapisano w historii'); go('#/wynik/h/' + e.id); };
    $('[data-act="report"]', v).onclick = () => go(saved ? '#/raport/h/' + e.id : '#/raport/cur/' + s.tryb);
    const rl = $('[data-act="real"]', v); if (rl) rl.onclick = () => realSheet(e);
  }];
}
function compHTML(c, i, sale) {
  const w = Math.max(6, Math.round(c.w * 100));
  return `<div class="comp" style="animation-delay:${Math.min(i, 12) * 40}ms"><div><b>${esc(c.opis || '—')}</b>${c.sameBuilding ? '<span class="badge g">ten sam budynek</span>' : ''}<span class="badge">${c.kind}</span></div><div class="p">${fmt(c.cena)} zł</div>
    <div class="m">${String(c.m2).replace('.', ',')} m² · ${c.pokoje} pok.${c.pietro != null ? ' · ' + (c.pietro === 0 ? 'parter' : c.pietro + '. p.') : ''}${c.rok ? ' · akt ' + c.rok : ''}${c.rokBudowy ? ' · bud. ' + c.rokBudowy : ''}</div><div class="m r">${fmt(c.pm2)} zł/m²</div><div class="wbar"><i style="width:${w}%"></i></div></div>`;
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
  const html = head('Raport', 'Dla klienta', true) + `<div id="rp"><div class="empty"><b>Przygotowuję raport…</b></div></div>
    <div class="row" style="position:sticky;bottom:calc(var(--nav) + var(--sab) + 12px)"><button class="btn" id="pdf" disabled>Udostępnij PDF</button></div>`;
  return [html, async v => {
    $('[data-back]', v).onclick = back; let pages = [];
    try { await document.fonts.ready; pages = await buildReport(e, S.ust); } catch (err) { $('#rp', v).innerHTML = `<div class="empty"><b>Nie udało się zbudować raportu</b>${esc(err.message)}</div>`; return; }
    $('#rp', v).innerHTML = pages.map(c => `<img class="report-img" alt="Strona raportu" src="${c.toDataURL('image/jpeg', .92)}">`).join('');
    const b = $('#pdf', v); b.disabled = false;
    b.onclick = async () => { b.disabled = true; try { const blob = makePdf(pages); const nm = 'Analiza-rynkowa-' + new Date().toISOString().slice(0, 10) + '.pdf'; const r = await saveFile(blob, nm); if (r !== 'cancel') toast(r === 'share' ? 'Gotowe' : 'Pobrano PDF'); } finally { b.disabled = false; } };
  }];
}

/* ---------- DANE ---------- */
function viewDane() {
  const n = S.offers.length, fl = S.offers.filter(o => o.flagi && o.flagi.length).length, off = S.offers.filter(o => o.wlaczone === false).length;
  const meta = S.rcn?.meta, resid = S.tx.filter(t => t.funkcja === 'mieszkalna' && !t.wielolokalowa && t.pelne && t.rok >= now() - 3).length;
  const list = S.offers.slice().reverse().slice(0, 40);
  const html = head('Dane', 'Źródła i import') + `
  <div class="card"><div class="eyebrow">Oferty najmu</div><div class="kv"><span>W bazie</span><b>${fmt(n)}</b></div><div class="kv"><span>Podejrzane (pominięte)</span><b>${fl}</b></div><div class="kv"><span>Wyłączone ręcznie</span><b>${off}</b></div>
    <div class="gap"></div><button class="btn" data-act="pdf">Wgraj PDF z ofertami</button><div class="gap"></div><button class="btn ghost" data-act="paste">Wklej tekst ofert</button>
    <input type="file" id="fpdf" accept="application/pdf" multiple hidden>
    <p class="tiny muted" style="margin:10px 0 0">W Safari: lista ofert → Udostępnij → Drukuj → pinch na podglądzie → Zapisz do Plików. Plik wgrywasz tutaj. Odczyt dzieje się w telefonie, bez internetu i bez AI.</p></div>
  <div class="card"><div class="eyebrow">Transakcje (RCN)</div>${meta ? `<div class="kv"><span>Rekordów</span><b>${fmt(S.tx.length)}</b></div><div class="kv"><span>Mieszkań z ostatnich 3 lat (użytecznych)</span><b>${fmt(resid)}</b></div><div class="kv"><span>Pobrano</span><b>${esc(meta.pobrano || '—')}</b></div><div class="kv"><span>Bez współrzędnych</span><b>${fmt(meta.bez_wspolrzednych ?? 0)}</b></div>` : '<p class="muted small" style="margin:0 0 10px">Brak danych. Wygeneruj plik skryptem na serwerze (tools/rcn_export.py) i wgraj poniżej.</p>'}
    <div class="gap"></div><label class="field"><span>Adres pliku z serwera</span><input class="in" id="rurl" value="${esc(S.ust.rcnUrl)}" placeholder="https://…/rcn_lublin.json"></label>
    <button class="btn" data-act="rcnurl">Pobierz z serwera</button><div class="gap"></div><button class="btn ghost" data-act="rcnfile">Wczytaj plik JSON</button><input type="file" id="frcn" accept=".json,application/json" hidden></div>
  <div class="card"><div class="eyebrow">Oferty w bazie (ostatnie ${list.length})</div>${list.length ? list.map(o => `<button class="off ${o.wlaczone === false ? 'dis' : ''}" data-id="${o.id}"><div><b>${esc([o.ulica, o.dzielnica].filter(Boolean).join(', ') || o.tytul)}</b></div><div class="p">${fmt(o.cena)} zł</div><div class="m">${o.m2} m² · ${o.pokoje} pok.${o.pietro != null ? ' · ' + (o.pietro === 0 ? 'parter' : o.pietro + '. p.') : ''}${o.czynsz ? ' · czynsz ' + fmt(o.czynsz) : ''}</div><div class="m" style="text-align:right">${fmt(o.cena / o.m2)} zł/m²</div>${o.flagi?.length ? `<div class="flag">⚠ ${esc(o.flagi.join(', ').replace(/_/g, ' '))}</div>` : ''}</button>`).join('') : '<div class="empty">Brak ofert.</div>'}
    ${list.length ? '<p class="tiny muted" style="margin:8px 0 0">Dotknij ofertę, aby ją wyłączyć lub włączyć w wycenach.</p>' : ''}</div>
  <div class="card"><div class="eyebrow">Kopia zapasowa</div><p class="small muted" style="margin-top:0">Oferty, historia wycen i pamięć lat budowy (bez danych RCN).</p><div class="row"><button class="btn ghost" data-act="exp">Zapisz kopię</button><button class="btn ghost" data-act="imp">Przywróć</button></div><input type="file" id="fbak" accept=".json,application/json" hidden>
    <div class="gap"></div><button class="btn danger" data-act="clear">Usuń wszystkie oferty</button></div>`;
  return [html, v => {
    const pdfIn = $('#fpdf', v);
    $('[data-act="pdf"]', v).onclick = () => pdfIn.click();
    pdfIn.onchange = () => importPdfs([...pdfIn.files]);
    $('[data-act="paste"]', v).onclick = pasteSheet;
    $$('.off', v).forEach(b => b.onclick = () => { const o = S.offers.find(x => x.id === b.dataset.id); o.wlaczone = o.wlaczone === false; save.offers(); b.classList.toggle('dis', o.wlaczone === false); });
    $('[data-act="rcnurl"]', v).onclick = async () => { const u = $('#rurl', v).value.trim(); if (!u) return toast('Wpisz adres pliku'); S.ust.rcnUrl = u; save.ust(); toast('Pobieram…'); try { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); await setRcn(await r.json()); } catch (e) { toast('Nie udało się: ' + e.message); } };
    const fr = $('#frcn', v); $('[data-act="rcnfile"]', v).onclick = () => fr.click(); fr.onchange = async () => { try { await setRcn(JSON.parse(await fr.files[0].text())); } catch (e) { toast('Błędny plik: ' + e.message); } };
    $('[data-act="exp"]', v).onclick = async () => { const blob = new Blob([JSON.stringify({ v: 1, offers: S.offers, budynki: S.budynki, wyceny: S.wyceny, ust: S.ust })], { type: 'application/json' }); await saveFile(blob, 'kopia-wycena-' + new Date().toISOString().slice(0, 10) + '.json'); };
    const fb = $('#fbak', v); $('[data-act="imp"]', v).onclick = () => fb.click();
    fb.onchange = async () => { try { const d = JSON.parse(await fb.files[0].text()); if (!Array.isArray(d.offers)) throw new Error('to nie jest kopia'); S.offers = d.offers; S.budynki = d.budynki || {}; S.wyceny = d.wyceny || []; S.ust = { ...S.ust, ...(d.ust || {}) }; save.offers(); save.budynki(); save.wyceny(); save.ust(); toast('Przywrócono'); render(); } catch (e) { toast('Błąd: ' + e.message); } };
    $('[data-act="clear"]', v).onclick = () => { if (confirm('Usunąć wszystkie oferty z bazy?')) { S.offers = []; save.offers(); render(); } };
  }];
}
async function setRcn(pack) {
  if (!pack || !Array.isArray(pack.cols) || !Array.isArray(pack.rows) || !pack.cols.includes('cena')) throw new Error('nieznany format');
  S.rcn = pack; setTx(); await store.set('rcn', pack); toast(`Wczytano ${fmt(S.tx.length)} transakcji`); render();
}
function offerSummary(found) {
  const have = new Set(S.offers.map(offerKey)); const seen = new Set(); let neu = [], dup = 0;
  for (const r of found) { const k = offerKey(r); if (have.has(k) || seen.has(k)) { dup++; continue; } seen.add(k); neu.push(r); }
  return { neu, dup, flagged: neu.filter(r => r.flagi.length).length };
}
function confirmImport(found, srcNote) {
  const { neu, dup, flagged } = offerSummary(found);
  openSheet(`<h3>Wynik odczytu</h3><p class="small muted">${esc(srcNote)}</p><div class="kv"><span>Odczytano ofert</span><b>${found.length}</b></div><div class="kv"><span>Nowych do dodania</span><b>${neu.length}</b></div><div class="kv"><span>Już w bazie / powtórzone</span><b>${dup}</b></div><div class="kv"><span>Podejrzane (zostaną pominięte w wycenach)</span><b>${flagged}</b></div>
    <p class="tiny muted">To ceny ofertowe z ogłoszeń. Aplikacja zapisuje tylko dane techniczne (cena, metraż, pokoje, piętro, lokalizacja), bez zdjęć, opisów i danych kontaktowych.</p>
    <button class="btn" id="ok" ${neu.length ? '' : 'disabled'}>Dodaj ${neu.length} ofert do bazy</button><div class="gap"></div><button class="btn ghost" id="no">Anuluj</button>`, p => {
    $('#no', p).onclick = closeSheet;
    $('#ok', p).onclick = () => { const t = Date.now(); S.offers.push(...neu.map(r => ({ ...r, id: uid(), typ: 'najem', ts: t, wlaczone: true }))); save.offers(); closeSheet(); toast(`Dodano ${neu.length} ofert`); render(); };
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
function pasteSheet() {
  openSheet(`<h3>Wklej tekst ofert</h3><p class="small muted">Zaznacz całą stronę wyników (lista ofert najmu), skopiuj i wklej tutaj.</p><textarea class="in" id="tx" rows="8" placeholder="Wklej tekst…"></textarea><div class="gap"></div><button class="btn" id="go">Odczytaj</button>`, p => {
    $('#go', p).onclick = () => { const l = $('#tx', p).value.split('\n'); if (isSaleList(l)) return toast('To lista ofert sprzedaży. Tu importujemy tylko najem.'); const found = offersFromLines(l); if (!found.length) return toast('Nie znaleziono ofert'); confirmImport(found, 'Odczyt z wklejonego tekstu.'); };
  });
}

/* ---------- HISTORIA ---------- */
function viewHistoria() {
  const items = S.wyceny.map(e => { const r = e.res, s = e.subj, sale = s.tryb === 'sprzedaz', st = sale ? 1000 : 10;
    const rng = r.ok ? `${fmt(roundTo(r.total.lo, st))} – ${fmt(roundTo(r.total.hi, st))} zł` : 'brak wyniku';
    let chk = ''; if (e.real && r.ok) { const inR = e.real >= r.total.lo && e.real <= r.total.hi, dv = (e.real - r.total.mid) / r.total.mid * 100; chk = `<span class="badge ${inR ? 'g' : ''}">${inR ? 'w przedziale' : (dv > 0 ? '+' : '') + dv.toFixed(0) + '% od mediany'}</span>`; }
    return `<a class="card" href="#/wynik/h/${e.id}" style="display:block;text-decoration:none;color:inherit"><div class="eyebrow">${sale ? 'Sprzedaż' : 'Najem'} · ${new Date(e.ts).toLocaleDateString('pl-PL')}${r.ok ? ' · pewność ' + LV[r.confidence.level].toLowerCase() : ''}</div><h3>${esc(rng)}</h3><div class="muted small">${esc(subjLine(s))}</div>${chk ? `<div style="margin-top:8px">${chk}</div>` : ''}</a>`; });
  const html = head('Historia', 'Zapisane wyceny') + (items.length ? items.join('') + '<button class="btn danger" data-act="clr">Wyczyść historię</button>' : '<div class="empty"><b>Pusto</b>Zapisane wyceny pojawią się tutaj. Po zamknięciu transakcji wpisz cenę rzeczywistą, a zobaczysz, jak trafiał szacunek.</div>');
  return [html, v => { const c = $('[data-act="clr"]', v); if (c) c.onclick = () => { if (confirm('Usunąć całą historię wycen?')) { S.wyceny = []; save.wyceny(); render(); } }; }];
}

/* ---------- USTAWIENIA ---------- */
function viewUst() {
  const u = S.ust, f = (k, l, ph) => `<label class="field"><span>${l}</span><input class="in" data-k="${k}" value="${esc(u[k])}" placeholder="${ph || ''}"></label>`;
  const html = head('Ustawienia', 'Dane w raporcie') + `<div class="card"><div class="eyebrow">Biuro (nagłówek raportu)</div>${f('biuro', 'Nazwa biura')}${f('haslo', 'Hasło')}${f('agent', 'Sporządził (imię i nazwisko)')}${f('tel', 'Telefon')}${f('email', 'E-mail')}${f('www', 'Strona www')}</div>
    <div class="card"><div class="eyebrow">O aplikacji</div><div class="kv"><span>Wersja</span><b>${VERSION}</b></div><div class="kv"><span>Dane</span><b>tylko w tym telefonie</b></div>
    <p class="small muted">Szacunek ma charakter orientacyjny i nie zastępuje wyceny rzeczoznawcy majątkowego. Wynik zawsze jest przedziałem z oceną pewności; cechy bez danych porównawczych nie zmieniają go.</p></div>`;
  return [html, v => $$('[data-k]', v).forEach(i => i.oninput = () => { S.ust[i.dataset.k] = i.value; save.ust(); })];
}

/* ---------- start ---------- */
window.addEventListener('hashchange', render);
document.addEventListener('click', e => { const b = e.target.closest('[data-back]'); if (b && !b.onclick) history.length > 1 ? history.back() : go('#/wycena'); });
load().then(() => { render(); if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { }); window.__am = { S, render, go }; });
