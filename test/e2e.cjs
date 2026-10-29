const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn } = require('child_process'); const fs = require('fs');
const SP = process.argv[2], PDFS = fs.readdirSync(SP + '/pdf').filter(f => f.endsWith('.pdf')).map(f => SP + '/pdf/' + f), OUT = SP + '/shots';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', require('path').resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(400); await p.screenshot({ path: OUT + '/00-splash.png' });
  await p.waitForTimeout(1800); await p.screenshot({ path: OUT + '/01-wycena.png' });
  await p.goto('http://localhost:8765/index.html#/dane'); await p.waitForTimeout(600);
  await p.setInputFiles('#fpdf', PDFS); await p.waitForSelector('#ok:not([disabled])', { timeout: 60000 }); await p.waitForTimeout(500); await p.screenshot({ path: OUT + '/02-import.png' });
  await p.click('#ok'); await p.waitForTimeout(800);
  await p.setInputFiles('#frcn', SP + '/rcn_syntetyczny.json'); await p.waitForTimeout(1500); await p.screenshot({ path: OUT + '/03-dane.png', fullPage: true });
  // wycena sprzedaży
  await p.goto('http://localhost:8765/index.html#/wycena'); await p.waitForTimeout(800);
  await p.fill('[name=ulica]', 'Bluszczowa'); await p.fill('[name=nr]', '13'); await p.fill('[name=m2]', '44,7'); await p.fill('[name=rok]', '1978');
  await p.click('[data-step=pokoje] [data-d="1"]', { clickCount: 0 }).catch(() => { }); await p.click('[data-step=pietro] [data-d="1"]'); await p.click('[data-step=pietro] [data-d="1"]'); await p.screenshot({ path: OUT + '/04-form.png' });
  await p.click('#f .btn'); await p.waitForTimeout(2200); await p.screenshot({ path: OUT + '/05-wynik-sprzedaz.png' }); await p.screenshot({ path: OUT + '/05b-wynik-full.png', fullPage: true });
  // najem
  await p.goto('http://localhost:8765/index.html#/wycena'); await p.waitForTimeout(600); await p.click('.seg button[data-t=najem]'); await p.waitForTimeout(500);
  await p.fill('[name=dzielnica]', 'Śródmieście'); await p.fill('[name=m2]', '40'); await p.click('#f .btn'); await p.waitForTimeout(2200); await p.screenshot({ path: OUT + '/06-wynik-najem.png' });
  await p.click('[data-act=save]'); await p.waitForTimeout(800);
  await p.click('[data-act=report]'); await p.waitForSelector('.report-img', { timeout: 15000 }); await p.waitForTimeout(800); await p.screenshot({ path: OUT + '/07-raport.png', fullPage: true });
  const imgs = await p.$$eval('.report-img', a => a.map(i => i.src.length)); console.log('stron raportu:', imgs.length);
  // pełny ekran: czy dolny pasek nawigacji dochodzi do krawędzi
  const nav = await p.$eval('#tabs', e => { const r = e.getBoundingClientRect(); return { bottom: r.bottom, vh: innerHeight, bg: getComputedStyle(document.documentElement).backgroundColor }; }); console.log('nav', nav);
  await p.goto('http://localhost:8765/index.html#/historia'); await p.waitForTimeout(700); await p.screenshot({ path: OUT + '/08-historia.png' });
  await p.goto('http://localhost:8765/index.html#/ust'); await p.waitForTimeout(700); await p.screenshot({ path: OUT + '/09-ust.png' });
  console.log('BŁĘDY:', errs.length ? errs : 'brak'); await b.close(); srv.kill();
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
