#!/usr/bin/env python3
"""Sonda RCN: pobiera próbkę z warstw lokale/budynki/dzialki i wypisuje, jakie wartości mają pola opisowe (bez danych osobowych).
Uruchomienie na serwerze:  python3 rcn_probe.py   (tylko biblioteka standardowa, ok. 1-2 minuty)"""
import collections, re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
BASE = "https://mapy.geoportal.gov.pl/wss/service/rcn"
BBOX = "51.15,22.38,51.33,22.73,urn:ogc:def:crs:EPSG::4326"
SKIP = {'TRAN_SPRZEDAJACY', 'TRAN_KUPUJACY', 'GEOMETRIA', 'TRAN_PRZESTRZEN_NAZW', 'TRAN_LOKALNY_ID_IIP', 'TRAN_WERSJA_ID', 'TRAN_OZNACZENIE_TRANS', 'DOK_OZNACZENIE', 'DOK_TWORCA', 'SERWIS_RCN', 'gid'}
def local(t): return t.split('}')[-1]
def get(layer, start, count):
    q = dict(service="WFS", version="2.0.0", request="GetFeature", typeNames="ms:" + layer, bbox=BBOX, count=count, startIndex=start, srsName="urn:ogc:def:crs:EPSG::4326")
    for a in range(4):
        try: return urllib.request.urlopen(urllib.request.Request(BASE + "?" + urllib.parse.urlencode(q), headers={"User-Agent": "am-operat-probe/1.0"}), timeout=120).read()
        except Exception:
            if a == 3: raise
            time.sleep(3)
for layer in ('lokale', 'budynki', 'dzialki'):
    rows = []
    for start in (0, 4000, 8000):   # trzy próbki z różnych miejsc listy
        root = ET.fromstring(get(layer, start, 1500))
        for m in root:
            for f in m:
                rows.append({local(c.tag): (c.text or '').strip() for c in f if len(c) == 0})
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
