#!/usr/bin/env python3
"""Pobiera z OpenStreetMap (Overpass) punkty otoczenia dla Lublina i okolic i zapisuje jeden plik JSON.
Dane © współtwórcy OpenStreetMap (ODbL). Uruchamiane na serwerze (server/osm_refresh.sh), aplikacja czyta gotowy plik.
Użycie: osm_export.py --out osm_lublin.json [--bbox S,W,N,E]"""
import argparse, hashlib, json, sys, time, urllib.parse, urllib.request

BBOX = (51.08, 22.25, 51.40, 22.85)
LAYERS = {  # klucz: (zapytanie Overpass, nazwa)
    'przystanki': ('node["highway"="bus_stop"]', 'Przystanki'),
    'szkoly': ('nwr["amenity"="school"]', 'Szkoły'),
    'przedszkola': ('nwr["amenity"="kindergarten"]', 'Przedszkola'),
    'sklepy': ('nwr["shop"="supermarket"]', 'Sklepy'),
    'parki': ('nwr["leisure"="park"]', 'Parki'),
    'zdrowie': ('nwr["amenity"~"^(hospital|clinic|doctors)$"]', 'Przychodnie i szpitale'),
    'uczelnie': ('nwr["amenity"~"^(university|college)$"]', 'Uczelnie'),
}
URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

def points(j):
    out, seen = [], set()
    for e in (j or {}).get('elements', []):
        la = e.get('lat', (e.get('center') or {}).get('lat')); lo = e.get('lon', (e.get('center') or {}).get('lon'))
        if la is None or lo is None: continue
        k = (round(la, 5), round(lo, 5))
        if k in seen: continue
        seen.add(k); out.append([k[0], k[1]])
    return out

def fetch(query, tries=4):
    last = None
    for t in range(tries):
        for u in URLS:
            try:
                req = urllib.request.Request(u, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'operat-osm-export/1.0 (AM Nieruchomosci)'})
                with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)
            except Exception as ex: last = ex; print(f'  {u}: {ex}', file=sys.stderr); time.sleep(3)
        time.sleep(15 * (t + 1))
    raise RuntimeError(f'Overpass niedostępny: {last}')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--bbox')
    a = ap.parse_args(); bb = tuple(float(x) for x in a.bbox.split(',')) if a.bbox else BBOX
    layers = {}
    for k, (q, n) in LAYERS.items():
        pts = points(fetch(f'[out:json][timeout:90];{q}({bb[0]},{bb[1]},{bb[2]},{bb[3]});out center;'))
        print(f'{n}: {len(pts)}', file=sys.stderr); layers[k] = pts; time.sleep(2)
    pack = dict(meta=dict(zrodlo='OpenStreetMap (Overpass), ODbL', pobrano=time.strftime('%Y-%m-%d'), bbox=bb, nazwy={k: v[1] for k, v in LAYERS.items()},
                          liczby={k: len(v) for k, v in layers.items()},
                          wersja=hashlib.sha1(json.dumps(layers, separators=(',', ':')).encode()).hexdigest()[:16]), layers=layers)
    json.dump(pack, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('zapisano', a.out, file=sys.stderr)

if __name__ == '__main__': main()
