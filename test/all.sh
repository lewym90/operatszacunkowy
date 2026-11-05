#!/usr/bin/env bash
# Testy niewymagające prywatnych danych (używane w CI i lokalnie): jednostkowe + przeglądarkowe na danych syntetycznych.
set -euo pipefail
cd "$(dirname "$0")/.."
# Straznik: pusty/niezgodny service worker psuje tryb offline i aktualizacje (zdarzylo sie w 1.20.0-1.21.2)
V=$(grep -o "const VERSION = '[0-9.]*'" js/app.js | grep -o "[0-9][0-9.]*")
[ -s sw.template.js ] && [ -s sw.js ] && grep -q "am-wycena-v$V" sw.template.js && grep -q "am-wycena-v$V" sw.js || { echo "BLAD: sw.js/sw.template.js puste albo wersja != $V (uruchom: python3 tools/mksw.py . )"; exit 1; }
# Straznik: serwer musi znac kazda kolekcje z aplikacji, inaczej po cichu ja odrzuca (tak bylo z teczkami)
node -e "const f=require('fs'),a=f.readFileSync('js/app.js','utf8').slice(0,f.readFileSync('js/app.js','utf8').indexOf('let syncOn')),k=[...a.matchAll(/^  (\w+): \{ read:/gm)].map(m=>m[1]),c=f.readFileSync('server/sync_server.py','utf8').match(/COLLS = \{(.*)\}/)[1];const b=k.filter(x=>!c.includes(\"'\"+x+\"'\"));if(!k.length||b.length){console.log('BLAD: serwer nie zna kolekcji',k,b);process.exit(1)}"
SP="${1:-$(mktemp -d)}"
node test/ulice.test.mjs
node test/najemkat.test.mjs
node test/jakosc.test.mjs
if grep -rIilE 'dorad' js css index.html manifest.webmanifest sw.template.js server tools; then echo 'FAIL: niedozwolone słowo z rdzenia dorad'; exit 1; fi
node test/ogledziny.test.mjs
node test/rynek.test.mjs
[ -f test/invest.test.mjs ] && node test/invest.test.mjs
bash test/sync.sh
node test/lock.cjs
node test/start.cjs
node test/geokod.test.mjs
node test/rynek.cjs "$SP"
node test/chips.cjs "$SP"
node test/teczka.cjs "$SP"
node test/raport.cjs "$SP"
node test/analiza.cjs "$SP"
node test/kalkulator.cjs "$SP"
node test/osm.cjs
python3 test/osm_analiza_test.py
python3 test/osm_silnik_test.py
node test/najem_test.cjs
echo "WSZYSTKIE TESTY OK"
