#!/usr/bin/env python3
"""Zebranie ofert z Otodom (całe woj. lubelskie): najem mieszkań, domów, lokali, hal i garaży oraz sprzedaż mieszkań, domów, działek i lokali i import do aplikacji przez synchronizację.
Procedura jak w KONTYNUACJA.md, sekcja 7: lista (wszystkie oferty) + 6 filtrów cech + pełny odczyt TYLKO nowych ogłoszeń (rok budowy, parking, meble).
Import: aplikacja otwarta w tej samej przeglądarce (ta sama logika co na telefonie), podłączona do serwera synchronizacji.
    OPERAT_SYNC_KEY=... python3 otodom_zbieraj.py [--proba] [--app URL] [--sync URL]
--proba: wszystko oprócz zapisu (nic nie trafia do bazy). Zbierane są tylko pola techniczne; opisy służą wyłącznie do odczytu parkingu, roku i mebli i nie są zapisywane."""
import argparse, json, os, re, sys, time
LISTA = 'https://www.otodom.pl/pl/wyniki/%s/lubelskie?limit=72&page=%d'
# (ścieżka portalu, typ, kategoria aplikacji). Najem mieszkań jest pierwszy i ma pełną procedurę (filtry, ogłoszenia).
GRUPY = [('wynajem/mieszkanie', 'najem', 'mieszkanie'), ('wynajem/dom', 'najem', 'dom'), ('wynajem/lokal', 'najem', 'lokal'), ('wynajem/haleimagazyny', 'najem', 'obiekt'), ('wynajem/garaz', 'najem', 'garaz'),
         ('sprzedaz/mieszkanie', 'sprzedaz', 'mieszkanie'), ('sprzedaz/dom', 'sprzedaz', 'dom'), ('sprzedaz/dzialka', 'sprzedaz', 'dzialka'), ('sprzedaz/lokal', 'sprzedaz', 'lokal')]
STAN = {'ready_to_use': 'gotowe', 'to_renovation': 'do remontu', 'to_completion': 'do wykończenia'}
FILTRY = [('klima', 'AIR_CONDITIONING'), ('taras', 'TERRACE'), ('ogrod', 'GARDEN'), ('garaz', 'GARAGE'), ('winda', 'LIFT'), ('balkon', 'BALCONY')]
PIETRO = {'GROUND': 0, 'FIRST': 1, 'SECOND': 2, 'THIRD': 3, 'FOURTH': 4, 'FIFTH': 5, 'SIXTH': 6, 'SEVENTH': 7, 'EIGHTH': 8, 'NINTH': 9, 'TENTH': 10}
POKOJE = {'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5, 'SIX': 6, 'SEVEN': 7, 'EIGHT': 8, 'NINE': 9, 'TEN': 10, 'MORE': 10}
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
log = lambda *a: print(*a, flush=True)
brak = lambda n, t: n < t - max(3, 0.1 * t)       # portal nie pokazuje na listach kilku procent ogłoszeń z licznika
kod = lambda s: (re.search(r'-(ID[0-9A-Za-z]+)$', s or '') or [None, None])[1]

# ---------- odczyt danych ----------
def ulica(a):
    s = (a or {}).get('street') or {}
    n = (s.get('name') if isinstance(s, dict) else s) or ''
    n = re.sub(r'^\s*(ul\.|ulica)\s+', '', n.strip(), flags=re.I).strip()
    return n or None

def miejsce(loc):
    """(miasto, dzielnica) z hierarchii lokalizacji portalu; dzielnica = najgłębszy poziom poniżej miejscowości."""
    L = ((loc or {}).get('reverseGeocoding') or {}).get('locations') or []
    m = next((x['name'] for x in L if x.get('locationLevel') == 'city_or_village'), None)
    d = [x['name'] for x in L if x.get('locationLevel') not in ('voivodeship', 'county', 'municipality', 'city_or_village', 'street', 'country')]
    return m, (d[-1] if d else None)

def zdjecie(i):
    """Adres miniatury zdjęcia głównego z portalu (sam link, plik nie jest pobierany). Tylko do rozpoznania oferty przez pośrednika."""
    im = (i.get('images') or [{}])[0] or {}
    u = im.get('small') or im.get('medium') or ''
    return u if u.startswith('https://') else None

def rekord(i, typ='najem', kat='mieszkanie'):
    if i.get('hidePrice') or not (i.get('totalPrice') or {}).get('value') or i.get('estate') == 'INVESTMENT' or not (i.get('areaInSquareMeters') or 0) > 0: return None
    m, d = miejsce(i.get('location')); slug = i.get('slug') or ''
    return {'portalId': kod(slug) or str(i.get('id')), 'url': 'https://www.otodom.pl/pl/oferta/' + slug, 'cena': int((i['totalPrice'])['value']),
            'czynsz': int(i['rentPrice']['value']) if (i.get('rentPrice') or {}).get('value') else None, 'pokoje': POKOJE.get(i.get('roomsNumber')),
            'm2': i.get('areaInSquareMeters'), 'pietro': PIETRO.get(i.get('floorNumber')), 'ulica': ulica(((i.get('location') or {}).get('address'))),
            'dzielnica': d, 'miasto': m, 'tytul': (i.get('title') or '').strip(), 'sprzedawca': 'prywatna' if i.get('isPrivateOwner') else 'biuro',
            **({'foto': f} if (f := zdjecie(i)) else {}),
            **({'typ': typ} if typ != 'najem' else {}), **({'kat': kat} if kat != 'mieszkanie' else {})}

def tekst(html):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html or '')).strip()

KW = r'(?:parking\w*|miejsc\w* (?:parkingow\w*|postojow\w*)|stanowisk\w* (?:postojow\w*|garażow\w*)|garaż\w*|hal\w* garażow\w*)'
def parking(opis):
    """Reguły z procedury: kwota 30–800 zł przy parkingu = dodatkowo; w cenie/wliczone = wliczony; ogólnodostępne = brak; wzmianka niejasna = nieznany; brak wzmianki = nic."""
    t = opis.lower(); okna = [t[max(0, m.start() - 90): m.end() + 110] for m in re.finditer(KW, t)]
    if not okna: return None
    for o in okna:
        if re.search(r'osiedlow|promocj', o): continue
        for k in re.finditer(r'(\d[\d ]{0,4})(?:[,.]\d+)?\s*(?:zł|pln)', o):
            v = int(k.group(1).replace(' ', ''))
            if 30 <= v <= 800 and not re.search(r'wliczon|w cenie', o[max(0, k.start() - 40): k.end() + 40]): return {'stan': 'dodatkowo', 'kwota': v}
    for o in okna:
        if re.search(r'wliczon|w cen(ie|ę)|w czynsz|bez dodatkowych opłat|gratis|bezpłatn', o): return {'stan': 'wliczony'}
    for o in okna:
        if re.search(r'ogólnodostępn|ogolnodostepn|wzdłuż ulicy|przed blokiem bezpłatn', o): return {'stan': 'brak'}
    return {'stan': 'nieznany'}

def rok_z(ad, opis):
    t = (ad.get('target') or {}).get('Build_year'); y = int(t) if t and str(t).isdigit() else None
    if not y:
        m = re.search(r'(?:budyn\w*|blok\w*|apartamentow\w*|kamienic\w*|inwestycj\w*|osiedl\w*)[^.]{0,40}?z (1[89]\d\d|20[0-3]\d) ?r(?:oku|\.)', opis, re.I)
        y = int(m.group(1)) if m else None
    return y if y and 1800 <= y <= time.localtime().tm_year + 3 else None

def meble(opis):
    return bool(re.search(r'(?<!nie)(?<!nie )umeblowan|w pełni wyposażon\w* w meble', opis, re.I)) and not re.search(r'nieumeblowan|bez mebli', opis, re.I)

# ---------- przeglądarka ----------
def next_data(pg, url):
    for proba in range(3):
        try:
            r = pg.goto(url, wait_until='domcontentloaded', timeout=60000); time.sleep(2.5)
            m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', pg.content(), re.S)
            if m: return (r.status if r else 0), json.loads(m.group(1))
            if r and r.status == 404: return 404, None
        except Exception as e: log('  błąd strony, ponawiam:', str(e)[:80])
        time.sleep(15 + 15 * proba)
    return 0, None

def lista(pg, extra='', sciezka='wynajem/mieszkanie', typ='najem', kat='mieszkanie'):
    """Wszystkie strony listy. Zwraca (rekordy, liczba ogłoszeń wg portalu) albo (None, ...) gdy czegoś brakuje."""
    out, tot, n, wid = {}, None, 1, set()
    while True:
        st, d = next_data(pg, LISTA % (sciezka, n) + extra)
        sa = (((d or {}).get('props') or {}).get('pageProps') or {}).get('data', {}).get('searchAds') if d else None
        if not sa: return None, tot
        pag = sa.get('pagination') or {}; tot = pag.get('totalItems', tot)
        if not sa.get('items') and n < (pag.get('totalPages') or 1): return None, tot     # pusta strona w środku listy = coś nie tak
        for i in sa.get('items') or []:
            wid.add(i.get('id'))
            r = rekord(i, typ, kat)
            if r: out[r['portalId']] = r
        if n >= (pag.get('totalPages') or 1): break
        n += 1; time.sleep(6)
    lista.widziane = len(wid)                      # wszystkie pozycje listy, także pominięte (inwestycje, ukryta cena)
    return list(out.values()), tot

def szczegoly_sprz(pg, r):
    """Oferta sprzedaży: rok budowy, stan wykończenia, rynek, powierzchnia działki domu. Tylko pola techniczne."""
    st, d = next_data(pg, r['url'])
    ad = (((d or {}).get('props') or {}).get('pageProps') or {}).get('ad') if d else None
    if not ad: return 'brak'
    t = ad.get('target') or {}; y = rok_z(ad, ''); c = (t.get('Construction_status') or [None])[0]; mk = t.get('MarketType')
    if y: r['rok'] = y
    if STAN.get(c): r['stan'] = STAN[c]
    if mk in ('primary', 'secondary'): r['rynek'] = 'pierwotny' if mk == 'primary' else 'wtorny'
    try:
        if t.get('Terrain_area') and r.get('kat') == 'dom': r['dzm2'] = float(t['Terrain_area'])
    except ValueError: pass
    r['szcz'] = 1
    return 'ok'

def szczegoly(pg, r):
    st, d = next_data(pg, r['url'])
    ad = (((d or {}).get('props') or {}).get('pageProps') or {}).get('ad') if d else None
    if not ad: return 'brak'
    opis = tekst(ad.get('description')); y = rok_z(ad, opis); p = parking(opis)
    if y: r['rok'] = y
    if p: r['parking'] = p
    if meble(opis): r['attrs'] = {'meble': 1}
    return 'ok'

# ---------- aplikacja ----------
def otworz_aplikacje(ctx, app, sync, key):
    pg = ctx.new_page(); pg.goto(app + '#/start', wait_until='load', timeout=90000)
    pg.wait_for_function('() => window.__am && window.__am.sync', timeout=90000)
    pg.evaluate('([u, k]) => window.__am.sync.connect(u, k)', [sync, key])
    for _ in range(60):
        st = pg.evaluate('() => window.__am.sync.status()')
        if st['state'] == 'ok': break
        if st['state'] in ('error', 'offline'): raise SystemExit('Synchronizacja nie działa: ' + str(st.get('error')))
        time.sleep(2)
    return pg

ZNANE_JS = '''() => { const S = window.__am.S, k = s => ((s || '').match(/-(ID[0-9A-Za-z]+)$/) || [])[1];
  const m = {}, sz = {}, all = S.offers.concat(S.poza, S.katy || [], S.sprz || []); for (const o of all) { const a = k(o.url) || (/^ID/.test(o.portalId || '') ? o.portalId : null); if (a) m[a] = o.portalId || null; if (o.portalId) { m['#' + o.portalId] = o.portalId; if (o.szcz) sz[o.portalId] = 1; } }
  return { m, sz, n: S.offers.length, wszystkie: all.length, zebrania: (S.ust.zebrania || []).length }; }'''

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--proba', action='store_true')
    ap.add_argument('--app', default='https://lewym90.github.io/operatszacunkowy/'); ap.add_argument('--sync', default='https://188-68-247-201.sslip.io/operat-sync')
    ap.add_argument('--max-nowych', type=int, default=400); ap.add_argument('--max-sprzedaz', type=int, default=800, help='ile ogłoszeń sprzedaży otworzyć w jednym przebiegu (reszta w kolejnych)'); ap.add_argument('--test-szczegoly', type=int, help=argparse.SUPPRESS); a = ap.parse_args()
    key = os.environ.get('OPERAT_SYNC_KEY', '')
    if not key: raise SystemExit('Brak klucza synchronizacji (OPERAT_SYNC_KEY).')
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
        ctx = b.new_context(locale='pl-PL', timezone_id='Europe/Warsaw', viewport={'width': 1366, 'height': 900}, user_agent=UA)
        log('1/5 Aplikacja: pobieram bazę z serwera...')
        app = otworz_aplikacje(ctx, a.app, a.sync, key); zn = app.evaluate(ZNANE_JS)
        log(f'    w bazie {zn["wszystkie"]} ofert (najem mieszkań w Lublinie {zn["n"]}), zebrań {zn["zebrania"]}')
        if zn['n'] < 100: raise SystemExit('Baza wygląda na niepełną (mniej niż 100 ofert). Przerywam, nic nie zapisano.')
        pg = ctx.new_page()
        log('2/5 Lista ofert (całe województwo)...')
        wsz, tot = lista(pg)
        if wsz is None or not tot or brak(lista.widziane, tot): raise SystemExit(f'Lista niepełna ({len(wsz or [])} z {tot}). Przerywam, nic nie zapisano.')
        log(f'    {len(wsz)} ofert (portal podaje {tot}); w Lublinie {sum(1 for r in wsz if r["miasto"] == "Lublin")}')
        filtry = {}
        for k, f in FILTRY:
            time.sleep(8); rr, t = lista(pg, '&extras=%5B' + f + '%5D')
            if rr is None or t is None or brak(lista.widziane, t): log(f'    filtr {k}: niepełny, pomijam'); continue
            filtry[k] = rr; log(f'    filtr {k}: {len(rr)}')
        inne = []                                                    # pozostałe kategorie: wszystkie muszą przejść, inaczej przerwanie (pełne zebranie oznaczyłoby je jako nieaktualne)
        for sc, typ, kat in GRUPY[1:]:
            time.sleep(8); rr, t = lista(pg, '', sc, typ, kat)
            # sprzedaż: portal liczy osobno mieszkania w inwestycjach, które lista pokazuje jednym kafelkiem, więc tam wystarczą wszystkie strony
            if rr is None or t is None or (typ == 'najem' and brak(lista.widziane, t)): raise SystemExit(f'Lista {sc} niepełna ({len(rr or [])} z {t}). Przerywam, nic nie zapisano.')
            wid = lista.widziane
            if sc == 'sprzedaz/mieszkanie':
                time.sleep(8); wt, t2 = lista(pg, '&market=SECONDARY', sc, typ, kat)
                if wt is None or brak(lista.widziane, t2): raise SystemExit(f'Lista rynku wtórnego niepełna ({len(wt or [])} z {t2}). Przerywam, nic nie zapisano.')
                log(f'    w tym rynek wtórny: {len(wt)} (portal {t2})'); wt = {x['portalId'] for x in wt}
                for x in rr: x['rynek'] = 'wtorny' if x['portalId'] in wt else 'pierwotny'
            inne += rr; log(f'    {sc}: {len(rr)} (portal {t}, pozycji na liście {wid})')
        for r in wsz + inne + [x for v in filtry.values() for x in v]:      # numer ogłoszenia jak w bazie
            pid = zn['m'].get(r['portalId'])
            if pid: r['portalId'] = pid
        nowe = [r for r in wsz if r['portalId'] not in zn['m'] and ('#' + r['portalId']) not in zn['m']]
        log(f'3/5 Nowe ogłoszenia do otwarcia: {len(nowe)} (znanych nie otwieramy)')
        if len(nowe) > a.max_nowych: raise SystemExit(f'Podejrzanie dużo nowych ({len(nowe)}). Przerywam, nic nie zapisano.')
        st = {'ok': 0, 'brak': 0}
        for i, r in enumerate(nowe[:a.test_szczegoly] if a.test_szczegoly else nowe, 1):
            st[szczegoly(pg, r)] += 1; time.sleep(4)
            if i % 20 == 0: log(f'    {i}/{len(nowe)}')
        szcz = {x['portalId']: x for x in nowe}
        for v in filtry.values():
            for r in v:
                if r['portalId'] in szcz: r.update({k: szcz[r['portalId']][k] for k in ('rok', 'parking', 'attrs') if k in szcz[r['portalId']]})
        pk = {}
        for r in nowe: pk[(r.get('parking') or {}).get('stan', 'brak wzmianki')] = pk.get((r.get('parking') or {}).get('stan', 'brak wzmianki'), 0) + 1
        log(f'    odczytano {st["ok"]}, niedostępne {st["brak"]}; rok budowy {sum(1 for r in nowe if r.get("rok"))}, umeblowane {sum(1 for r in nowe if r.get("attrs"))}, parking {pk}')
        kol = [r for r in inne if r.get('typ') == 'sprzedaz' and r.get('kat') in (None, 'dom') and r['portalId'] not in zn['sz']]
        kol.sort(key=lambda r: (r.get('kat') == 'dom', r.get('rynek') != 'wtorny'))
        kol = kol[:a.max_sprzedaz]; log(f'    sprzedaż: otwieram {len(kol)} ogłoszeń (rok, stan, rynek; reszta w kolejnych zebraniach)'); ok2 = 0
        for i, r in enumerate(kol, 1):
            ok2 += szczegoly_sprz(pg, r) == 'ok'; time.sleep(4)
            if i % 50 == 0: log(f'    {i}/{len(kol)}')
        log(f'    odczytano {ok2}; stan: ' + str({k: sum(1 for r in kol if r.get('stan') == k) for k in STAN.values()}))
        if a.proba:
            log('4/5 PRÓBA: nic nie zapisuję.'); log('WYNIK: PRÓBA UDANA'); b.close(); return
        log('4/5 Import do aplikacji (jedno zebranie)...')
        w = app.evaluate('(x) => { const r = window.__am.importOffers(x, { pelne: true }); return { dodane: r.added, zaktualizowane: r.updated, zebranie: r.zebranie.id }; }', wsz + inne)
        for k, rr in filtry.items(): app.evaluate('([x, k]) => window.__am.importOffers(x, { attrs: [k] })', [rr, k])
        pz = app.evaluate('() => { const S = window.__am.S; return [S.offers.length, S.katy.length, S.sprz.length, S.poza.length]; }')
        log(f'    nowe {w["dodane"]}, znane {w["zaktualizowane"]}, zebranie nr {w["zebranie"]}')
        log(f'    w bazie: najem mieszkań Lublin {pz[0]}, najem domów/lokali/hal/garaży {pz[1]}, sprzedaż Lublin {pz[2]}, spoza Lublina {pz[3]}')
        log('5/5 Wysyłam na serwer...')
        app.evaluate('() => window.__am.sync.run()'); time.sleep(3)
        for _ in range(90):
            s = app.evaluate('() => window.__am.sync.status()')
            if s['state'] == 'ok': break
            if s['state'] in ('error', 'offline'): raise SystemExit('Wysyłka nie powiodła się: ' + str(s.get('error')))
            time.sleep(2)
        log('    zapisane na serwerze'); log('WYNIK: ZEBRANIE ZAPISANE. Otwórz aplikację na telefonie, pobierze zmiany sama.')
        b.close()

if __name__ == '__main__':
    main()
