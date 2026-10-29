// Tryb awaryjny: po nieudanym uruchomieniu (znacznik am-boot) dane RCN nie wczytują się same; przycisk je wczytuje.
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn } = require('child_process'); const SP = process.argv[2];
(async () => {
  const web = spawn('python3', ['-m', 'http.server', '8797', '-d', require('path').resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' }); let p = await ctx.newPage(); let bad = 0; const errs = [];
  p.on('pageerror', e => errs.push(e.message)); const U = 'http://localhost:8797/index.html';
  await p.goto(U + '#/dane'); await p.waitForTimeout(600); await p.setInputFiles('#frcn', SP + '/rcn_syntetyczny.json'); await p.waitForTimeout(1500);
  const n0 = await p.evaluate(() => window.__am.S.tx.length); console.log('wczytane lokale:', n0);
  await p.evaluate(() => localStorage.setItem('am-boot', '1'));   // symulacja awarii: znacznik zostaje, bo przy awarii nie ma zdarzenia pagehide
  const p1 = p; const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message)); await q.goto(U + '#/dane'); await q.waitForTimeout(1500); p = q;
  const safe = await p.evaluate(() => ({ safe: window.__am.S.safe, tx: window.__am.S.tx.length, banner: !!document.querySelector('[data-act=safeoff]') }));
  console.log('po „awarii”:', JSON.stringify(safe)); if (!safe.safe || safe.tx !== 0 || !safe.banner) { bad++; console.log('✗ tryb awaryjny nie działa'); }
  await p.click('[data-act=safeoff]'); await p.waitForTimeout(1500); const n1 = await p.evaluate(() => window.__am.S.tx.length); console.log('po kliknięciu:', n1); if (n1 !== n0) { bad++; console.log('✗ dane nie wróciły'); }
  await p.reload(); await p.waitForTimeout(1200); const s2 = await p.evaluate(() => window.__am.S.safe); console.log('kolejne uruchomienie normalne, safe =', s2);
  if (errs.length) { bad++; console.log('✗ błędy JS', errs); } await b.close(); web.kill(); console.log(bad ? 'PROBLEMY' : 'AWARYJNY OK'); process.exit(bad ? 1 : 0);
})();
