// E2E zakładki Rynek: syntetyczne RCN z trendem +8%/rok i oferty w 3 dzielnicach; sprawdza wykresy, filtry i brak błędów.
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn } = require('child_process'); const fs = require('fs'), path = require('path');
const SP = process.argv[2], OUT = SP + '/shots-rynek'; fs.mkdirSync(OUT, { recursive: true });
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const NOW = Date.now(), YR = 365.25 * 864e5;
const DZ = [{ n: 'Śródmieście', la: 51.247, lo: 22.568, base: 1.15, st: ['Krakowskie Przedmieście', 'Lipowa', 'Narutowicza'], y: .05 }, { n: 'Wrotków', la: 51.225, lo: 22.505, base: .95, st: ['Granata', 'Wrotkowska', 'Hutnicza'], y: .065 }, { n: 'Czuby', la: 51.226, lo: 22.53, base: 1, st: ['Dworska', 'Rudnicka', 'Wileńska'], y: .055 }];
const cols = ['id', 'tran', 'cena', 'rynek', 'rodzaj', 'rok', 'funkcja', 'izby', 'kond', 'm2', 'm2p', 'ulica', 'nr', 'udzial', 'lat', 'lon', 'sprz', 'data', 'cena_nier', 'cena_lok'], rows = [];
for (let i = 0; i < 3000; i++) { const d = DZ[i % 3], age = rnd() * 6 * YR, ts = NOW - age, m2 = 28 + rnd() * 40, pm2 = 8000 * Math.pow(1.08, (6 * YR - age) / YR) * d.base * (.85 + rnd() * .3);
  rows.push(['L' + i, 'T' + i, Math.round(pm2 * m2), i % 4 ? 'rynekWtorny' : 'rynekPierwotny', 'wolnyRynek', 2000, 'mieszkalna', 2, 1, +m2.toFixed(1), 3, d.st[Math.floor(i / 3) % 3], '1', null, d.la + (rnd() - .5) * .01, d.lo + (rnd() - .5) * .01, null, new Date(ts).toISOString().slice(0, 10), null, null]); }
const rcn = SP + '/rcn_trend.json'; fs.writeFileSync(rcn, JSON.stringify({ meta: { v: 1 }, cols, rows }));
const offers = []; for (let i = 0; i < 150; i++) { const d = DZ[i % 3], m2 = Math.round(30 + rnd() * 35), sale = 8000 * Math.pow(1.08, 6) * d.base; offers.push({ id: 'o' + i, cena: Math.round(m2 * sale * d.y / 12 * (.9 + rnd() * .2)), m2, pokoje: 2, pietro: 2, ulica: d.st[Math.floor(i / 3) % 3], dzielnica: d.n, miasto: 'Lublin', tytul: 'Mieszkanie', wlaczone: true, flagi: [] }); }
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8765/index.html#/dane'); await p.waitForTimeout(2500);
  await p.setInputFiles('#frcn', rcn); await p.waitForTimeout(2500);
  await p.evaluate(o => { window.__am.S.offers = o; }, offers);
  await p.goto('http://localhost:8765/index.html#/rynek'); await p.waitForTimeout(1500);
  const tabs = await p.$$eval('#tabs a', a => a.map(x => x.textContent.trim())); console.log('zakładki:', tabs.join(' | '));
  const pts = await p.$$eval('#rtrend svg circle', c => c.length); const yoy = await p.$eval('#rtrend .stats', e => e.innerText.replace(/\n/g, ' '));
  const bars = await p.$$eval('#ryield svg rect', r => r.length); console.log('punktów trendu:', pts, '|', yoy, '| słupków:', bars);
  await p.screenshot({ path: OUT + '/01-rynek.png', fullPage: true });
  await p.tap('#rtrend svg circle:nth-of-type(8)').catch(() => { }); await p.waitForTimeout(200); console.log('odczyt:', await p.$eval('#rtrend .chart-read', e => e.innerText));
  await p.click('[data-rf=rynek] [data-v=wtorny]'); await p.waitForTimeout(300); const n2 = await p.$eval('#rtrend .stats', e => e.innerText.replace(/\n/g, ' ')); console.log('wtórny:', n2);
  await p.fill('#rf-ul', 'Granata'); await p.dispatchEvent('#rf-ul', 'change'); await p.waitForTimeout(400); console.log('okolica Granata:', await p.$eval('#rtrend .stats', e => e.innerText.replace(/\n/g, ' ')));
  await p.screenshot({ path: OUT + '/02-okolica.png', fullPage: true });
  const nav = await p.$eval('#tabs .in-tabs', e => { const r = e.getBoundingClientRect(); return { w: r.width, sw: e.scrollWidth, vw: innerWidth }; }); console.log('nav', nav);
  console.log('BŁĘDY:', errs.length ? errs : 'brak'); await b.close(); srv.kill();
  if (!(pts >= 10) || !(bars >= 3) || errs.length) process.exit(1);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
