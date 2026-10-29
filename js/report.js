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

export async function buildReport(e, ust) {
  await Promise.all([document.fonts.load('40px Marcellus'), document.fonts.load('400 20px Archivo'), document.fonts.load('700 20px Archivo')]);
  const logo = await loadImg('icons/logo-am.png');
  const { subj: s, res: r } = e, sale = s.tryb === 'sprzedaz', step = sale ? 1000 : 10;
  const pages = []; let cv, ctx, y;
  const newPage = first => {
    cv = document.createElement('canvas'); cv.width = W; cv.height = H; ctx = cv.getContext('2d'); pages.push(cv);
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    if (first) {
      ctx.fillStyle = C.onyx; ctx.fillRect(0, 0, W, 236);
      const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(200,164,77,0)'); g.addColorStop(.5, 'rgba(200,164,77,.9)'); g.addColorStop(1, 'rgba(200,164,77,0)'); ctx.fillStyle = g; ctx.fillRect(0, 236, W, 3);
      if (logo) ctx.drawImage(logo, M, 40, 156, 156);
      ctx.fillStyle = C.goldL; ctx.font = '400 54px Marcellus'; ctx.fillText(ust.biuro || 'Biuro nieruchomości', M + 196, 112);
      ctx.fillStyle = C.bone; ctx.font = '400 26px Archivo'; ctx.fillText(ust.haslo || '', M + 196, 158);
      ctx.textAlign = 'right'; ctx.fillStyle = C.ash || '#9A978F'; ctx.font = '400 24px Archivo'; ctx.fillText(new Date(e.ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }), W - M, 112); ctx.textAlign = 'left';
      y = 330;
    } else { ctx.fillStyle = C.gold; ctx.fillRect(0, 0, W, 10); y = 110; }
  };
  const text = (t, size, color, weight = 400, font = 'Archivo', lh = 1.4, maxW = W - 2 * M) => {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color;
    for (const ln of wrap(ctx, t, maxW)) { ctx.fillText(ln, M, y); y += size * lh; }
  };
  const footer = n => {
    ctx.fillStyle = C.line; ctx.fillRect(M, H - 118, W - 2 * M, 2);
    ctx.font = '400 22px Archivo'; ctx.fillStyle = C.ink2;
    const who = [ust.agent ? 'Sporządził: ' + ust.agent : '', ust.biuro, ust.tel, ust.email, ust.www].filter(Boolean).join('  ·  ');
    ctx.fillText(who, M, H - 70); ctx.textAlign = 'right'; ctx.fillText(`Strona ${n}/${pages.length}`, W - M, H - 70); ctx.textAlign = 'left';
  };

  newPage(true);
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
      : [['Wyposażenie (wg zgłoszenia)', ({ tak: 'umeblowane', nie: 'bez mebli' })[s.meble] || 'nie podano'], ...(s.attrs && Object.values(s.attrs).some(Boolean) ? [['Udogodnienia', Object.entries(s.attrs).filter(e => e[1]).map(e => ({ klima: 'klimatyzacja', winda: 'winda', balkon: 'balkon', taras: 'taras', ogrod: 'ogród', garaz: 'garaż' })[e[0]]).join(', ')]] : [])])];
  const cw = (W - 2 * M) / 2;
  rows.forEach((rw, i) => { const x = M + (i % 2) * cw, yy = y + Math.floor(i / 2) * 78; ctx.font = '400 21px Archivo'; ctx.fillStyle = C.ink2; ctx.fillText(rw[0].toUpperCase(), x, yy); ctx.font = '700 30px Archivo'; ctx.fillStyle = C.ink; ctx.fillText(rw[1], x, yy + 38); });
  y += Math.ceil(rows.length / 2) * 78 + 24;
  // wynik
  const bx = M, bw = W - 2 * M, bh = 300; ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(bx, y, bw, bh, 26); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.goldD; ctx.font = '700 22px Archivo'; ctx.textAlign = 'center'; ctx.fillText((sale ? 'SZACUNKOWA WARTOŚĆ RYNKOWA' : 'SZACUNKOWY CZYNSZ NAJMU, MIESIĘCZNIE').toUpperCase(), W / 2, y + 56);
  ctx.fillStyle = C.ink; ctx.font = '400 84px Marcellus'; ctx.fillText(`${money(round(r.total.lo, step))} – ${money(round(r.total.hi, step))} zł`, W / 2, y + 160);
  ctx.fillStyle = C.ink2; ctx.font = '400 26px Archivo'; ctx.fillText(`mediana porównań: ${money(round(r.total.mid, step))} zł  ·  ${money(r.pm2.mid)} zł za m²`, W / 2, y + 210);
  ctx.fillText(`pewność oceny: ${LV[r.confidence.level]}  ·  liczba porównań: ${r.n}`, W / 2, y + 250); ctx.textAlign = 'left'; y += bh + 44;
  text('Jak to policzono', 34, C.ink, 400, 'Marcellus'); y += 4;
  text(sale ? `Metoda porównawcza. Podstawą są ceny z aktów notarialnych zapisane w Rejestrze Cen Nieruchomości (RCN) dla ${fl ? 'lokali o zbliżonej powierzchni, liczbie pokoi, piętrze i położeniu' : ({ dom: 'domów o zbliżonej powierzchni, wielkości działki i położeniu', dzialka: 'działek o zbliżonej powierzchni, przeznaczeniu i położeniu', lokal: 'lokali użytkowych o zbliżonej powierzchni, funkcji i położeniu', obiekt: 'obiektów o zbliżonej powierzchni, rodzaju i położeniu', garaz: 'garaży o zbliżonej powierzchni i położeniu' })[kat]}. Podany przedział to ${r.rangeKind}. Starsze transakcje mają mniejszą wagę.`
    : `Metoda porównawcza. Podstawą są ceny ofertowe lokali na wynajem z ogłoszeń o zbliżonej powierzchni, liczbie pokoi, piętrze i dzielnicy. Podany przedział to ${r.rangeKind}. Ceny ofertowe mogą być wyższe od faktycznie uzgodnionych czynszów.`, 25, C.ink2); y += 8;
  if (r.adminTotal) { text(`Czynsz administracyjny w porównywalnych ofertach: ok. ${money(round(r.adminTotal, 10))} zł miesięcznie (nie wlicza się do powyższego przedziału).`, 25, C.ink2); y += 8; }
  if (!sale && r.applied && r.applied.length) { text('Uwzględnione cechy mieszkania: ' + r.applied.map(a => `${a.label}${a.has === false ? ' (brak)' : ''}`).join(', ') + '. Ich wpływ na czynsz zmierzono na bazie ofert z rynku lubelskiego.', 25, C.ink2); y += 8; }
  const nts = r.notes.filter(n => !/^(Lokalizacja podmiotu|Pominięto|Korekta segmentu|Cecha „|Segmenty |Dzielnica ustalona|Uwaga: wpisano)/.test(n)).slice(0, 4); nts.forEach(n => text('•  ' + n, 23, C.ink2, 400, 'Archivo', 1.38, W - 2 * M - 28)); y += 10;

  // tabela porównań
  const cols = [['Lokalizacja', M, 'l'], ['m²', 620, 'r'], [fl ? 'Pok.' : '', 705, 'r'], ['Cena', 880, 'r'], ['zł/m²', 1010, 'r'], [sale ? 'Akt' : 'Typ', W - M, 'r']];
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
  // zastrzeżenie
  const disc = `Niniejsze zestawienie ma charakter wyłącznie orientacyjny i informacyjny. Sporządzono je metodą porównawczą na podstawie ${sale ? 'cen transakcyjnych z Rejestru Cen Nieruchomości' : 'cen ofertowych z ogłoszeń'}, bez oględzin nieruchomości oraz bez badania jej stanu prawnego i technicznego. Nie jest wyceną sporządzoną przez rzeczoznawcę majątkowego i nie może jej zastępować. Rzeczywista cena lub czynsz zależą od stanu nieruchomości, negocjacji i sytuacji rynkowej.`;
  ctx.font = '400 22px Archivo'; const dl = wrap(ctx, disc, W - 2 * M - 48), dh = dl.length * 31 + 44;
  if (y + dh > H - 140) { footer(pages.length); newPage(false); }
  ctx.fillStyle = '#F2EEE2'; ctx.beginPath(); ctx.roundRect(M, y, W - 2 * M, dh, 18); ctx.fill(); ctx.fillStyle = C.ink2; dl.forEach((l, i) => ctx.fillText(l, M + 24, y + 38 + i * 31));
  footer(pages.length);
  // numeracja po zbudowaniu całości
  pages.forEach((p, i) => { const c2 = p.getContext('2d'); c2.fillStyle = C.paper; c2.fillRect(W - M - 260, H - 100, 260, 40); c2.fillStyle = C.ink2; c2.font = '400 22px Archivo'; c2.textAlign = 'right'; c2.fillText(`Strona ${i + 1}/${pages.length}`, W - M, H - 70); });
  return pages;
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
