// Sprawdza automatyczną aktualizację RCN: serwer wystawia rcn_lublin.json i rcn_meta.json; aplikacja ma je pobrać sama, a po zmianie wersji pobrać ponownie.
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SP = process.argv[2], tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcn-'));
const base = JSON.parse(fs.readFileSync(SP + '/rcn_syntetyczny.json', 'utf8'));
const put = (wersja, extra = 0) => { const pack = { ...base, meta: { ...base.meta, wersja, rekordow: base.rows.length + extra }, rows: extra ? base.rows.concat(base.rows.slice(0, extra).map((r, i) => { const c = r.slice(); c[0] = 'x' + i; return c; })) : base.rows };
  fs.writeFileSync(tmp + '/rcn_lublin.json', JSON.stringify(pack)); fs.writeFileSync(tmp + '/rcn_meta.json', JSON.stringify(pack.meta)); };
(async () => {
  put('wersja-A');
  // serwer plików z CORS (jak Caddy)
  fs.writeFileSync(tmp + '/srv.py', `import http.server,sys\nclass H(http.server.SimpleHTTPRequestHandler):\n  def end_headers(self):\n    self.send_header('Access-Control-Allow-Origin','*'); self.send_header('Cache-Control','no-cache'); super().end_headers()\n  def log_message(self,*a): pass\nhttp.server.ThreadingHTTPServer(('127.0.0.1',8795),H).serve_forever()\n`);
  const data = spawn('python3', [tmp + '/srv.py'], { cwd: tmp, stdio: 'ignore' }), web = spawn('python3', ['-m', 'http.server', '8796', '-d', require('path').resolve(__dirname, '..')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(), errs = [], ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  const U = 'http://localhost:8796/index.html', RURL = 'http://127.0.0.1:8795/rcn_lublin.json', st = () => p.evaluate(() => ({ n: window.__am.S.tx.length, w: window.__am.S.rcn?.meta?.wersja, rows: window.__am.S.rcn?.rows.length }));
  await p.goto(U); await p.waitForTimeout(1500);
  // urządzenie z samym adresem pliku (np. po synchronizacji ustawień) i bez danych RCN: ma pobrać samo
  await p.evaluate(url => { window.__am.S.ust.rcnUrl = url; }, RURL); await p.evaluate(() => window.__am.checkRcn()); await p.waitForTimeout(2500);
  let s = await st(); console.log('1 po starcie bez danych:', JSON.stringify(s)); if (s.w !== 'wersja-A') errs.push('NIE POBRAŁO DANYCH RCN SAMO');
  // ta sama wersja: bez ponownego pobierania
  await p.evaluate(() => { window.__fetches = 0; const f = window.fetch; window.fetch = (...a) => { if (String(a[0]).endsWith('rcn_lublin.json')) window.__fetches++; return f(...a); }; });
  await p.evaluate(() => window.__am.checkRcn(true)); await p.waitForTimeout(800);
  const nf = await p.evaluate(() => window.__fetches); console.log('2 ta sama wersja, pobrań dużego pliku:', nf); if (nf !== 0) errs.push('POBRAŁO DUŻY PLIK MIMO TEJ SAMEJ WERSJI');
  // serwer odświeżył plik: nowa wersja i 25 nowych rekordów
  put('wersja-B', 25); await p.evaluate(() => window.__am.checkRcn(true)); await p.waitForTimeout(2500);
  s = await st(); console.log('3 po nowej wersji:', JSON.stringify(s)); if (s.w !== 'wersja-B' || s.rows !== base.rows.length + 25) errs.push('NIE ZAKTUALIZOWAŁO DO NOWEJ WERSJI');
  // trwałość po przeładowaniu i brak ponownego pobierania (przerwa < 3 h)
  await p.reload(); await p.waitForTimeout(1500); s = await st(); console.log('4 po przeładowaniu:', JSON.stringify(s)); if (s.w !== 'wersja-B') errs.push('PO PRZEŁADOWANIU NIE MA NOWEJ WERSJI');
  // brak pliku wersji na serwerze: bez błędów, dane zostają
  fs.unlinkSync(tmp + '/rcn_meta.json'); await p.evaluate(() => window.__am.checkRcn(true)); await p.waitForTimeout(800); s = await st(); if (s.w !== 'wersja-B') errs.push('BRAK META ZEPSUŁ DANE');
  console.log('BŁĘDY:', errs.length ? errs : 'brak'); await b.close(); data.kill(); web.kill(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
