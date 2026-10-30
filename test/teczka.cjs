// E2E: teczka nieruchomości (utworzenie z wyceny, zdjęcie, notatka, drugie wycenienie z automatycznym powiązaniem, wykres) i kontrola własnych umów.
// Wymaga najpierw uruchomienia test/rynek.cjs (tworzy rcn_trend.json w katalogu roboczym).
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn, execSync } = require('child_process'); const fs = require('fs'), path = require('path');
const SP = process.argv[2], OUT = SP + '/shots-teczka'; fs.mkdirSync(OUT, { recursive: true });
const rcn = SP + '/rcn_trend.json'; if (!fs.existsSync(rcn)) { console.error('brak ' + rcn + ' (uruchom najpierw rynek.cjs)'); process.exit(2); }
const png = SP + '/foto-test.png'; execSync(`python3 -c "from PIL import Image; Image.new('RGB',(1600,1200),(180,140,60)).save('${png}')"`);
let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const DZ = [{ n: 'Śródmieście', st: ['Krakowskie Przedmieście', 'Lipowa', 'Narutowicza'], pm: 62 }, { n: 'Wrotków', st: ['Granata', 'Wrotkowska', 'Hutnicza'], pm: 52 }, { n: 'Czuby', st: ['Dworska', 'Rudnicka', 'Wileńska'], pm: 55 }];
const offers = []; for (let i = 0; i < 150; i++) { const d = DZ[i % 3], m2 = Math.round(30 + rnd() * 35); offers.push({ id: 'o' + i, cena: Math.round(m2 * d.pm * (.9 + rnd() * .2)), m2, pokoje: 2, pietro: 2, ulica: d.st[Math.floor(i / 3) % 3], dzielnica: d.n, miasto: 'Lublin', tytul: 'Mieszkanie', wlaczone: true, flagi: [] }); }
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', d => d.accept());
  const fail = []; const ok = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) fail.push(msg); };
  await p.goto('http://localhost:8765/index.html#/dane'); await p.waitForTimeout(2500);
  await p.setInputFiles('#frcn', rcn); await p.waitForTimeout(2500);
  await p.evaluate(o => { window.__am.S.offers = o; }, offers);
  // wycena sprzedaży
  await p.goto('http://localhost:8765/index.html#/wycena'); await p.waitForTimeout(800);
  await p.fill('[name=ulica]', 'Granata'); await p.fill('[name=nr]', '5'); await p.fill('[name=m2]', '45'); await p.click('#f .btn'); await p.waitForTimeout(2000);
  ok(await p.$('[data-act=save]') != null, 'wynik sprzedaży z przyciskiem zapisu');
  await p.click('[data-act=save]'); await p.waitForTimeout(700);
  await p.click('[data-act=tec]'); await p.waitForTimeout(500); await p.click('#tc-new'); await p.waitForTimeout(600);
  let st = await p.evaluate(() => ({ t: window.__am.S.teczki.length, w: window.__am.S.wyceny.map(e => !!e.teczka) }));
  ok(st.t === 1 && st.w[0], 'teczka utworzona i wycena powiązana: ' + JSON.stringify(st));
  await p.goto('http://localhost:8765/index.html#/historia'); await p.waitForTimeout(500); await p.click('[data-ht=teczki]'); await p.waitForTimeout(400);
  ok((await p.$$('a.card[href^="#/teczka/"]')).length === 1, 'teczka na liście');
  await p.screenshot({ path: OUT + '/01-lista.png' });
  await p.click('a.card[href^="#/teczka/"]'); await p.waitForTimeout(700);
  await p.setInputFiles('#tph', png); await p.waitForTimeout(1200);
  ok((await p.$$('.photos .ph')).length === 1, 'zdjęcie dodane');
  await p.fill('#tnote', 'Klient chce sprzedać do marca.'); await p.waitForTimeout(1200);
  // drugie wycenienie z teczki
  await p.click('[data-act=w-sale]'); await p.waitForTimeout(800);
  const f = await p.evaluate(() => ({ u: document.querySelector('[name=ulica]').value, n: document.querySelector('[name=nr]').value, m: document.querySelector('[name=m2]').value }));
  ok(f.u === 'Granata' && f.n === '5' && f.m === '45', 'formularz wypełniony z teczki: ' + JSON.stringify(f));
  await p.click('#f .btn'); await p.waitForTimeout(1800); await p.click('[data-act=save]'); await p.waitForTimeout(700);
  st = await p.evaluate(() => ({ t: window.__am.S.teczki.length, w: window.__am.S.wyceny.filter(e => e.teczka).length, note: window.__am.S.teczki[0].notatki }));
  ok(st.t === 1 && st.w === 2 && /marca/.test(st.note), 'druga wycena powiązana automatycznie, notatka zapisana: ' + JSON.stringify(st));
  await p.goto('http://localhost:8765/index.html#/historia'); await p.waitForTimeout(400); await p.click('[data-ht=teczki]'); await p.click('a.card[href^="#/teczka/"]'); await p.waitForTimeout(900);
  ok((await p.$$('#tchart svg circle')).length === 2, 'wykres wartości w czasie: 2 punkty');
  await p.screenshot({ path: OUT + '/02-teczka.png', fullPage: true });
  // własne umowy
  await p.goto('http://localhost:8765/index.html#/dane'); await p.waitForTimeout(700); await p.click('[data-act=own]'); await p.waitForTimeout(500);
  await p.fill('#o-ul', 'Granata'); await p.fill('#o-m2', '52'); await p.fill('#o-pk', '3'); await p.fill('#o-pi', '1'); await p.fill('#o-ce', '3200'); await p.waitForTimeout(2500);
  const live = await p.$eval('#o-live', e => e.innerText); ok(/Bez tej umowy/.test(live), 'panel na żywo: ' + live.slice(0, 110));
  await p.screenshot({ path: OUT + '/03-umowa.png' });
  await p.click('#o-ok2'); await p.waitForTimeout(900);
  ok(await p.$('#o-ok') != null, 'po „Zapisz i dodaj kolejną” otwiera się nowy arkusz'); await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelector('#sheet .scrim').click()); await p.waitForTimeout(500);
  ok((await p.evaluate(() => window.__am.S.wlasne.length)) === 1, 'umowa zapisana');
  await p.click('[data-act=ownchk]'); await p.waitForTimeout(2500);
  const chk = await p.$eval('#ownchk', e => e.innerText.replace(/\n/g, ' ')); ok(/W przedziale wyceny/.test(chk), 'kontrola trafności umów: ' + chk.slice(0, 120));
  console.log('BŁĘDY:', errs.length ? errs : 'brak'); await b.close(); srv.kill();
  if (fail.length || errs.length) process.exit(1);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
