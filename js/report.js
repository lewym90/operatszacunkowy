// Raport dla klienta: rysowany na kanwie (czcionki biura) i pakowany do PDF. Nigdzie nie występuje nazwa aplikacji.
import { KAT, POD_TXT } from './rcn.js';
const W = 1240, H = 1754, M = 84;
const C = { onyx: '#0B0B0D', gold: '#C8A44D', goldD: '#8A6C2A', goldL: '#E6CE94', bone: '#E8E5DE', paper: '#FBFAF6', ink: '#16161A', ink2: '#55544F', line: '#E3DECF' };
const money = n => Math.round(n).toLocaleString('pl-PL');
const round = (n, s) => Math.round(n / s) * s;
const LV = { 'niska': 'niska', 'średnia': 'średnia', 'wysoka': 'wysoka' };

function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
function wrap(ctx, text, maxW) {
  const out = []; for (const para of String(text).split('\n')) {
    let line = ''; for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  } return out;
}


const plN = (n, d = 1) => n.toFixed(d).replace('.', ',');
function lineChartCv(ctx, pts, x0, y0, w, h) {
  const padL = 110, padB = 50, pw = w - padL - 20, ph = h - padB - 10;
  const lo = Math.min(...pts.map(p => p.p25)), hi = Math.max(...pts.map(p => p.p75)), span = hi - lo || 1, a = lo - span * .08, b = hi + span * .08;
  const tx = i => x0 + padL + (pts.length === 1 ? pw / 2 : i * pw / (pts.length - 1)), ty = v => y0 + 10 + ph * (1 - (v - a) / (b - a));
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.fillStyle = C.ink2; ctx.font = '400 21px Archivo'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const v = a + (b - a) * i / 4, yy = ty(v); ctx.beginPath(); ctx.moveTo(x0 + padL, yy); ctx.lineTo(x0 + padL + pw, yy); ctx.stroke(); ctx.fillText(money(v), x0 + padL - 12, yy + 7); }
  ctx.fillStyle = 'rgba(200,164,77,.22)'; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(tx(i), ty(p.p75)) : ctx.moveTo(tx(i), ty(p.p75))); for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(tx(i), ty(pts[i].p25)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.goldD; ctx.lineWidth = 4; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(tx(i), ty(p.med)) : ctx.moveTo(tx(i), ty(p.med))); ctx.stroke();
  ctx.fillStyle = C.goldD; pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(tx(i), ty(p.med), 5, 0, 7); ctx.fill(); });
  ctx.fillStyle = C.ink2; ctx.textAlign = 'center'; ctx.font = '400 21px Archivo'; let lastX = -1e9;
  pts.forEach((p, i) => { const lb = String(p.y); if (i === 0 || p.y !== pts[i - 1].y) { const X = tx(i); if (X - lastX > 80) { ctx.fillText(lb, X, y0 + h - 14); lastX = X; } } });
  const l = pts[pts.length - 1]; ctx.textAlign = 'right'; ctx.fillStyle = C.ink; ctx.font = '700 24px Archivo'; ctx.fillText(money(l.med) + ' zł/m²', x0 + w, ty(l.med) - 16); ctx.textAlign = 'left';
}
function barChartCv(ctx, rows, ref, x0, y0, w) {
  const labW = 300, rowH = 50, max = Math.max(...rows.map(r => r.yHi || r.y), ref) * 1.1, bw = w - labW - 110, X = v => x0 + labW + bw * v / max;
  ctx.font = '400 24px Archivo'; y0 += 30;
  rows.forEach((r, i) => { const yy = y0 + i * rowH; ctx.fillStyle = C.ink; ctx.textAlign = 'left'; let nm = r.name; while (ctx.measureText(nm).width > labW - 16 && nm.length > 3) nm = nm.slice(0, -1);
    ctx.fillText(nm, x0, yy + 8); ctx.fillStyle = C.gold; ctx.fillRect(x0 + labW, yy - 14, X(r.y) - x0 - labW, 28);
    if (r.yLo != null && r.yHi != null) { ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(r.yLo), yy); ctx.lineTo(X(r.yHi), yy); ctx.stroke(); }
    ctx.fillStyle = C.ink; ctx.font = '700 24px Archivo'; ctx.fillText(plN(r.y) + '%', X(Math.max(r.y, r.yHi || 0)) + 12, yy + 8); ctx.font = '400 24px Archivo'; });
  ctx.strokeStyle = C.goldD; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(X(ref), y0 - 28); ctx.lineTo(X(ref), y0 + rows.length * rowH - 20); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C.goldD; ctx.font = '400 20px Archivo'; ctx.fillText('miasto ' + plN(ref) + '%', X(ref) + 8, y0 - 34);
  return y0 + rows.length * rowH;
}

export async function buildReport(e, ust, opts = {}) {
  const variant = opts.variant || 'full';
  await Promise.all([document.fonts.load('40px Marcellus'), document.fonts.load('400 20px Archivo'), document.fonts.load('700 20px Archivo')]);
  const custom = !!ust.logo, logo = await loadImg(ust.logo || 'icons/logo-am.png');
  const { subj: s, res: r } = e, sale = s.tryb === 'sprzedaz', step = sale ? 1000 : 10;
  const pages = []; let cv, ctx, y;
  const newPage = first => {
    cv = document.createElement('canvas'); cv.width = W; cv.height = H; ctx = cv.getContext('2d'); pages.push(cv);
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    if (first) {
      ctx.fillStyle = C.onyx; ctx.fillRect(0, 0, W, 236);
      const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(200,164,77,0)'); g.addColorStop(.5, 'rgba(200,164,77,.9)'); g.addColorStop(1, 'rgba(200,164,77,0)'); ctx.fillStyle = g; ctx.fillRect(0, 236, W, 3);
      if (logo) { if (custom) { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(M, 40, 156, 156, 18); ctx.fill(); const k = Math.min(132 / logo.width, 132 / logo.height); ctx.drawImage(logo, M + 78 - logo.width * k / 2, 118 - logo.height * k / 2, logo.width * k, logo.height * k); } else ctx.drawImage(logo, M, 40, 156, 156); }
      ctx.fillStyle = C.goldL; ctx.font = '400 54px Marcellus'; ctx.fillText(ust.biuro || 'Biuro nieruchomości', M + 196, 112);
      ctx.fillStyle = C.bone; ctx.font = '400 26px Archivo'; ctx.fillText(ust.haslo || '', M + 196, 158);
      ctx.textAlign = 'right'; ctx.fillStyle = C.ash || '#9A978F'; ctx.font = '400 24px Archivo'; ctx.fillText(new Date(opts.docNo ? Date.now() : e.ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }), W - M, 112); if (opts.docNo) { ctx.font = '400 22px Archivo'; ctx.fillText('Dokument ' + opts.docNo, W - M, 150); if (opts.docWid) ctx.fillText('Wycena ' + opts.docWid, W - M, 182); } ctx.textAlign = 'left';
      y = 330;
    } else { ctx.fillStyle = C.gold; ctx.fillRect(0, 0, W, 10); y = 110; }
  };
  const text = (t, size, color, weight = 400, font = 'Archivo', lh = 1.4, maxW = W - 2 * M) => {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color;
    for (const ln of wrap(ctx, t, maxW)) { ctx.fillText(ln, M, y); y += size * lh; }
  };
  const footer = n => {
    ctx.font = '400 21px Archivo'; ctx.fillStyle = C.ink2; ctx.textAlign = 'center'; ctx.fillText('Orientacyjna analiza, nie operat szacunkowy w rozumieniu ustawy o gospodarce nieruchomościami.', W / 2, H - 34); ctx.textAlign = 'left';
    ctx.fillStyle = C.line; ctx.fillRect(M, H - 118, W - 2 * M, 2);
    ctx.font = '400 22px Archivo'; ctx.fillStyle = C.ink2;
    const who = [ust.agent ? 'Sporządził: ' + ust.agent : '', ust.biuro, ust.tel, ust.email, ust.www].filter(Boolean).join('  ·  ');
    ctx.fillText(who, M, H - 70); ctx.textAlign = 'right'; ctx.fillText(`Strona ${n}/${pages.length}`, W - M, H - 70); ctx.textAlign = 'left';
  };

  const ensure = h => { if (H - 190 - y < h) { footer(pages.length); newPage(false); } };
  const pl1 = x => x == null ? '—' : plN(x) + '%', zl = x => money(x) + ' zł', sg = x => (x >= 0 ? '+' : '−') + money(Math.abs(x)) + ' zł';
  const kvRows = rows => rows.forEach(([a, b]) => { ensure(50); ctx.font = '400 25px Archivo'; ctx.fillStyle = C.ink2; ctx.fillText(a, M, y); ctx.font = '700 26px Archivo'; ctx.fillStyle = C.ink; ctx.textAlign = 'right'; ctx.fillText(b, W - M, y); ctx.textAlign = 'left'; ctx.fillStyle = C.line; ctx.fillRect(M, y + 14, W - 2 * M, 2); y += 50; });
  const table = (hdr, xs, rows, rowH = 46) => { ctx.font = '700 21px Archivo'; ctx.fillStyle = C.goldD; hdr.forEach((h, i) => { ctx.textAlign = i ? 'right' : 'left'; ctx.fillText(h.toUpperCase(), xs[i], y); }); ctx.textAlign = 'left'; ctx.fillStyle = C.line; ctx.fillRect(M, y + 14, W - 2 * M, 2); y += 52;
    rows.forEach(rw => { ensure(50); ctx.font = '400 25px Archivo'; ctx.fillStyle = C.ink; rw.forEach((v, i) => { ctx.textAlign = i ? 'right' : 'left'; ctx.fillText(String(v), xs[i], y); }); ctx.textAlign = 'left'; y += rowH; }); y += 10; };
  const adres = [s.ulica, s.nr].filter(Boolean).join(' ') || s.dzielnica || '';
  const finish = disc => {
    ctx.font = '400 22px Archivo'; const dl = wrap(ctx, disc, W - 2 * M - 48), dh = dl.length * 31 + 44;
    if (y + dh > H - 140) { footer(pages.length); newPage(false); }
    ctx.font = '400 22px Archivo'; ctx.fillStyle = '#F2EEE2'; ctx.beginPath(); ctx.roundRect(M, y, W - 2 * M, dh, 18); ctx.fill(); ctx.fillStyle = C.ink2; dl.forEach((l, i) => ctx.fillText(l, M + 24, y + 38 + i * 31));
    footer(pages.length);
    pages.forEach((p, i) => { const c2 = p.getContext('2d'); c2.fillStyle = C.paper; c2.fillRect(W - M - 260, H - 100, 260, 40); c2.fillStyle = C.ink2; c2.font = '400 22px Archivo'; c2.textAlign = 'right'; c2.fillText(`Strona ${i + 1}/${pages.length}`, W - M, H - 70); c2.textAlign = 'left'; });
    return pages;
  };
  const trendCh = mk => { ensure(620); text('Ceny transakcyjne w czasie', 34, C.ink, 400, 'Marcellus'); y += 6; text(mk.trendLabel || '', 23, C.ink2); y += 8; lineChartCv(ctx, mk.trend.points, M, y, W - 2 * M, 380); y += 410;
    text(`Mediana ceny za m² (akty notarialne, RCN) w okresach ${mk.trend.step === 12 ? 'rocznych' : mk.trend.step === 6 ? 'półrocznych' : 'kwartalnych'}; pasmo to środkowe 50% transakcji. Podstawa: ${money(mk.trend.n)} transakcji.${mk.trend.yoy ? ` Zmiana rok do roku: ${mk.trend.yoy.pct >= 0 ? '+' : ''}${plN(mk.trend.yoy.pct)}%.` : ''}`, 22, C.ink2, 400, 'Archivo', 1.38); y += 22; };
  const yieldCh = mk => { const rows = mk.yield.rows.slice(0, 10); ensure(130 + rows.length * 50 + 120); text('Rentowność najmu w dzielnicach', 34, C.ink, 400, 'Marcellus'); y += 6; y = barChartCv(ctx, rows, mk.yield.city.y, M, y, W - 2 * M); y += 16;
    text('Roczny czynsz z ofert do mediany ceny transakcyjnej tego samego metrażu; wartość brutto, przed podatkiem i kosztami. Linia pionowa: średnia dla miasta.', 22, C.ink2, 400, 'Archivo', 1.38); y += 22; };
  const okolTab = (RH = 76) => { const ok = opts.okolica; ensure(130 + Math.ceil(ok.length / 2) * RH + 70); text('Najbliższe okolice', 34, C.ink, 400, 'Marcellus'); y += 6; const cw2 = (W - 2 * M) / 2;
    ok.forEach((o, i) => { const x = M + (i % 2) * cw2, yy = y + Math.floor(i / 2) * RH; ctx.font = '400 21px Archivo'; ctx.fillStyle = C.ink2; ctx.fillText(o.label.toUpperCase(), x, yy); ctx.font = '700 28px Archivo'; ctx.fillStyle = C.ink; ctx.fillText(o.txtR, x, yy + 32); }); y += Math.ceil(ok.length / 2) * RH + 10; };
  const okolSrc = () => { text((opts.okolicaNote ? opts.okolicaNote + ' ' : '') + 'Odległość w linii prostej od budynku do najbliższego punktu danego rodzaju. Dane punktów: OpenStreetMap (© współtwórcy OpenStreetMap).', 21, C.ink2, 400, 'Archivo', 1.38); y += 22; };
  const D1 = 'Niniejsze zestawienie ma charakter wyłącznie orientacyjny i informacyjny. ';
  const SPEC = { inwest: 'Analiza inwestycyjna', lokal: 'Analiza lokalizacji', rent: 'Rentowność najmu', rynek: 'Raport rynku lokalnego' };
  newPage(true);
  if (SPEC[variant]) {
    text(SPEC[variant], 50, C.ink, 400, 'Marcellus', 1.25); y += 6;
    text(variant === 'rynek' ? 'Lublin i okolice' : [adres, adres ? 'Lublin' : '', String(s.m2).replace('.', ',') + ' m²'].filter(Boolean).join(', ').replace(/Lublin, /, 'Lublin · '), 28, C.ink2); y += 22;
    if (variant === 'inwest') { const { inp: I, h, scen } = opts.invest;
      text('Założenia', 34, C.ink, 400, 'Marcellus'); y += 6;
      kvRows([['Cena zakupu', zl(+I.cena)], ['Czynsz miesięczny', zl(+I.czynsz)], ['Całkowity koszt zakupu', zl(h.koszt)], ['Własny kapitał na start', zl(h.equity)], ...(h.loan ? [['Kredyt', `${zl(h.loan)}, rata ${zl(h.rata)}`]] : []), ['Okres inwestycji', h.N + ' lat'], ['Zmiana wartości rocznie', plN(+I.wzrost || 0) + '%']]); y += 24;
      text('Wyniki', 34, C.ink, 400, 'Marcellus'); y += 6;
      kvRows([['Zwrot brutto', pl1(h.gross)], ['Zwrot netto po podatku', pl1(h.netPost)], ['Cash-on-cash', pl1(h.coc)], ['Okres zwrotu', h.payback ? plN(h.payback) + ' lat' : '—'], ['Przepływ miesięczny', sg(h.cfMies)], ['Wartość przy sprzedaży', zl(h.wartosc)], ['Zysk całkowity', sg(h.zysk)], ['ROI za cały okres', pl1(h.roi)], ['IRR rocznie', pl1(h.irr)], ...(h.npv != null ? [[`NPV przy ${plN(h.dyskonto)}%`, sg(h.npv)]] : [])]); y += 24;
      ensure(300); text('Scenariusze', 34, C.ink, 400, 'Marcellus'); y += 6;
      table(['Scenariusz', 'Zwrot netto', 'IRR', 'Zysk'], [M, 700, 860, W - M], scen.map(x => [x.name, pl1(x.r.netPost), pl1(x.r.irr), sg(x.r.zysk)]));
      text(scen.filter(x => x.name !== 'Bazowy').map(x => `${x.name}: ${x.opis}.`).join(' '), 22, C.ink2, 400, 'Archivo', 1.38); y += 22;
      return finish(D1 + 'Wyniki wynikają z podanych założeń i nie są prognozą ani poradą inwestycyjną lub podatkową. Podatek liczony orientacyjnie, bez składki zdrowotnej, ulg i podatku od sprzedaży.');
    }
    if (variant === 'lokal') { if (opts.okolicaOpis) { text(opts.okolicaOpis, 25, C.ink); y += 12; } okolTab(64);
      if (opts.promienie && opts.promienie.length) { ensure(120 + opts.promienie.length * 46); text('Liczba punktów w promieniach od budynku', 34, C.ink, 400, 'Marcellus'); y += 6; const xs = [M, 590, 720, 850, 970, W - M]; table(['', ...opts.radii], xs, opts.promienie.map(x => [x.label, ...x.n]), 38); }
      okolSrc(); return finish(D1 + 'Opis powstał wyłącznie z policzonych punktów mapowych, których kompletność zależy od danych OpenStreetMap. Nie stanowi oceny atrakcyjności nieruchomości.');
    }
    if (variant === 'rent') { const p = opts.pair; kvRows([['Szacunkowa wartość', zl(round(p.wartosc, 1000))], ['Szacunkowy czynsz miesięcznie', zl(round(p.czynsz, 10))], ['Rentowność brutto rocznie', pl1(p.y)]]); y += 16;
      text('Roczny czynsz do szacunkowej wartości, przed podatkiem, kosztami, remontami i pustostanami. Rzeczywisty zwrot jest niższy.', 24, C.ink2); y += 18; if (opts.market?.yield) yieldCh(opts.market);
      return finish(D1 + 'Czynsze pochodzą z cen ofertowych, które mogą być wyższe od faktycznie uzgodnionych.');
    }
    if (opts.market?.trend) trendCh(opts.market); if (opts.market?.yield) yieldCh(opts.market);
    if (opts.market?.exp) { const X = opts.market.exp; ensure(160); text('Czas ekspozycji ofert najmu', 34, C.ink, 400, 'Marcellus'); y += 6; text(`Połowa ofert znikała w ciągu ${Math.round(X.days.med)} dni (środkowe 50%: ${Math.round(X.days.p25)}–${Math.round(X.days.p75)} dni), na podstawie ${X.nGone} ofert. Zniknięcie oferty nie zawsze oznacza wynajem.`, 24, C.ink2); y += 22; }
    return finish(D1 + 'Ceny transakcyjne pochodzą z Rejestru Cen Nieruchomości, czynsze z cen ofertowych. Ceny zmieniają się też ze standardem i metrażem, więc to wskazówka o rynku, nie wycena.');
  }
  text(sale ? 'Orientacyjna analiza wartości nieruchomości' : 'Orientacyjna analiza czynszu najmu', 50, C.ink, 400, 'Marcellus', 1.25); y += 10;
  // dane nieruchomości
  const lok = sale ? [s.ulica, s.nr].filter(Boolean).join(' ') : [s.dzielnica, s.ulica].filter(Boolean).join(', ');
  const kat = s.kat || 'mieszkanie', fl = kat === 'mieszkanie', stdTxt = ({ remont: 'do remontu', dobry: 'dobry', wysoki: 'wysoki' })[s.standard] || 'nie podano';
  const m2Lbl = kat === 'dzialka' ? 'Powierzchnia działki' : kat === 'dom' ? 'Powierzchnia użytkowa budynku' : 'Powierzchnia';
  const podLbl = { dzialka: 'Przeznaczenie wg planu', lokal: 'Funkcja lokalu', obiekt: 'Rodzaj obiektu' }[kat];
  const rows = [...(fl ? [] : [['Rodzaj nieruchomości', KAT[kat].n]]), ['Lokalizacja', (lok || 'Lublin') + (sale ? '' : ', Lublin')], [m2Lbl, String(s.m2).replace('.', ',') + ' m²'],
    ...(kat === 'dom' && s.dzm2 ? [['Powierzchnia działki', String(s.dzm2).replace('.', ',') + ' m²']] : []),
    ...(fl ? [['Liczba pokoi', String(s.pokoje)], ['Piętro', s.pietro == null ? '—' : s.pietro === 0 ? 'parter' : String(s.pietro)]] : []),
    ...(podLbl && s.pod ? [[podLbl, POD_TXT[s.pod] || s.pod]] : []),
    ...(['mieszkanie', 'dom', 'obiekt'].includes(kat) ? [['Rok budowy', s.rok ? String(s.rok) : 'nie podano']] : []),
    ...(kat === 'garaz' || kat === 'dzialka' ? [] : [['Standard (wg zgłoszenia)', stdTxt]]),
    ...(sale ? (['mieszkanie', 'dom', 'obiekt', 'lokal'].includes(kat) ? [['Rynek', ({ wtorny: 'wtórny', pierwotny: 'pierwotny' })[s.rynek] || 'dowolny']] : [])
      : [['Wyposażenie (wg zgłoszenia)', ({ tak: 'umeblowane', nie: 'bez mebli' })[s.meble] || 'nie podano'], ...(s.parking ? [['Parking / garaż', ({ brak: 'brak', wliczony: 'w cenie czynszu', osobno: 'płatny osobno' })[s.parking]]] : []), ...(s.attrs && Object.values(s.attrs).some(Boolean) ? [['Udogodnienia', Object.entries(s.attrs).filter(e => e[1]).map(e => ({ klima: 'klimatyzacja', winda: 'winda', balkon: 'balkon', taras: 'taras', ogrod: 'ogród', garaz: 'garaż' })[e[0]]).join(', ')]] : [])])];
  const cw = (W - 2 * M) / 2;
  rows.forEach((rw, i) => { const x = M + (i % 2) * cw, yy = y + Math.floor(i / 2) * 78; ctx.font = '400 21px Archivo'; ctx.fillStyle = C.ink2; ctx.fillText(rw[0].toUpperCase(), x, yy); ctx.font = '700 30px Archivo'; ctx.fillStyle = C.ink; ctx.fillText(rw[1], x, yy + 38); });
  y += Math.ceil(rows.length / 2) * 78 + 24;
  // wynik
  const bx = M, bw = W - 2 * M, bh = 300; ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(bx, y, bw, bh, 26); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.goldD; ctx.font = '700 22px Archivo'; ctx.textAlign = 'center'; ctx.fillText((sale ? 'SZACUNKOWA WARTOŚĆ RYNKOWA' : 'SZACUNKOWY CZYNSZ NAJMU, MIESIĘCZNIE').toUpperCase(), W / 2, y + 56);
  ctx.fillStyle = C.ink; ctx.font = '400 84px Marcellus'; ctx.fillText(`${money(round(r.total.lo, step))} – ${money(round(r.total.hi, step))} zł`, W / 2, y + 160);
  ctx.fillStyle = C.ink2; ctx.font = '400 26px Archivo'; ctx.fillText(`środek przedziału: ${money(round((r.total.lo + r.total.hi) / 2, step))} zł  ·  mediana: ${money(round(r.total.mid, step))} zł  ·  ${money(r.pm2.mid)} zł za m²`, W / 2, y + 210);
  ctx.fillText(`pewność oceny: ${LV[r.confidence.level]}  ·  liczba porównań: ${r.n}`, W / 2, y + 250); ctx.textAlign = 'left'; y += bh + 44;
  text('Jak to policzono', 34, C.ink, 400, 'Marcellus'); y += 4;
  text(sale ? `Metoda porównawcza. Podstawą są ceny z aktów notarialnych zapisane w Rejestrze Cen Nieruchomości (RCN) dla ${fl ? 'lokali o zbliżonej powierzchni, liczbie pokoi, piętrze i położeniu' : ({ dom: 'domów o zbliżonej powierzchni, wielkości działki i położeniu', dzialka: 'działek o zbliżonej powierzchni, przeznaczeniu i położeniu', lokal: 'lokali użytkowych o zbliżonej powierzchni, funkcji i położeniu', obiekt: 'obiektów o zbliżonej powierzchni, rodzaju i położeniu', garaz: 'garaży o zbliżonej powierzchni i położeniu' })[kat]}. Podany przedział to ${r.rangeKind}. Starsze transakcje mają mniejszą wagę.`
    : `Metoda porównawcza. Podstawą są ceny ofertowe lokali na wynajem z ogłoszeń o zbliżonej powierzchni, liczbie pokoi, piętrze i dzielnicy. Podany przedział to ${r.rangeKind}. Ceny ofertowe mogą być wyższe od faktycznie uzgodnionych czynszów.`, 25, C.ink2); y += 8;
  if (sale && r.timeAdj != null) { text(`Ceny z aktów sprzed kilku miesięcy lub lat doprowadzono do dzisiejszego poziomu rynku (zmiana cen rok do roku w tym segmencie: ${r.timeAdj >= 0 ? '+' : ''}${(r.timeAdj * 100).toFixed(1).replace('.', ',')}%).${variant === 'short' ? '' : ' Kolumna „zł/m² dziś” pokazuje cenę po tej korekcie.'}`, 25, C.ink2); y += 8; }
  if (r.adminTotal) { text(`Czynsz administracyjny w porównywalnych ofertach: ok. ${money(round(r.adminTotal, 10))} zł miesięcznie (nie wlicza się do powyższego przedziału).`, 25, C.ink2); y += 8; }
  if (!sale && s.parking === 'osobno') { text(r.parking && r.parking.ok ? `Miejsce parkingowe lub garaż jest płatne osobno: w ogłoszeniach zwykle ${money(round(r.parking.lo, 10))} – ${money(round(r.parking.hi, 10))} zł miesięcznie, dolicza się je do podanego czynszu za mieszkanie.` : 'Miejsce parkingowe lub garaż jest płatne osobno i nie jest wliczone w podany czynsz za mieszkanie.', 25, C.ink2); y += 8; }
  if (!sale && r.applied && r.applied.length) { text('Uwzględnione cechy mieszkania: ' + r.applied.map(a => `${a.label}${a.has === false ? ' (brak)' : ''}`).join(', ') + '. Ich wpływ na czynsz zmierzono na bazie ofert z rynku lubelskiego.', 25, C.ink2); y += 8; }
  const nts = r.notes.filter(n => !/^(Lokalizacja podmiotu|Korekta czasu|Pominięto|Korekta segmentu|Cecha „|Segmenty |Dzielnica ustalona|Uwaga: wpisano)/.test(n)).slice(0, 4); nts.forEach(n => text('•  ' + n, 23, C.ink2, 400, 'Archivo', 1.38, W - 2 * M - 28)); y += 10;

  if (variant !== 'short') {
  // tabela porównań
  const cols = [['Lokalizacja', M, 'l'], ['m²', 620, 'r'], [fl ? 'Pok.' : '', 705, 'r'], ['Cena', 880, 'r'], [sale && r.timeAdj != null ? 'zł/m² dziś' : 'zł/m²', 1010, 'r'], [sale ? 'Akt' : 'Typ', W - M, 'r']];
  const head = () => { ctx.fillStyle = C.goldD; ctx.font = '700 21px Archivo'; cols.forEach(([n, x, a]) => { ctx.textAlign = a === 'r' ? 'right' : 'left'; ctx.fillText(n.toUpperCase(), x, y); }); ctx.textAlign = 'left'; ctx.fillStyle = C.line; ctx.fillRect(M, y + 14, W - 2 * M, 2); y += 52; };
  const comps = r.comps.slice(0, 24); let first = true;
  if (H - 190 - y < 5 * 46 + 140) { footer(pages.length); newPage(false); }   // tabela nie zaczyna się przy samym dole strony
  text(`Porównania użyte w analizie (${comps.length} z ${r.n})`, 34, C.ink, 400, 'Marcellus'); y += 8; head();
  for (const c of comps) {
    if (y > H - 190) { footer(pages.length); newPage(false); head(); }
    ctx.font = '400 24px Archivo'; ctx.fillStyle = C.ink;
    let lbl = c.opis || '—'; while (ctx.measureText(lbl).width > 500 && lbl.length > 4) lbl = lbl.slice(0, -2); if (lbl !== (c.opis || '—')) lbl += '…';
    ctx.fillText(lbl, M, y);
    const vals = [String(c.m2).replace('.', ','), c.pokoje != null ? String(c.pokoje) : '', money(c.cena) + ' zł', money(c.pm2), sale ? String(c.rok || '') : 'oferta'];
    ctx.textAlign = 'right'; [620, 705, 880, 1010, W - M].forEach((x, i) => ctx.fillText(vals[i], x, y)); ctx.textAlign = 'left'; y += 46;
  }
  y += 14;
  }
  if (variant !== 'short' && opts.okolica && opts.okolica.length) {
    okolTab(); if (opts.okolicaOpis) { ensure(90); text(opts.okolicaOpis, 24, C.ink); y += 10; } okolSrc();
  }
  if (variant === 'market' && opts.market) {
    const mk = opts.market, need = 700;
    if (H - 190 - y < need) { footer(pages.length); newPage(false); }
    if (mk.trend && mk.trend.ok) {
      text('Ceny transakcyjne w czasie', 34, C.ink, 400, 'Marcellus'); y += 6;
      text(mk.trendLabel || '', 23, C.ink2); y += 8;
      lineChartCv(ctx, mk.trend.points, M, y, W - 2 * M, 380); y += 380 + 30;
      text(`Mediana ceny za m² (akty notarialne, RCN) w okresach ${mk.trend.step === 12 ? 'rocznych' : mk.trend.step === 6 ? 'półrocznych' : 'kwartalnych'}; pasmo to środkowe 50% transakcji. Podstawa: ${money(mk.trend.n)} transakcji.${mk.trend.yoy ? ` Zmiana rok do roku: ${mk.trend.yoy.pct >= 0 ? '+' : ''}${mk.trend.yoy.pct.toFixed(1).replace('.', ',')}%.` : ''}`, 22, C.ink2, 400, 'Archivo', 1.38); y += 22;
    }
    if (mk.yield && mk.yield.ok) {
      const rows = mk.yield.rows.slice(0, 10), need2 = 130 + rows.length * 50 + 120;
      if (H - 190 - y < need2) { footer(pages.length); newPage(false); }
      text('Rentowność najmu w dzielnicach', 34, C.ink, 400, 'Marcellus'); y += 6;
      y = barChartCv(ctx, rows, mk.yield.city.y, M, y, W - 2 * M); y += 16;
      text('Roczny czynsz z ofert do mediany ceny transakcyjnej tego samego metrażu; wartość brutto, przed podatkiem i kosztami. Linia pionowa: średnia dla miasta.', 22, C.ink2, 400, 'Archivo', 1.38); y += 22;
    }
  }
  // zastrzeżenie
  // zastrzeżenie
  const disc = `Niniejsze zestawienie ma charakter wyłącznie orientacyjny i informacyjny. Sporządzono je metodą porównawczą na podstawie ${sale ? 'cen transakcyjnych z Rejestru Cen Nieruchomości' : 'cen ofertowych z ogłoszeń'}, bez oględzin nieruchomości oraz bez badania jej stanu prawnego i technicznego. Nie jest wyceną sporządzoną przez rzeczoznawcę majątkowego i nie może jej zastępować. Rzeczywista cena lub czynsz zależą od stanu nieruchomości, negocjacji i sytuacji rynkowej.`;
  return finish(disc);
}

// Minimalny zapis PDF: jedna strona A4 = jeden obraz JPEG.
export function makePdf(canvases) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = d => { const b = typeof d === 'string' ? enc.encode(d) : d; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };
  const n = canvases.length, pw = 595.28, ph = 841.89;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  canvases.forEach((cv, i) => {
    const b64 = cv.toDataURL('image/jpeg', .92).split(',')[1], bin = atob(b64), jpg = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) jpg[k] = bin.charCodeAt(k);
    const pg = 3 + i * 3, im = pg + 1, ct = pg + 2, content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
    offs[im] = len; push(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream\nendobj\n');
    obj(ct, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const total = 3 + n * 3, xref = len; push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
