// Kalkulator inwestycyjny najmu: zwrot brutto i netto, podatek, kredyt, przepływ gotówki i wrażliwość na czynsz i cenę.
// Podatek jest orientacyjny (stawki ustawowe; bez składki zdrowotnej, ulg i kwoty wolnej): do decyzji potrzebny jest doradca podatkowy.
export const PCC = 0.02;                                       // podatek od czynności cywilnoprawnych przy zakupie na rynku wtórnym
export const TAX = {
  ryczalt: { n: 'Ryczałt 8,5% (12,5% powyżej 100 tys. zł przychodu)', f: (rev) => 0.085 * Math.min(rev, 1e5) + 0.125 * Math.max(0, rev - 1e5) },
  skala: { n: 'Skala podatkowa 12% (32% powyżej 120 tys. zł dochodu)', f: (rev, inc) => 0.12 * Math.min(Math.max(inc, 0), 1.2e5) + 0.32 * Math.max(0, inc - 1.2e5) },
  liniowy: { n: 'Podatek liniowy 19%', f: (rev, inc) => 0.19 * Math.max(inc, 0) },
};
export const pmt = (principal, ratePct, years) => { const n = Math.round(years * 12), r = ratePct / 100 / 12; if (!(principal > 0) || !(n > 0)) return 0; return r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n)); };

/** i: { cena, rynek:'wtorny'|'pierwotny', pcc (zł, opcj.), kosztyInne, remont, czynsz (mies.), pustostan (mies./rok), oplaty (mies.), zarzad (% przychodu), podatek, wklad (% ceny), oproc (%), lata } */
export function investCalc(i) {
  const cena = +i.cena || 0, czynsz = +i.czynsz || 0;
  if (!(cena > 0) || !(czynsz > 0)) return { ok: false, reason: 'Podaj cenę zakupu i czynsz miesięczny.' };
  const pcc = i.pcc != null && i.pcc !== '' ? +i.pcc : i.rynek === 'pierwotny' ? 0 : cena * PCC;
  const koszt = cena + pcc + (+i.kosztyInne || 0) + (+i.remont || 0);
  const pust = Math.min(12, Math.max(0, i.pustostan == null || i.pustostan === '' ? 1 : +i.pustostan));
  const rev = czynsz * (12 - pust), opex = (+i.oplaty || 0) * 12 + (+i.zarzad || 0) / 100 * rev, noi = rev - opex;
  const tax = (TAX[i.podatek] || TAX.ryczalt).f(rev, noi), taxless = noi - tax;
  const loan = i.wklad != null && i.wklad !== '' && +i.wklad < 100 && +i.oproc >= 0 && +i.lata > 0 && i.oproc !== '' ? cena * (1 - +i.wklad / 100) : 0;
  const rata = loan ? pmt(loan, +i.oproc, +i.lata) : 0, debtYear = rata * 12, equity = koszt - loan, cf = taxless - debtYear;
  return { ok: true, koszt, pcc, rev, opex, noi, tax, taxless, loan, rata, equity, cf, cfMies: cf / 12,
    gross: czynsz * 12 / cena * 100, netPre: noi / koszt * 100, netPost: taxless / koszt * 100, coc: equity > 0 ? cf / equity * 100 : null,
    payback: (loan ? cf : taxless) > 0 ? (loan ? equity / cf : koszt / taxless) : null, interestYear1: loan ? Math.max(0, debtYear - principalYear1(loan, +i.oproc, +i.lata)) : 0 };
}
function principalYear1(loan, ratePct, years) { const r = ratePct / 100 / 12, p = pmt(loan, ratePct, years); let bal = loan, paid = 0; for (let k = 0; k < 12 && k < years * 12; k++) { const intr = bal * r, pr = p - intr; paid += pr; bal -= pr; } return paid; }

// Wrażliwość: czynsz −10% / bazowy / +10%, cena zakupu −5% (negocjacja), dłuższy pustostan (+2 mies.)
export function sensitivity(i) {
  const base = investCalc(i); if (!base.ok) return [];
  const v = (name, patch) => { const r = investCalc({ ...i, ...patch }); return r.ok ? { name, y: r.netPost, cf: r.cf } : null; };
  const c = +i.czynsz, p0 = i.pustostan == null || i.pustostan === '' ? 1 : +i.pustostan;
  return [v('Czynsz −10%', { czynsz: c * 0.9 }), { name: 'Bazowy', y: base.netPost, cf: base.cf }, v('Czynsz +10%', { czynsz: c * 1.1 }), v('Cena −5%', { cena: +i.cena * 0.95, pcc: i.pcc === '' || i.pcc == null ? '' : +i.pcc * 0.95 }), v(`Pust. ${Math.min(12, p0 + 2)} mies.`, { pustostan: Math.min(12, p0 + 2) })].filter(Boolean);
}

/* ---------- Horyzont inwestycji: przepływy roczne, sprzedaż na końcu, ROI, IRR, NPV ---------- */
// Saldo kredytu po m ratach (raty równe)
export function balance(loan, ratePct, years, m) {
  const n = Math.round(years * 12), r = ratePct / 100 / 12; if (!(loan > 0) || m >= n) return 0;
  if (r === 0) return loan * (1 - m / n);
  return loan * Math.pow(1 + r, m) - pmt(loan, ratePct, years) * (Math.pow(1 + r, m) - 1) / r;
}
export const npv = (rate, flows) => flows.reduce((s, f, t) => s + f / Math.pow(1 + rate, t), 0);
// IRR metodą bisekcji. null, gdy nie ma jednej zmiany znaku przepływów (wtedy wynik byłby niejednoznaczny albo nie istnieje).
export function irr(flows) {
  const nz = flows.filter(f => f !== 0); let changes = 0; for (let i = 1; i < nz.length; i++) if (nz[i] > 0 !== nz[i - 1] > 0) changes++;
  if (changes !== 1) return null;
  let lo = -0.99, hi = 10, flo = npv(lo, flows), fhi = npv(hi, flows); if (!Number.isFinite(flo) || flo > 0 === fhi > 0) return null;
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2, fm = npv(m, flows); if (fm > 0 === flo > 0) { lo = m; flo = fm; } else hi = m; if (hi - lo < 1e-10) break; }
  return (lo + hi) / 2;
}
/** Dodatkowe pola i: okres (lata, domyślnie 10), wzrost (% wartości rocznie), wzrostCz (% czynszu i kosztów rocznie), koszSprz (% ceny sprzedaży), dyskonto (%), mnozSprz (mnożnik wartości końcowej, do symulacji). */
export function holdCalc(i) {
  const b = investCalc(i); if (!b.ok) return b;
  const N = Math.min(40, Math.max(1, Math.round(+i.okres || 10))), w = (+i.wzrost || 0) / 100, g = (+i.wzrostCz || 0) / 100, sc = (+i.koszSprz || 0) / 100, ms = i.mnozSprz || 1;
  const taxF = (TAX[i.podatek] || TAX.ryczalt).f, nm = b.loan ? Math.round(+i.lata * 12) : 0, flows = [-b.equity], lata = [];
  for (let k = 1; k <= N; k++) {
    const f = Math.pow(1 + g, k - 1), rev = b.rev * f, opex = (+i.oplaty || 0) * 12 * f + (+i.zarzad || 0) / 100 * rev, noi = rev - opex, tax = taxF(rev, noi);
    const paid = Math.min(12, Math.max(0, nm - 12 * (k - 1))), debt = b.rata * paid, cf = noi - tax - debt;
    flows.push(cf); lata.push({ k, rev, opex, tax, debt, cf });
  }
  const wartosc = (+i.cena) * Math.pow(1 + w, N) * ms, kosztSprz = wartosc * sc, saldo = b.loan ? balance(b.loan, +i.oproc, +i.lata, N * 12) : 0, zeSprzedazy = wartosc - kosztSprz - saldo;
  const gotowka = flows.slice(1).reduce((s, x) => s + x, 0); flows[N] += zeSprzedazy;
  const zysk = gotowka + zeSprzedazy - b.equity, d = i.dyskonto === '' || i.dyskonto == null ? null : +i.dyskonto / 100, r = b.equity > 0 ? irr(flows) : null;
  return { ...b, ok: true, N, flows, lata, wartosc, kosztSprz, saldo, zeSprzedazy, gotowka, zysk, roi: b.equity > 0 ? zysk / b.equity * 100 : null, irr: r == null ? null : r * 100, npv: d == null ? null : npv(d, flows), dyskonto: d == null ? null : d * 100 };
}
const pust0 = i => i.pustostan == null || i.pustostan === '' ? 1 : +i.pustostan;
// Scenariusze: te same założenia widać w tabeli, nie są prognozą.
export const SCEN = [['Pesymistyczny', 'czynsz −10%, pustostan +1 mies., wartość −2 pkt rocznie', -0.1, 1, -2], ['Bazowy', 'Twoje dane', 0, 0, 0], ['Optymistyczny', 'czynsz +10%, pustostan −1 mies., wartość +2 pkt rocznie', 0.1, -1, 2]];
export function scenarios(i) {
  return SCEN.map(([name, opis, cz, p, w]) => ({ name, opis, r: holdCalc({ ...i, czynsz: +i.czynsz * (1 + cz), pustostan: Math.min(12, Math.max(0, pust0(i) + p)), wzrost: (+i.wzrost || 0) + w }) }));
}
// Symulacje jednej zmiany naraz, względem Twoich danych
export function whatIf(i) {
  const base = holdCalc(i); if (!base.ok) return [];
  const rows = [['Cena zakupu −5%', { cena: +i.cena * 0.95, pcc: i.pcc === '' || i.pcc == null ? i.pcc : +i.pcc * 0.95 }], ['Czynsz −10%', { czynsz: +i.czynsz * 0.9 }], ['Czynsz +10%', { czynsz: +i.czynsz * 1.1 }], ['Remont +20%', { remont: (+i.remont || 0) * 1.2 }],
    ['Pustostan +2 mies.', { pustostan: Math.min(12, pust0(i) + 2) }], ['Koszty utrzymania +20%', { oplaty: (+i.oplaty || 0) * 1.2 }], ['Wartość przy sprzedaży −10%', { mnozSprz: 0.9 }]];
  if (base.loan) rows.splice(4, 0, ['Oprocentowanie +1 pkt', { oproc: +i.oproc + 1 }]);
  return rows.filter(([, p]) => !('remont' in p && !(+i.remont > 0)) && !('oplaty' in p && !(+i.oplaty > 0))).map(([name, patch]) => { const r = holdCalc({ ...i, ...patch }); return { name, netPost: r.netPost, cfMies: r.cfMies, irr: r.irr, dNet: r.netPost - base.netPost, dIrr: r.irr != null && base.irr != null ? r.irr - base.irr : null }; });
}
