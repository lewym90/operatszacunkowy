#!/usr/bin/env python3
"""Składa pliki jednego obszaru pracy aplikacji z plików powiatowych województwa (wynik server/woj_zbieraj.sh).
Format jak dla Lublina (te same kolumny), więc aplikacja czyta je tym samym kodem:
  rcn_lokale.json  lokale (mieszkania, lokale użytkowe, garaże) z powiatów obszaru, od podanej daty
  rcn_inne.json    domy, obiekty, grunty z tych samych powiatów, od tej samej daty
  rcn_meta.json    wersje i liczby (aplikacja najpierw sprawdza ten mały plik)
  osm.json         punkty otoczenia OSM przycięte do prostokąta obszaru
Użycie: obszar_plik.py --woj KATALOG --obszar krakow --out KATALOG [--od 2018-01-01]
Obszary: OBSZARY niżej (kod TERYT powiatu, prostokąt S,W,N,E dla OSM)."""
import argparse, hashlib, json, os, sys, time

OBSZARY = {
    # Kraków + 9 powiatów wokół (decyzja właściciela 24.11.2026: od razu szerzej)
    'krakow': dict(nazwa='Kraków i okolice', powiaty=['1261', '1206', '1219', '1209', '1201', '1218', '1203', '1208', '1214', '1212'], bbox=(49.58, 19.22, 50.55, 20.72)),
}

def wczytaj(path):
    with open(path, encoding='utf-8') as f: return json.load(f)

def zloz(woj, powiaty, wzor, od):
    cols, rows, src = None, [], {}
    for t in powiaty:
        p = os.path.join(woj, wzor.format(t))
        if not os.path.exists(p): raise SystemExit(f'Brak pliku {p}')
        j = wczytaj(p)
        if cols is None: cols = j['cols']
        elif j['cols'] != cols: raise SystemExit(f'Inne kolumny w {p}')
        di = cols.index('data'); n0 = len(rows)
        rows += [r for r in j['rows'] if (r[di] or '') >= od]
        src[t] = dict(powiat=j['meta'].get('powiat'), wszystkich=len(j['rows']), wzietych=len(rows) - n0)
    return cols, rows, src

def zapisz(path, obj):
    tmp = path + '.new'
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--woj', required=True); ap.add_argument('--obszar', required=True, choices=sorted(OBSZARY)); ap.add_argument('--out', required=True); ap.add_argument('--od', default='2018-01-01')
    a = ap.parse_args(); O = OBSZARY[a.obszar]; os.makedirs(a.out, exist_ok=True); dzis = time.strftime('%Y-%m-%d')
    wersja = lambda rows: hashlib.sha1(json.dumps(rows, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()[:16]
    meta = {}
    for wzor, plik in (('rcn_{}.json', 'rcn_lokale.json'), ('rcn_inne_{}.json', 'rcn_inne.json')):
        cols, rows, src = zloz(a.woj, O['powiaty'], wzor, a.od)
        m = dict(zrodlo='RCN, GUGiK, paczka wojewódzka', pobrano=dzis, obszar=a.obszar, nazwa=O['nazwa'], od=a.od, powiaty=src, rekordow=len(rows), wersja=wersja(rows))
        zapisz(os.path.join(a.out, plik), dict(meta=m, cols=cols, rows=rows)); meta[plik] = m
        print(f'{plik}: {len(rows)} rekordów, {os.path.getsize(os.path.join(a.out, plik)) / 1e6:.1f} MB', file=sys.stderr)
    m = dict(meta['rcn_lokale.json']); m['bajtow'] = os.path.getsize(os.path.join(a.out, 'rcn_lokale.json'))
    mi = meta['rcn_inne.json']; m['inne'] = dict(wersja=mi['wersja'], rekordow=mi['rekordow'], bajtow=os.path.getsize(os.path.join(a.out, 'rcn_inne.json')), pobrano=dzis)
    osm = os.path.join(a.woj, 'osm_woj.json')
    if os.path.exists(osm):
        j = wczytaj(osm); s, w, n, e = O['bbox']
        L = {k: [p for p in v if s <= p[0] <= n and w <= p[1] <= e] for k, v in j['layers'].items()}
        jm = dict(j['meta'], bbox=O['bbox'], liczby={k: len(v) for k, v in L.items()}, wersja=hashlib.sha1(json.dumps(L, separators=(',', ':')).encode()).hexdigest()[:16])
        zapisz(os.path.join(a.out, 'osm.json'), dict(meta=jm, layers=L)); m['osm'] = dict(wersja=jm['wersja'], liczby=jm['liczby'])
        print('osm.json:', jm['liczby'], file=sys.stderr)
    else: print('UWAGA: brak osm_woj.json, osm.json nie powstał', file=sys.stderr)
    zapisz(os.path.join(a.out, 'rcn_meta.json'), m)
    print(f'OBSZAR {O["nazwa"]}: lokale {m["rekordow"]}, domy/obiekty/grunty {m["inne"]["rekordow"]}', file=sys.stderr)

if __name__ == '__main__': main()
