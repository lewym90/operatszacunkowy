#!/usr/bin/env python3
"""Podsumowanie pliku RCN: skąd się biorą odrzucenia i jak kompletne są pola. Tylko odczyt. Użycie: python3 rcn_stats.py rcn_lublin.json"""
import json, sys
from collections import Counter
d = json.load(open(sys.argv[1], encoding='utf-8')); I = {c: i for i, c in enumerate(d['cols'])}; R = d['rows']
g = lambda r, c: r[I[c]]
def top(c, n=8): return ', '.join(f"{k or '(puste)'}={v}" for k, v in Counter(g(r, c) for r in R).most_common(n))
print('rekordów:', len(R)); print('rodzaj transakcji:', top('rodzaj')); print('rynek:', top('rynek')); print('funkcja:', top('funkcja'))
tc = Counter(g(r, 'tran') for r in R); print('transakcje z >1 lokalem:', sum(1 for v in tc.values() if v > 1), 'z', len(tc))
W = [r for r in R if g(r, 'rodzaj') == 'wolnyRynek' and g(r, 'funkcja') == 'mieszkalna' and (g(r, 'm2') or 0) >= 12]
print('wolny rynek + mieszkalna:', len(W), '| z ulicą:', sum(1 for r in W if g(r, 'ulica')), '| z ceną:', sum(1 for r in W if g(r, 'cena')), '| z izbami:', sum(1 for r in W if g(r, 'izby')))
print('lata aktów (mieszkalna, wolny rynek):', ', '.join(f"{k}={v}" for k, v in sorted(Counter(g(r, 'rok') for r in W).items())))
print('piętro (kond):', ', '.join(f"{k}={v}" for k, v in sorted(Counter(g(r, 'kond') for r in W).items(), key=lambda x: (x[0] is None, x[0] or 0))[:12]))
print('udział ≠ 1/1:', sum(1 for r in W if g(r, 'udzial') not in (None, '', '1/1')))
pm = sorted(g(r, 'cena') / g(r, 'm2') for r in W if g(r, 'cena') and g(r, 'm2') and g(r, 'rok') in (2025, 2026))
if pm: print('zł/m² 2025-26: 10%%=%d  mediana=%d  90%%=%d  (n=%d)' % (pm[len(pm) // 10], pm[len(pm) // 2], pm[len(pm) * 9 // 10], len(pm)))
la = [g(r, 'lat') for r in W if g(r, 'ulica')]
print('próbka adresów:', [(g(r, 'ulica'), g(r, 'nr')) for r in W[:: max(1, len(W) // 6)] if g(r, 'ulica')][:6])
