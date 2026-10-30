import { estimateRentKat, estimateRent as eR } from '../js/engine.js';
// ---- najem innych kategorii ----
{
  const few = [{ kat: 'dom', m2: 120, cena: 5000, ulica: 'A', wlaczone: true, flagi: [] }];
  const r0 = estimateRentKat(few, { kat: 'dom', m2: 130, ulica: 'A' }); if (r0.ok) throw new Error('1 pozycja nie powinna dać wyniku');
  const many = []; for (let i = 0; i < 8; i++) many.push({ id: 'h' + i, kat: 'lokal', m2: 40 + i * 5, cena: (40 + i * 5) * 50, ulica: 'B', dzielnica: 'Czuby', wlaczone: true, flagi: [], own: true });
  const r1 = estimateRentKat(many, { kat: 'lokal', m2: 60, ulica: 'B', dzielnica: 'Czuby' }); if (!r1.ok || Math.abs(r1.pm2.mid - 50) > 1 || r1.confidence.level !== 'niska') throw new Error('lokal: ' + JSON.stringify(r1.pm2));
  // oferty innych kategorii nie mogą wpływać na wycenę mieszkania
  const fl = []; for (let i = 0; i < 12; i++) fl.push({ id: 'f' + i, cena: 2500 + i * 10, m2: 45, pokoje: 2, pietro: 2, dzielnica: 'Czuby', ulica: 'X', wlaczone: true, flagi: [] });
  const a = eR(fl, { tryb: 'najem', kat: 'mieszkanie', dzielnica: 'Czuby', m2: 45, pokoje: 2, pietro: 2 }), b = eR(fl.concat(many), { tryb: 'najem', kat: 'mieszkanie', dzielnica: 'Czuby', m2: 45, pokoje: 2, pietro: 2 });
  if (!a.ok || a.total.mid !== b.total.mid) throw new Error('inne kategorie wpływają na mieszkanie');
  console.log('najem kategorii: OK');
}
