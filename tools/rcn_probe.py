#!/usr/bin/env python3
"""Sonda RCN: pobiera próbkę z warstw lokale/budynki/dzialki i wypisuje, jakie wartości mają pola opisowe (bez danych osobowych).
Uruchomienie na serwerze:  python3 rcn_probe.py   (tylko biblioteka standardowa, ok. 1-2 minuty)"""
import collections, re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
BASE = "https://mapy.geoportal.gov.pl/wss/service/rcn"
BBOX = "51.15,22.38,51.33,22.73,urn:ogc:def:crs:EPSG::4326"
SKIP = {'TRAN_SPRZEDAJACY', 'TRAN_KUPUJACY', 'GEOMETRIA', 'TRAN_PRZESTRZEN_NAZW', 'TRAN_LOKALNY_ID_IIP', 'TRAN_WERSJA_ID', 'TRAN_OZNACZENIE_TRANS', 'DOK_OZNACZENIE', 'DOK_TWORCA', 'SERWIS_RCN', 'gid'}
def local(t): return t.split('}')[-1]
VAR = None   # (kolejność osi bbox, sortowanie, srsName) — wybierane tak jak w rcn_export.py
BB = {"latlon": "51.15,22.38,51.33,22.73,urn:ogc:def:crs:EPSG::4326", "lonlat": "22.38,51.15,22.73,51.33,urn:ogc:def:crs:EPSG::4326"}
def get(layer, start, count):
    q = dict(service="WFS", version="2.0.0", request="GetFeature", typeNames="ms:" + layer, bbox=BB[VAR[0]], count=count, startIndex=start)
    if VAR[2]: q["srsName"] = "urn:ogc:def:crs:EPSG::4326"
    if VAR[1]: q["sortBy"] = "gid"
    for a in range(4):
        try: return urllib.request.urlopen(urllib.request.Request(BASE + "?" + urllib.parse.urlencode(q), headers={"User-Agent": "am-operat-probe/1.0"}), timeout=120).read()
        except Exception:
            if a == 3: raise
            time.sleep(3)
def rows_of(raw):
    out = []
    for m in ET.fromstring(raw):
        for f in m: out.append({local(c.tag): (c.text or '').strip() for c in f if len(c) == 0})
    return out
for srs in (False, True):
    for order in ("latlon", "lonlat"):
        for sort in (False, True):
            VAR = (order, sort, srs)
            try: n = len(rows_of(get('lokale', 0, 20)))
            except Exception as e: n = 0; print("  błąd:", str(e)[:100], file=sys.stderr)
            print(f"wariant bbox={order} sortBy={sort} srsName={srs}: {n} rekordów", file=sys.stderr)
            if n: break
        if n: break
    if n: break
if not n: sys.exit("Żaden wariant nie zwrócił rekordów.")
for layer in ('lokale', 'budynki', 'dzialki'):
    rows = []
    for start in (0, 4000, 8000):   # trzy próbki z różnych miejsc listy
        rows += rows_of(get(layer, start, 1500))
    print(f"\n===== {layer}: próbka {len(rows)} rekordów =====")
    cols = collections.OrderedDict()
    for r in rows:
        for k, v in r.items(): cols.setdefault(k, collections.Counter())[v] += 1
    for k, c in cols.items():
        if k in SKIP: continue
        filled = sum(n for v, n in c.items() if v)
        if len(c) <= 25: print(f"{k} (wypełnione {filled}): " + "; ".join(f"{v or '∅'}={n}" for v, n in c.most_common()))
        else:
            ex = [v[:60] for v, _ in c.most_common(4) if v]
            print(f"{k} (wypełnione {filled}, {len(c)} różnych): np. " + " | ".join(ex))
