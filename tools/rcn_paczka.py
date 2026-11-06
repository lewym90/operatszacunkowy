#!/usr/bin/env python3
"""Paczki RCN województwa (GeoParquet z Geoportalu) -> pliki powiatów w formacie aplikacji.
Tylko dane potrzebne do wycen: kolumny stron transakcji poza rodzajem sprzedającego nie są w ogóle czytane.
Braki uzupełnia z PRG (adres po punkcie) i ULDK (punkt po numerze działki, z pamięcią podręczną; można przerwać i wznowić).
    python3 rcn_paczka.py --lokale L.parquet --budynki B.parquet --dzialki D.parquet --prg 06_Punkty_Adresowe.zip --out KATALOG [--uldk cache.json] [--uldk-limit N]
dokl (dokładność punktu): 1 = punkt z RCN, 2 = środek działki z ULDK, 3 = środek obrębu z ULDK, null = brak."""
import argparse, collections, datetime, hashlib, json, os, re, struct, sys, time, urllib.parse, urllib.request, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rcn_export as X
import rcn_export_inne as I

GRANICA = 2021                 # punkty z ULDK dociągamy dla transakcji od tego roku
DOD = ['msc', 'dokl', 'adr_prg']
DZIS = datetime.date.today()
NAZWY = {'0601': 'bialski', '0602': 'bilgorajski', '0603': 'chelmski', '0604': 'hrubieszowski', '0605': 'janowski', '0606': 'krasnostawski', '0607': 'krasnicki', '0608': 'lubartowski', '0609': 'lubelski', '0610': 'leczynski', '0611': 'lukowski', '0612': 'opolski', '0613': 'parczewski', '0614': 'pulawski', '0615': 'radzynski', '0616': 'rycki', '0617': 'swidnicki', '0618': 'tomaszowski', '0619': 'wlodawski', '0620': 'zamojski', '0661': 'biala_podlaska', '0662': 'chelm', '0663': 'lublin', '0664': 'zamosc'}

def dobra_data(d):
    return d if d and datetime.date(1990, 1, 1) <= d <= DZIS + datetime.timedelta(days=31) else None

def teryt_z(rek, idp):
    """Kod powiatu z identyfikatora obiektu; pole teryt bywa błędne (paczka powtarza łukowski pod opolskim)."""
    m = re.match(r'\s*(\d{4})\d\d_', rek.get(idp) or '')
    return m.group(1) if m else (rek.get('teryt') or '')

def srodek(g):
    """Środek geometrii WKB w układzie 2180: (x na wschód, y na północ)."""
    if not g: return None
    b = bytes(g); e = '<' if b[0] == 1 else '>'; t = struct.unpack_from(e + 'I', b, 1)[0] & 0xff
    if t == 1: return struct.unpack_from(e + 'dd', b, 5)
    xs, ys, o = [], [], 5
    def pierscienie(o):
        n = struct.unpack_from(e + 'I', b, o)[0]; o += 4
        for _ in range(n):
            k = struct.unpack_from(e + 'I', b, o)[0]; o += 4
            for i in range(k):
                x, y = struct.unpack_from(e + 'dd', b, o + 16 * i); xs.append(x); ys.append(y)
            o += 16 * k
        return o
    if t == 3: pierscienie(o)
    elif t == 6:
        n = struct.unpack_from(e + 'I', b, o)[0]; o += 4
        for _ in range(n): o = pierscienie(o + 5)
    return (sum(xs) / len(xs), sum(ys) / len(ys)) if xs else None

def wgs(p):
    la, lo = X.cs92_to_wgs84(p[1], p[0]); return round(la, 6), round(lo, 6)

def adres(s):
    d = dict(p.split(':', 1) for p in (s or '').split(';') if ':' in p)
    nr = re.sub(r'\s+(lok|m)\b.*$', '', d.get('NR_PORZ', ''), flags=re.I).strip()
    return d.get('UL', '').strip(), nr, d.get('MSC', '').strip()

def sprz(v):
    return v if v and re.fullmatch(r'[A-Za-z]+', v) else None

# ---------- PRG ----------
class PRG:
    def __init__(s, zp):
        z = zipfile.ZipFile(zp); f = z.open(z.namelist()[0]); msc, ul, pts, buf = {}, {}, [], b''
        R = re.compile(rb'<prgad:(AD_Miejscowosc|AD_UlicaPlac|AD_PunktAdresowy) gml:id="([^"]+)">(.*?)</prgad:\1>', re.S)
        tx = lambda b, t: (re.search(rb'<prgad:' + t + rb'>([^<]*)<', b) or [None, b''])[1].decode()
        while True:
            b = f.read(1 << 24); buf += b; last = 0
            for m in R.finditer(buf):
                k, i, x = m.group(1), m.group(2), m.group(3); last = m.end()
                if k == b'AD_Miejscowosc': msc[i] = tx(x, b'nazwa')
                elif k == b'AD_UlicaPlac': ul[i] = tx(x, b'nazwaPelna')
                else:
                    p = re.search(rb'<gml:pos>([\d.]+) ([\d.]+)', x); ms = re.search(rb'<prgad:miejscowosc xlink:href="#([^"]+)"', x); us = re.search(rb'<prgad:ulica\w* xlink:href="#([^"]+)"', x)
                    if p: pts.append((float(p.group(2)), float(p.group(1)), tx(x, b'numerPorzadkowy'), ms and ms.group(1), us and us.group(1)))
            buf = buf[last:]
            if not b: break
        s.msc, s.ul, s.pts, s.K = msc, ul, pts, 50; s.G = collections.defaultdict(list)
        for i, p in enumerate(pts): s.G[(int(p[0] // s.K), int(p[1] // s.K))].append(i)
    def najblizszy(s, p, maks=60):
        R = int(maks // s.K) + 1; cx, cy = int(p[0] // s.K), int(p[1] // s.K); best, bd = None, maks ** 2
        for a in range(-R, R + 1):
            for c in range(-R, R + 1):
                for i in s.G.get((cx + a, cy + c), ()):
                    q = s.pts[i]; d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
                    if d <= bd: bd, best = d, i
        if best is None: return None
        q = s.pts[best]; return s.ul.get(q[4], '') if q[4] else '', q[2], s.msc.get(q[3], '')

# ---------- ULDK ----------
ID = re.compile(r'^\s*(\d{6}_\d\.\d{4})(?:\.((?:AR_\d+\.)?[0-9]+(?:/[0-9]+)?))?(?:[._]|$)')
class ULDK:
    """Pamięć: id -> [x, y] albo 0 (usługa nie zna). Klucz „r:” to obręb. Zapis co 500 odpowiedzi."""
    def __init__(s, plik, limit):
        s.plik, s.limit, s.n = plik, limit, 0
        s.c = json.load(open(plik)) if plik and os.path.exists(plik) else {}
    def _wkt(s, req, i):
        u = 'https://uldk.gugik.gov.pl/?request=%s&result=geom_wkt&srid=2180&id=%s' % (req, urllib.parse.quote(i))
        for a in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(u, headers=X.UA), timeout=40) as r: t = r.read().decode('utf8', 'replace')
                break
            except Exception:
                if a == 3: return None
                time.sleep(3 + 5 * a)
        if not t.startswith('0'): return 0
        v = [float(x) for x in re.findall(r'-?\d+\.?\d*', t.split('POLYGON')[-1])]
        return [round(sum(v[0::2]) / (len(v) // 2), 1), round(sum(v[1::2]) / (len(v) // 2), 1)] if len(v) >= 2 else 0
    def daj(s, klucz, req, i):
        if klucz in s.c: return s.c[klucz]
        if s.limit is not None and s.n >= s.limit: return None
        w = s._wkt(req, i); s.n += 1; time.sleep(.22)
        if w is None: return None
        s.c[klucz] = w
        if s.n % 500 == 0: s.zapisz(); print('ULDK: %d zapytań' % s.n, file=sys.stderr, flush=True)
        return w
    def punkt(s, idob):
        m = ID.match((idob or '').split('_BUD')[0])
        if not m: return None, None
        if m.group(2):
            p = s.daj(m.group(1) + '.' + m.group(2), 'GetParcelById', m.group(1) + '.' + m.group(2))
            if p: return p, 2
        p = s.daj('r:' + m.group(1), 'GetRegionById', m.group(1))
        return (p, 3) if p else (None, None)
    def zapisz(s):
        if s.plik:
            json.dump(s.c, open(s.plik + '.tmp', 'w'), separators=(',', ':')); os.replace(s.plik + '.tmp', s.plik)

# ---------- przebieg ----------
def czytaj(pq, f, kol):
    p = pq.ParquetFile(f)
    for b in p.iter_batches(batch_size=50000, columns=kol):
        yield from b.to_pylist()

def uzup(r, prg, uldk, idob, rok):
    """Zwraca (punkt 2180, dokl). Punkt z ULDK tylko dla nowszych transakcji."""
    p = srodek(r.get('geometry'))
    if p: return p, 1
    if rok and rok >= GRANICA and uldk:
        return uldk.punkt(idob)
    return None, None

def lokale(pq, f, prg, uldk):
    seen, wyn, stat = set(), collections.defaultdict(list), collections.Counter()
    for r in czytaj(pq, f, ['teryt', 'geometry', 'lok_id_lokalu', 'tran_oznaczenie_trans', 'tran_cena_brutto', 'tran_rodzaj_rynku', 'tran_rodzaj_trans', 'dok_oznaczenie', 'dok_data', 'lok_funkcja', 'lok_liczba_izb', 'lok_nr_kond', 'lok_pow_uzyt', 'lok_pow_przyn', 'lok_adres', 'nier_udzial', 'tran_sprzedajacy', 'nier_cena_brutto', 'lok_cena_brutto']):
        t = teryt_z(r, 'lok_id_lokalu'); kl = (t, r['tran_oznaczenie_trans'], r['lok_id_lokalu'], r['dok_oznaczenie'])
        if kl in seen: stat['powt'] += 1; continue
        seen.add(kl); d = dobra_data(r['dok_data']); stat['data_zla'] += (r['dok_data'] is not None and d is None)
        ul, nr, msc = adres(r['lok_adres']); rok = re.search(r'/(20\d\d|19\d\d)\s*$', r['dok_oznaczenie'] or '')
        p, dok = uzup(r, prg, uldk, r['lok_id_lokalu'], d.year if d else None); la = lo = None; ap = 0
        if p:
            la, lo = wgs(p)
            if not ul and prg and dok in (1, 2):
                a = prg.najblizszy(p, 60 if dok == 1 else 120)
                if a: ul, nr2, msc2 = a; nr = nr or nr2; msc = msc or msc2; ap = 1
        wyn[t].append([r['lok_id_lokalu'], r['tran_oznaczenie_trans'], X.num(r['tran_cena_brutto']), r['tran_rodzaj_rynku'], r['tran_rodzaj_trans'], int(rok.group(1)) if rok else None, r['lok_funkcja'], X.num(r['lok_liczba_izb']), X.num(r['lok_nr_kond']), X.num(r['lok_pow_uzyt']), X.num(r['lok_pow_przyn']), ul, nr, r['nier_udzial'] or None, la, lo, sprz(r['tran_sprzedajacy']), d.isoformat() if d else None, X.num(r['nier_cena_brutto']), X.num(r['lok_cena_brutto']), msc or None, dok, ap])
    return wyn, stat

def inne(pq, fb, fd, uldk):
    """Ta sama agregacja co rcn_export_inne, tylko wejście z paczki."""
    wg = collections.defaultdict(lambda: {'budynki': [], 'dzialki': []}); seen = set(); stat = collections.Counter()
    def wiersze(f, warstwa, pole, kol, map_):
        for r in czytaj(pq, f, ['teryt', 'geometry', pole, 'tran_oznaczenie_trans', 'tran_cena_brutto', 'tran_rodzaj_rynku', 'tran_rodzaj_trans', 'dok_oznaczenie', 'dok_data', 'nier_rodzaj', 'nier_prawo', 'nier_udzial', 'nier_pow_gruntu', 'nier_cena_brutto', 'tran_sprzedajacy'] + kol):
            if r['nier_rodzaj'] not in (I.ZAB, I.NIEZAB): continue
            t = teryt_z(r, pole); kl = (warstwa, t, r['tran_oznaczenie_trans'], r[pole], r['dok_oznaczenie'])
            if kl in seen: stat['powt'] += 1; continue
            seen.add(kl); dd = dobra_data(r['dok_data']); p, dok = uzup(r, None, uldk, r[pole], dd.year if dd else None)
            d = {'TRAN_OZNACZENIE_TRANS': (t + ':' + r['tran_oznaczenie_trans']) if r['tran_oznaczenie_trans'] else '', 'TRAN_CENA_BRUTTO': r['tran_cena_brutto'], 'TRAN_RODZAJ_RYNKU': r['tran_rodzaj_rynku'], 'TRAN_RODZAJ_TRANS': r['tran_rodzaj_trans'], 'DOK_OZNACZENIE': r['dok_oznaczenie'] or '', 'DOK_DATA': dd.isoformat() if dd else '', 'NIER_RODZAJ': r['nier_rodzaj'], 'NIER_PRAWO': r['nier_prawo'], 'NIER_UDZIAL': r['nier_udzial'], 'NIER_POW_GRUNTU': r['nier_pow_gruntu'], 'NIER_CENA_BRUTTO': r['nier_cena_brutto'], 'TRAN_SPRZEDAJACY': sprz(r['tran_sprzedajacy'])}
            d.update({a: r[b] for a, b in map_.items()}); la, lo = wgs(p) if p else (None, None)
            wg[t][warstwa].append((d, la, lo))
    wiersze(fb, 'budynki', 'bud_id_budynku', ['bud_rodzaj', 'bud_pow_uzyt', 'bud_adres'], {'BUD_ID_BUDYNKU': 'bud_id_budynku', 'BUD_RODZAJ': 'bud_rodzaj', 'BUD_POW_UZYT': 'bud_pow_uzyt', 'BUD_ADRES': 'bud_adres'})
    wiersze(fd, 'dzialki', 'dzi_id_dzialki', ['dzi_pow_ewid', 'dzi_przezn_wmpzp', 'dzi_sposob_uzyt', 'dzi_adres'], {'DZI_ID_DZIALKI': 'dzi_id_dzialki', 'DZI_POW_EWID': 'dzi_pow_ewid', 'DZI_PRZEZN_WMPZP': 'dzi_przezn_wmpzp', 'DZI_SPOSOB_UZYT': 'dzi_sposob_uzyt', 'DZI_ADRES': 'dzi_adres'})
    return {t: I.aggregate(v) for t, v in wg.items()}, stat

def main():
    ap_ = argparse.ArgumentParser()
    for a in ('--lokale', '--budynki', '--dzialki', '--prg', '--out'): ap_.add_argument(a, required=a != '--prg')
    ap_.add_argument('--uldk'); ap_.add_argument('--uldk-limit', type=int); ap_.add_argument('--bez-uldk', action='store_true'); a = ap_.parse_args()
    import pyarrow.parquet as pq
    os.makedirs(a.out, exist_ok=True); prg = PRG(a.prg) if a.prg else None; print('PRG gotowe', file=sys.stderr, flush=True)
    uldk = None if a.bez_uldk else ULDK(a.uldk, a.uldk_limit)
    L, st = lokale(pq, a.lokale, prg, uldk); print('lokale gotowe', dict(st), file=sys.stderr, flush=True)
    N, st2 = inne(pq, a.budynki, a.dzialki, uldk); print('budynki i działki gotowe', dict(st2), file=sys.stderr, flush=True)
    if uldk: uldk.zapisz()
    pob = time.strftime('%Y-%m-%d'); spis = {}
    for t in sorted(set(L) | set(N)):
        if t not in NAZWY: print('pominięto nieznany kod powiatu, rekordów:', len(L.get(t, [])), file=sys.stderr); continue
        ro, cn = L.get(t, []), X.COLS + DOD
        def zap(nazwa, cols, rows):
            pack = dict(meta=dict(zrodlo='RCN, GUGiK, paczka wojewódzka', pobrano=pob, teryt=t, powiat=NAZWY[t], rekordow=len(rows), wersja=hashlib.sha1(json.dumps(rows, ensure_ascii=False, separators=(',', ':'), default=str).encode()).hexdigest()[:16]), cols=cols, rows=rows)
            json.dump(pack, open(os.path.join(a.out, nazwa), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), default=str)
            return pack['meta']['wersja']
        zap('rcn_%s.json' % t, cn, ro); zap('rcn_inne_%s.json' % t, I.COLS, N.get(t, []))
        wp = cn.index('lat'); wa = cn.index('adr_prg'); wu = cn.index('ulica'); wd = cn.index('dokl')
        spis[t] = dict(powiat=NAZWY[t], lokale=len(ro), inne=len(N.get(t, [])), lokale_punkt=sum(1 for r in ro if r[wp] is not None), lokale_uldk=sum(1 for r in ro if r[wd] in (2, 3)), lokale_ulica=sum(1 for r in ro if r[wu]), lokale_ulica_prg=sum(r[wa] for r in ro))
    json.dump(dict(pobrano=pob, powiaty=spis), open(os.path.join(a.out, 'rcn_spis.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    for t, s in spis.items(): print(t, s['powiat'], s['lokale'], s['inne'], 'punkt', s['lokale_punkt'], 'uldk', s['lokale_uldk'], 'ulica', s['lokale_ulica'], 'prg', s['lokale_ulica_prg'])

if __name__ == '__main__':
    main()
