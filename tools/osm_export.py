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
URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

def points(j):
    out, seen = [], set()
    for e in (j or {}).get('elements', []):
        la = e.get('lat', (e.get('center') or {}).get('lat')); lo = e.get('lon', (e.get('center') or {}).get('lon'))
        if la is None or lo is None: continue
        k = (round(la, 5), round(lo, 5))
        if k in seen: continue
        seen.add(k); out.append([k[0], k[1]])
    return out

def fetch(query, tries=2, czas=60):
    last = None
    for t in range(tries):
        for u in URLS:
            t0 = time.time()
            try:
                req = urllib.request.Request(u, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'operat-osm-export/1.1 (AM Nieruchomosci; kontakt: biuro)', 'Accept': '*/*', 'Content-Type': 'application/x-www-form-urlencoded'})
                with urllib.request.urlopen(req, timeout=czas) as r: data = json.load(r)
                print(f'  {u}: OK {time.time() - t0:.1f}s', file=sys.stderr, flush=True); return data
            except Exception as ex: last = ex; print(f'  {u}: {ex} po {time.time() - t0:.1f}s', file=sys.stderr, flush=True); time.sleep(2)
        time.sleep(10)
    raise RuntimeError(f'Overpass niedostępny: {last}')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--bbox'); ap.add_argument('--czas', type=int, default=60, help='sekundy na warstwę; dla województwa więcej')
    a = ap.parse_args(); bb = tuple(float(x) for x in a.bbox.split(',')) if a.bbox else BBOX
    layers = {}
    for k, (q, n) in LAYERS.items():
        print(f'Pobieram: {n}…', file=sys.stderr, flush=True)
        pts = points(fetch(f'[out:json][timeout:{max(90, a.czas - 10)}];{q}({bb[0]},{bb[1]},{bb[2]},{bb[3]});out center;', czas=a.czas))
        print(f'{n}: {len(pts)}', file=sys.stderr, flush=True); layers[k] = pts; time.sleep(2)
    pack = dict(meta=dict(zrodlo='OpenStreetMap (Overpass), ODbL', pobrano=time.strftime('%Y-%m-%d'), bbox=bb, nazwy={k: v[1] for k, v in LAYERS.items()},
                          liczby={k: len(v) for k, v in layers.items()},
                          wersja=hashlib.sha1(json.dumps(layers, separators=(',', ':')).encode()).hexdigest()[:16]), layers=layers)
    json.dump(pack, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('zapisano', a.out, file=sys.stderr, flush=True)

if __name__ == '__main__': main()
