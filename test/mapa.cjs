// Sprawdza zakładkę Mapa i mapę w wyniku wyceny sprzedaży (na danych testowych), na trzech rozmiarach ekranu.
const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const { spawn } = require('child_process'); const fs = require('fs');
const SP = process.argv[2], PDFS = fs.readdirSync(SP + '/pdf').filter(f => f.endsWith('.pdf')).map(f => SP + '/pdf/' + f), OUT = SP + '/shots-map'; fs.mkdirSync(OUT, { recursive: true });
const VP = [['phone', 390, 844, true], ['tablet', 820, 1180, true], ['desktop', 1440, 900, false]];
(async () => {
  const web = spawn('python3', ['-m', 'http.server', '8797', '-d', '/home/claude/operat'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const U = 'http://localhost:8797/index.html';
  for (const [name, w, h, touch] of VP) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch && w < 700, hasTouch: touch, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|tile\.openstreetmap|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await p.route('**/tile.openstreetmap.org/**', r => r.abort());   // piaskownica bez internetu: podkład pomijamy, sprawdzamy warstwy danych
    await p.goto(U + '#/mapa'); await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${name}-0-brak-danych.png` });
    await p.goto(U + '#/dane'); await p.waitForTimeout(600); await p.setInputFiles('#fpdf', PDFS); await p.waitForSelector('#ok:not([disabled])', { timeout: 60000 }); await p.click('#ok'); await p.waitForTimeout(800);
    await p.setInputFiles('#frcn', SP + '/rcn_syntetyczny.json'); await p.waitForTimeout(1500);
    await p.evaluate(() => { const S = window.__am.S; const mk = (i, ul, dz, cena, m2, pk) => ({ id: 't' + i, ulica: ul, dzielnica: dz, miasto: 'Lublin', m2, pokoje: pk, pietro: 2, cena, czynsz: 500, wlaczone: true, flagi: [], typ: 'najem' });
      let i = 0; for (const [ul, dz, base] of [['Zana', 'Felin', 2600], ['Lipowa', 'Śródmieście', 3100], ['Czechowska', 'Czechów', 2300], ['Głęboka', 'Kośminek', 2000], ['Bluszczowa', 'Czuby', 2500]]) for (let k = 0; k < 6; k++) S.offers.push(mk(i++, ul, dz, base + k * 80, 35 + k * 4, 1 + (k % 3)));
      for (let k = 0; k < 4; k++) S.offers.push(mk(i++, '', 'Felin', 2700 + k * 90, 40, 2)); });   // tylko dzielnica: położenie przybliżone
    await p.goto(U + '#/mapa'); await p.waitForSelector('.leaflet-container', { timeout: 10000 }); await p.waitForTimeout(1200);
    const nDots = () => p.evaluate(() => document.querySelector('#mapstat').textContent); const st = await nDots(); console.log(name, 'transakcje:', st.slice(0, 90));
    await p.screenshot({ path: `${OUT}/${name}-1-transakcje.png` });
    const pop = await p.evaluate(() => { const ctl = window.__am.getMap(), it = ctl.items[0], L = ctl.L; ctl.map.setView([it.lat, it.lon], 16, { animate: false }); return new Promise(r => setTimeout(() => { ctl.map.fire('click', { latlng: L.latLng(it.lat, it.lon), containerPoint: ctl.map.latLngToContainerPoint([it.lat, it.lon]) }); setTimeout(() => r(document.querySelector('.leaflet-popup-content')?.textContent || ''), 300); }, 400)); });
    console.log(name, 'okienko punktu:', pop.slice(0, 100)); if (!/zł\/m²/.test(pop)) errs.push('BRAK OKIENKA PUNKTU');
    await p.click('[data-mode=grid]'); await p.waitForTimeout(900); console.log(name, 'siatka:', (await nDots()).slice(0, 90)); await p.screenshot({ path: `${OUT}/${name}-2-ceny-okolic.png` });
    await p.click('[data-mode=najem]'); await p.waitForTimeout(900); console.log(name, 'najem:', (await nDots()).slice(0, 110)); await p.screenshot({ path: `${OUT}/${name}-3-najem.png` });
    await p.click('[data-mf=pokoje] [data-v="2"]'); await p.waitForTimeout(500); console.log(name, 'najem 2 pok.:', (await nDots()).slice(0, 80));
    const before = (await nDots()).match(/Na mapie: (\d+)/)?.[1]; await p.click('[data-mf=metraz] [data-v="30-40"]'); await p.waitForTimeout(500); const after = (await nDots()).match(/Na mapie: (\d+)/)?.[1];
    console.log(name, 'metraż 30–40: ofert na mapie', before, '→', after); if (!(+after < +before)) errs.push('FILTR METRAŻU NIE ZMIENIA LICZBY OFERT');
    await p.click('[data-mode=tx]'); await p.waitForTimeout(600); await p.click('[data-mf=metraz] [data-v=""]'); await p.waitForTimeout(400); const a1 = (await nDots()).match(/Na mapie: (\d+)/)?.[1]; await p.click('[data-mf=metraz] [data-v="50+"]'); await p.waitForTimeout(500); const a2 = (await nDots()).match(/Na mapie: (\d+)/)?.[1];
    console.log(name, 'transakcje: wszystkie', a1, '→ powyżej 50 m²', a2); if (!(+a2 < +a1)) errs.push('FILTR METRAŻU NIE DZIAŁA DLA TRANSAKCJI');
    // punkt -> okienko
    await p.evaluate(() => { const L = window.L; });
    // wynik sprzedaży z mapą
    await p.goto(U + '#/wycena'); await p.waitForTimeout(700); await p.fill('[name=ulica]', 'Bluszczowa'); await p.fill('[name=nr]', '13'); await p.fill('[name=m2]', '44,7'); await p.fill('[name=rok]', '1978'); await p.click('#f .btn'); await p.waitForTimeout(2500);
    const has = await p.$('#resmap.leaflet-container'); if (!has) errs.push('BRAK MAPY W WYNIKU'); await p.locator('#resmap').scrollIntoViewIfNeeded(); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${name}-4-wynik.png` });
    // nawigacja: pasek nie przykryty przez mapę
    const z = await p.evaluate(() => { const nav = document.querySelector('#tabs'); const r = nav.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && !!el.closest('#tabs'); });
    if (!z) errs.push('MAPA PRZYKRYWA NAWIGACJĘ'); const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (ov) errs.push('POZIOME PRZEWIJANIE');
    console.log(name, 'BŁĘDY:', errs.length ? errs : 'brak'); await ctx.close();
  }
  await b.close(); web.kill();
})().catch(e => { console.error('TEST PADŁ', e); process.exit(1); });
