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
