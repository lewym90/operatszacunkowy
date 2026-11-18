#!/usr/bin/env python3
"""Test: czy Otodom wpuszcza przeglądarkę z serwera. Otwiera 2 strony listy najmu, niczego nie zapisuje, wypisuje same liczby."""
import json, re, sys, time
from playwright.sync_api import sync_playwright
URL = {'Lublin': 'https://www.otodom.pl/pl/wyniki/wynajem/mieszkanie/lubelskie/lublin/lublin/lublin?limit=72&page=1',
       'województwo': 'https://www.otodom.pl/pl/wyniki/wynajem/mieszkanie/lubelskie?limit=72&page=1'}
def znajdz(o, k):
    if isinstance(o, dict):
        for a, b in o.items():
            if a == k: return b
            r = znajdz(b, k)
            if r is not None: return r
    elif isinstance(o, list):
        for b in o:
            r = znajdz(b, k)
            if r is not None: return r
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
    c = b.new_context(locale='pl-PL', timezone_id='Europe/Warsaw', viewport={'width': 1366, 'height': 900},
                      user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
    pg = c.new_page(); ok = 0
    for n, u in URL.items():
        try:
            r = pg.goto(u, wait_until='domcontentloaded', timeout=60000); time.sleep(4)
            h = pg.content(); st = r.status if r else '?'
            m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
            if not m:
                blok = 'captcha' if re.search(r'captcha|robot|verify you are human|weryfikacj', h, re.I) else 'zablokowane albo inna strona'
                print(f'{n}: status {st}, BRAK DANYCH ({blok}), tytuł: {pg.title()[:60]}'); continue
            d = json.loads(m.group(1)); it = znajdz(d, 'items') or []; tot = znajdz(d, 'totalCount')
            pag = znajdz(d, 'pagination') or {}
            print(f'{n}: status {st}, ofert na stronie {len(it)}, wszystkich ogłoszeń {pag.get("totalItems") or tot or "?"}, stron {pag.get("totalPages", "?")}')
            ok += bool(it)
        except Exception as e: print(f'{n}: BŁĄD {str(e)[:120]}')
        time.sleep(6)
    b.close()
print('\nWYNIK: ' + ('OTODOM WPUSZCZA SERWER' if ok == 2 else 'OTODOM BLOKUJE SERWER' if ok == 0 else 'CZĘŚCIOWO'))
