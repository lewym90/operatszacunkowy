// Kategorie nieruchomości: katalog w Danych, wycena (dom, działka, lokal użytkowy, obiekt/hala, garaż), raport PDF i mapa — na danych syntetycznych.
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn } = require('child_process'); const fs = require('fs');
const SP = process.argv[2], OUT = SP + '/shots-kat'; fs.mkdirSync(OUT, { recursive: true });
let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const lok = JSON.parse(fs.readFileSync(SP + '/rcn_syntetyczny.json', 'utf8')); const ix = Object.fromEntries(lok.cols.map((c, i) => [c, i]));
const geo = () => [51.215 + rnd() * 0.07, 22.5 + rnd() * 0.12];
for (let i = 0; i < 60; i++) { const [la, lo] = geo(), m2 = 14 + Math.round(rnd() * 8); const r = Array(lok.cols.length).fill(null); r[ix.id] = 'G' + i; r[ix.tran] = 'TG' + i; r[ix.cena] = m2 * (1800 + rnd() * 900); r[ix.rynek] = 'rynekWtorny'; r[ix.rodzaj] = 'wolnyRynek'; r[ix.rok] = 2025; r[ix.funkcja] = 'garaz'; r[ix.izby] = 0; r[ix.m2] = m2; r[ix.ulica] = pick(['Zana', 'Lipowa']); r[ix.nr] = '' + (1 + i % 30); r[ix.udzial] = '1/1'; r[ix.lat] = la; r[ix.lon] = lo; lok.rows.push(r); }
for (let i = 0; i < 40; i++) { const [la, lo] = geo(), m2 = 40 + Math.round(rnd() * 90); const r = Array(lok.cols.length).fill(null); r[ix.id] = 'U' + i; r[ix.tran] = 'TU' + i; r[ix.cena] = m2 * (6000 + rnd() * 3000); r[ix.rynek] = 'rynekWtorny'; r[ix.rodzaj] = i % 9 === 0 ? 'sprzedazPrzetargowa' : 'wolnyRynek'; r[ix.rok] = 2025; r[ix.funkcja] = pick(['handlowoUslugowa', 'biurowa']); r[ix.izby] = 0; r[ix.m2] = m2; r[ix.ulica] = 'Lipowa'; r[ix.nr] = '' + (1 + i); r[ix.udzial] = '1/1'; r[ix.lat] = la; r[ix.lon] = lo; lok.rows.push(r); }
lok.meta.wersja = 'testA'; lok.meta.rekordow = lok.rows.length;
const cols = ['tran', 'cena', 'cena_nier', 'rynek', 'rodzaj', 'rok', 'data', 'nier', 'prawo', 'udzial', 'pow_gr', 'bud_rodz', 'bud_m2', 'n_bud', 'dz_przezn', 'dz_sposob', 'dz_m2', 'n_dz', 'wiele', 'ulica', 'nr', 'lat', 'lon', 'sprz'], rows = [];
const row = (id, cena, nier, bud, bm2, przezn, dz, o = {}) => { const [la, lo] = geo(); return [id, cena, 0, o.rynek ?? 'rynekWtorny', o.rodzaj || 'wolnyRynek', 2025, o.data ?? `2025-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`, nier, 'wlasnoscNieruchomosciGruntowej', '1/1', dz, bud, bm2, bud ? 1 : 0, przezn, 'gruntyZabudowaneIZurbanizowane', dz, 1, o.wiele || 0, o.ulica || '', o.nr || '', la, lo, null]; };
for (let i = 0; i < 120; i++) { const b = 90 + Math.round(rnd() * 140); rows.push(row('H' + i, b * (7000 + rnd() * 5000), 'nieruchomoscGruntowaZabudowana', 'mieszkalny', i % 3 === 0 ? null : b, 'budownictwoMieszkanioweJednorodzinne', 400 + Math.round(rnd() * 900), { ulica: i % 4 ? '' : 'Wrzosowa', nr: '' + (1 + i % 20) })); }
for (let i = 0; i < 40; i++) { const b = 300 + Math.round(rnd() * 1500); rows.push(row('O' + i, b * (2500 + rnd() * 2500), 'nieruchomoscGruntowaZabudowana', pick(['przemyslowy', 'handlowoUslugowy', 'zbiornikiSilosyMagazyny']), b, 'terenObiektowProdukcyjnychSkladowIMagazynow', 2000 + Math.round(rnd() * 4000))); }
for (let i = 0; i < 200; i++) { const a = 500 + Math.round(rnd() * 1500), ha = i % 5 === 0; rows.push(row('D' + i, a * (150 + rnd() * 250), 'nieruchomoscGruntowaNiezabudowana', null, null, pick(['budownictwoMieszkanioweJednorodzinne', 'terenRolniczy', 'terenZabudowyUslugowej']), ha ? a / 1e4 : a, { rynek: '', rodzaj: i % 17 === 0 ? 'sprzedazPrzetargowa' : 'wolnyRynek', data: i % 23 === 0 ? '0204-06-17' : undefined })); }
rows.push(row('W1', 5000000, 'nieruchomoscGruntowaNiezabudowana', null, null, 'terenRolniczy', 40000, { wiele: 1, rynek: '' }));
const inne = { meta: { rekordow: rows.length, wersja: 'testB', pobrano: '2026-10-29', bez_wspolrzednych: 0 }, cols, rows };
const meta = { ...lok.meta, inne: { wersja: 'testB', rekordow: rows.length } };
(async () => {
  const web = spawn('python3', ['-m', 'http.server', '8797', '-d', require('path').resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const U = 'http://localhost:8797/index.html'; let bad = 0; const err = m => { bad++; console.log('  ✗', m); };
  for (const [name, w, h, touch] of [['phone', 390, 844, true], ['desktop', 1440, 900, false]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|tile\.openstreetmap|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await p.route('**/tile.openstreetmap.org/**', r => r.abort());
    await p.route('**/zz/rcn_lublin.json', r => r.fulfill({ json: lok })); await p.route('**/zz/rcn_inne.json', r => r.fulfill({ json: inne })); await p.route('**/zz/rcn_meta.json', r => r.fulfill({ json: meta }));
    await p.goto(U + '#/dane'); await p.waitForTimeout(700);
    await p.fill('#rurl', 'http://localhost:8797/zz/rcn_lublin.json'); await p.click('[data-act=rcnurl]'); await p.waitForTimeout(2500);
    const cat = await p.evaluate(() => [...document.querySelectorAll('.cattab .r')].map(r => r.innerText.replace(/\n+/g, ' | ')));
    console.log(name, 'katalog:', cat.slice(1).join(' ; ')); for (const k of ['Dom', 'Działka', 'Lokal użytkowy', 'Obiekt / hala', 'Garaż', 'Mieszkanie']) if (!cat.some(r => r.startsWith(k))) err('brak wiersza katalogu: ' + k);
    // automatyczna aktualizacja: ta sama wersja => „aktualne”; zmiana wersji pliku domów => ponowne pobranie
    await p.evaluate(() => window.__am.checkRcn(true)); await p.waitForTimeout(800);
    const cases = [
      ['dom', { ulica: 'Wrzosowa', nr: '3', m2: '140', dzm2: '700' }], ['dzialka', { m2: '1000' }, 'budownictwoMieszkanioweJednorodzinne'], ['lokal', { m2: '80' }, 'handlowoUslugowa'],
      ['obiekt', { m2: '800' }, 'przemyslowy'], ['garaz', { m2: '18' }], ['dzialka', { m2: '1000', ulica: 'Nieistniejąca' }, 'terenRolniczy'],
    ];
    for (const [kat, f, pod] of cases) {
      await p.goto(U + '#/wycena'); await p.waitForTimeout(500); await p.click(`[data-katsel] [data-v=${kat}]`); await p.waitForTimeout(300);
      for (const [k, v] of Object.entries(f)) await p.fill(`[name=${k}]`, v); if (pod) await p.click(`[data-chips=pod] [data-v=${pod}]`);
      await p.click('#f .btn'); await p.waitForTimeout(900);
      const hero = await p.$('.hero .big'); const txt = hero ? await hero.innerText() : await p.evaluate(() => document.querySelector('.card')?.innerText.slice(0, 120));
      const n = await p.evaluate(() => document.querySelector('.stat b')?.textContent); const lvl = await p.evaluate(() => document.querySelector('.conf b')?.textContent);
      const comp = await p.evaluate(() => document.querySelector('.comp .m')?.innerText || '');
      console.log(name, kat, f.ulica ? '(' + f.ulica + ')' : '', '→', txt.replace(/\n/g, ' '), '| porównań', n, '| pewność', lvl, '| 1. porównanie:', comp.slice(0, 70));
      if (!hero) err(kat + ': brak wyniku'); if (/pok\./.test(comp)) err(kat + ': porównanie z liczbą pokoi');
      if (hero && kat === 'dom') { await p.screenshot({ path: `${OUT}/${name}-wynik-dom.png` }); }
      if (hero) { await p.click('[data-act=report]'); await p.waitForSelector('.report-img', { timeout: 15000 }); if (kat === 'dom' || kat === 'dzialka') await p.screenshot({ path: `${OUT}/${name}-raport-${kat}.png`, fullPage: false }); }
    }
    // najem nie-mieszkania: czytelny komunikat, nie błąd
    await p.goto(U + '#/wycena'); await p.waitForTimeout(400); await p.click('.seg [data-t=najem]'); await p.waitForTimeout(300); await p.click('[data-katsel] [data-v=dom]'); await p.fill('[name=m2]', '120'); await p.click('#f .btn'); await p.waitForTimeout(600);
    console.log(name, 'najem domu:', (await p.evaluate(() => document.querySelector('.card')?.innerText || '')).replace(/\n+/g, ' ').slice(0, 160));
    // mapa
    await p.goto(U + '#/mapa'); await p.waitForSelector('.leaflet-container', { timeout: 10000 }); await p.waitForTimeout(900);
    for (const kat of ['mieszkanie', 'dom', 'dzialka', 'lokal', 'obiekt', 'garaz']) {
      await p.click(`[data-mf=kat] [data-v=${kat}]`); await p.waitForTimeout(700); const st = await p.evaluate(() => document.querySelector('#mapstat').textContent);
      console.log(name, 'mapa', kat, ':', st.slice(0, 100)); if (!/Na mapie: \d+/.test(st)) err('mapa ' + kat + ' pusta');
      if (kat === 'dzialka') await p.screenshot({ path: `${OUT}/${name}-mapa-dzialki.png` });
    }
    await p.click('[data-mode=grid]'); await p.waitForTimeout(700); console.log(name, 'mapa siatka (garaż):', (await p.evaluate(() => document.querySelector('#mapstat').textContent)).slice(0, 110));
    await p.goto(U + '#/dane'); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${name}-dane.png`, fullPage: true });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (ov) err('poziome przewijanie');
    console.log(name, 'BŁĘDY JS:', errs.length ? errs : 'brak'); bad += errs.length; await ctx.close();
  }
  await b.close(); web.kill(); console.log(bad ? 'PROBLEMY: ' + bad : 'WSZYSTKO OK'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
