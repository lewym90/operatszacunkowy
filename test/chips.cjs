// Przegląd wszystkich grup przycisków wyboru (.chips, .seg): po kliknięciu przycisk ma być podświetlony (klasa "on"),
// a w grupach jednokrotnego wyboru pozostałe nie. Dane: rcn_trend.json z rynek.cjs + syntetyczne oferty.
let _pw; try { _pw = require('playwright'); } catch { _pw = require('/opt/npm-tools/node_modules/playwright'); } const { chromium } = _pw; const { spawn } = require('child_process'); const fs = require('fs'), path = require('path');
const SP = process.argv[2], rcn = SP + '/rcn_trend.json';
let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const DZ = [{ n: 'Śródmieście', st: ['Lipowa', 'Narutowicza', 'Jasna'] }, { n: 'Wrotków', st: ['Granata', 'Wrotkowska', 'Hutnicza'] }, { n: 'Czuby', st: ['Dworska', 'Rudnicka', 'Wileńska'] }];
const offers = []; for (let i = 0; i < 150; i++) { const d = DZ[i % 3], m2 = Math.round(30 + rnd() * 35); offers.push({ id: 'o' + i, cena: Math.round(m2 * 55 * (.9 + rnd() * .2)), m2, pokoje: 1 + (i % 3), pietro: i % 5, ulica: d.st[Math.floor(i / 3) % 3], dzielnica: d.n, miasto: 'Lublin', tytul: 'Mieszkanie', wlaczone: true, flagi: [], attrs: { winda: i % 2, balkon: 1 } }); }
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '-d', path.resolve(__dirname, '..')], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route(/overpass/, r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elements: [{ type: 'node', lat: 51.246, lon: 22.568, tags: { name: 'Test' } }, { type: 'way', center: { lat: 51.25, lon: 22.57 }, tags: {} }] }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/index.html#/dane'); await p.waitForTimeout(2500); await p.setInputFiles('#frcn', rcn); await p.waitForTimeout(2500);
  await p.evaluate(o => { window.__am.S.offers = o; }, offers);
  let checked = 0; const bad = [];
  const GROUPS = `(() => [...document.querySelectorAll('.chips, .seg')].map(g => ({ key: [...g.querySelectorAll('button')].map(x => x.textContent.trim()).join('|'), multi: !!(g.dataset.multi || g.matches('[data-ofa]') || g.closest('#flt')), n: g.querySelectorAll('button').length })))()`;
  async function audit(label, setup) {
    await setup(); await p.waitForTimeout(500);
    const groups = (await p.evaluate(GROUPS)).filter((g, i, a) => a.findIndex(x => x.key === g.key) === i);
    for (const g of groups) for (let bi = 0; bi < g.n; bi++) {
      const res = await p.evaluate(({ key, bi, multi }) => {
        const find = () => [...document.querySelectorAll('.chips, .seg')].find(x => [...x.querySelectorAll('button')].map(y => y.textContent.trim()).join('|') === key);
        const g0 = find(); if (!g0) return { skip: 'brak grupy' }; const btn = g0.querySelectorAll('button')[bi], name = btn.textContent.trim(), before = btn.classList.contains('on');
        btn.click(); return { name, before, multi };
      }, { key: g.key, bi, multi: g.multi });
      if (res.skip) continue; await p.waitForTimeout(250);
      const after = await p.evaluate(({ key, bi }) => {
        const g1 = [...document.querySelectorAll('.chips, .seg')].find(x => [...x.querySelectorAll('button')].map(y => y.textContent.trim()).join('|') === key);
        if (!g1) return { gone: true }; const bs = [...g1.querySelectorAll('button')]; return { on: bs[bi].classList.contains('on'), onCount: bs.filter(x => x.classList.contains('on')).length };
      }, { key: g.key, bi });
      if (after.gone) continue; checked++;
      const okState = g.multi ? after.on !== res.before : after.on && after.onCount === 1;
      if (!okState) bad.push(`${label} › [${g.key.slice(0, 40)}] › ${res.name}: on=${after.on}, zaznaczonych=${after.onCount}`);
    }
  }
  const go = h => async () => { await p.goto('http://localhost:8765/index.html' + h); await p.waitForTimeout(900); };
  await audit('Wycena sprzedaż', go('#/wycena'));
  await audit('Wycena najem', async () => { await go('#/wycena')(); await p.evaluate(() => { window.__am.S.form.tryb = 'najem'; window.__am.render(); }); });
  await audit('Mapa', go('#/mapa')); await audit('Rynek', go('#/rynek')); await audit('Oferty', go('#/oferty')); await audit('Historia', go('#/historia')); await audit('Dane', go('#/dane')); await audit('Ustawienia', go('#/ust'));
  await audit('Umowa (arkusz)', async () => { await go('#/dane')(); await p.click('[data-act=own]'); });
  await audit('Import (arkusz filtrów)', async () => { await go('#/dane')(); await p.evaluate(() => document.querySelector('[data-act=pdf]') && 0); });
  console.log('sprawdzonych przycisków:', checked); console.log(bad.length ? 'BŁĘDY PODŚWIETLENIA:\n' + bad.join('\n') : 'wszystkie przyciski poprawnie się podświetlają'); console.log('JS:', errs.length ? errs : 'brak');
  await b.close(); srv.kill(); if (bad.length || errs.length) process.exit(1);
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
