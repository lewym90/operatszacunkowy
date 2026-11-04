// Ekran Start (1.22): kafelki prowadzą do właściwych ekranów, pasek Więcej otwiera menu, a wszystkie zakładki są osiągalne na telefonie.
let _pw; try { _pw = require('playwright'); } catch { _pw = require('/opt/npm-tools/node_modules/playwright'); } const { chromium } = _pw; const { spawn } = require('child_process'); const path = require('path');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); const ok = (c, m) => { console.log((c ? 'OK ' : '✗ ') + m); if (!c) errs.push(m); };
  const U = 'http://localhost:8765/index.html'; await p.goto(U); await p.waitForTimeout(2000);
  ok(await p.$eval('#view', e => e.dataset.view) === 'start', 'aplikacja startuje od ekranu Start'); ok((await p.$$('.tile')).length === 8, '8 kafelków');
  ok((await p.$$eval('#tabs a, #tabs .more', a => a.filter(x => x.offsetParent).map(x => x.textContent.trim()))).join('|') === 'Start|Wycena|Mapa|Rynek|Więcej', 'pasek: Start, Wycena, Mapa, Rynek, Więcej');
  const tile = async (k, view, chk) => { await p.goto(U + '#/start'); await p.waitForTimeout(300); await p.click(`[data-tile="${k}"]`); await p.waitForTimeout(400); ok(await p.$eval('#view', e => e.dataset.view) === view, `kafelek ${k} → ${view}`); if (chk) ok(await p.evaluate(chk), `kafelek ${k}: stan`); };
  await tile('sale', 'wycena', "window.__am.S.form.tryb === 'sprzedaz'"); await tile('rent', 'wycena', "window.__am.S.form.tryb === 'najem'");
  await tile('#/rynek', 'rynek'); await tile('#/kalkulator', 'kalkulator'); await tile('#/oferty', 'oferty'); await tile('tec', 'historia', "window.__am.S.histTab === 'teczki'"); await tile('#/raporty', 'raporty');
  for (const k of ['oferty', 'historia', 'raporty', 'kalkulator', 'dane', 'ust']) { await p.goto(U + '#/start'); await p.waitForTimeout(250); await p.click('#tabs [data-menu]'); await p.waitForTimeout(600); await p.click(`#sheet a[href="#/${k}"]`); await p.waitForTimeout(500); ok(await p.$eval('#view', e => e.dataset.view) === k && !(await p.$('#sheet.open')), 'menu Więcej → ' + k); }
  await b.close(); srv.kill(); console.log('BŁĘDY:', errs.length ? errs : 'brak'); if (errs.length) process.exit(1);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
