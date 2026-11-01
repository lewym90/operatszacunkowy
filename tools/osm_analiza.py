#!/usr/bin/env python3
"""Czy otoczenie (punkty z OpenStreetMap) wyjaśnia różnice cen mieszkań ponad to, co daje położenie i parametry mieszkania?
Dane: rcn_lublin.json (transakcje RCN) + osm_lublin.json (punkty). Tylko biblioteka standardowa.
Metoda: ridge na log(cena/m²), walidacja krzyżowa 5-krotna (błąd liczony na transakcjach, których model nie widział).
  M0 = metraż, pokoje, czas                      (bez położenia)
  M1 = M0 + położenie (średnia z 20 najbliższych transakcji + wielomian lat/lon)   <- tak działa wycena dziś
  M1+warstwa = M1 + otoczenie jednej warstwy, M1+wszystkie = M1 + otoczenie wszystkich warstw
  M0+otoczenie = M0 + otoczenie wszystkich warstw (co samo otoczenie mówi o cenie, bez położenia)
Użycie: python3 osm_analiza.py rcn_lublin.json osm_lublin.json"""
import json, math, random, re, statistics, sys

def load(p): return json.load(open(p, encoding='utf-8'))

def prep(rcn):
    # Te same reguły co w aplikacji (js/rcn.js + engine.js): wolny rynek lub pierwotna bezprzetargowa, pełna własność, cena samego lokalu.
    C = {c: i for i, c in enumerate(rcn['cols'])}; cnt = {}
    for r in rcn['rows']: cnt[r[C['tran']]] = cnt.get(r[C['tran']], 0) + 1
    rows, seen = [], set()
    for r in rcn['rows']:
        g = lambda k: r[C[k]]
        if g('funkcja') != 'mieszkalna': continue
        if not (g('rodzaj') == 'wolnyRynek' or (g('rodzaj') == 'sprzedazBezprzetargowa' and g('rynek') == 'rynekPierwotny')): continue
        key = (g('id'), g('tran'))
        if key in seen: continue
        seen.add(key)
        u = g('udzial')
        if not (u is None or u == '' or re.match(r'^1(/1|\.0+)?$', str(u).strip())): continue
        cenaTr = float(g('cena') or 0); cenaN = float(g('cena_nier') or 0); multi = cnt[g('tran')] > 1; split = multi and 0 < cenaN < cenaTr - 1
        if multi and not split: continue
        cena = cenaN if split else cenaTr; m2 = float(g('m2') or 0); izby = float(g('izby') or 0)
        d = str(g('data') or '')
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', d) or not (2005 <= int(d[:4]) <= 2030): continue
        if not (cena > 0 and 12 <= m2 <= 250 and izby > 0) or g('lat') is None or g('lon') is None: continue
        rows.append(dict(y=math.log(cena / m2), m2=m2, izby=izby, t=int(d[:4]) + (int(d[5:7]) - 1) / 12, lat=g('lat'), lon=g('lon')))
    if len(rows) < 100: return rows
    ys = sorted(r['y'] for r in rows); lo, hi = ys[int(len(ys) * .01)], ys[int(len(ys) * .99)]
    return [r for r in rows if lo <= r['y'] <= hi]

KX = 111.32 * 0.6258  # km na stopień długości przy ~51,2°N
KY = 111.32
CELL = 0.005

class Grid:
    def __init__(s, pts):
        s.pts = pts; s.g = {}
        for i, (la, lo) in enumerate(pts): s.g.setdefault((int(la / CELL), int(lo / CELL)), []).append(i)
    def ring(s, la, lo, r):
        cy, cx = int(la / CELL), int(lo / CELL)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dy), abs(dx)) == r: yield from s.g.get((cy + dy, cx + dx), ())
    def dist(s, a, b): return math.hypot((a[0] - b[0]) * KY, (a[1] - b[1]) * KX)
    def nearest(s, la, lo, maxr=60):
        best = 1e9
        for r in range(maxr):
            for i in s.ring(la, lo, r): best = min(best, s.dist((la, lo), s.pts[i]))
            if best < 1e9 and best <= r * CELL * KY * .55: break
        return best * 1000
    def within(s, la, lo, km):
        r = int(km / (CELL * KX)) + 1; n = 0
        for rr in range(r + 1):
            for i in s.ring(la, lo, rr):
                if s.dist((la, lo), s.pts[i]) <= km: n += 1
        return n

def solve(A, b):
    n = len(A); M = [A[i][:] + [b[i]] for i in range(n)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[p] = M[p], M[c]
        pv = M[c][c] or 1e-12
        for j in range(c, n + 1): M[c][j] /= pv
        for r in range(n):
            if r != c and M[r][c]:
                f = M[r][c]
                for j in range(c, n + 1): M[r][j] -= f * M[c][j]
    return [M[i][n] for i in range(n)]

def fit(X, y, lam=1.0):
    p = len(X[0]); mu = [sum(x[j] for x in X) / len(X) for j in range(p)]; sd = [math.sqrt(sum((x[j] - mu[j]) ** 2 for x in X) / len(X)) or 1 for j in range(p)]
    Z = [[(x[j] - mu[j]) / sd[j] for j in range(p)] + [1.0] for x in X]; q = p + 1
    A = [[0.0] * q for _ in range(q)]; b = [0.0] * q
    for z, t in zip(Z, y):
        for i in range(q):
            zi = z[i]; b[i] += zi * t; Ai = A[i]
            for j in range(i, q): Ai[j] += zi * z[j]
    for i in range(q):
        for j in range(i): A[i][j] = A[j][i]
    for i in range(p): A[i][i] += lam
    w = solve(A, b); return mu, sd, w

def pred(model, x):
    mu, sd, w = model; return sum(w[j] * (x[j] - mu[j]) / sd[j] for j in range(len(mu))) + w[-1]

def knn_feature(rows, train_idx, k=20):
    g = Grid([(rows[i]['lat'], rows[i]['lon']) for i in train_idx]); ts = set(train_idx); res = {}
    for i, r in enumerate(rows):
        c = []; rr = 0
        while rr < 80:
            for j in g.ring(r['lat'], r['lon'], rr):
                gi = train_idx[j]
                if gi != i: c.append((g.dist((r['lat'], r['lon']), g.pts[j]), rows[gi]['y'] - .0 * 0))
            if len(c) >= k * 2 and rr >= 1: break
            rr += 1
        c.sort(); top = c[:k]; res[i] = sum(v for _, v in top) / len(top) if top else 0.0
    return res

def main():
    rcn, osm = load(sys.argv[1]), load(sys.argv[2]); rows = prep(rcn); n = len(rows)
    print(f'Transakcje do analizy: {n} (mieszkania, rynek jak w wycenie, pełna własność, cena samego lokalu)')
    if n < 500: sys.exit('Za mało transakcji do rzetelnego testu.')
    print(f'(Uwaga: modele uczone na wszystkich latach naraz, z czasem jako zmienną.)')
    L = osm['layers']; names = osm['meta'].get('nazwy', {})
    poi = {}
    for k, pts in L.items():
        if len(pts) < 5: continue
        g = Grid([tuple(p) for p in pts])
        poi[k] = [[math.log(g.nearest(r['lat'], r['lon']) + 50), math.log1p(g.within(r['lat'], r['lon'], .5))] for r in rows]
    t0 = min(r['t'] for r in rows); lat0 = statistics.mean(r['lat'] for r in rows); lon0 = statistics.mean(r['lon'] for r in rows)
    base = [[math.log(r['m2']), r['izby'], r['t'] - t0, (r['t'] - t0) ** 2] for r in rows]
    geo = [[(r['lat'] - lat0) * KY, (r['lon'] - lon0) * KX] for r in rows]; geo = [g + [g[0] ** 2, g[1] ** 2, g[0] * g[1]] for g in geo]
    y = [r['y'] for r in rows]; idx = list(range(n)); random.Random(7).shuffle(idx); K = 5; folds = [idx[i::K] for i in range(K)]
    models = {'M0 bez położenia': (None, []), 'M1 położenie (dziś)': ('loc', [])}
    for k in poi: models[f'M1 + {names.get(k, k)}'] = ('loc', [k])
    models['M1 + wszystkie warstwy'] = ('loc', list(poi)); models['M0 + same warstwy (bez położenia)'] = (None, list(poi))
    oof = {m: [0.0] * n for m in models}
    for f in range(K):
        te = set(folds[f]); tr = [i for i in idx if i not in te]; kn = knn_feature(rows, tr)
        for m, (loc, ps) in models.items():
            def X(i): return base[i] + ([kn[i]] + geo[i] if loc else []) + [v for p in ps for v in poi[p][i]]
            mod = fit([X(i) for i in tr], [y[i] for i in tr])
            for i in te: oof[m][i] = pred(mod, X(i))
    def err(m): return [abs(math.exp(oof[m][i] - y[i]) - 1) for i in range(n)]
    ref = err('M1 położenie (dziś)')
    print(f'\n{"Model":44s}{"średni błąd":>13s}{"mediana błędu":>15s}{"zmiana wobec M1":>17s}{"t":>7s}  wniosek')
    for m in models:
        e = err(m); d = [a - b for a, b in zip(ref, e)]; md = sum(d) / n; se = statistics.pstdev(d) / math.sqrt(n) or 1e-9; tt = md / se
        verdict = '' if m.startswith('M0') or m == 'M1 położenie (dziś)' else ('POMAGA' if md > 0.001 and tt > 2.5 else ('szkodzi' if md < -0.001 and tt < -2.5 else 'bez znaczenia'))
        print(f'{m:44s}{sum(e) / n * 100:12.2f}%{statistics.median(e) * 100:14.2f}%{md * 100:+16.2f} pp{tt:7.1f}  {verdict}')
    print('\n"zmiana wobec M1" = o ile punktów procentowych spada średni błąd po dodaniu otoczenia (dodatnia = lepiej). t > 2,5 = różnica większa niż szum.')
    print('Wdrażać do wyceny tylko warstwy oznaczone POMAGA.')

if __name__ == '__main__': main()
