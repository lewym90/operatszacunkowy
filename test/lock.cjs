// Jedna karta naraz: druga karta dostaje nakładkę i nie zapisuje; przejęcie przenosi blokadę, a pierwsza karta się zamraża.
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/npm-tools/node_modules/playwright'); }
const { spawn } = require('child_process'); const path = require('path');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await pw.chromium.launch(); const ctx = await b.newContext({ serviceWorkers: 'block' }); const errs = [], fail = [];
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail.push(m); };
  const A = await ctx.newPage(); A.on('pageerror', e => errs.push(e.message)); await A.goto('http://localhost:8765/index.html#/wycena'); await A.waitForTimeout(1500);
  ok(await A.evaluate(() => window.__am && window.__am.got === true), 'karta A ma blokadę');
  const B = await ctx.newPage(); B.on('pageerror', e => errs.push(e.message)); await B.goto('http://localhost:8765/index.html#/wycena'); await B.waitForTimeout(1500);
  ok(await B.$('#lockov') != null, 'karta B pokazuje nakładkę'); ok(await B.evaluate(() => window.__am.got === false), 'karta B nie ma blokady');
  await B.click('#lk-use'); await B.waitForTimeout(2000);
  ok(await B.$('#lockov') == null && await B.evaluate(() => window.__am.got === true), 'po przejęciu karta B ma blokadę po przeładowaniu');
  await A.waitForTimeout(500); ok(await A.$('#lockov') != null, 'karta A po utracie blokady pokazuje nakładkę');
  console.log('JS:', errs.length ? errs : 'brak'); await b.close(); srv.kill(); if (fail.length || errs.length) process.exit(1);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
