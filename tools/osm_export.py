#!/usr/bin/env python3
"""Pobiera z OpenStreetMap (Overpass) punkty otoczenia dla Lublina i okolic i zapisuje jeden plik JSON.
Dane © współtwórcy OpenStreetMap (ODbL). Uruchamiane na serwerze (server/osm_refresh.sh), aplikacja czyta gotowy plik.
Użycie: osm_export.py --out osm_lublin.json [--bbox S,W,N,E] [--kafle N] [--cache KATALOG]
--cache: każda pobrana część zapisuje się od razu; ponowne uruchomienie pobiera tylko brakujące (przeciążone serwery Overpass).
--kafle N dzieli obszar na N×N części (duże województwo z dużym miastem: jedno zapytanie kończy się błędem 504 na serwerach Overpass)."""
import argparse, hashlib, json, os, sys, time, urllib.parse, urllib.request

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
        time.sleep(30 * (t + 1))
    raise RuntimeError(f'Overpass niedostępny: {last}')

def kafle(bb, n):
    s, w, nn, e = bb; ds, dw = (nn - s) / n, (e - w) / n
    return [(round(s + i * ds, 5), round(w + j * dw, 5), round(s + (i + 1) * ds, 5), round(w + (j + 1) * dw, 5)) for i in range(n) for j in range(n)]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--bbox'); ap.add_argument('--czas', type=int, default=60, help='sekundy na warstwę; dla województwa więcej'); ap.add_argument('--kafle', type=int, default=1); ap.add_argument('--cache')
    a = ap.parse_args(); bb = tuple(float(x) for x in a.bbox.split(',')) if a.bbox else BBOX
    layers, braki = {}, 0
    if a.cache: os.makedirs(a.cache, exist_ok=True)
    for k, (q, n) in LAYERS.items():
        print(f'Pobieram: {n}…', file=sys.stderr, flush=True)
        pts, seen, ok = [], set(), True
        for b in kafle(bb, a.kafle):
            zq = f'[out:json][timeout:{max(90, a.czas - 10)}];{q}({b[0]},{b[1]},{b[2]},{b[3]});out center;'
            cf = os.path.join(a.cache, hashlib.sha1(zq.encode()).hexdigest()[:20] + '.json') if a.cache else None
            if cf and os.path.exists(cf): part = json.load(open(cf))
            else:
                try: part = points(fetch(zq, tries=3, czas=a.czas))
                except RuntimeError as ex:
                    if not a.cache: raise
                    print(f'  część {b} nie pobrana ({ex}); dalej z pozostałymi', file=sys.stderr, flush=True); ok = False; braki += 1; continue
                if cf: json.dump(part, open(cf, 'w'))
                if a.kafle > 1: time.sleep(2)
            for p in part:
                if tuple(p) not in seen: seen.add(tuple(p)); pts.append(p)
        print(f'{n}: {len(pts)}' + ('' if ok else ' (niepełne)'), file=sys.stderr, flush=True); layers[k] = pts; time.sleep(2)
    if braki: raise SystemExit(f'Brakuje {braki} części; uruchom ponownie (pobrane części są zapamiętane)')
    pack = dict(meta=dict(zrodlo='OpenStreetMap (Overpass), ODbL', pobrano=time.strftime('%Y-%m-%d'), bbox=bb, nazwy={k: v[1] for k, v in LAYERS.items()},
                          liczby={k: len(v) for k, v in layers.items()},
                          wersja=hashlib.sha1(json.dumps(layers, separators=(',', ':')).encode()).hexdigest()[:16]), layers=layers)
    json.dump(pack, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('zapisano', a.out, file=sys.stderr, flush=True)

if __name__ == '__main__': main()
