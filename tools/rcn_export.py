#!/usr/bin/env python3
"""Eksport transakcji lokali z RCN (usługa WFS GUGiK) do zwartego pliku JSON dla aplikacji.
Uruchamiać NA SERWERZE (tylko biblioteka standardowa):
    python3 rcn_export.py --out /var/www/operat-data/rcn_lublin.json
Nie zapisuje danych osobowych (sprzedający/kupujący są pomijani). Dane są publiczne (RCN, bezpłatnie od 13.02.2026).
Nic tu nie jest zgadywane: pola brane są wprost z odpowiedzi usługi; gdy współrzędnych nie da się odczytać, lat/lon = null."""
import argparse, json, re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET

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

def centroid(feature):
    """Środek geometrii; rozpoznaje kolejność lat/lon po zakresie wartości (Polska: lat 49–55, lon 14–25)."""
    pts = []
    for el in feature.iter():
        if local(el.tag) in ('posList', 'pos', 'coordinates') and el.text:
            v = floats(el.text)
            pts += [(v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)]
    if not pts: return None, None
    la, lo = [], []
    for a, b in pts:
        if 49 <= a <= 55 and 14 <= b <= 25: la.append(a); lo.append(b)
        elif 49 <= b <= 55 and 14 <= a <= 25: la.append(b); lo.append(a)
    if not la: return None, None          # np. układ metryczny 2180 — nie zgadujemy
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
    bbox = "%s,%s,%s,%s,urn:ogc:def:crs:EPSG::4326" % BBOX
    rows, start = [], 0
    while True:
        raw = fetch(dict(service="WFS", version="2.0.0", request="GetFeature", typeNames="ms:lokale", bbox=bbox,
                         srsName="urn:ogc:def:crs:EPSG::4326", count=a.page, startIndex=start, sortBy="gid"))
        batch = parse(raw); rows += batch; start += a.page
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
