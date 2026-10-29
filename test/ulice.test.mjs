import { streetKey, addrKey, migrateAddrKey, inferDistrict } from '../js/engine.js';
import assert from 'node:assert/strict';
const eq = (a, b) => assert.equal(streetKey(a), streetKey(b), `${a} vs ${b}`);
const ne = (a, b) => assert.notEqual(streetKey(a), streetKey(b), `${a} vs ${b}`);
eq('Granata', 'Ks. Wincentego Granata'); eq('ul. Granata', 'Wincentego Granata'); eq('Leszczyńskiego', 'Stanisława Leszczyńskiego');
eq('Kunickiego', 'Władysława Kunickiego'); eq('Zana', 'ul. Witolda Zana'); eq('Aleje Racławickie', 'Racławickie'); eq('Bluszczowa', 'ul. Bluszczowa');
eq('Jana Pawła II', 'Pawła II'); eq('Lubelskiego Lipca 80', 'Lipca 80');
eq('Okrzei 12', 'Stefana Okrzei'); eq('Nałęczowska 16A', 'Nałęczowska'); eq('Leszka Czarnego 1', 'Czarnego'); eq('3 Maja', 'ul. 3 Maja'); ne('3 Maja', '1 Maja');
ne('Lipowa', 'Lipca 80'); ne('Bluszczowa', 'Granata'); ne('Jana Pawła II', 'Jana Kochanowskiego');
assert.equal(addrKey('Ks. Wincentego Granata', '5'), 'granata|5');
assert.equal(migrateAddrKey('ks wincentego granata|5'), 'granata|5'); assert.equal(migrateAddrKey('bluszczowa|13'), 'bluszczowa|13');
// dzielnica z ulicy: oferty z „Granata” podpowiadają dzielnicę dla „Ks. Wincentego Granata”
const offers = [{ ulica: 'Granata', dzielnica: 'Wrotków' }, { ulica: 'ul. Granata', dzielnica: 'Wrotków' }];
assert.equal(inferDistrict(offers, [], 'Ks. Wincentego Granata').name, 'Wrotków');
console.log('ULICE OK');
