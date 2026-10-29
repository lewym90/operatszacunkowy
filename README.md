# Operat szacunkowy (AM Nieruchomości)

Prywatne narzędzie do orientacyjnej oceny wartości sprzedaży i najmu (Lublin i woj. lubelskie).
Zwykłe pliki HTML/CSS/JS, bez budowania i bez zależności; działa offline po pierwszym otwarciu (PWA).
**Dane (oferty, historia, RCN) są tylko w telefonie (IndexedDB). Repozytorium zawiera sam kod, żadnych danych.**

## Zasady wyceny
- metoda porównawcza; wynik = przedział + liczba porównań + poziom pewności + uwagi;
- żadnych korekt „z głowy": standard, wyposażenie i rok budowy nie zmieniają ceny, dopóki dane porównawcze tego nie pozwalają;
- za mało danych = brak wyniku;
- sprzedaż: transakcje z RCN (akty notarialne), najem: ceny ofertowe z list ogłoszeń (oznaczone jako ofertowe);
- progi pewności są orientacyjne, do skalibrowania (zakładka Historia: wpisz cenę rzeczywistą po transakcji).

## Publikacja (GitHub Pages)
1. Wgraj całą zawartość folderu do gałęzi `main` (plik `index.html` w katalogu głównym).
2. Settings → Pages → Deploy from a branch → `main` / root.
3. Po każdej zmianie: `python3 tools/mksw.py .` i zwiększ `VERSION` w `sw.template.js` (inaczej telefon trzyma starą wersję).
4. iPhone: Safari → Udostępnij → Do ekranu początkowego. Po zmianie ikony lub paska stanu usuń ikonę i dodaj od nowa.

## Dane RCN (sprzedaż)
Na serwerze: `python3 tools/rcn_export.py --out /var/www/operat-data/rcn_lublin.json`
(tylko biblioteka standardowa; pomija dane stron transakcji). Plik udostępnij przez Caddy z nagłówkiem
`Access-Control-Allow-Origin: *`, a jego adres wpisz w aplikacji: Dane → Adres pliku z serwera.
Skrypt nie był jeszcze uruchomiony na żywej usłudze GUGiK: pierwsze uruchomienie sprawdź (liczba rekordów, „bez współrzędnych").

## Oferty najmu
Dane → Wgraj PDF (Safari: lista ofert → Udostępnij → Drukuj → pinch → Zapisz do Plików) albo wklej tekst. Odczyt lokalny, bez AI.
Zapisywane są tylko cena, czynsz, metraż, pokoje, piętro, lokalizacja. Regulamin portalu zakazuje agregowania danych bez zgody:
przed użyciem komercyjnym uzyskaj zgodę lub licencję i skonsultuj to z prawnikiem.

## Testy
`node test/engine.test.mjs <oferty.json>` (silnik), `node test/e2e.cjs <katalog>` (przeglądarka, rozmiar telefonu).
