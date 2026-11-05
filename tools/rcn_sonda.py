#!/usr/bin/env python3
"""Sonda RCN dla 24 powiatów woj. lubelskiego: liczba rekordów i jakość próbki. Tylko czyta, wypisuje same liczby zbiorcze.
Uruchomienie: python3 rcn_sonda.py [próbka_na_powiat]"""
import re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
BASE = "https://mapy.geoportal.gov.pl/wss/service/rcn"; UA = {"User-Agent": "am-operat-rcn-sonda/1.0 (dane publiczne RCN)"}
POW = {'0663': 'Lublin', '0617': 'świdnicki', '0609': 'lubelski', '0610': 'łęczyński', '0608': 'lubartowski', '0614': 'puławski', '0607': 'kraśnicki', '0606': 'krasnostawski', '0612': 'opolski', '0616': 'rycki',
       '0662': 'Chełm', '0603': 'chełmski', '0664': 'Zamość', '0620': 'zamojski', '0661': 'Biała Podlaska', '0601': 'bialski', '0611': 'łukowski', '0615': 'radzyński', '0613': 'parczewski', '0619': 'włodawski',
       '0602': 'biłgorajski', '0605': 'janowski', '0604': 'hrubieszowski', '0618': 'tomaszowski'}
FES = '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:PropertyIsEqualTo><fes:ValueReference>TERYT</fes:ValueReference><fes:Literal>%s</fes:Literal></fes:PropertyIsEqualTo></fes:Filter>'
def get(layer, teryt, **kw):
    q = dict(service="WFS", version="2.0.0", request="GetFeature", typeNames="ms:" + layer, filter=FES % teryt, **kw)
    for a in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE + "?" + urllib.parse.urlencode(q), headers=UA), timeout=180) as r: return r.read()
        except Exception as e:
            if a == 3: raise
            time.sleep(3 + 4 * a)
def hits(layer, t):
    txt = get(layer, t, resultType="hits")[:3000].decode('utf8', 'replace'); m = re.search(r'numberMatched="(\d+)"', txt)
    if m: return int(m.group(1))
    raise SystemExit("usługa nie policzyła rekordów: " + txt[:300])
local = lambda t: t.split('}')[-1]
def probka(t, n, ile):
    w = []
    for st in [int(ile * i / 8) for i in range(8)]:   # z filtrem strona bywa niepełna lub pusta, więc próbkujemy w kilku miejscach
        root = ET.fromstring(get('lokale', t, count=n, startIndex=st)); time.sleep(.3)
        for m in root:
            for f in m:
                if local(f.tag) != 'lokale': continue
                d = {local(c.tag): (c.text or '').strip() for c in f if len(c) == 0}; dd = next(((x.text or '') for c in f if local(c.tag) == 'DOK_DATA' for x in c.iter() if local(x.tag) == 'timePosition'), '')
                d['_geo'] = any(local(e.tag) in ('posList', 'pos') for e in f.iter()); d['_data'] = dd; w.append(d)
    return w
n = int(sys.argv[1]) if len(sys.argv) > 1 else 500; pct = lambda a, b: f"{round(100 * a / b)}%" if b else "-"
print(f"{'POWIAT':16}{'KOD':5}{'LOKALE':>8}{'BUDYNKI':>9}{'DZIAŁKI':>9}  | próbka do {n} lokali: {'MIESZK':>6}{'PUNKT':>6}{'ULICA':>6}{'NR':>5}{'DATA':>6}{'IZBY':>6}{'POW':>6}  MIEJSC")
S = [0, 0, 0]
for t, nazwa in POW.items():
    c = [hits(l, t) for l in ('lokale', 'budynki', 'dzialki')]; S = [a + b for a, b in zip(S, c)]; p = probka(t, n, c[0]) if c[0] else []; time.sleep(1); L = len(p)
    adr = [dict(x.split(':', 1) for x in (r.get('LOK_ADRES') or '').split(';') if ':' in x) for r in p]; ile = lambda f: sum(1 for r in p if f(r))
    print(f"{nazwa:16}{t:5}{c[0]:>8}{c[1]:>9}{c[2]:>9}  | {'':22}{pct(ile(lambda r: r.get('LOK_FUNKCJA') == 'mieszkalna'), L):>6}{pct(ile(lambda r: r['_geo']), L):>6}{pct(sum(1 for a in adr if a.get('UL')), L):>6}{pct(sum(1 for a in adr if a.get('NR_PORZ')), L):>5}{pct(ile(lambda r: re.match(r'\d{4}-\d\d-\d\d', r['_data'])), L):>6}{pct(ile(lambda r: r.get('LOK_LICZBA_IZB')), L):>6}{pct(ile(lambda r: r.get('LOK_POW_UZYT')), L):>6}  {len({a.get('MSC') for a in adr if a.get('MSC')})}", flush=True)
print(f"{'RAZEM':21}{S[0]:>8}{S[1]:>9}{S[2]:>9}")
