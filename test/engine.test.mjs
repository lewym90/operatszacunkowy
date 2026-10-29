import fs from 'fs'; import assert from 'assert';
import { estimateRent, estimateSale, wquantile, grossYield, THRESH } from '../js/engine.js';
import { rcnToObjects, RCN_COLS } from '../js/rcn.js';

// 1) kwantyle
assert.equal(wquantile([{v:1,w:1},{v:2,w:1},{v:3,w:1}],0.5),2);
assert.ok(wquantile([{v:1,w:1},{v:2,w:1},{v:3,w:1},{v:4,w:1}],0.25) < wquantile([{v:1,w:1},{v:2,w:1},{v:3,w:1},{v:4,w:1}],0.75));

// 2) najem na PRAWDZIWYCH ofertach z Twoich PDF-ów
const offers = JSON.parse(fs.readFileSync(process.argv[2],'utf8')).map((o,i)=>({...o,id:'o'+i,wlaczone:true}));
const s1 = { tryb:'najem', dzielnica:'Śródmieście', m2:40, pokoje:2, pietro:2 };
const r1 = estimateRent(offers, s1);
console.log('NAJEM Śródmieście 40 m², 2 pok.:', r1.ok, r1.n, 'porównań', r1.total && [r1.total.lo,r1.total.mid,r1.total.hi].map(Math.round), r1.confidence.level, r1.rangeKind);
assert.ok(r1.ok && r1.total.lo < r1.total.mid && r1.total.mid < r1.total.hi);
const s2 = { tryb:'najem', dzielnica:'Wsie Nieistniejące', m2:200, pokoje:6, pietro:1 };
const r2 = estimateRent(offers, s2);
console.log('NAJEM egzotyczny:', r2.ok, r2.reason || '', r2.confidence?.level);
assert.ok(!r2.ok || r2.confidence.level === 'niska');   // brak danych => brak wyniku albo niska pewność, nigdy "wysoka"
const only3 = offers.slice(0,3);
const r3 = estimateRent(only3, { tryb:'najem', dzielnica:'Śródmieście', m2:40, pokoje:2, pietro:2 });
console.log('NAJEM, tylko 3 oferty w bazie:', r3.ok, r3.reason||'', r3.confidence?.level);
assert.ok(!r3.ok || r3.confidence.level==='niska');

// 3) sprzedaż: SYNTETYCZNE transakcje (wyłącznie test logiki)
let seed = 7; const rnd = () => (seed = (seed*16807)%2147483647)/2147483647;
const rows=[]; const streets=[['Bluszczowa',51.2301,22.5502],['Lipowa',51.2480,22.5600],['Zana',51.2200,22.5200]];
for(let i=0;i<300;i++){ const [u,la,lo]=streets[i%3]; const m2=Math.round(28+rnd()*50); const pm=9500+rnd()*2500+(u==='Bluszczowa'?800:0);
  rows.push(['L'+i,'T'+i,Math.round(m2*pm),'rynekWtorny','wolnyRynek',2024+Math.floor(rnd()*2),'mieszkalna',m2<35?1:m2<55?2:3,Math.floor(rnd()*5),m2,4,u,String(1+i%20),null,la+rnd()*0.002,lo+rnd()*0.002]); }
rows.push(['G1','T900',25500,'rynekWtorny','wolnyRynek',2024,'garaz',0,-1,1294,null,'Bluszczowa','13',null,51.2301,22.5502]);
rows.push(['M1','T901',900000,'rynekWtorny','wolnyRynek',2025,'mieszkalna',2,1,44,3,'Bluszczowa','13',null,51.2301,22.5502]);  // wielolokalowa
rows.push(['M2','T901',900000,'rynekWtorny','wolnyRynek',2025,'garaz',0,-1,15,null,'Bluszczowa','13',null,51.2301,22.5502]);
rows.push(['P1','T902',50000,'rynekWtorny','przetarg',2025,'mieszkalna',2,1,44,3,'Bluszczowa','13',null,51.2301,22.5502]);   // nie wolny rynek
const tx = rcnToObjects({cols:RCN_COLS,rows});
console.log('RCN: rekordów po konwersji', tx.length, '(wielolokalowych:', tx.filter(t=>t.wielolokalowa).length+')');
assert.ok(!tx.some(t=>t.id.startsWith('P1')));
const sale = estimateSale(tx, { tryb:'sprzedaz', ulica:'Bluszczowa', nr:'13', m2:44, pokoje:2, pietro:2, rynek:'wtorny' }, {year:2026});
console.log('SPRZEDAŻ:', sale.ok, sale.n, sale.total && [sale.total.lo,sale.total.mid,sale.total.hi].map(Math.round), sale.confidence.level);
assert.ok(sale.ok);
assert.ok(!sale.comps.some(c=>c.id.startsWith('M1')), 'transakcja wielolokalowa nie może być porównaniem');
assert.ok(sale.total.mid > 44*9000 && sale.total.mid < 44*13500);
// rok budowy: gdy podano, a porównania go nie znają, nie znikają, tylko mają niższą wagę
const saleY = estimateSale(tx, { tryb:'sprzedaz', ulica:'Bluszczowa', nr:'13', m2:44, pokoje:2, pietro:2, rok:1972 }, {year:2026});
console.log('SPRZEDAŻ z rokiem budowy 1972:', saleY.ok, saleY.n, saleY.notes.filter(n=>n.includes('Rok budowy')));
assert.ok(saleY.ok && saleY.n>0);
const y = grossYield(sale, r1); console.log('Rentowność brutto (orient.):', y && Object.values(y).map(v=>v.toFixed(1)));
console.log('TESTY OK');
