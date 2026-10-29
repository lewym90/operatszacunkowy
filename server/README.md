# Serwer synchronizacji (opcjonalny)

Jeden plik Pythona bez zależności (`sync_server.py`) + SQLite. Przechowuje oferty, własne umowy, wyceny, wpisy o budynkach i ustawienia,
żeby telefon, tablet i komputer miały te same dane. Dostęp wyłącznie z tajnym kluczem (nagłówek `Authorization: Bearer`).
Konflikt tego samego rekordu rozstrzyga nowszy znacznik czasu. Raz na dobę powstaje kopia bazy (7 ostatnich, `/var/lib/operat-sync/kopie`).

Nie ma tu żadnych kluczy ani danych: klucz generuje `install.sh` na serwerze i zapisuje w `/etc/operat-sync.env` (tylko root).
Dane RCN nie idą przez ten serwer: aplikacja pobiera je z pliku `/operat-data/rcn_lublin.json`.

## Instalacja (na serwerze, jako root)

    cd /tmp && rm -rf operat-src && git clone --depth 1 https://github.com/lewym90/operatszacunkowy operat-src
    bash operat-src/server/install.sh

Skrypt wypisze klucz. Potem w Caddy trzeba przekierować `/operat-sync/*` na `127.0.0.1:8787` (patrz poniżej) i przeładować Caddy.

    handle_path /operat-sync/* {
        reverse_proxy 127.0.0.1:8787
    }

## Interfejs

- `GET  /v1/ping`  → `{ok, v, records}`
- `POST /v1/sync`  `{since, changes:[{c,id,ts,del?,d?}]}` → `{cursor, more, records:[...]}`
