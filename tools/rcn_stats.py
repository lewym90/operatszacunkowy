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
print('lata aktów (mieszkalna, wolny rynek):', ', '.join(f"{k}={v}" for k, v in sorted(Counter(g(r, 'rok') for r in W).items(), key=lambda x: (x[0] is None, x[0] or 0))))
print('piętro (kond):', ', '.join(f"{k}={v}" for k, v in sorted(Counter(g(r, 'kond') for r in W).items(), key=lambda x: (x[0] is None, x[0] or 0))[:12]))
print('udział ≠ 1/1:', sum(1 for r in W if g(r, 'udzial') not in (None, '', '1/1')))
pm = sorted(g(r, 'cena') / g(r, 'm2') for r in W if g(r, 'cena') and g(r, 'm2') and g(r, 'rok') in (2025, 2026))
if pm: print('zł/m² 2025-26: 10%%=%d  mediana=%d  90%%=%d  (n=%d)' % (pm[len(pm) // 10], pm[len(pm) // 2], pm[len(pm) * 9 // 10], len(pm)))
la = [g(r, 'lat') for r in W if g(r, 'ulica')]
print('próbka adresów:', [(g(r, 'ulica'), g(r, 'nr')) for r in W[:: max(1, len(W) // 6)] if g(r, 'ulica')][:6])

print('\n--- ceny za m² wg rodzaju transakcji i rynku (mieszkalna, 1 lokal w transakcji, akty 2025-26) ---')
M = [r for r in R if g(r, 'funkcja') == 'mieszkalna' and tc[g(r, 'tran')] == 1 and g(r, 'cena') and (g(r, 'm2') or 0) >= 12 and g(r, 'rok') in (2025, 2026)]
grp = {}
for r in M: grp.setdefault((g(r, 'rodzaj'), g(r, 'rynek') or '-'), []).append(g(r, 'cena') / g(r, 'm2'))
for k, v in sorted(grp.items(), key=lambda x: -len(x[1])):
    v.sort(); print(f"{k[0]:34s} {k[1]:15s} n={len(v):5d}  10%={v[len(v) // 10]:6.0f}  mediana={v[len(v) // 2]:6.0f}  90%={v[len(v) * 9 // 10]:6.0f}")

if 'sprz' in I:
    print('\n--- typ sprzedającego (mieszkalna, 1 lokal, akty 2025-26) ---')
    g2 = {}
    for r in M: g2.setdefault((g(r, 'rodzaj'), g(r, 'rynek') or '-', g(r, 'sprz') or '-'), []).append(g(r, 'cena') / g(r, 'm2'))
    for k, v in sorted(g2.items(), key=lambda x: -len(x[1]))[:8]:
        v.sort(); print(f"{k[0][:22]:22s} {k[1]:14s} {k[2]:14s} n={len(v):5d}  10%={v[len(v)//10]:6.0f}  mediana={v[len(v)//2]:6.0f}  90%={v[len(v)*9//10]:6.0f}")
    print('\n--- data aktu ---')
    dt = [g(r, 'data') for r in R if g(r, 'data')]
    print('z datą:', len(dt), 'z', len(R), '| zakres:', min(dt) if dt else None, '–', max(dt) if dt else None)
    print('ostatnie 12 miesięcy (mieszkalna, wolny rynek+pierwotny bezprzetargowa):', sum(1 for r in R if g(r, 'data') and g(r, 'data') >= '2025-11-01' and g(r, 'funkcja') == 'mieszkalna'))
    print('\n--- ceny samego lokalu/nieruchomości ---')
    multi = [r for r in R if tc[g(r, 'tran')] > 1 and g(r, 'funkcja') == 'mieszkalna']
    print('mieszkalna w transakcjach wielolokalowych:', len(multi), '| z ceną lokalu:', sum(1 for r in multi if g(r, 'cena_lok')), '| z ceną nieruchomości:', sum(1 for r in multi if g(r, 'cena_nier')))
    one = [r for r in R if tc[g(r, 'tran')] == 1 and g(r, 'funkcja') == 'mieszkalna' and g(r, 'cena')]
    eq = sum(1 for r in one if g(r, 'cena_nier') and abs(g(r, 'cena_nier') - g(r, 'cena')) < 1); print('1 lokal: cena nieruchomości = cena transakcji w', eq, 'z', len(one), 'przypadków')

if 'cena_nier' in I:
    print('\n--- CZY cena_nier TO CENA SAMEGO LOKALU? (mieszkalna, akty 2025-26, rynek pierwotny/wolny) ---')
    MM = [r for r in R if g(r, 'funkcja') == 'mieszkalna' and tc[g(r, 'tran')] > 1 and (g(r, 'm2') or 0) >= 12 and g(r, 'rok') in (2025, 2026) and g(r, 'cena_nier')]
    same = sum(1 for r in MM if abs(g(r, 'cena_nier') - g(r, 'cena')) < 1)
    print('wielolokalowe: n=', len(MM), '| cena_nier = cena całej transakcji:', same)
    a = sorted(g(r, 'cena_nier') / g(r, 'm2') for r in MM); b = sorted(g(r, 'cena') / g(r, 'm2') for r in MM)
    if a: print('zł/m² wg ceny nieruchomości: 10%%=%d mediana=%d 90%%=%d' % (a[len(a)//10], a[len(a)//2], a[len(a)*9//10]))
    if b: print('zł/m² wg ceny całej transakcji: 10%%=%d mediana=%d 90%%=%d' % (b[len(b)//10], b[len(b)//2], b[len(b)*9//10]))
    ex = [r for r in MM if g(r, 'rodzaj') == 'sprzedazBezprzetargowa'][:3]
    for r in ex:
        t = [x for x in R if g(x, 'tran') == g(r, 'tran')]
        print('przykład transakcji:', [(g(x, 'funkcja'), g(x, 'm2'), g(x, 'cena_nier'), g(x, 'cena')) for x in t])
