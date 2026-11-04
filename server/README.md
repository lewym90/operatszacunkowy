# Serwer synchronizacji (opcjonalny)

Jeden plik Pythona bez zależności (`sync_server.py`) + SQLite. Przechowuje oferty, własne umowy, wyceny, teczki, historię dokumentów, wpisy o budynkach i ustawienia,
żeby telefon, tablet i komputer miały te same dane. Dostęp wyłącznie z tajnym kluczem (nagłówek `Authorization: Bearer`).
Konflikt tego samego rekordu rozstrzyga nowszy znacznik czasu. Raz na dobę powstaje kopia bazy (7 ostatnich, `/var/lib/operat-sync/kopie`).

Nie ma tu żadnych kluczy ani danych: klucz generuje `install.sh` na serwerze i zapisuje w `/etc/operat-sync.env` (tylko root).
Dane RCN nie idą przez ten serwer: aplikacja pobiera je z pliku `/operat-data/rcn_lublin.json`.

## Instalacja (na serwerze, jako root)

    cd /tmp && rm -rf operat-src && git clone --depth 1 https://github.com/lewym90/operatszacunkowy operat-src
    bash operat-src/server/install.sh

Skrypt wypisze klucz. Potem w Caddy trzeba przekierować `/operat-sync/*` na `127.0.0.1:PORT (skrypt wypisze port)` (patrz poniżej) i przeładować Caddy.

    handle_path /operat-sync/* {
        reverse_proxy 127.0.0.1:PORT (skrypt wypisze port)
    }

## Interfejs

- `GET  /v1/ping`  → `{ok, v, records}`
- `POST /v1/sync`  `{since, changes:[{c,id,ts,del?,d?}]}` → `{cursor, more, records:[...]}`

## Punkty otoczenia z OpenStreetMap (osm_lublin.json)
`sudo bash install_osm.sh` (z katalogu server/ pobranego repo) kopiuje tools/osm_export.py, włącza cotygodniowy timer operat-osm.timer i od razu robi pierwsze pobranie do /var/www/operat-data/osm_lublin.json. Aplikacja czyta plik spod tego samego adresu co rcn_lublin.json. Podgląd: `journalctl -u operat-osm -f`. Za mały lub pusty wynik nie podmienia poprzedniego pliku.
Test, czy otoczenie poprawia wycenę: `python3 tools/osm_analiza.py /var/www/operat-data/rcn_lublin.json /var/www/operat-data/osm_lublin.json`.


Aktualizacja samego programu (klucz i dane bez zmian): `curl -fsSL https://lewym90.github.io/operatszacunkowy/server/update_sync.sh | bash`
