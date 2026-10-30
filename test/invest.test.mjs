import assert from 'node:assert/strict';
import { investCalc, pmt, sensitivity, TAX } from '../js/invest.js';
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
console.log('invest.test: OK  netto po podatku', r.netPost.toFixed(2) + '%');
