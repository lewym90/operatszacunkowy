#!/usr/bin/env bash
# Testy niewymagające prywatnych danych (używane w CI i lokalnie): jednostkowe + przeglądarkowe na danych syntetycznych.
set -euo pipefail
cd "$(dirname "$0")/.."
SP="${1:-$(mktemp -d)}"
node test/ulice.test.mjs
node test/rynek.test.mjs
[ -f test/invest.test.mjs ] && node test/invest.test.mjs
bash test/sync.sh
node test/lock.cjs
node test/rynek.cjs "$SP"
node test/chips.cjs "$SP"
node test/teczka.cjs "$SP"
node test/raport.cjs "$SP"
node test/kalkulator.cjs "$SP"
echo "WSZYSTKIE TESTY OK"
