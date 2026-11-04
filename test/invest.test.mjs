import assert from 'node:assert/strict';
import { investCalc, pmt, sensitivity, TAX, irr, npv, balance, holdCalc, scenarios, whatIf } from '../js/invest.js';
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);
// przykład liczony ręcznie: 500 000 zł, wtórny (PCC 2% = 10 000), notariusz 3 000, remont 20 000 → koszt 533 000
const base = { cena: 500000, rynek: 'wtorny', kosztyInne: 3000, remont: 20000, czynsz: 2800, pustostan: 1, oplaty: 300, zarzad: 0, podatek: 'ryczalt' };
const r = investCalc(base);
near(r.koszt, 533000); near(r.rev, 30800); near(r.noi, 27200); near(r.tax, 2618); near(r.taxless, 24582);
near(r.gross, 6.72, 0.001); near(r.netPre, 5.1032, 0.001); near(r.netPost, 4.6117, 0.001); near(r.payback, 533000 / 24582, 0.001);
// rynek pierwotny: bez PCC; skala i liniowy
near(investCalc({ ...base, rynek: 'pierwotny' }).pcc, 0); near(investCalc({ ...base, podatek: 'liniowy' }).tax, 0.19 * 27200); near(investCalc({ ...base, podatek: 'skala' }).tax, 0.12 * 27200);
// ryczałt powyżej progu 100 tys.
near(TAX.ryczalt.f(120000), 8500 + 2500);
// kredyt: 70% ceny, 7%, 25 lat → rata ok. 2473,7; przepływ = po podatku − 12·rata
near(pmt(350000, 7, 25), 2473.7, 0.5);
const k = investCalc({ ...base, wklad: 30, oproc: 7, lata: 25 }); near(k.loan, 350000); near(k.equity, 533000 - 350000); near(k.cf, k.taxless - k.rata * 12, 0.01); assert.ok(k.cf < 0 && k.payback === null, 'ujemny przepływ: brak okresu zwrotu');
assert.ok(k.interestYear1 > 23000 && k.interestYear1 < 24500, 'odsetki w 1. roku ' + k.interestYear1);
// walidacja i wrażliwość
assert.equal(investCalc({ cena: 0, czynsz: 100 }).ok, false);
const sv = sensitivity(base); assert.equal(sv.length, 5); assert.ok(sv[0].y < sv[1].y && sv[2].y > sv[1].y && sv[3].y > sv[1].y && sv[4].y < sv[1].y);
// IRR i NPV: wartości policzone ręcznie
near(irr([-1000, 100, 100, 1100]) * 100, 10, 1e-6); near(npv(0.1, [-1000, 100, 100, 1100]), 0, 1e-6); near(npv(0, [-100, 50, 60]), 10); near(npv(0.05, [-1000, 1050]), 0, 1e-9);
near(irr([-1000, 0, 0, 1331]) * 100, 10, 1e-6); near(irr([-100, 90]) * 100, -10, 1e-6); assert.equal(irr([100, 100]), null); assert.equal(irr([-100, 300, -210]), null, 'dwie zmiany znaku = bez IRR');
// saldo kredytu: po 0 rat = kwota, po wszystkich = 0, zero procent liniowo, spłata zgodna z sumą kapitału z 12 rat
near(balance(350000, 7, 25, 0), 350000, 1e-6); near(balance(350000, 7, 25, 300), 0, 1e-6); near(balance(1200, 0, 1, 6), 600, 1e-9);
{ let b = 350000; const p = pmt(350000, 7, 25); for (let m = 0; m < 60; m++) b = b * (1 + .07 / 12) - p; near(balance(350000, 7, 25, 60), b, 1e-4); }
// horyzont bez kredytu, bez wzrostów: 10 lat tego samego przepływu + cena zakupu ze sprzedaży
const h = holdCalc({ ...base, okres: 10 }); near(h.equity, 533000); near(h.gotowka, 245820, 1e-6); near(h.wartosc, 500000); near(h.zysk, 245820 + 500000 - 533000, 1e-6); near(h.roi, h.zysk / 533000 * 100, 1e-9);
{ const fl = [-533000, ...Array(9).fill(24582), 524582]; near(h.irr, irr(fl) * 100, 1e-6); near(npv(h.irr / 100, h.flows), 0, 1e-3); assert.equal(h.npv, null, 'bez stopy nie ma NPV'); near(holdCalc({ ...base, okres: 10, dyskonto: 5 }).npv, npv(.05, fl), 1e-6); }
// wzrost wartości, koszty sprzedaży, kredyt: saldo odjęte, ostatni rok zawiera sprzedaż
const h2 = holdCalc({ ...base, wklad: 30, oproc: 7, lata: 25, okres: 5, wzrost: 3, koszSprz: 2, wzrostCz: 2 });
near(h2.wartosc, 500000 * 1.03 ** 5, 1e-6); near(h2.kosztSprz, h2.wartosc * .02, 1e-6); near(h2.saldo, balance(350000, 7, 25, 60), 1e-6); near(h2.zeSprzedazy, h2.wartosc * .98 - h2.saldo, 1e-6); near(h2.flows[0], -183000, 1e-6);
{ const y2rev = 30800 * 1.02, opex = 3600 * 1.02, tax = TAX.ryczalt.f(y2rev); near(h2.lata[1].cf, y2rev - opex - tax - h2.rata * 12, 1e-6); }
// kredyt krótszy niż horyzont: po spłacie brak raty, saldo 0
const h3 = holdCalc({ ...base, wklad: 50, oproc: 6, lata: 3, okres: 5 }); assert.equal(h3.saldo, 0); near(h3.lata[3].debt, 0); near(h3.lata[2].debt, h3.rata * 12, 1e-6);
assert.equal(holdCalc({ cena: 0 }).ok, false);
// scenariusze uporządkowane, bazowy równy danym; symulacje działają w dobrą stronę
const sc = scenarios({ ...base, okres: 10 }); assert.equal(sc.length, 3); near(sc[1].r.irr, h.irr, 1e-9); assert.ok(sc[0].r.irr < sc[1].r.irr && sc[1].r.irr < sc[2].r.irr);
near(sc[0].r.wartosc, 500000 * .98 ** 10, 1e-6); near(sc[2].r.rev, 2800 * 1.1 * 12, 1e-6); near(sc[0].r.rev, 2800 * .9 * 10, 1e-6);
const wi = whatIf({ ...base, okres: 10, wklad: 30, oproc: 7, lata: 25 }), wn = n => wi.find(x => x.name.startsWith(n)); assert.ok(wn('Cena').dNet > 0 && wn('Czynsz −').dNet < 0 && wn('Czynsz +').dNet > 0 && wn('Remont').dNet < 0 && wn('Pustostan').dNet < 0 && wn('Koszty').dNet < 0); assert.ok(wn('Oprocentowanie').cfMies < holdCalc({ ...base, okres: 10, wklad: 30, oproc: 7, lata: 25 }).cfMies); assert.ok(wn('Wartość').dIrr < 0 && wn('Wartość').dNet === 0);
assert.equal(whatIf({ ...base, okres: 10 }).some(x => x.name.startsWith('Oprocentowanie')), false, 'bez kredytu brak symulacji oprocentowania');
console.log('invest.test: OK  netto po podatku', r.netPost.toFixed(2) + '%');
