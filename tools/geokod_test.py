#!/usr/bin/env python3
"""Sprawdza geokoder UUG (GUGiK, punkty adresowe PRG) na prawdziwych adresach z RCN: ile znajduje i jak daleko od RCN leży jego punkt.
RCN służy tu TYLKO jako niezależna kontrola jakości; w aplikacji współrzędne do odległości będą pochodzić wyłącznie z PRG.
Użycie: python3 geokod_test.py /var/www/operat-data/rcn_lublin.json [liczba_adresów, domyślnie 300]"""
import json, math, random, re, sys, time, urllib.parse, urllib.request

def cs92_to_wgs84(n, e):
    """EPSG:2180 (PL-1992) -> szerokość/długość WGS84. Odwrotne odwzorowanie Gaussa-Krügera (GRS80), n = northing, e = easting."""
    a_, f = 6378137.0, 1 / 298.257222101; k0, lon0, fe, fn = 0.9993, math.radians(19), 500000.0, -5300000.0
    n_ = f / (2 - f); A = a_ / (1 + n_) * (1 + n_**2 / 4 + n_**4 / 64)
    b1 = n_ / 2 - 2 * n_**2 / 3 + 37 * n_**3 / 96 - n_**4 / 360
    b2 = n_**2 / 48 + n_**3 / 15 - 437 * n_**4 / 1440
    b3 = 17 * n_**3 / 480 - 37 * n_**4 / 840
    b4 = 4397 * n_**4 / 161280
    xi, eta = (n - fn) / (k0 * A), (e - fe) / (k0 * A)
    xp = xi - sum(c * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, c in ((1, b1), (2, b2), (3, b3), (4, b4)))
    ep = eta - sum(c * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, c in ((1, b1), (2, b2), (3, b3), (4, b4)))
    chi = math.asin(math.sin(xp) / math.cosh(ep))
    e2 = f * (2 - f); d1 = e2 / 2 + 5 * e2**2 / 24 + e2**3 / 12 + 13 * e2**4 / 360
    d2 = 7 * e2**2 / 48 + 29 * e2**3 / 240 + 811 * e2**4 / 11520
    d3 = 7 * e2**3 / 120 + 81 * e2**4 / 1120; d4 = 4279 * e2**4 / 161280
    lat = chi + d1 * math.sin(2 * chi) + d2 * math.sin(4 * chi) + d3 * math.sin(6 * chi) + d4 * math.sin(8 * chi)
    lon = lon0 + math.atan2(math.sinh(ep), math.cos(xp))
    return math.degrees(lat), math.degrees(lon)


def uug(adr):
    u = 'https://services.gugik.gov.pl/uug/?' + urllib.parse.urlencode({'request': 'GetAddress', 'address': adr})
    for t in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'operat-geokod-test/1.0'}), timeout=30) as r: return json.load(r)
        except Exception as e: err = e; time.sleep(2)
    return {'error': repr(err)}

def hav(a, b):
    R = 6371000; p1, p2 = math.radians(a[0]), math.radians(b[0]); dp = p2 - p1; dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def pick(resp, nr):
    rs = (resp.get('results') or {}).values()
    ex = [r for r in rs if str(r.get('number', '')).lower().replace(' ', '') == str(nr).lower().replace(' ', '') and 'Lublin' in str(r.get('jednostka', ''))]
    return ex

print('=== A. Warianty zapisu i granice (co zwraca UUG) ===')
for adr in ['Lublin, Granata 1', 'Lublin, granata 1', 'Lublin, ul. Granata 1', 'Lublin, Ks. Wincentego Granata 1', 'Lublin, Granata 1a', 'Lublin, Granata 100', 'Lublin, Krężnicka 1', 'Lublin, Krężnicka 100', 'Lublin, Krężnicka 150', 'Lublin, Krężnicka 200', 'Lublin, Krężnicka 275', 'Lublin, Krężnicka', 'Lublin, Krężnicka 2', 'Lublin, Zamojska 10']:
    rr = uug(adr); rs = list((rr.get('results') or {}).values())
    print(f"{adr:36s} -> zwrócono {rr.get('returned objects')} z {rr.get('found objects')}" + ''.join(f"\n     {x.get('street')} {x.get('number')} ({x.get('city')}), dokładność {x.get('accuracy')}" for x in rs[:3]) + (f"  BŁĄD {rr['error']}" if 'error' in rr else ''))
    time.sleep(.3)

print('\n=== B. Kontrola na adresach z RCN ===')
rcn = json.load(open(sys.argv[1], encoding='utf-8')); N = int(sys.argv[2]) if len(sys.argv) > 2 else 300
C = {c: i for i, c in enumerate(rcn['cols'])}; seen = {}
for r in rcn['rows']:
    ul, nr, la, lo = r[C['ulica']], r[C['nr']], r[C['lat']], r[C['lon']]
    if ul and nr and la is not None and hav((la, lo), (51.246, 22.568)) < 6000 and r[C['funkcja']] == 'mieszkalna': seen.setdefault((ul, nr), (la, lo))
keys = sorted(seen); random.Random(1).shuffle(keys); keys = keys[:N]
print(f'Adresów do kontroli: {len(keys)} (z promienia 6 km od centrum Lublina, żeby wszystkie były w mieście)')
found, dist, nf, wrong = 0, [], [], []
for ul, nr in keys:
    rr = uug(f'Lublin, {ul} {nr}'); ex = pick(rr, nr)
    if not ex: nf.append((ul, nr, rr.get('returned objects'))); time.sleep(.25); continue
    x = ex[0]; ll = cs92_to_wgs84(float(x['y']), float(x['x'])); d = hav(ll, seen[(ul, nr)]); found += 1; dist.append(d)
    if d > 100: wrong.append((ul, nr, x.get('street'), round(d)))
    time.sleep(.25)
dist.sort(); q = lambda p: dist[min(len(dist) - 1, int(len(dist) * p))] if dist else float('nan')
print(f'Znaleziono: {found} z {len(keys)} ({found / max(1, len(keys)) * 100:.1f}%)')
print(f'Odległość punktu PRG od współrzędnej RCN: mediana {q(.5):.0f} m, 90% {q(.9):.0f} m, 99% {q(.99):.0f} m, powyżej 100 m: {len(wrong)}')
print('Nieznalezione (przykłady):', [f'{u} {n}' for u, n, _ in nf[:12]])
print('Duże rozbieżności >100 m (przykłady):', wrong[:10])
