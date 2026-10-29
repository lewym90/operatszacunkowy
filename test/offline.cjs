const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8767', '-d', require('path').resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8767/index.html'); await p.waitForTimeout(2500);
  const ready = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; await new Promise(x => setTimeout(x, 2500)); return !!r.active; });
  const cached = await p.evaluate(async () => (await (await caches.keys()).length ? (await (await caches.open((await caches.keys())[0])).keys()).length : 0));
  await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(2500);
  const title = await p.$eval('h1', e => e.textContent).catch(() => 'BRAK'); console.log('sw aktywny:', ready, '| plików w cache:', cached, '| offline h1:', title, '| błędy:', errs.length ? errs : 'brak');
  await b.close(); srv.kill();
})();
