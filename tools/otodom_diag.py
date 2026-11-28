#!/usr/bin/env python3
"""Diagnostyka: jak portal podaje zdjęcie na liście ofert (pierwsze 3 ogłoszenia). Nic nie zapisuje.
Uruchamiać na serwerze w środowisku zbieracza: /opt/operat-otodom/venv/bin/python otodom_diag.py"""
import json, re, time
from playwright.sync_api import sync_playwright
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
    pg = b.new_context(locale='pl-PL', user_agent=UA).new_page()
    pg.goto('https://www.otodom.pl/pl/wyniki/wynajem/mieszkanie/malopolskie?limit=36&page=1', wait_until='domcontentloaded', timeout=60000); time.sleep(3)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', pg.content(), re.S)
    items = json.loads(m.group(1))['props']['pageProps']['data']['searchAds']['items'] if m else []
    print('ogłoszeń na stronie:', len(items))
    for i in items[:3]:
        print('---', i.get('slug', '')[:60])
        print('klucze:', sorted(i.keys()))
        for k in i:
            if re.search(r'image|photo|foto|thumb|picture', k, re.I): print(k, '=', json.dumps(i[k], ensure_ascii=False)[:400])
    b.close()
