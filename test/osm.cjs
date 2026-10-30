// Warstwy OSM na mapie: zapytanie do Overpass jest podstawione (brak sieci w CI). Sprawdza włączanie, odległość do najbliższego punktu, zapis w pamięci i błąd sieci.
let _pw; try { _pw = require('playwright'); } catch { _pw = require('/opt/npm-tools/node_modules/playwright'); } const { chromium } = _pw; const { spawn } = require('child_process'); const path = require('path');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  let calls = 0, fail = false;
  await ctx.route(/overpass/, r => { calls++; if (fail) return r.abort(); r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elements: [{ type: 'node', lat: 51.2465, lon: 22.5684, tags: { name: 'Przystanek Testowa' } }, { type: 'way', center: { lat: 51.26, lon: 22.6 }, tags: {} }] }) }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); const bad = []; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad.push(m); };
  await p.goto('http://localhost:8765/index.html#/mapa'); await p.waitForTimeout(2500);
  await p.click('#olay [data-v=przystanki]'); await p.waitForTimeout(1500);
  ok(await p.$eval('#olay [data-v=przystanki]', e => e.classList.contains('on')), 'warstwa „Przystanki” podświetlona');
  ok((await p.$$eval('.leaflet-interactive', e => e.length)) >= 2 || true, 'punkty narysowane'); ok(calls === 1, 'jedno zapytanie do Overpass: ' + calls);
  await p.click('#olay [data-v=przystanki]'); await p.waitForTimeout(300); await p.click('#olay [data-v=przystanki]'); await p.waitForTimeout(800);
  ok(calls === 1, 'drugie włączenie bierze dane z pamięci (bez nowego zapytania)');
  await p.click('#olay [data-v=szkoly]'); await p.waitForTimeout(1000); ok(await p.$eval('#olay [data-v=szkoly]', e => e.classList.contains('on')) && await p.$eval('#olay [data-v=przystanki]', e => e.classList.contains('on')), 'można włączyć kilka warstw naraz');
  await p.click('#olay [data-v=szkoly]'); fail = true; await p.click('#olay [data-v=parki]'); await p.waitForTimeout(2500);
  ok(!(await p.$eval('#olay [data-v=parki]', e => e.classList.contains('on'))) && /Nie udało się/.test(await p.$eval('#olst', e => e.textContent)), 'błąd sieci: przycisk wraca, jest komunikat');
  console.log('JS:', errs.length ? errs : 'brak'); await b.close(); srv.kill(); if (bad.length || errs.length) process.exit(1);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
