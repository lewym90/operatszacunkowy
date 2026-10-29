#!/usr/bin/env python3
"""Podsumowanie pliku rcn_inne.json (bez danych osobowych): wypełnienie pól, rozkłady kategorii, kilka przykładowych wierszy."""
import collections as C, json, sys
p = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/var/www/operat-data/rcn_inne.json'))
c, r = p['cols'], p['rows']; ix = {k: i for i, k in enumerate(c)}
print(p['meta'])
for k in ['nier', 'rodzaj', 'rynek', 'bud_rodz', 'dz_przezn', 'dz_sposob', 'wiele', 'n_bud', 'n_dz', 'prawo']:
    print(k, C.Counter(x[ix[k]] for x in r).most_common(14))
for k in ['cena', 'cena_nier', 'bud_m2', 'pow_gr', 'dz_m2', 'data', 'lat', 'ulica']:
    print(k, 'wypelnione', sum(1 for x in r if x[ix[k]] not in (None, '')), 'z', len(r))
ds = sorted(x[ix['data']] for x in r if x[ix['data']])
if ds: print('daty', ds[0], ds[-1])
for x in r[:3]: print({k: v for k, v in zip(c, x) if k != 'sprz'})
