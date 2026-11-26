// Obszary pracy: Lublin działa jak dotąd, Kraków i okolice ma osobne dane (pliki krakow/ z tego samego serwera), przełączanie niczego nie kasuje.
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
let zle = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) zle++; };
const COLS = ['id', 'tran', 'cena', 'rynek', 'rodzaj', 'rok', 'funkcja', 'izby', 'kond', 'm2', 'ulica', 'nr', 'udzial', 'lat', 'lon', 'data', 'msc'];
let sd = 5; const rnd = () => (sd = (sd * 1664525 + 1013904223) % 4294967296) / 4294967296;
const rows = (n, pref, lat, lon, ulice, msc, pm2) => Array.from({ length: n }, (_, i) => { const m2 = 35 + Math.round(rnd() * 40), u = ulice[i % ulice.length], d = new Date(Date.UTC(2025, i % 12, 1 + (i % 27))).toISOString().slice(0, 10);
  return [pref + i, 'T' + pref + i, Math.round(m2 * pm2 * (0.9 + rnd() * 0.2)), 'rynekWtorny', 'wolnyRynek', 2025, 'mieszkalna', m2 < 50 ? 2 : 3, 2, m2, u, String(1 + (i % 15)), '1/1', lat + (i % 15) * 0.0007 + (ulice.indexOf(u)) * 0.004, lon + (i % 15) * 0.0007, d, msc ? msc[i % msc.length] : undefined]; });
const pack = (meta, r, cols = COLS) => ({ meta: { wersja: meta, rekordow: r.length }, cols, rows: r });
const LUB = pack('lub1', rows(300, 'L', 51.24, 22.55, ['Lipowa', 'Narutowicza', 'Krakowska'], null, 8000), COLS.slice(0, -1));
const KRK = pack('krk1', rows(400, 'K', 50.05, 19.93, ['Krakowska', 'Długa', 'Wielicka'], ['KRAKÓW', 'KRAKÓW', 'KRAKÓW', 'Wieliczka'], 15000));
const INNE = v => ({ meta: { wersja: v, rekordow: 0 }, cols: ['tran', 'cena', 'data'], rows: [] });
const FILES = { '/_t/rcn_lublin.json': LUB, '/_t/rcn_inne.json': INNE('li1'), '/_t/rcn_meta.json': { wersja: 'lub1', rekordow: 300, inne: { wersja: 'li1' } },
  '/_t/krakow/rcn_lokale.json': KRK, '/_t/krakow/rcn_inne.json': INNE('ki1'), '/_t/krakow/rcn_meta.json': { wersja: 'krk1', rekordow: 400, inne: { wersja: 'ki1' } } };
const hits = [];
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); if (FILES[u]) { hits.push(u); r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(FILES[u])); }
  const p = path.join(process.cwd(), u.replace(/\/$/, '/index.html')); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const U = `http://localhost:${srv.address().port}/`, b = await chromium.launch(), c = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }), p = await c.newPage(); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.goto(U + '#/start'); await p.waitForFunction(() => window.__am); await p.waitForTimeout(800);
  ok(await p.$('.obfirst') !== null, 'pierwsze wejście: kafelki wyboru obszaru na Starcie');
  ok(/Lublin i okolice/.test(await p.innerText('.obsz')), 'domyślnie Lublin (pigułka w nagłówku)');
  await p.goto(U + '#/dane'); await p.waitForTimeout(500); await p.fill('#rurl', U + '_t/rcn_lublin.json'); await p.click('[data-act="rcnurl"]'); await p.waitForFunction(() => window.__am.S.tx.length > 0, null, { timeout: 15000 });
  const wyc = () => p.evaluate(async ul => { const { estimateSale } = await import('./js/engine.js'), S = window.__am.S; const r = estimateSale(S.tx, { tryb: 'sprzedaz', kat: 'mieszkanie', ulica: ul, nr: '3', m2: 50, pokoje: 2, pietro: 2 }, {}); return r.ok ? Math.round(r.total.mid) : 'brak'; }, 'Lipowa');
  const lubTx = await p.evaluate(() => window.__am.S.tx.length), lubW = await wyc();
  ok(lubTx === 300 && typeof lubW === 'number', `Lublin: ${lubTx} transakcji, wycena ${lubW}`);
  // przełączenie na Kraków: pobiera pliki z katalogu krakow/
  await p.goto(U + '#/start'); await p.waitForTimeout(400); await p.click('[data-ob="krakow"]'); await p.waitForFunction(() => window.__am.S.tx.length === 400, null, { timeout: 15000 });
  ok(hits.includes('/_t/krakow/rcn_lokale.json') && hits.includes('/_t/krakow/rcn_meta.json'), 'Kraków: dane z katalogu krakow/ na tym samym serwerze');
  ok(/Kraków i okolice/.test(await p.innerText('.obsz')) && await p.$('.obfirst') === null, 'pigułka: Kraków i okolice; kafelki pierwszego wyboru znikają');
  ok(await p.evaluate(() => window.__am.S.tx.every(t => t.lat > 49.9 && t.lat < 50.2)), 'w pamięci tylko transakcje Krakowa');
  // wycena w Krakowie: pole Miejscowość, ulica o tej samej nazwie w Lublinie nie miesza się
  await p.goto(U + '#/wycena'); await p.waitForTimeout(500); ok(await p.$('[name="miasto"]') !== null, 'formularz Krakowa ma pole Miejscowość');
  ok(await p.evaluate(() => [...document.querySelectorAll('#dl-msc option')].map(o => o.value).join(',') === 'Kraków,Wieliczka'), 'podpowiedzi miejscowości z RCN (ładne nazwy, od najczęstszej)');
  const krkW = await p.evaluate(async () => { const { estimateSale } = await import('./js/engine.js'), S = window.__am.S; const r = estimateSale(S.tx, { tryb: 'sprzedaz', kat: 'mieszkanie', miasto: 'Kraków', ulica: 'Krakowska', nr: '3', m2: 50, pokoje: 2, pietro: 2 }, {}); return r.ok ? r.total.mid / 50 : 0; });
  ok(krkW > 12000, 'wycena w Krakowie z cen Krakowa (' + Math.round(krkW) + ' zł/m²)');
  const msc = await p.evaluate(async () => { const { estimateSale } = await import('./js/engine.js'), S = window.__am.S; const tx = S.tx.map(t => ({ ...t, lat: null, lon: null })); const a = estimateSale(tx, { tryb: 'sprzedaz', kat: 'mieszkanie', miasto: 'Kraków', ulica: 'Krakowska', nr: '3', m2: 50, pokoje: 2, pietro: 2 }, {}), w = estimateSale(tx, { tryb: 'sprzedaz', kat: 'mieszkanie', miasto: 'Wieliczka', ulica: 'Krakowska', nr: '3', m2: 50, pokoje: 2, pietro: 2 }, {}); const loc = r => r.ok ? r.comps.filter(x => x.local).length : -1; return [loc(a), loc(w)]; });
  ok(msc[0] > 0 && msc[1] >= 0 && msc[0] !== msc[1], `bez współrzędnych „ta sama ulica” liczona w obrębie miejscowości (Kraków ${msc[0]}, Wieliczka ${msc[1]})`);
  // rok budowy zapisany w Krakowie nie trafia do Lublina
  await p.evaluate(() => { const S = window.__am.S; S.form = { ...S.form, tryb: 'sprzedaz', kat: 'mieszkanie' }; });
  await p.goto(U + '#/wycena'); await p.waitForTimeout(400); await p.fill('[name=ulica]', 'Lipowa'); await p.fill('[name=nr]', '3'); await p.fill('[name=m2]', '50'); await p.fill('[name=rok]', '1965'); await p.click('button[type=submit]'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => Object.keys(window.__am.S.budynki).some(k => k.startsWith('krakow:')) && !Object.keys(window.__am.S.budynki).some(k => !k.startsWith('krakow:'))), 'rok budowy z Krakowa zapisany z przedrostkiem obszaru');
  // powrót do Lublina: dane Lublina z pamięci urządzenia, bez ponownego pobierania, wycena identyczna
  const nLub = hits.filter(h => h === '/_t/rcn_lublin.json').length;
  await p.goto(U + '#/start'); await p.waitForTimeout(300); await p.click('[data-area]'); await p.waitForTimeout(500); await p.click('#sheet [data-ob="lublin"]'); await p.waitForFunction(() => window.__am.S.tx.length === 300, null, { timeout: 15000 }); await p.waitForTimeout(500);
  ok(hits.filter(h => h === '/_t/rcn_lublin.json').length === nLub, 'Lublin wrócił z pamięci urządzenia (bez pobierania)');
  ok(await wyc() === lubW, 'wycena Lublina identyczna po przełączeniach: ' + lubW);
  await p.reload(); await p.waitForFunction(() => window.__am); await p.waitForTimeout(900);
  ok(await p.evaluate(() => window.__am.S.tx.length === 300) && /Lublin i okolice/.test(await p.innerText('.obsz')), 'po ponownym otwarciu: ostatni wybrany obszar (Lublin)');
  // oferty: zebranie dla małopolskiego (Kraków i okolice) nie rusza ofert Lublina i odwrotnie
  const st = await p.evaluate(() => {
    const am = window.__am, S = am.S, L = n => Array.from({ length: n }, (_, i) => ({ portalId: 'LUB' + i, url: 'https://www.otodom.pl/pl/oferta/x-IDL' + i, cena: 2000 + i, m2: 40, pokoje: 2, pietro: 1, ulica: 'Lipowa', dzielnica: 'Czuby', miasto: 'Lublin', tytul: 'M', flagi: [] }));
    const K = n => Array.from({ length: n }, (_, i) => ({ portalId: 'KRK' + i, url: 'https://www.otodom.pl/pl/oferta/x-IDK' + i, cena: 3500 + i, m2: 40, pokoje: 2, pietro: 1, ulica: 'Długa', dzielnica: 'Stare Miasto', miasto: 'Kraków', powiat: 'krakow', woj: 'malopolskie', tytul: 'M', flagi: [] }));
    am.importOffers(L(60), { pelne: true });
    am.importOffers(K(40), { pelne: true, woj: 'malopolskie' }); am.importOffers(K(40).slice(0, 10), { attrs: ['balkon'], woj: 'malopolskie' });
    const z = S.ust.zebrania, f = am.statusFn(), all = S.offers.concat(S.katy, S.sprz, S.poza);
    const lub = all.filter(o => (o.portalId || '').startsWith('LUB')), krk = all.filter(o => (o.portalId || '').startsWith('KRK'));
    // drugie zebranie małopolskiego bez 5 ofert (po 13 h): tylko te 5 nieaktualne
    z[z.length - 1].ts -= 13 * 3600e3; am.importOffers(K(40).slice(5), { pelne: true, woj: 'malopolskie' }); const f2 = am.statusFn(), all2 = S.offers.concat(S.katy, S.sprz, S.poza);
    return { nz: z.length, woj: S.ust.zebrania.map(x => x.woj || 'lubelskie').join(','), lubAkt: lub.every(o => f(o) === 'aktualne'), krkN: krk.length, krkWoj: krk.every(o => o.woj === 'malopolskie' && o.powiat === 'krakow'),
      balkonLub: lub.some(o => o.attrs && 'balkon' in o.attrs), balkonKrk: krk.filter(o => o.attrs && o.attrs.balkon === 1).length,
      stare: all2.filter(o => (o.portalId || '').startsWith('KRK') && f2(o) === 'nieaktualne').length, lubPo: all2.filter(o => (o.portalId || '').startsWith('LUB')).every(o => f2(o) !== 'nieaktualne'), w: S.offers.length };
  });
  ok(st.woj === 'lubelskie,malopolskie,malopolskie' && st.krkN === 40 && st.krkWoj, 'zebrania osobno dla województw; oferty Krakowa z województwem i powiatem: ' + st.woj);
  ok(st.lubAkt && st.lubPo, 'pełne zebranie Krakowa nie oznacza ofert Lublina jako nieaktualnych');
  ok(st.stare === 5, 'drugie zebranie Krakowa: nieaktualne tylko 5 brakujących (' + st.stare + ')');
  ok(!st.balkonLub && st.balkonKrk === 10, 'cechy z filtrów Krakowa nie trafiają do Lublina');
  ok(await p.evaluate(() => window.__am.S.offers.every(o => (o.portalId || '').startsWith('LUB') || !o.portalId)), 'w Lublinie lista najmu bez ofert z Krakowa');
  ok(!err.length, 'bez błędów strony ' + err.join(' | '));
  await b.close(); srv.close(); if (zle) { console.log('obszar: BŁĘDY', zle); process.exit(1); } console.log('obszar: OK');
})().catch(e => { console.log('TEST PADŁ', e.message); process.exit(1); });
