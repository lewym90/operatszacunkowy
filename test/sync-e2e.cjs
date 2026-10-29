// Dwie przeglądarki ("telefon" i "komputer") łączą się z jednym serwerem synchronizacji: dane z jednej pojawiają się w drugiej.
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SP = process.argv[2], PDFS = fs.readdirSync(SP + '/pdf').filter(f => f.endsWith('.pdf')).map(f => SP + '/pdf/' + f), OUT = SP + '/shots-sync'; fs.mkdirSync(OUT, { recursive: true });
const KEY = 'testkey-0123456789-abcdefghijk', tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-'));
(async () => {
  const web = spawn('python3', ['-m', 'http.server', '8791', '-d', '/home/claude/operat'], { stdio: 'ignore' });
  const api = spawn('python3', ['/home/claude/operat/server/sync_server.py'], { stdio: 'inherit', env: { ...process.env, OPERAT_SYNC_KEY: KEY, OPERAT_SYNC_DB: tmp + '/s.db', OPERAT_SYNC_PORT: '8792' } });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(), errs = [];
  const mk = async (w, h, mobile) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('CONSOLE ' + m.text()); }); return p; };
  const U = 'http://localhost:8791/index.html', URL = 'http://127.0.0.1:8792';
  const A = await mk(390, 844, true), B = await mk(1440, 900, false);
  // A: import ofert, połączenie przez adres i klucz
  await A.goto(U + '#/dane'); await A.waitForTimeout(600);
  await A.setInputFiles('#fpdf', PDFS); await A.waitForSelector('#ok:not([disabled])', { timeout: 60000 }); await A.click('#ok'); await A.waitForTimeout(800);
  const nA = await A.evaluate(() => window.__am.S.offers.length); console.log('A ofert po imporcie:', nA);
  await A.goto(U + '#/ust'); await A.waitForSelector('#sy-go'); await A.screenshot({ path: OUT + '/A-przed.png', fullPage: true });
  await A.fill('#sy-url', URL); await A.fill('#sy-key', KEY); await A.click('#sy-go');
  await A.waitForFunction(() => document.getElementById('syncst')?.dataset.s === 'ok', null, { timeout: 30000 }); await A.waitForTimeout(500); await A.screenshot({ path: OUT + '/A-polaczony.png', fullPage: true });
  console.log('A status:', await A.textContent('#syncst'));
  // A: kod połączenia do schowka
  await A.click('#sy-copy'); const code = await A.evaluate(() => navigator.clipboard.readText()); console.log('kod:', code.slice(0, 14) + '…');
  // B: pusty komputer, łączy się kodem
  await B.goto(U + '#/ust'); await B.waitForSelector('#sy-code'); const nB0 = await B.evaluate(() => window.__am.S.offers.length); console.log('B ofert przed:', nB0);
  await B.fill('#sy-code', code); await B.click('#sy-code-go');
  await B.waitForFunction(() => document.querySelector('#syncst')?.dataset.s === 'ok', null, { timeout: 30000 }); await B.waitForTimeout(500);
  const nB = await B.evaluate(() => window.__am.S.offers.length); console.log('B ofert po połączeniu:', nB);
  await B.screenshot({ path: OUT + '/B-polaczony.png' });
  if (nB !== nA) errs.push(`RÓŻNA LICZBA OFERT: A=${nA} B=${nB}`);
  // B edytuje (wyłącza ofertę) i dopisuje własną umowę; A po synchronizacji to widzi
  await B.evaluate(() => { const S = window.__am.S; S.offers[0].wlaczone = false; S.wlasne.push({ id: 'wtest', ulica: 'Granata', dzielnica: 'Rury', m2: 52, pokoje: 2, pietro: 3, rok: 2020, standard: 'wysoki', meble: 'tak', cena: 3500, ts: Date.now() }); });
  await B.evaluate(() => window.__am.sync.run()); await A.evaluate(() => window.__am.sync.run());
  const seenA = await A.evaluate(() => ({ off: window.__am.S.offers[0].wlaczone, w: window.__am.S.wlasne.map(w => w.id) }));
  console.log('A widzi zmiany z B:', JSON.stringify(seenA)); if (seenA.off !== false || !seenA.w.includes('wtest')) errs.push('ZMIANY Z B NIE DOSZŁY DO A');
  // dane zostają po przeładowaniu (IndexedDB) i auto-sync przy starcie
  await A.reload(); await A.waitForTimeout(1500); const afterReload = await A.evaluate(() => window.__am.S.offers.length); if (afterReload !== nA) errs.push('PO PRZEŁADOWANIU INNA LICZBA OFERT ' + afterReload);
  // odłączenie
  await B.goto(U + '#/ust'); await B.waitForSelector('#sy-off'); B.once('dialog', d => d.accept()); await B.click('#sy-off'); await B.waitForSelector('#sy-go');
  console.log('BŁĘDY:', errs.length ? errs : 'brak');
  await b.close(); web.kill(); api.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
