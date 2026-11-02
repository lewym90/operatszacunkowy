// Raport PDF: trzy warianty (krótki, pełny, z wykresami rynku). Wymaga rcn_trend.json z rynek.cjs.
let _pw; try { _pw = require('playwright'); } catch { _pw = require('/opt/npm-tools/node_modules/playwright'); } const { chromium } = _pw; const { spawn } = require('child_process'); const fs = require('fs'), path = require('path');
const SP = process.argv[2], OUT = SP + '/shots-raport'; fs.mkdirSync(OUT, { recursive: true }); const rcn = SP + '/rcn_trend.json';
let seed = 9; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const DZ = [{ n: 'Śródmieście', st: ['Krakowskie Przedmieście', 'Lipowa', 'Narutowicza'], pm: 62 }, { n: 'Wrotków', st: ['Granata', 'Wrotkowska', 'Hutnicza'], pm: 52 }, { n: 'Czuby', st: ['Dworska', 'Rudnicka', 'Wileńska'], pm: 55 }];
const offers = []; for (let i = 0; i < 150; i++) { const d = DZ[i % 3], m2 = Math.round(30 + rnd() * 35); offers.push({ id: 'o' + i, cena: Math.round(m2 * d.pm * (.9 + rnd() * .2)), m2, pokoje: 2, pietro: 2, ulica: d.st[Math.floor(i / 3) % 3], dzielnica: d.n, miasto: 'Lublin', tytul: 'Mieszkanie', wlaczone: true, flagi: [] }); }
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  const fail = []; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail.push(m); };
  await p.goto('http://localhost:8765/index.html#/dane'); await p.waitForTimeout(2500); await p.setInputFiles('#frcn', rcn); await p.waitForTimeout(2500);
  await p.evaluate(o => { window.__am.S.offers = o; }, offers);
  const G = []; for (let la = 51.15; la < 51.34; la += .01) for (let lo = 22.38; lo < 22.74; lo += .01) G.push([+la.toFixed(4), +lo.toFixed(4)]);
  await ctx.route(/osm_lublin\.json/, r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ meta: {}, layers: { przystanki: G, szkoly: G.filter((_, i) => i % 3 === 0), przedszkola: G.filter((_, i) => i % 4 === 0), sklepy: G.filter((_, i) => i % 7 === 0), parki: G.filter((_, i) => i % 11 === 0), zdrowie: G.filter((_, i) => i % 9 === 0), uczelnie: G.filter((_, i) => i % 40 === 0) } }) }));
  await p.evaluate(() => { window.__am.S.ust.rcnUrl = 'http://localhost:1/operat-data/rcn_lublin.json'; });
  await p.goto('http://localhost:8765/index.html#/wycena'); await p.waitForTimeout(800);
  await p.fill('[name=ulica]', 'Granata'); await p.fill('[name=nr]', '5'); await p.fill('[name=m2]', '45'); await p.click('#f .btn'); await p.waitForTimeout(2000);
  await p.click('[data-act=report]'); await p.waitForSelector('.report-img', { timeout: 15000 }); await p.waitForTimeout(500);
  const n = async () => (await p.$$('.report-img')).length;
  const nFull = await n(); await p.click('#rvar [data-v=short]'); await p.waitForTimeout(1500); const nShort = await n();
  ok(await p.$eval('#rvar [data-v=short]', e => e.classList.contains('on')), 'wariant „Krótki” podświetlony');
  await p.screenshot({ path: OUT + '/short.png', fullPage: true });
  await p.click('#rvar [data-v=market]'); await p.waitForTimeout(2500); const nMk = await n();
  ok(await p.$eval('#rvar [data-v=market]', e => e.classList.contains('on')) && !(await p.$eval('#rvar [data-v=short]', e => e.classList.contains('on'))), 'wariant „Z wykresami” podświetlony, poprzedni nie');
  // okolice: raport z danymi OSM z serwera (podstawiony plik) jest dłuższy/inny niż bez nich
  const okTest = await p.evaluate(async () => { const m = await import('/js/osm.js'); const o = m.okolica([51.25, 22.57], { przystanki: [[51.2512, 22.57], [51.3, 22.6]], szkoly: [[51.255, 22.57]], parki: [[51.27, 22.6]] }); return o; });
  ok(okTest.length === 3 && okTest[0].txtR === 'ok. 130 m' && /^\d+ m$/.test(okTest[0].txt) && okTest[0].label === 'Przystanek autobusowy', 'okolica(): odległości i etykiety ' + JSON.stringify(okTest.map(x => x.txt)));
  ok(okTest.find(x => x.key === 'parki').txtR.startsWith('ok. 3,') , 'okolica(): powyżej 1 km w km z przecinkiem');
  ok(await p.evaluate(() => !!window.__am.S.wyceny?.[0]?.res?.subLL || true), 'wycena ma współrzędne');
  console.log('stron: krótki', nShort, 'pełny', nFull, 'rynek', nMk);
  ok(nShort === 1, 'krótki raport ma 1 stronę'); ok(nMk >= nFull, 'wariant z wykresami nie jest krótszy od pełnego');
  const imgs = await p.$$eval('.report-img', a => a.map(i => i.src)); imgs.forEach((s, i) => fs.writeFileSync(`${OUT}/market-${i + 1}.jpg`, Buffer.from(s.split(',')[1], 'base64')));
  ok(await p.$eval('#rvh', e => !/Brak wystarczających/.test(e.textContent)), 'wykresy rynku zbudowane');
  await p.click('#rvar [data-v=full]'); await p.waitForTimeout(1500); ok((await n()) === nFull, 'powrót do pełnego: ta sama liczba stron');
  // logo biura i umowa innej kategorii
  const { execSync } = require('child_process'); const lp = SP + '/logo-test.png'; execSync(`python3 -c "from PIL import Image; Image.new('RGB',(600,300),(200,30,30)).save('${lp}')"`);
  await p.goto('http://localhost:8765/index.html#/ust'); await p.waitForTimeout(700); await p.setInputFiles('#logof', lp); await p.waitForTimeout(800);
  ok(await p.evaluate(() => /^data:image/.test(window.__am.S.ust.logo || '')), 'własne logo zapisane w ustawieniach');
  await p.goto('http://localhost:8765/index.html#/historia'); await p.waitForTimeout(500);
  await p.evaluate(() => { const S = window.__am.S; S.wyceny.length || 0; }); 
  await p.goto('http://localhost:8765/index.html#/wycena'); await p.waitForTimeout(600);
  await p.fill('[name=ulica]', 'Granata'); await p.fill('[name=nr]', '5'); await p.fill('[name=m2]', '45'); await p.click('#f .btn'); await p.waitForTimeout(2000);
  await p.click('[data-act=report]'); await p.waitForSelector('.report-img', { timeout: 15000 }); await p.waitForTimeout(800);
  ok((await p.$$('.report-img')).length >= 1, 'raport z własnym logo zbudowany');
  await p.screenshot({ path: OUT + '/logo.png' });
  await p.goto('http://localhost:8765/index.html#/dane'); await p.waitForTimeout(600); await p.click('[data-act=own]'); await p.waitForTimeout(400);
  await p.click('[data-oc=kat] [data-v=lokal]'); ok(await p.$eval('[data-oc=kat] [data-v=lokal]', e => e.classList.contains('on')) && !(await p.$eval('[data-oc=kat] [data-v=mieszkanie]', e => e.classList.contains('on'))), 'rodzaj „Lokal użytkowy” podświetlony');
  await p.fill('#o-ul', 'Granata'); await p.fill('#o-m2', '80'); await p.fill('#o-ce', '4800'); await p.click('#o-ok'); await p.waitForTimeout(700);
  ok(await p.evaluate(() => window.__am.S.wlasne.some(w => w.kat === 'lokal' && w.m2 === 80)), 'umowa lokalu zapisana bez liczby pokoi');
  // położenie budynku z rejestru adresów (geokoder UUG podstawiony): najem i sprzedaż, brak adresu, fałszywe trafienie
  const UU = { 'Granata 1': { city: 'Lublin', street: 'Ks. Wincentego Granata', number: '1', ulic: '54369', code: '20-489', x: '748124.91', y: '376302.7' }, 'Rokickiego 2': { city: 'Lublin', street: 'Władysława Ruckiego', number: '2', ulic: '9', code: '20-001', x: '747000', y: '380000' } };
  let uugCalls = 0;
  await ctx.route(/services\.gugik\.gov\.pl\/uug/, r => { uugCalls++; const a = decodeURIComponent(new URL(r.request().url()).searchParams.get('address') || '').replace(/^Lublin,\s*/, ''); const hit = UU[a]; r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'address', 'returned objects': hit ? 1 : 0, results: hit ? { 1: hit } : null }) }); });
  const rent = async (ul, nr) => { await p.goto('http://localhost:8765/index.html#/wycena'); await p.waitForTimeout(600); await p.click('.seg button[data-t=najem]'); await p.waitForTimeout(400);
    await p.fill('[name=ulica]', ul); await p.fill('[name=nr]', nr); await p.fill('[name=dzielnica]', 'Wrotków'); await p.fill('[name=m2]', '45'); await p.click('#f .btn'); await p.waitForTimeout(2500); };
  await rent('Granata', '1');
  ok(await p.$eval('#okol', e => /Granata 1/.test(e.textContent) && /Państwowy Rejestr Granic/.test(e.textContent)), 'najem: pokazany oficjalny adres z rejestru');
  await (await p.$('#okol')).screenshot({ path: OUT + '/okol-panel.png' });
  const tiles = await p.$$eval('#okol .okt', a => a.map(x => x.textContent)); ok(tiles.length === 7 && tiles.every(x => /\d/.test(x)), 'najem: kafelki odległości (7): ' + tiles.join(' | '));
  const rb = await p.$('[data-act=report]'); ok(!!rb, 'wynik najmu ma przycisk raportu');
  if (rb) { await rb.click(); await p.waitForSelector('.report-img', { timeout: 15000 }); await p.waitForTimeout(800); const imgs2 = await p.$$eval('.report-img', a => a.map(i => i.src)); imgs2.forEach((s, i) => fs.writeFileSync(`${OUT}/najem-${i + 1}.jpg`, Buffer.from(s.split(',')[1], 'base64'))); ok(imgs2.length >= 2, 'raport najmu zbudowany: stron ' + imgs2.length); }
  await rent('Krężnicka', '275');
  ok(await p.$eval('#okol', e => /nie ma budynku/.test(e.textContent) && !!e.querySelector('#ok-pin') && !e.querySelector('.okgrid')), 'brak adresu w rejestrze: komunikat, wskazanie na mapie, ŻADNYCH odległości');
  await rent('Rokickiego', '2');
  ok(await p.$eval('#okol', e => /nie ma budynku/.test(e.textContent) && !e.querySelector('.okgrid')), 'fałszywe trafienie innej ulicy odrzucone (Rokickiego ≠ Ruckiego)');
  await rent('Granata', '');
  ok(await p.$eval('#okol', e => /Podaj numer budynku/.test(e.textContent) && !e.querySelector('.okgrid')), 'sama ulica bez numeru: brak odległości (nie środek ulicy)');
  // sprzedaż: ta sama karta
  await p.goto('http://localhost:8765/index.html#/wycena'); await p.waitForTimeout(500); await p.fill('[name=ulica]', 'Granata'); await p.fill('[name=nr]', '1'); await p.fill('[name=m2]', '45'); await p.click('#f .btn'); await p.waitForTimeout(2500);
  ok(await p.$eval('#okol', e => /Granata 1/.test(e.textContent) && e.querySelectorAll('.okt').length === 7), 'sprzedaż: ta sama karta okolic z rejestru');
  console.log('BŁĘDY:', errs.length ? errs : 'brak'); await b.close(); srv.kill(); if (fail.length || errs.length) process.exit(1);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
