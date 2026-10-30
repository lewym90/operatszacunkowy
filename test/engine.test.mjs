import fs from 'fs'; import assert from 'assert';
import { estimateRent, estimateSale, crossCheckRent, inferDistrict, learnPremiums, wquantile, grossYield, THRESH } from '../js/engine.js';
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

// 2b) segmenty: Felin, nowe, wysoki standard — wynik musi być wyższy niż bez wiedzy o segmencie, a przy braku danych bez zmian
const base = estimateRent(offers, { tryb:'najem', dzielnica:'Felin', m2:29.9, pokoje:2, pietro:3 });
const nw = estimateRent(offers, { tryb:'najem', dzielnica:'Felin', m2:29.9, pokoje:2, pietro:3, rok:2026, standard:'wysoki' });
console.log('FELIN bez segmentu:', Math.round(base.total.mid), '| nowe+wysoki:', Math.round(nw.total.mid), '| pytania:', base.ask.length);
assert.ok(nw.total.mid > base.total.mid * 1.1, 'segment nowe/wysoki musi podnosić wynik');
assert.ok(base.ask.length >= 1, 'bez roku i standardu aplikacja ma o nie zapytać');
const old = estimateRent(offers, { tryb:'najem', dzielnica:'Felin', m2:29.9, pokoje:2, pietro:3, rok:1975, standard:'dobry' });
assert.ok(old.total.mid < nw.total.mid);
const few = estimateRent(offers.slice(0,40), { tryb:'najem', dzielnica:'Śródmieście', m2:40, pokoje:2, pietro:2, rok:2026 });
assert.ok(!few.ok || !few.adjusted, 'przy małej bazie nie wolno stosować korekt');

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
// 4) wielolokalowe: mieszkanie + garaż z osobną ceną lokalu wchodzi, a gdy cena nieruchomości = cena aktu, nie wchodzi; data aktu liczy się do wagi
const C=[...RCN_COLS];
const mk=(id,tran,cena,rodzaj,rynek,rok,fun,m2,cn,data)=>{const r=new Array(C.length).fill(null);const set=(c,v)=>r[C.indexOf(c)]=v;
 set('id',id);set('tran',tran);set('cena',cena);set('rynek',rynek);set('rodzaj',rodzaj);set('rok',rok);set('funkcja',fun);set('izby',fun==='mieszkalna'?2:0);set('kond',2);set('m2',m2);set('ulica','Zana');set('nr','1');set('udzial','1/1');set('lat',51.22);set('lon',22.52);set('cena_nier',cn);set('data',data);return r;};
const rows2=[mk('A1','T1',410000,'sprzedazBezprzetargowa','rynekPierwotny',2026,'mieszkalna',40,380000,'2026-03-01'),mk('A2','T1',410000,'sprzedazBezprzetargowa','rynekPierwotny',2026,'garaz',12,30000,'2026-03-01'),
 mk('B1','T2',500000,'sprzedazBezprzetargowa','rynekPierwotny',2026,'mieszkalna',40,500000,'2026-03-01'),mk('B2','T2',500000,'sprzedazBezprzetargowa','rynekPierwotny',2026,'garaz',12,500000,'2026-03-01'),
 mk('C1','T3',300000,'sprzedazZBonifikata','rynekPierwotny',2026,'mieszkalna',40,300000,'2026-03-01'),
 mk('D1','T4',380000,'sprzedazBezprzetargowa','rynekWtorny',2026,'mieszkalna',40,380000,'2026-03-01')];
const tx2=rcnToObjects({cols:C,rows:rows2});
const ids=tx2.map(t=>t.id.split('#')[0]);
assert.ok(ids.includes('A1')&&!ids.includes('C1')&&!ids.includes('D1'),'filtr rodzaju transakcji');
assert.equal(tx2.find(t=>t.id.startsWith('A1')).cena,380000); assert.equal(tx2.find(t=>t.id.startsWith('A1')).wielolokalowa,false);
assert.equal(tx2.find(t=>t.id.startsWith('B1')).wielolokalowa,true,'cena nieruchomości = cena aktu: wyłączone');
// 5) kontrola ze sprzedażą: syntetycznie czynsz = 0,5% wartości/m² miesięcznie (+szum) na 14 ulicach; pomiar musi to odzyskać
let sd=3; const rn=()=> (sd=(sd*16807)%2147483647)/2147483647;
const sts=Array.from({length:14},(_,i)=>['Ulica'+i,7000+i*500]);
const rowsX=[],offX=[]; sts.forEach(([u,pm],i)=>{ for(let k=0;k<6;k++){const m2=40+k*3; rowsX.push(mk('X'+i+'_'+k,'TX'+i+'_'+k,Math.round(m2*pm*(0.95+rn()*0.1)),'wolnyRynek','rynekWtorny',2026,'mieszkalna',m2,null,'2026-05-01').map((v,j)=>C[j]==='ulica'?u:v)); }
  for(let k=0;k<3;k++) offX.push({id:'ox'+i+k,wlaczone:true,flagi:[],ulica:u,dzielnica:'Śródmieście',m2:40+k*4,pokoje:2,pietro:1,cena:Math.round((40+k*4)*pm*0.005*(0.95+rn()*0.1)),tytul:'x'}); });
const txX=rcnToObjects({cols:C,rows:rowsX});
const subX={tryb:'najem',ulica:'Ulica5',nr:'',dzielnica:'Śródmieście',m2:44,pokoje:2,pietro:1};
const rentX=estimateRent(offX,subX); const cc=crossCheckRent(offX,txX,subX,rentX,{nowTs:Date.parse('2026-10-29')});
console.log('KONTROLA:', cc.ok, 'par:', cc.pairs, 'rentowność %:', cc.grossYieldPct?.toFixed(2), 'R2:', cc.r2?.toFixed(2), 'wyliczony czynsz:', cc.implied && Object.values(cc.implied).map(Math.round));
assert.ok(cc.ok && Math.abs(cc.grossYieldPct-6)<0.7,'odzyskana rentowność ~6%'); assert.ok(cc.r2>0.7);
assert.ok(!crossCheckRent(offX,txX,{...subX,ulica:''},rentX).ok,'bez ulicy brak kontroli');
assert.ok(!crossCheckRent(offX.slice(0,6),txX,subX,rentX).ok,'za mało par = brak kontroli');
// 6) kontrola po DZIELNICACH: 12 dzielnic, czynsz = 0,55% wartości/m² miesięcznie; transakcje bez dzielnicy, przypisane po ulicach znanych z ofert
const rowsD=[],offD=[]; const pmD=i=>6500+i*400;
for(let i=0;i<12;i++){ for(let k=0;k<40;k++){ const m2=35+(k%10)*3, u='S'+i+(k%2?'a':'b'); const r=mk('D'+i+'_'+k,'TD'+i+'_'+k,Math.round(m2*pmD(i)*(0.93+rn()*0.14)),'wolnyRynek','rynekWtorny',2026,'mieszkalna',m2,null,'2026-06-01');
    r[C.indexOf('ulica')]=u; r[C.indexOf('lat')]=51.15+i*0.012+rn()*0.002; r[C.indexOf('lon')]=22.5+rn()*0.002; rowsD.push(r); }
  for(let k=0;k<9;k++){ const m2=36+k*3; offD.push({id:'od'+i+'_'+k,wlaczone:true,flagi:[],ulica:k<3?'S'+i+'a':null,dzielnica:'D'+i,m2,pokoje:2,pietro:1,cena:Math.round(m2*pmD(i)*0.0055*(0.9+rn()*0.2)),tytul:'x'}); } }
const txD=rcnToObjects({cols:C,rows:rowsD});
const subD={tryb:'najem',ulica:'',nr:'',dzielnica:'D5',m2:44,pokoje:2,pietro:1};
const rentD=estimateRent(offD,subD); const cd=crossCheckRent(offD,txD,subD,rentD,{nowTs:Date.parse('2026-10-29')});
console.log('KONTROLA (dzielnice):', cd.ok, cd.unit, cd.pairs, 'przypisano transakcji:', cd.assigned, 'rentowność %:', cd.grossYieldPct?.toFixed(2), 'R2:', cd.r2?.toFixed(2), 'implied:', cd.implied&&Object.values(cd.implied).map(Math.round), 'z ofert:', rentD.ok&&Object.values(rentD.total).map(Math.round), cd.agreement);
assert.ok(cd.ok && cd.unit==='dzielnic' && cd.pairs>=10); assert.ok(Math.abs(cd.grossYieldPct-6.6)<0.8); assert.ok(cd.r2>0.8);
const trueMid=44*pmD(5)*0.0055; assert.ok(Math.abs(cd.implied.mid-trueMid)/trueMid<0.12,'wyliczony czynsz blisko prawdziwego');
// 7) metraż: czynsz/m² ~ m2^-0,5, cena/m² ~ m2^-0,1; mieszkanie 30 m² — bez standaryzacji kontrola zaniżałaby czynsz
const rowsE=[],offE=[]; const trueRent=(i,m2)=>m2*pmD(i)*0.0055*Math.pow(m2/45,-0.5);
for(let i=0;i<12;i++){ for(let k=0;k<40;k++){ const m2=28+(k%12)*5, u='S'+i+(k%2?'a':'b'); const r=mk('E'+i+'_'+k,'TE'+i+'_'+k,Math.round(m2*pmD(i)*Math.pow(m2/45,-0.1)*(0.95+rn()*0.1)),'wolnyRynek','rynekWtorny',2026,'mieszkalna',m2,null,'2026-06-01');
    r[C.indexOf('ulica')]=u; r[C.indexOf('lat')]=51.15+i*0.012+rn()*0.002; r[C.indexOf('lon')]=22.5+rn()*0.002; rowsE.push(r); }
  for(let k=0;k<12;k++){ const m2=28+k*5; offE.push({id:'oe'+i+'_'+k,wlaczone:true,flagi:[],ulica:k<3?'S'+i+'a':null,dzielnica:'D'+i,m2,pokoje:2,pietro:1,cena:Math.round(trueRent(i,m2)*(0.95+rn()*0.1)),tytul:'x'}); } }
const txE=rcnToObjects({cols:C,rows:rowsE}); const subE={tryb:'najem',ulica:'',nr:'',dzielnica:'D5',m2:30,pokoje:1,pietro:1};
const ce=crossCheckRent(offE,txE,subE,null,{nowTs:Date.parse('2026-10-29')}); const tr=trueRent(5,30);
console.log('KONTROLA (metraż 30 m2):', ce.ok, 'implied:', Math.round(ce.implied.mid), 'prawdziwy:', Math.round(tr), 'efekt metrażu:', ce.sizeEffect.rent.toFixed(2), ce.sizeEffect.sale.toFixed(2));
assert.ok(Math.abs(ce.implied.mid-tr)/tr<0.12,'po standaryzacji metrażu blisko prawdy');
// 8) dzielnica z ulicy: ulica bez ofert, ale z transakcjami RCN obok ulic o znanej dzielnicy
const infA=inferDistrict(offD,txD,'S5b'); const infB=inferDistrict(offD,txD,'Nieistniejąca');
console.log('DZIELNICA z ulicy S5b (bez ofert, tylko RCN):', infA&&infA.name, infA&&infA.source, '| nieznana ulica:', infB);
assert.ok(infA&&infA.name==='D5'&&infB===null);
assert.equal(inferDistrict(offD,txD,'S3a').name,'D3'); assert.equal(inferDistrict(offD,txD,'S3a').source,'oferty');
// 9) własne umowy: mają jawne cechy i podwójną wagę; dodanie dwóch umów wysokiego standardu przesuwa wynik ku nim
const own=[{id:'w1',own:true,ulica:'Granata',dzielnica:'Wrotków',m2:52,pokoje:3,pietro:1,cena:3500,tags:{nowe:0,wysoki:1},tytul:'własna umowa',wlaczone:true,flagi:[]},
 {id:'w2',own:true,ulica:'Granata',dzielnica:'Wrotków',m2:28,pokoje:1,pietro:1,cena:2500,tags:{nowe:0,wysoki:1},tytul:'własna umowa',wlaczone:true,flagi:[]}];
const subG={tryb:'najem',dzielnica:'Wrotków',m2:52,pokoje:3,pietro:1,rok:2005,standard:'wysoki'};
const g0=estimateRent(offers,subG), g1=estimateRent([...offers,...own],subG);
console.log('WŁASNE UMOWY: bez:',Math.round(g0.total.mid),'z umowami:',Math.round(g1.total.mid),'| własne wśród porównań:',g1.comps.filter(c=>c.own).length);
assert.ok(g1.comps.some(c=>c.own)&&g1.total.mid>g0.total.mid,'własna umowa podnosi wynik ku swojej wartości'); assert.ok(g1.total.mid<3500,'nie przejmuje całkowicie wyniku');
// 10) cechy z filtrów: syntetycznie klimatyzacja +10%, meble +12%, winda 0%; pomiar ma to odzyskać, a bez oznaczeń nie wolno mierzyć
const offA=[]; for(let i=0;i<320;i++){ const m2=30+Math.floor(rn()*40), kl=rn()<0.4?1:0, mb=rn()<0.5?1:0, wd=rn()<0.5?1:0;
  offA.push({id:'oa'+i,wlaczone:true,flagi:[],dzielnica:'D'+(i%5),ulica:null,m2,pokoje:m2<38?1:m2<55?2:3,pietro:1,cena:Math.round(m2*55*Math.pow(m2/40,-0.5)*(kl?1.10:1)*(mb?1.12:1)*(0.92+rn()*0.16)),tytul:'x',attrs:{klima:kl,meble:mb,winda:wd}}); }
const LA=learnPremiums(offA);
console.log('CECHY: klima', (LA.attr.klima.pct*100).toFixed(1)+'%', LA.attr.klima.sig, '| meble', (LA.attr.meble.pct*100).toFixed(1)+'%', LA.attr.meble.sig, '| winda', (LA.attr.winda.pct*100).toFixed(1)+'%', LA.attr.winda.sig, '| garaż wspierany:', LA.attr.garaz.supported);
assert.ok(LA.attr.klima.sig&&LA.attr.klima.pct>0.04&&LA.attr.klima.pct<0.17); assert.ok(LA.attr.meble.sig&&LA.attr.meble.pct>0.06&&LA.attr.meble.pct<0.2); assert.ok(!LA.attr.winda.sig,'cecha bez wpływu nie jest istotna'); assert.ok(!LA.attr.garaz.supported);
const sub0={tryb:'najem',dzielnica:'D2',m2:50,pokoje:2,pietro:1}, rA0=estimateRent(offA,{...sub0,attrs:{klima:0,winda:0},meble:'nie'}), rA1=estimateRent(offA,{...sub0,attrs:{klima:1,winda:0},meble:'tak'});
console.log('MIESZKANIE bez klimy i mebli:',Math.round(rA0.total.mid),'| z klimą i meblami:',Math.round(rA1.total.mid),'| iloraz',(rA1.total.mid/rA0.total.mid).toFixed(2));
assert.ok(rA1.total.mid/rA0.total.mid>1.12&&rA1.total.mid/rA0.total.mid<1.30);
const noTag=offA.map(o=>({...o,attrs:undefined})); assert.ok(!learnPremiums(noTag).attr.klima.supported,'bez oznaczeń nie mierzymy');
console.log('TESTY OK');

// ---- najem innych kategorii ----
{
  const { estimateRentKat, estimateRent: eR } = await import('../js/engine.js');
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
