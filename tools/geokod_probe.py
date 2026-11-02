#!/usr/bin/env python3
"""Sprawdza, które urzędowe źródła adresów (GUGiK: geokoder UUG oraz paczki punktów adresowych PRG) są dostępne z tego serwera i co zwracają.
Tylko odczyt, kilkanaście zapytań. Wynik wklej do rozmowy: na tej podstawie wybieram metodę."""
import json, sys, urllib.parse, urllib.request, urllib.error

def get(url, n=900, method='GET', rng=None):
    h = {'User-Agent': 'operat-geokod-probe/1.0', 'Accept': '*/*'}
    if rng: h['Range'] = rng
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h, method=method), timeout=40) as r:
            body = r.read(n if method == 'GET' else 0).decode('utf-8', 'replace')
            return r.status, {k.lower(): v for k, v in r.headers.items()}, body
    except urllib.error.HTTPError as e: return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read(300).decode('utf-8', 'replace')
    except Exception as e: return 0, {}, repr(e)

print('=== 1. Geokoder UUG (GUGiK) ===')
for adr in ['Lublin, Granata 1', 'Lublin, Krężnicka 275', 'Lublin, Granata', 'Lublin, Aleje Racławickie 14']:
    u = 'https://services.gugik.gov.pl/uug/?' + urllib.parse.urlencode({'request': 'GetAddress', 'address': adr})
    st, h, b = get(u, 1200)
    print(f'\n--- {adr} -> HTTP {st}, CORS: {h.get("access-control-allow-origin")}, typ: {h.get("content-type")}\n{b}')

print('\n=== 2. Paczki punktów adresowych PRG (nagłówki) ===')
for u in ['https://integracja.gugik.gov.pl/PRG/pobierz.php?adresy', 'https://integracja.gugik.gov.pl/PRG/pobierz.php?adresy_lubelskie', 'https://opendata.geoportal.gov.pl/prg/adresy/']:
    st, h, b = get(u, 200, rng='bytes=0-199')
    print(f'\n{u}\n  HTTP {st}, rozmiar: {h.get("content-length")} / {h.get("content-range")}, typ: {h.get("content-type")}\n  {b[:200]!r}')

print('\n=== 3. Usługi WFS (GetCapabilities) ===')
for u in ['https://mapy.geoportal.gov.pl/wss/service/PZGiK/EMUiA/WFS/UniversalAddress?service=WFS&request=GetCapabilities',
          'https://mapy.geoportal.gov.pl/wss/service/PZGiK/PRG/WFS/AddressPoint?service=WFS&request=GetCapabilities']:
    st, h, b = get(u, 700)
    print(f'\n{u}\n  HTTP {st}, typ: {h.get("content-type")}\n  {b[:700]!r}')
