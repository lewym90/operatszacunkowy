#!/usr/bin/env python3
"""Eksport transakcji lokali z RCN (usługa WFS GUGiK) do zwartego pliku JSON dla aplikacji.
Uruchamiać NA SERWERZE (tylko biblioteka standardowa):
    python3 rcn_export.py --out /var/www/operat-data/rcn_lublin.json
Nie zapisuje danych osobowych (sprzedający/kupujący są pomijani). Dane są publiczne (RCN, bezpłatnie od 13.02.2026).
Nic tu nie jest zgadywane: pola brane są wprost z odpowiedzi usługi; gdy współrzędnych nie da się odczytać, lat/lon = null."""
import argparse, json, math, re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET

BASE = "https://mapy.geoportal.gov.pl/wss/service/rcn"
BBOX = (51.15, 22.38, 51.33, 22.73)   # lat_min, lon_min, lat_max, lon_max — Lublin z otoczeniem
COLS = ['id', 'tran', 'cena', 'rynek', 'rodzaj', 'rok', 'funkcja', 'izby', 'kond', 'm2', 'm2p', 'ulica', 'nr', 'udzial', 'lat', 'lon']
UA = {"User-Agent": "am-operat-rcn-export/1.0 (dane publiczne RCN)"}

def local(t): return t.split('}')[-1]

def fetch(params, timeout=120):
    url = BASE + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if attempt == 3: raise
            time.sleep(2 + 3 * attempt)

def floats(txt):
    return [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', txt or '')]

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

def in_area(la, lo):
    return BBOX[0] - 0.3 <= la <= BBOX[2] + 0.3 and BBOX[1] - 0.3 <= lo <= BBOX[3] + 0.3

def centroid(feature):
    """Środek geometrii. Obsługuje stopnie (4326) i metry (2180). Przyjęty wynik musi leżeć w okolicy Lublina; inaczej null (nie zgadujemy)."""
    pts = []
    for el in feature.iter():
        if local(el.tag) in ('posList', 'pos', 'coordinates') and el.text:
            v = floats(el.text)
            pts += [(v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)]
    if not pts: return None, None
    la, lo = [], []
    for a, b in pts:
        cands = [(a, b), (b, a)] if (abs(a) < 400 and abs(b) < 400) else [cs92_to_wgs84(a, b), cs92_to_wgs84(b, a)]
        for c in cands:
            if in_area(*c): la.append(c[0]); lo.append(c[1]); break
    if not la: return None, None
    return round(sum(la) / len(la), 6), round(sum(lo) / len(lo), 6)

def addr(s):
    d = dict(p.split(':', 1) for p in (s or '').split(';') if ':' in p)
    return d.get('UL', ''), d.get('NR_PORZ', '')

def num(x):
    try: return float(x) if x not in (None, '') else None
    except ValueError: return None

def parse(raw):
    root = ET.fromstring(raw); rows = []
    for m in root:
        if local(m.tag) not in ('member', 'featureMember'): continue
        for f in m:
            d = {}
            for c in f:
                if len(c) == 0: d[local(c.tag)] = (c.text or '').strip()
            la, lo = centroid(f)
            ul, nr = addr(d.get('LOK_ADRES'))
            rok = re.search(r'/(20\d\d|19\d\d)\s*$', d.get('DOK_OZNACZENIE', ''))
            rows.append([d.get('LOK_ID_LOKALU'), d.get('TRAN_OZNACZENIE_TRANS'), num(d.get('TRAN_CENA_BRUTTO')),
                         d.get('TRAN_RODZAJ_RYNKU'), d.get('TRAN_RODZAJ_TRANS'), int(rok.group(1)) if rok else None,
                         d.get('LOK_FUNKCJA'), num(d.get('LOK_LICZBA_IZB')), num(d.get('LOK_NR_KOND')),
                         num(d.get('LOK_POW_UZYT')), num(d.get('LOK_POW_PRZYN')), ul, nr, d.get('NIER_UDZIAL') or None, la, lo])
    return rows

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--page', type=int, default=2000)
    ap.add_argument('--max', type=int, default=0, help='limit rekordów (test)')
    a = ap.parse_args()
    la0, lo0, la1, lo1 = BBOX
    orders = {"latlon": "%s,%s,%s,%s,urn:ogc:def:crs:EPSG::4326" % (la0, lo0, la1, lo1),
              "lonlat": "%s,%s,%s,%s,urn:ogc:def:crs:EPSG::4326" % (lo0, la0, lo1, la1)}
    def req(order, sort, start, count, srs=True):
        q = dict(service="WFS", version="2.0.0", request="GetFeature", typeNames="ms:lokale", bbox=orders[order], count=count, startIndex=start)
        if srs: q["srsName"] = "urn:ogc:def:crs:EPSG::4326"
        if sort: q["sortBy"] = "gid"
        return fetch(q)
    # Pierwsza strona: sprawdzamy warianty (kolejność osi bbox, sortowanie) i wybieramy pierwszy, który zwraca rekordy.
    chosen = None
    for srs in (False, True):
        for order in ("latlon", "lonlat"):
            for sort in (False, True):
                raw = req(order, sort, 0, min(a.page, 50), srs); got = parse(raw)
                txt = re.sub(r"\s+", " ", raw.decode('utf-8', 'replace'))
                nm = re.search(r'numberMatched="(\w+)"', txt); nr = re.search(r'numberReturned="(\w+)"', txt)
                print(f"próba srsName={srs}, bbox={order}, sortBy={sort}: {len(got)} rekordów (matched={nm and nm.group(1)}, returned={nr and nr.group(1)})", file=sys.stderr)
                if got: chosen = (order, sort, srs); break
                if 'xception' in txt: print("  BŁĄD USŁUGI: " + txt[:500], file=sys.stderr)
            if chosen: break
        if chosen: break
    if not chosen: sys.exit("Usługa nie zwróciła żadnych rekordów w żadnym wariancie. Wklej mi powyższe linie.")
    print(f"używam: {chosen}", file=sys.stderr)
    rows, start = [], 0
    while True:
        batch = parse(req(chosen[0], chosen[1], start, a.page, chosen[2])); rows += batch; start += a.page
        print(f"pobrano {len(rows)}", file=sys.stderr)
        if len(batch) < a.page or (a.max and len(rows) >= a.max): break
        time.sleep(1)
    no_geo = sum(1 for r in rows if r[14] is None)
    pack = dict(meta=dict(zrodlo="RCN, GUGiK (mapy.geoportal.gov.pl/wss/service/rcn), warstwa ms:lokale", pobrano=time.strftime('%Y-%m-%d'),
                          obszar="Lublin i otoczenie (prostokąt)", rekordow=len(rows), bez_wspolrzednych=no_geo), cols=COLS, rows=rows)
    json.dump(pack, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f"zapisano {a.out}: {len(rows)} rekordów, bez współrzędnych: {no_geo}", file=sys.stderr)

if __name__ == '__main__':
    main()
