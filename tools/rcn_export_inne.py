#!/usr/bin/env python3
"""Eksport z RCN: domy, obiekty niemieszkalne (hale, magazyny, biura, obiekty handlowe i przemysłowe) oraz grunty (działki).
Mieszkania i inne lokale są w osobnym pliku (rcn_export.py, warstwa ms:lokale), więc tutaj ich NIE ma.
Warstwy budynki i dzialki RCN powtarzają też transakcje lokalami, dlatego bierzemy tylko nieruchomości gruntowe
(zabudowane i niezabudowane). Jeden wiersz = jedna transakcja (akt). Dane osobowe są pomijane. Tylko biblioteka standardowa.
    python3 rcn_export_inne.py --out /var/www/operat-data/rcn_inne.json"""
import argparse, collections, hashlib, json, re, sys, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import rcn_export as X   # fetch, centroid, local, num, addr, BBOX

COLS = ['tran', 'cena', 'cena_nier', 'rynek', 'rodzaj', 'rok', 'data', 'nier', 'prawo', 'udzial', 'pow_gr', 'bud_rodz', 'bud_m2', 'n_bud',
        'dz_przezn', 'dz_sposob', 'dz_m2', 'n_dz', 'wiele', 'ulica', 'nr', 'lat', 'lon', 'sprz']
ZAB, NIEZAB = 'nieruchomoscGruntowaZabudowana', 'nieruchomoscGruntowaNiezabudowana'

def feature_dicts(raw):
    """Odpowiedź WFS -> lista (słownik pól, lat, lon)."""
    root = X.ET.fromstring(raw); out = []
    for m in root:
        if X.local(m.tag) not in ('member', 'featureMember'): continue
        for f in m:
            d = {}
            for c in f:
                if len(c) == 0: d[X.local(c.tag)] = (c.text or '').strip()
                elif X.local(c.tag) == 'DOK_DATA':
                    d['DOK_DATA'] = next(((x.text or '').strip() for x in c.iter() if X.local(x.tag) == 'timePosition'), '')
            la, lo = X.centroid(f); out.append((d, la, lo))
    return out

def aggregate(recs_by_layer):
    """recs_by_layer: {'budynki': [(d,la,lo)...], 'dzialki': [...]} -> wiersze (po jednym na transakcję)."""
    agg = collections.OrderedDict()
    def entry(tr, d):
        return agg.setdefault(tr, dict(d=d, bud={}, dz={}, props=set(), ll=[], layers=set(), adr=None))
    for layer in ('budynki', 'dzialki'):
        for d, la, lo in recs_by_layer.get(layer, []):
            nier = d.get('NIER_RODZAJ')
            if nier not in (ZAB, NIEZAB): continue
            tr = d.get('TRAN_OZNACZENIE_TRANS') or ''
            if not tr: continue
            e = entry(tr, d); e['layers'].add(layer)
            e['props'].add((nier, d.get('NIER_CENA_BRUTTO') or '', d.get('NIER_POW_GRUNTU') or ''))
            if la is not None: e['ll'].append((la, lo))
            if layer == 'budynki':
                e['bud'][d.get('BUD_ID_BUDYNKU') or ('b%d' % len(e['bud']))] = (X.num(d.get('BUD_POW_UZYT')), d.get('BUD_RODZAJ') or '')
                e['adr'] = e['adr'] or X.addr(d.get('BUD_ADRES'))
            else:
                e['dz'][d.get('DZI_ID_DZIALKI') or ('d%d' % len(e['dz']))] = (X.num(d.get('DZI_POW_EWID')), d.get('DZI_PRZEZN_WMPZP') or '', d.get('DZI_SPOSOB_UZYT') or '')
                e['adr'] = e['adr'] or X.addr(d.get('DZI_ADRES'))
    rows = []
    for tr, e in agg.items():
        d = e['d']; nier = d.get('NIER_RODZAJ')
        # zabudowana nieruchomość z wierszami tylko w warstwie działek (brak budynku w RCN) zostaje, z pustym rodzajem budynku
        bm2 = [v[0] for v in e['bud'].values() if v[0]]; big = max(e['bud'].values(), key=lambda v: v[0] or 0, default=(None, ''))
        dm2 = [v[0] for v in e['dz'].values() if v[0]]; bigd = max(e['dz'].values(), key=lambda v: v[0] or 0, default=(None, '', ''))
        ll = e['ll']; la = round(sum(x[0] for x in ll) / len(ll), 6) if ll else None; lo = round(sum(x[1] for x in ll) / len(ll), 6) if ll else None
        rok = re.search(r'/(20\d\d|19\d\d)\s*$', d.get('DOK_OZNACZENIE', ''))
        ul, nr = e['adr'] or ('', '')
        pow_gr = max([X.num(p[2]) or 0 for p in e['props']] + [0]) or None
        rows.append([tr, X.num(d.get('TRAN_CENA_BRUTTO')), X.num(d.get('NIER_CENA_BRUTTO')), d.get('TRAN_RODZAJ_RYNKU'), d.get('TRAN_RODZAJ_TRANS'),
                     int(rok.group(1)) if rok else None, d.get('DOK_DATA') or None, nier, d.get('NIER_PRAWO') or None, d.get('NIER_UDZIAL') or None, pow_gr,
                     big[1] or None, round(sum(bm2), 2) if bm2 else None, len(e['bud']),
                     bigd[1] or None, bigd[2] or None, round(sum(dm2), 2) if dm2 else None, len(e['dz']),
                     1 if len(e['props']) > 1 else 0, ul, nr, la, lo, d.get('TRAN_SPRZEDAJACY') or None])
    return rows

def pick_variant(layer):
    orders = {"latlon": "%s,%s,%s,%s,urn:ogc:def:crs:EPSG::4326" % (X.BBOX[0], X.BBOX[1], X.BBOX[2], X.BBOX[3]),
              "lonlat": "%s,%s,%s,%s,urn:ogc:def:crs:EPSG::4326" % (X.BBOX[1], X.BBOX[0], X.BBOX[3], X.BBOX[2])}
    def req(v, start, count):
        q = dict(service="WFS", version="2.0.0", request="GetFeature", typeNames="ms:" + layer, bbox=orders[v[0]], count=count, startIndex=start)
        if v[2]: q["srsName"] = "urn:ogc:def:crs:EPSG::4326"
        if v[1]: q["sortBy"] = "gid"
        return X.fetch(q)
    for v in [(o, s, r) for r in (False, True) for o in ("latlon", "lonlat") for s in (True, False)]:
        try: n = len(feature_dicts(req(v, 0, 20)))
        except Exception as ex: print(f"  {layer} {v}: błąd {str(ex)[:80]}", file=sys.stderr); n = 0
        print(f"{layer}: wariant {v}: {n} rekordów", file=sys.stderr)
        if n: return v, req
    sys.exit(f"Warstwa {layer}: żaden wariant zapytania nie zwrócił rekordów.")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--page', type=int, default=2000)
    ap.add_argument('--max', type=int, default=0, help='limit rekordów na warstwę (test)')
    a = ap.parse_args(); recs = {}
    for layer in ('budynki', 'dzialki'):
        v, req = pick_variant(layer); got, start = [], 0
        while True:
            batch = feature_dicts(req(v, start, a.page)); got += batch; start += a.page
            print(f"{layer}: pobrano {len(got)}", file=sys.stderr)
            if len(batch) < a.page or (a.max and len(got) >= a.max): break
            time.sleep(1)
        recs[layer] = got
    rows = aggregate(recs); no_geo = sum(1 for r in rows if r[COLS.index('lat')] is None)
    pack = dict(meta=dict(zrodlo="RCN, GUGiK (mapy.geoportal.gov.pl/wss/service/rcn), warstwy ms:budynki i ms:dzialki (tylko nieruchomości gruntowe)",
                          pobrano=time.strftime('%Y-%m-%d'), obszar="Lublin i otoczenie (prostokąt)", rekordow=len(rows), bez_wspolrzednych=no_geo,
                          wersja=hashlib.sha1(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()[:16]), cols=COLS, rows=rows)
    json.dump(pack, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f"zapisano {a.out}: {len(rows)} transakcji, bez współrzędnych: {no_geo}", file=sys.stderr)

if __name__ == '__main__':
    main()
