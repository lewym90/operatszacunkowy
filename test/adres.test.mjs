// Dane nieruchomości przekazane w adresie (np. z Mojej Agencji) — odczyt i odrzucanie błędnych wartości.
import assert from 'node:assert/strict';
import { daneZAdresu } from '../js/adres.js';

assert.equal(daneZAdresu('#/wycena'), null);
assert.equal(daneZAdresu('#/start?m2=50'), null);
const f = daneZAdresu('#/wycena?tryb=najem&kat=dom&ulica=Lipowa&nr=7a&dzielnica=Czuby&m2=120,5&dzm2=600&pokoje=5&pietro=2&rok=1998');
assert.deepEqual(f, { kat: 'dom', pod: '', ulica: 'Lipowa', nr: '7a', dzielnica: 'Czuby', m2: '120.5', dzm2: '600', pietro: 2, rok: '1998', tryb: 'najem', pokoje: 5 });
const z = daneZAdresu('#/wycena?tryb=kradziez&kat=zamek&m2=-3&pokoje=99&pietro=abc&rok=12');
assert.equal(z.tryb, undefined); assert.equal(z.kat, 'mieszkanie'); assert.equal(z.m2, '');
assert.equal(z.pokoje, undefined); assert.equal(z.pietro, null); assert.equal(z.rok, '');
assert.equal(daneZAdresu('#wycena?ulica=' + 'x'.repeat(200)).ulica.length, 80);
console.log('adres: OK');
