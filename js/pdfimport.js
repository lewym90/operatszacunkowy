// Odczyt tekstu z PDF (pdf.js, lokalnie z folderu vendor, działa offline) i zamiana na oferty.
import { parseLines, flags } from './parseOtodom.js';
let lib = null;
async function pdfjs() {
  if (lib) return lib;
  lib = await import('../vendor/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return lib;
}
export async function linesFromPdf(file, onPage) {
  const p = await pdfjs();
  const doc = await p.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent(); let cur = '';
    for (const it of tc.items) { cur += it.str; if (it.hasEOL) { lines.push(cur); cur = ''; } }
    if (cur) lines.push(cur);
    onPage && onPage(i, doc.numPages);
  }
  return lines;
}
export const offersFromLines = lines => parseLines(lines).map(r => ({ ...r, flagi: flags(r) }));
export const offerKey = r => [r.cena, r.czynsz, r.pokoje, r.m2, r.pietro, r.ulica, r.dzielnica, r.miasto].join('|');
