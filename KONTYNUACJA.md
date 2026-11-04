# KONTYNUACJA — OPERAT SZACUNKOWY (AM Nieruchomości)

Plik przekazania pracy między kontami/sesjami Claude. Stan na **2026-11-04, wersja aplikacji 1.23.4** (pełna analiza z teczki, IRR/NPV, jakość porównań, porównanie wycen, promienie, nowe raporty z numeracją, mapa rentowności).
Ten plik zawiera całą wiedzę potrzebną do kontynuacji: nie wymaga dostępu do poprzednich rozmów ani do poprzedniego projektu Claude.

> **UWAGA — repozytorium jest PUBLICZNE (GitHub Pages).** W tym pliku nie ma i nie wolno zapisywać haseł, kluczy, tokenów, kodu synchronizacji „AMSYNC1:…”, adresu IP serwera ani danych ofert/klientów. Nigdy nie wklejaj klucza synchronizacji do czatu ani na zrzut ekranu — właściciel wpisuje go sam.

---

## 0. PROMPT STARTOWY (dla nowego konta Claude)

Właściciel wkleja do nowej sesji (z podpiętym GitHubem i repo `lewym90/operatszacunkowy`):

> „Odczytaj plik KONTYNUACJA.md z repozytorium lewym90/operatszacunkowy i kontynuuj pracę nad aplikacją OPERAT SZACUNKOWY.”

**Co ma zrobić Claude, zaczynając sesję:**
1. Dołączyć repo do sesji (narzędzie dodawania repozytorium GitHub, jeśli jest) i sklonować je do katalogu roboczego; przeczytać ten plik w całości.
2. Przeczytać `README.md` i `server/README.md`, `git log --oneline | head -20`, uruchomić `bash test/all.sh` (oczekiwane: „WSZYSTKIE TESTY OK”; wymaga Node i Playwrighta z Chromium, Pythona 3; przy braku Node: `apt install -y nodejs`; jeśli w katalogu brak `package.json`, test silnika w tools/osm_silnik.mjs wymaga `{"type":"module"}`).
3. Odpowiedzieć właścicielowi jednym zdaniem, że wczytał stan, i podać krótko co jest otwarte (sekcja 11) — nie streszczać całego pliku.
4. Dalej pracować według zasad z sekcji 2 i 9.
5. Nie ma dostępu do starych dokumentów „Projects/APLIKACJE” z poprzedniego konta: ich istotną treść zawiera ten plik (sekcje 3–8). Jeśli nowe konto ma własny projekt, można tam zapisać kopię tego pliku i dokumentów z katalogu `docs/` (jeśli istnieją).
6. Właściciel nie jest programistą: odpowiedzi po polsku, krótko, najpierw odpowiedź; komendy dla serwera jako jedna linia do skopiowania (sekcja 9).

---

## 1. Idea i właściciel

- Właściciel: biuro **AM Nieruchomości** (Lublin). Biuro otwiera najwcześniej w **lutym 2027**. Marka: „Sprawdzone do końca.”, kolory onyx #0B0B0D + złoto #C8A44D, fonty Marcellus + Archivo.
- Aplikacja: PWA „OPERAT SZACUNKOWY” — orientacyjna ocena wartości **sprzedaży** (z cen transakcyjnych RCN) i **najmu** (z ofert Otodom oraz własnych umów). Nazwa aplikacji jest tylko dla właściciela; w raportach dla klienta jej nie ma (raport = „Orientacyjna analiza…”, wynik to „szacunkowa wartość”, nie wycena rzeczoznawcy).
- Repo: `lewym90/operatszacunkowy`, kod lokalnie zwykle w `/home/claude/operatszacunkowy`. Publikacja: GitHub Pages `https://lewym90.github.io/operatszacunkowy/` (wdrożenie po pushu trwa 1–3 min). Dane (oferty, historia, RCN) są tylko w telefonie (IndexedDB) i na prywatnym serwerze właściciela; repo zawiera sam kod.
- Właściciel używa aplikacji głównie na iPhonie (PWA z ekranu początkowego). Zrzuty ekranu z telefonu to najlepsze źródło informacji o błędach.

## 2. Zasady ustalone z właścicielem (obowiązujące)

1. **Bez wymyślonych liczb** i korekt „z głowy”; za mało danych = brak wyniku.
2. **Zmian metody wyceny nie wdrażamy bez walidacji na prawdziwych danych** (walidacja wsteczna/krzyżowa, liczby w dokumencie).
3. **Raport dla klienta**: daje WYLICZONĄ kwotę, bez ostrzeżeń i gwiazdek; techniczne notatki są filtrowane z raportu.
4. **Nie zawężamy się do mieszkań**: wszystkie rodzaje nieruchomości (domy, grunty, lokale, hale, garaże) w wycenie, na mapach i w danych. Najem innych rodzajów tylko z ofert/własnych umów (RCN nie ma czynszów).
5. **Narzędzie ma być profesjonalne i nie może ośmieszyć doradcy przed klientem.** Odległości do ważnych punktów (przystanki, szkoły…) liczymy WYŁĄCZNIE od dokładnego budynku znalezionego w urzędowym rejestrze adresów — **nigdy od środka ulicy, nigdy ze współrzędnych transakcji RCN**. Brak adresu w rejestrze = brak odległości (komunikat), bez zgadywania. Nie podstawiamy „podobnej” ulicy sami (błąd Rokickiego→Ruckiego) — tylko podpowiedź do potwierdzenia.
6. **Import danych w aplikacji, nie przez czat.** Przechowywane tylko pola techniczne ofert (cena, czynsz, metraż, pokoje, piętro, ulica, dzielnica, rok, znaczniki cech, link); bez opisów, zdjęć i danych osobowych.
7. Linki do ogłoszeń widoczne wszędzie, gdzie pokazują się oferty z bazy (poza raportem klienta: brak konkretnych ofert/linków z portali).
8. **Najpierw odpowiedź**, gdy właściciel pyta tylko o odpowiedź. Odpowiedzi po polsku, zwięźle, bez przechwałek; błędy przyznawać wprost i naprawiać.
9. **Klucz synchronizacji**: nigdy w czacie, na zrzutach, w plikach repo.
10. **Zbieranie ofert** (Otodom): tylko własny użytek, spokojne tempo, tylko pola techniczne, pod nadzorem właściciela (regulamin zabrania agregowania bez zgody — sekcja 8, punkt 15 listy).
11. **Jedna karta aplikacji naraz** (dwie karty doprowadziły do utraty ofert z serwera; od 1.11.2 jest zabezpieczenie, ale zasada zostaje).

## 3. Architektura aplikacji

PWA bez budowania i bez zależności (zwykłe pliki), ES-modules. Dane lokalnie: IndexedDB (`js/store.js`) + localStorage.

| Plik | Rola |
|---|---|
| `index.html`, `css/app.css`, `manifest.webmanifest`, `sw.template.js` → `sw.js` | powłoka PWA; **SW generowany** `python3 tools/mksw.py .` |
| `js/app.js` | główny interfejs: ekran Start (8 kafelków), na telefonie pasek Start/Wycena/Mapa/Rynek/Więcej (reszta w menu), na komputerze boczne menu ze wszystkim; widoki Wycena, Mapa, Rynek, Oferty, Dane, Historia, Raporty, Ustawienia; formularze, raport, teczki, CRM, kalkulator, okolica |
| `js/engine.js` | silnik wyceny: sprzedaż mieszkań (porównania RCN), sprzedaż pozostałych rodzajów (`estimateSaleKat`), najem (hybryda A+B, `estimateRentKat` dla innych rodzajów), pewność, przedziały |
| `js/rcn.js` | wczytanie i filtrowanie danych RCN z serwera |
| `js/geokod.js` | geokoder adresów (GUGiK UUG, PRG), dopasowanie nazw ulic, podpowiedzi, cache |
| `js/osm.js` | warstwy OSM (7), odległości (`nearest`, `okolica`) |
| `js/mapa.js` | mapa Leaflet i warstwy |
| `js/rynek.js` | zakładka Rynek (trendy, rentowność, czas ekspozycji, wykresy SVG) |
| `js/report.js` | raport PDF (3 warianty: krótki / pełny / z wykresami rynku), sekcja „Najbliższe okolice” |
| `js/invest.js` | kalkulator inwestycyjny (podatki orientacyjne, kredyt) |
| `js/parseOtodom.js`, `js/pdfimport.js` | odczyt ofert z tekstu/PDF |
| `js/sync.js` | synchronizacja z własnym serwerem (kod „AMSYNC1:…” = klucz; ochrona przed masowym usunięciem) |
| `js/ui.js` | pomocnicze elementy UI (uwaga: eksportuje m.in. `suggest` — dlatego w app.js geokoder importowany jako `suggestAddr`) |
| `server/*`, `tools/*` | skrypty serwerowe i narzędzia analityczne (sekcja 6) |
| `test/*` | testy (sekcja 9) |

**Wersjonowanie (obowiązkowe przy każdej zmianie kodu):** zwiększyć `const VERSION` w `js/app.js` **oraz** w `sw.template.js` (tam jako `am-wycena-vX.Y.Z`; muszą się zgadzać, pilnuje tego test w `test/all.sh`; `mksw.py` tylko wstawia listę plików, wersji nie zmienia), uruchomić `python3 tools/mksw.py .`, następnie `bash test/all.sh`, commit, push. Bez tego telefon trzyma starą wersję. Po pushu właściciel zamyka i ponownie otwiera aplikację.

Model ofert: `o.hc=[[idZebrania,cena],...]` (historia cen; pierwszy element = najstarsza, ostatni = obecna); statusy: nowe / aktualne / nieaktualne; zebrania `S.ust.zebrania=[{id,ts,pelne,n}]`; filtry listy Oferty (`S.of.status`): Wszystkie, Zmiany cen, Nowe ogłoszenia, Aktualne, Nieaktualne. Wyceny zapisywane w `wyceny` (wycena może mieć `e.geo` — wynik geokodowania budynku).

## 4. Silnik wyceny i walidacje (wyniki zmierzone)

### Sprzedaż (mieszkania)
Porównania z RCN (wolny rynek lub rynek pierwotny bezprzetargowo, pełna własność, cena samego lokalu), waga położenia, świeżości, podział ceny przy wielolokalowych, **korekta czasu** (zmiana rok do roku z ≥100 transakcji w oknie 12 mies., ograniczona −10%…+15%; od 1.15.1).
Walidacja na RCN (62 063 rekordów, 41 560 użytecznych mieszkań; wycena tylko z transakcji wcześniejszych):
- próbka A (300, ost. 6 mies.): bez korekty błąd 9,2% (obciążenie +5,7%), z korektą 7,9% (0,0%);
- próbka B (300, ost. 9 mies.): 9,9% → 7,6%; pokrycie przedziału ok. 50%.
- Ograniczenie: testowane w okresie rosnących cen; dolne ograniczenie −10% to założenie.
**Sprawdzone i NIEwdrożone:** model ridge na RCN (11,3% błędu vs 7,6% porównań; mieszanki 70/30 i 50/50 bez poprawy); standard przy sprzedaży (RCN go nie zawiera → tylko pytanie informacyjne).

### Sprzedaż (pozostałe rodzaje) — `estimateSaleKat`
Cena za m² powierzchni właściwej rodzajowi; wagi: położenie (do 12 km), powierzchnia (log), podtyp, wiek transakcji, okno 3→5→8 lat. Powierzchnia użytkowa budynku jest tylko dla ok. 1/3 domów.

### Najem (mieszkania) — metoda hybrydowa (1.12.0)
- Warstwa A: porównania (30 najlepszych) + premie cech (ridge + bootstrap, min. 15 ofert po każdej stronie cechy).
- Warstwa B: ridge na ln(cena/m²), min. 60 ofert; cechy: metraż, pokoje, parter, piętro ≥5, przedziały roku budowy (<1990, 1990–2007, 2008–2017, ≥2018, nieznany), „wysoki standard” w tytule, klimatyzacja, winda, balkon, taras, ogród, garaż, meble (tylko gdy ≥15 znanych po obu stronach), dzielnica (λ=10), ulica (≥2 oferty, λ=2).
- Wartość centralna = exp(0,6·ln B + 0,4·ln A). Przedział = środkowe 50% błędów z testu wstecznego, ×1,25 przy niezgodzie A i B (>0,15), pewność obniżana przy niezgodzie >0,2. „Standard: wysoki” w formularzu podnosi wynik (jedyny sposób, by wycena wiedziała o luksusie).
- Walidacja krzyżowa 10-krotna na 358 ofertach: MAPE hybryda 11,8% (obciążenie +0,3%); same porównania 13,4%; sam model 13,4%; nowe budynki 8,2% zamiast 10,6%; pokrycie przedziału 51% (66% nowe, 42% stare, 38% duże). Granica: szum cen ofertowych 12–14%.
- Punkt kontrolny Granata (52 m², 3 pok., 1. piętro, Wrotków, rok 2025): ok. 2619 zł (2334–2984); ze „standard wysoki” ok. 2858 (2547–3257). Wrotków ma tylko ok. 10 ofert (niższa pewność).
- Przedziały: wariant ważonych kwantyli (`RANGE_MODE='seg'`) poprawia pokrycie z 6,7 do 5,8 pkt (szum) → zostaje `'base'`. Wrócić, gdy będzie kilkaset ofert więcej (`test/cvrent.js`).
- Cena oferty = czynsz BEZ opłat administracyjnych (mediana opłat ok. 14 zł/m², ok. 600 zł/mies.); decyzja właściciela: nie pokazujemy czynszu łącznie z opłatami.
- Cechy z treści ogłoszeń (sprzęt, ogrzewanie) dają tylko ok. 0,7 pkt MAPE → niepolecane (punkt 7 listy).
- Rynek najmu jest prawie całkiem umeblowany (325 z 360), więc obniżki za brak mebli nie da się zmierzyć (<15 ofert).
- Najem pozostałych rodzajów: `estimateRentKat` (≥5 pozycji, niska pewność), źródło: własne umowy właściciela (waga ×2) i oferty.

### Normalizacja ulic
`streetKey`: „Ks. Wincentego Granata” = „Granata”; numer domu usuwany; „3 Maja”, „Lubelskiego Lipca 80” zachowane.

## 5. Dane zewnętrzne i ustalenia

### RCN (ceny transakcyjne; dane publiczne, bezpłatne od 13.02.2026)
- WFS GUGiK: warstwy `ms:lokale`, `ms:budynki`, `ms:dzialki`, `ms:powiaty`. Zapytanie działa BEZ `srsName`; geometria w EPSG:2180 (przeliczana na WGS84).
- Warstwy budynki i dzialki powtarzają też transakcje LOKALAMI, więc domy/grunty wyłuskuje się po `NIER_RODZAJ`; jeden wiersz = jedna transakcja.
- Lokale: `LOK_FUNKCJA` = mieszkalna, garaz, handlowoUslugowa, biurowa, produkcyjna, inna. Budynki: `BUD_RODZAJ` = mieszkalny, handlowoUslugowy, biurowy, przemyslowy, zbiornikiSilosyMagazyny, gospodarczy, transportuILacznosci, pozostaleNiemieszkalne, oswiatyISportu, szpitale. Działki: `DZI_PRZEZN_WMPZP`, `DZI_SPOSOB_UZYT`.
- **Jednostki:** powierzchnia gruntu bywa w m², a bywa w HEKTARACH — jednostkę ustala się po tym, czy cena za m² mieści się w rozsądnym przedziale; gdy niejednoznaczne, rekord pomijany.
- Daty bywają błędne (rok 0204) i z przyszłości; odrzucane, wtedy rok z numeru aktu. Transakcje wielu nieruchomości w jednym akcie i udziały pomijane. Rodzaj transakcji: wolnyRynek oraz sprzedazBezprzetargowa na rynku pierwotnym.
- Obszar: prostokąt Lublin + okolice. `LOK_NR_KOND` (piętro): numeracja NIEPOTWIERDZONA. Brak roku budowy w RCN i w EGiB Lublina.

### OpenStreetMap (punkty okolicy)
7 warstw: przystanki, szkoły, przedszkola, sklepy, parki, przychodnie/szpitale, uczelnie. Serwer pobiera je raz w tygodniu do `osm_lublin.json` (`tools/osm_export.py`, `server/osm_refresh.sh`, timer `operat-osm`, instalacja `server/install_osm.sh`). Aplikacja czyta plik, adres wyprowadza z `S.ust.rcnUrl` (podmiana nazwy pliku; `osmUrl`). Powód: publiczny Overpass z telefonu dawał HTTP 504; serwery Overpass bywają dławione (skrypt: limit 60 s, log, kilka serwerów).

**Wpływ otoczenia na cenę — zmierzony i odrzucony (1.11.2026):**
- Test 1 (prosty model, `tools/osm_analiza.py`, CV 5-krotna, 42 133 mieszkania): wszystkie warstwy razem +0,37 pkt (mediana 9,34→8,91%).
- Test 2 (prawdziwy silnik, `tools/osm_silnik.mjs`): bez poprawki mediana 8,65%, średni 12,64%; z poprawką z otoczenia średni błąd ROŚNIE o 0,33–0,44 pkt dla każdej warstwy i wszystkich razem → **NIE używamy otoczenia w wycenie**. Warstwy zostają jako informacja (mapa, panel, raport). Najem nie testowany (brak podstaw, by oczekiwać inaczej).

### Geokodowanie adresów (PRG/GUGiK UUG) — od 1.21.0
- Usługa: `https://services.gugik.gov.pl/uug/?request=GetAddress&address=Lublin, <ulica> <nr>` (JSON, CORS `*`; wyniki pod kluczami "1".., pola: city, street, number, ulic, code, x (easting), y (northing) w EPSG:2180, accuracy; parametr „only exact numbers”:1 → brak wyników, gdy numeru nie ma). Przeliczenie EPSG:2180→WGS84 w JS (`fromEpsg2180`), zgodne z Pythonem (Granata 1 → 51.19946, 22.55288).
- NIE nadają się: pełne pobranie PRG oraz WFS EMUiA/PRG (401 lub puste).
- Walidacja (`tools/geokod_test.py`, 300 adresów z RCN): znaleziono 300/300; odchyłka od punktu RCN: mediana 8 m, p90 29 m, p99 82 m; jedno fałszywe dopasowanie nazwy (Rokickiego→Ruckiego) → reguła dopasowania nazw.
- **Reguła nazw:** wszystkie wpisane człony muszą pasować do członów oficjalnej nazwy; tytuły (ul, al, ks, gen, płk…) pomijane; to samo słowo, gdy wspólny prefiks ≥5 znaków i ≥ (długość krótszego − 3). Niejednoznaczność → lista kandydatów. Kody błędów: `brak_ulicy`, `brak_numeru`, `siec`, `niejednoznaczne`, `nie_znaleziono`.
- **Podpowiedzi** (`suggest`, 1.21.1): po „nie ma takiego budynku” szuka ulic o niemal identycznej nazwie (UUG + znane ulice z aplikacji), sprawdza, że pod tym numerem jest budynek, pokazuje „Czy chodziło o: Ks. Wincentego Granata 1” — **użycie dopiero po kliknięciu użytkownika**. Przykład: „Granta 1” → podpowiedź „Granata 1”.
- Cache: klucz `geokod`, 180 dni, max 400 wpisów (też jako fallback offline). Pierwsze wyszukanie adresu wymaga sieci. Usługa GUGiK jest publiczna i żywa (może się zmienić/być niedostępna).
- Silnik wyceny sprzedaży nadal używa własnego położenia z RCN (osobny temat); dokładny punkt z PRG służy tylko do odległości.
- Miasto jest domyślnie „Lublin” (`geocode({ulica,nr,miasto='Lublin'})`); przy innych miastach trzeba je przekazać.

### Zachowanie w aplikacji (odległości)
- Najem (mieszkania): pole „Nr budynku” w jednej linii z „Ulica”; sprzedaż: pole „Nr” obok ulicy.
- Panel wyceny (najem i sprzedaż): karta „Najbliższe okolice” — oficjalny adres („Ks. Wincentego Granata 1, Lublin (20-489)”), źródło, kafelki odległości w metrach; „Zmień adres lub wskaż na mapie”.
- Nie znaleziono: komunikat, pola ulicy/numeru, „Szukaj budynku”, podpowiedzi, „Pokaż najbliższe numery w rejestrze”, „Wskaż budynek na mapie” (punkt ręczny, źródło `reczne`, wymaga potwierdzenia).
- Raport klienta (pełny i rynkowy, nie krótki): sekcja „Najbliższe okolice”, 2 kolumny, odległości zaokrąglone do 10 m („ok. 190 m”), podpis ze źródłem położenia („Państwowy Rejestr Granic, GUGiK” lub „wskazano ręcznie”) i danych punktów („© współtwórcy OpenStreetMap”). Bez adresu w rejestrze raport nie zawiera odległości (w aplikacji podpowiedź dla doradcy).

## 6. Serwer właściciela (VPS „lewym90”) — bez sekretów

Adres IP i domena są znane właścicielowi (wpisane w ustawieniach aplikacji); nie zapisujemy ich tutaj. Serwer pracuje jako root; skrypty pobierane z GitHub Pages do `/opt/operat-*` (po pushu poczekać 1–3 min).

- **Synchronizacja:** usługa `operat-sync` (port 18795), `/opt/operat-sync`, klucz w `/etc/operat-sync.env`, baza `/var/lib/operat-sync`, Caddy: `handle_path /operat-sync/*`. Zapis: ostatni zapis wygrywa (per rekord). Kopie zapasowe: `server/backup_sync.sh` (zainstalowane 30.10, działają).
- **RCN:** timer `operat-rcn.timer` (03:40 ±15 min) → `/opt/operat-rcn/rcn_refresh.sh`: `rcn_export.py` (lokale → `/var/www/operat-data/rcn_lublin.json`) + `rcn_export_inne.py` (budynki + działki → `rcn_inne.json`); `rcn_meta.json` ma wersje obu plików. Awaria eksportu domów/gruntów nie blokuje mieszkań. Ręcznie: `systemctl start operat-rcn.service`, log: `journalctl -u operat-rcn`. Inne miasta: `server/rcn_miasto.sh` (po `bash install_rcn.sh`), np. `bash rcn_miasto.sh chelm 51.143 23.472`.
- **OSM:** timer `operat-osm` (tygodniowo), `osm_lublin.json` w `/var/www/operat-data`; zainstalowane przez właściciela 1.11.
- Pliki w `/var/www/operat-data` serwowane przez Caddy z `Access-Control-Allow-Origin: *`; adres wpisany w aplikacji: Dane → Adres pliku z serwera (`S.ust.rcnUrl`).
- **Termius skleja wklejone wieloliniowe polecenia** → dla właściciela zawsze jedna linia do skopiowania w osobnym polu (np. `curl -fsSL <URL skryptu z Pages> | bash`). Dłuższe skrypty udostępniamy jako pliki w repo i uruchamiamy jednolinijkowo, jako root.
- Instrukcja dla nowego urządzenia: plik `Operat-nowe-urzadzenie.txt` (poza repo; w razie potrzeby przygotować ponownie bez klucza).

## 7. Oferty Otodom — stan danych i procedura zbierania

### Stan
- 29.10: pierwszy pełny przegląd najmu mieszkań w Lublinie, 363 oferty (358 po scaleniu duplikatów). 31.10: drugie pełne zebranie: baza 368 ofert (340 aktualnych, 8 nowych, 20 nieaktualnych, 3 spadki cen w historii). Zsynchronizowane na serwer.
- **Kolejne pełne zebranie: po 5–7 listopada** (≥7 dni od pierwszego) — odblokuje kartę „Czas ekspozycji” (punkt 19).
- Baza ofert i umów domów/lokali/hal jest pusta (wyniki, gdy właściciel doda ≥5 pozycji danej kategorii).

### Procedura (wersja 1.18.0)
**Dla wszystkich aktualnych ofert (lista, 72 na stronę, ok. 6 stron, ok. 366 ogłoszeń):** cena, czynsz administracyjny, pokoje, m², piętro, ulica (bez „ul.”, „al.” zostaje), dzielnica, miasto, tytuł, sprzedawca, link, identyfikator portalu.
**Cechy z filtrów portalu** (6 przejść listy z parametrem `extras=%5B...%5D`): AIR_CONDITIONING, TERRACE, GARDEN, GARAGE, LIFT, BALCONY. Oferta ma 1, jeśli jest na liście filtra, inaczej 0.
**Tylko dla NOWYCH ofert — pełny odczyt ogłoszenia:** rok budowy (pole „Rok budowy” lub wyraźne „z 2026 roku”); parking: stan i kwota (30–800 zł przy słowie kluczowym = dodatkowo; „w cenie/wliczone” = wliczony; osiedlowe/promocyjne/niejasne = nieznany; „ogólnodostępne” = brak); meble = 1 tylko gdy ogłoszenie wyraźnie mówi „umeblowane” albo „w pełni wyposażone w meble”, inaczej nieznane.
**Czego NIE robić ponownie:** znanych ofert nadal widocznych (mają komplet danych); ofert, których już nie ma (dostają status nieaktualne). Z listy bierzemy tylko to, co się zmienia: cenę (historia) i czynsz.
**Historia cen:** gdy cena z listy różni się od zapisanej, aplikacja dopisuje zmianę do `o.hc`; lista Oferty pokazuje „aktualna zł (poprzednio X zł, Y zł)”.
**Statusy i zebrania:** import łączy się z ostatnim zebraniem, jeśli ma <12 h, inaczej tworzy nowe. Dopasowanie oferty: po `portalId`, potem po kluczu (cena, czynsz, pokoje, m², piętro, ulica, dzielnica, miasto); duplikaty tego samego mieszkania scalają się po kluczu. nieaktualne = ostatnio widziana przed ostatnim pełnym zebraniem (zostaje w bazie i liczy się w wycenach); nowe = pierwszy raz w ostatnim zebraniu (gdy zebrań >1); inaczej aktualne. Import pełnego przeglądu: `importOffers(found,{pelne:true,attrs})`.
**Technika w przeglądarce (panel Claude):** lista `?page=N`; parser artykułów pomija śmieci karuzeli („…”, „1 / 14”) i startuje od pierwszej linii z ceną; identyfikatory per filtr: tylko artykuły zawierające „zł” i „lubelskie”; dane między kartami przez `window.name`, z domeny github.io do karty aplikacji przez BroadcastChannel („am-collect” oferty, „am-ids” identyfikatory filtrów); przed testem w panelu wyrejestrować service worker i wyczyścić cache; pętle `setTimeout` zatrzymują się między wywołaniami → wykonywać synchronicznie w jednym wywołaniu; ogłoszenie 404 pomijamy.
Ogłoszenie Otodom (dane strukturalne) zawiera: tytuł, rok budowy (`build_year`), wyposażenie (`equipment_types`), dodatki (`extras_types`), ogrzewanie, czynsz administracyjny (`rent`); odczyt ok. 3 s na ogłoszenie.

## 8. Prawo / ToS (punkt 15 — OTWARTY)

- Regulamin Otodom (użytkownicy indywidualni, wersja 2021): 2.3a zakaz „wykorzystywania” treści bez zgody; 2.3b zakaz agregowania danych „w celu ich dalszego udostępniania osobom trzecim”; 8.1a zakłócanie serwisu.
- Zasady pracy: tylko dane techniczne, spokojne tempo, nadzór właściciela, raport klienta bez konkretnych ofert/linków/opisów z portali.
- **Przed otwarciem biura (luty 2027) potrzebna zgoda OLX Group/Otodom albo opinia prawnika.** Pytania do prawnika (skrót): czy regulaminy zakazują zapisywania takich danych do użytku wewnętrznego; ochrona baz danych sui generis; czy zagregowane statystyki w raporcie są dozwolone; czy pojedyncze porównania w raporcie są dozwolone; czy potrzebna licencja/API partnerskie; deduplikacja z wielu portali; RODO (adres bez danych właściciela). Warianty zabezpieczenia niezależne od odpowiedzi: raport tylko ze statystykami (wariant „krótki” to już robi), zapis bez URL-i, zamiana ofert na własne umowy biura i RCN, wystąpienie do portali o zgodę.
- Decyzja i kontakt po stronie właściciela.

## 9. Sposób pracy (przepływ zmian)

1. Zmiana kodu → dopisać/zmienić test w `test/` → `VERSION` w `js/app.js` i `sw.template.js` → `python3 tools/mksw.py .` → `bash test/all.sh` (musi kończyć się „WSZYSTKIE TESTY OK”) → commit → `git push`.
2. Testy: `test/all.sh` uruchamia m.in. e2e (Playwright, rozmiar telefonu), offline, mapa, kategorie, rcn-auto, oferty, raport, kalkulator, osm, chips, osm_analiza_test.py, osm_silnik_test.py, geokod.test.mjs, silnik, sync. Działają też w GitHub Actions (`.github/workflows/tests.yml`). Testy sieciowe używają mocków tras (osm_lublin.json, UUG) — nie wywołują prawdziwych usług.
3. Commit: krótki opis wersji po polsku (np. „1.21.2: …”). Dodawać stopkę atrybucji zgodną z bieżącą konfiguracją sesji (system poda właściwą).
4. Do właściciela: po pushu napisać, że wdrożenie Pages trwa 1–3 min i że trzeba zamknąć/otworzyć aplikację, żeby pobrała nową wersję.
5. Gdy trzeba coś uruchomić na serwerze: jedna linia do skopiowania (sekcja 6), wynik właściciel wkleja z powrotem.
6. Zadania wieloetapowe: lista zadań, na końcu sprawdzenie (testy, otwarcie wyniku). Dokument/pamięć projektu aktualizować po większych zmianach.
7. Błędne wpisy właściciela traktować życzliwie (np. „Granta” zamiast „Granata”): aplikacja ma podpowiadać, nie zgadywać.

## 10. Historia wersji (skrót)

- 1.3–1.5: dzielnica z ulicy; własne umowy najmu (waga ×2); znaczniki cech z filtrów portalu, mierzone przy ≥15 ofertach z cechą i ≥15 bez.
- 1.6.0 układ responsywny. 1.7.0 synchronizacja przez własny serwer. 1.8.0 automatyczna aktualizacja RCN. 1.9.x zakładka Mapa i filtry. 1.10.0 kategorie nieruchomości. 1.10.1–1.11.0 zakładka OFERTY i ZEBRANIA. 1.11.1 linki w porównaniach, PARKING w wycenie najmu (parking osobno płatny jako dopłata z ofert). 1.11.2 ochrona synchronizacji przed masowym usunięciem. 1.11.3–1.11.4 środek przedziału, normalizacja ulic. 1.12.0 hybrydowa metoda najmu.
- 1.13.0 zakładka RYNEK (trend cen/m² z RCN, rentowność najmu w dzielnicach, wykresy SVG), TECZKI nieruchomości (zdjęcia tylko lokalnie), własne umowy (panel „na żywo”, kontrola trafności).
- 1.14.0 kalkulator inwestycyjny (ryczałt, skala, liniowy, PCC 2%, kredyt, wrażliwość), blokada jednej karty + dziennik błędów, kopie zapasowe serwera, testy w GitHub Actions.
- 1.15.0 CRM w teczkach (statusy, zadania, koniec umowy, przypomnienia, odznaka na zakładce Historia), raport PDF w 3 wariantach. 1.15.1 korekta czasu w wycenie sprzedaży.
- 1.16.0 czas ekspozycji i historia zmian cen. 1.17.0 logo biura w raporcie, najem domów/lokali/hal z własnych umów, warstwy OSM, skrypty dla innych miast, materiał dla prawnika.
- 1.18.0 historia cen na liście Oferty; 1.18.1 filtry Zmiany cen / Nowe ogłoszenia / Nieaktualne.
- 1.19.0 punkty OSM z pliku serwera (koniec 504). 1.20.0 sekcja „Najbliższe okolice” w raporcie sprzedaży; 1.20.1 w raporcie najmu (wtedy z RCN po ulicy — **odrzucone przez właściciela, usunięte w 1.21.0**).
- 1.21.0 dokładny budynek z PRG, pole Nr budynku, karta w panelu i raporcie. 1.21.1 podpowiedzi przy literówce. 1.21.2 układ pól ulica/numer. 1.21.3 naprawa: `sw.template.js` i `sw.js` były puste od 1.20.0 (brak trybu offline/aktualizacji cache); przywrócone, dodany strażnik w `test/all.sh`.

- 1.22.0 nowa szata wg projektu właściciela (układ jak w projekcie, kolory onyx/złoto, Marcellus + Archivo, logo AM bez zmian): ekran Start, nagłówek z menu, karta wyniku z dużą wartością, Rynek z zakresem Miasto/Dzielnica/Promień, wskaźniki kalkulatora nad formularzem, lista Raporty. Świadome odstępstwa: pewność jako poziom (niska/średnia/wysoka), nie procent (zasada 1); zdjęcie w wyniku tylko z teczki; analiza wrażliwości jako wykres, nie suwaki.
- 1.23.0 pełna analiza z teczki (`fullAnalysis`, widok `#/analiza/<id>`, wynik w `t.analiza`, cechy spoza teczki z ostatniej wyceny tej teczki); kalkulator: `holdCalc`, `irr`, `npv`, `scenarios`, `whatIf` w `js/invest.js`; `js/jakosc.js`: `qualityOf`, `compWhy`, `diffWyceny` (nie zmieniają wyniku); `promienie`, `opisLokalizacji` w `js/osm.js`; raporty: inwest, lokal, rent, rynek, stopka „Orientacyjna analiza, nie operat szacunkowy…”, numer `AM/rok/nnnn-XX` (XX = urządzenie) nadawany przy zapisie PDF, kolekcja `dokumenty`; mapa: tryb Rentowność, grupowanie w `DotsLayer`. `rentPair`: para tylko przy tym samym rodzaju i metrażu, tej samej teczce lub adresie, do 180 dni. Raport najmu bez tabeli konkretnych ofert (zasada 7). Naprawiony stary błąd: serwer nie znał kolekcji `teczki`, więc teczki nie synchronizowały się; poprawka serwera: `server/update_sync.sh`, strażnik w `test/all.sh`.
- 1.23.1 sekcja „Porównanie rynkowe” w raporcie najmu (pełny i z wykresami, od 10 porównań): rozkład czynszów wszystkich ofert użytych w wycenie, ceny jak w ofertach, bez adresów (`rentBins`, `marketCv`). Decyzja właściciela: nazwa ogólna, bez nazwy portalu.
- 1.23.4 ikona ze zdjęciem domu, kluczem i planem (grafika właściciela) w `icons/ikona2-*`; przy każdej zmianie ikony nowa nazwa pliku, bo iOS trzyma starą w pamięci. 1.23.2 poprzednia ikona (dom, wykres, lupa) (nowe nazwy plików, bo iOS trzymał starą ikonę w pamięci); logo AM zostaje w `icons/logo-am.png` (ekran startowy, nagłówki, raport).

## 11. Lista pomysłów i stan (numeracja ustalona z właścicielem 30.10)

Gdy właściciel zapyta „co jeszcze jest do zrobienia”, podać punkty z sekcji „Zablokowane / czeka”.

### Zrobione (numery z listy)
1 blokada jednej karty + dziennik błędów; 3 najem domów/lokali/hal (z własnych umów, od 5 pozycji); 4 (część) korekta czasu; 5, 6 zakładka Rynek; 8 teczki; 9 własne umowy; 10 raport PDF w 3 wariantach + logo; 11 przypomnienia; 14 (część serwerowa) skrypt dla innych miast; 19 czas ekspozycji (karta gotowa, czeka na dane); 21 kalkulator inwestycyjny; 22 CRM; 25 kopie zapasowe; 27 testy w Actions; 28 warstwy OSM; filtry ofert; historia cen; geokodowanie budynku i odległości.

### Sprawdzone i celowo niezmienione
2 (przedziały najmu — zostaje `'base'`), 4 (ridge na RCN — nie), 18 (standard przy sprzedaży — tylko informacja), otoczenie OSM w wycenie (nie, sekcja 5), cechy z opisów (7: nie).

### Zablokowane / czeka
- **20 i 18 (pomiar):** potrzebne oferty SPRZEDAŻY (dziś baza to oferty najmu), żeby zmierzyć luz negocjacyjny względem RCN i wpływ standardu. Zbieranie pod nadzorem właściciela.
- **13:** więcej ofert z cienkich dzielnic i OLX z deduplikacją — tylko ręcznie, pod nadzorem, w granicach regulaminu (zależy od 15).
- **15:** zgoda OLX/Otodom albo opinia prawnika (sekcja 8). Przed lutym 2027.
- **14:** inne miasta: (a) właściciel musi uruchomić na serwerze `bash install_rcn.sh`, potem np. `bash rcn_miasto.sh chelm 51.143 23.472`; (b) aplikacja nie ma wyboru miasta ani wczytywania `rcn_<miasto>.json` — potrzebna kolejna wersja; geokoder ma miasto „Lublin” domyślnie. Współrzędne środków miast są orientacyjne.
- **3 (dane):** baza ofert i umów domów/lokali/hal pusta.
- **28 (zasięg) i 29:** potwierdzić na telefonie: warstwy OSM na mapie bez błędu oraz odległości od budynku („Granata 1” znajduje od razu; „Granta 1” daje podpowiedź „Czy chodziło o: Ks. Wincentego Granata 1”; ulica bez numeru → brak odległości; sprzedaż: np. „Krężnicka 275”). Porównać kompletność punktów OSM (przystanki, szkoły) z listami urzędowymi (dane otwarte Lublina, np. ZTM), bo odległość jest tak dobra jak lista punktów.
- **19 (dane):** drugie pełne zebranie ofert po ≥7 dniach od pierwszego (ok. 7 listopada) → ruszy „Czas ekspozycji”.
- **12:** zbieranie ofert jednym kliknięciem (zależy od 15).

### Pomysły opcjonalne (niepotwierdzone przez właściciela)
- Użycie dokładnego punktu budynku z PRG w wycenie sprzedaży (wymaga osobnej walidacji na RCN; dziś silnik używa położenia z RCN).
- Porównanie kompletności OSM z danymi urzędowymi; ewentualne dołożenie punktów z otwartych danych miasta.
- Wybór miasta w aplikacji (punkt 14).

### Ocena listy rozwoju właściciela (4.11.2026)
Zrobione w 1.23.0: analiza z teczki, IRR/NPV/scenariusze, jakość porównań, porównanie wycen, lokalizacja w promieniach, nowe raporty i numeracja, mapa rentowności. Następne: lejek CRM razem z ochroną danych klientów.
Czeka na dane lub zgodę: rekomendacja ceny ofertowej i okazje rynkowe (oferty sprzedaży, punkt 15 i 20); inne miasta (punkt 14).
Nie teraz: prognozy cen (najpierw walidacja, dane tylko z okresu wzrostu), wycena ze zdjęć (brak danych), cechy spoza RCN w doborze sprzedaży, księgi wieczyste, zespół i API.

### Do zrobienia przez właściciela
- Na serwerze: `curl -fsSL https://lewym90.github.io/operatszacunkowy/server/update_sync.sh | bash` (teczki i historia dokumentów zaczną się synchronizować).
- Do decyzji: `DEFAULT_URL` w `js/sync.js` zawiera adres IP serwera w publicznym repo (stare, wbrew zasadzie z początku pliku).
- Zamknąć i otworzyć aplikację na wszystkich urządzeniach (jedna karta naraz), żeby pobrała 1.23.4 (przy problemach z odświeżeniem: zamknąć aplikację całkiem i otworzyć dwa razy).
- Sprawdzić na telefonie: najem → ulica „Granata”, nr „1” (karta „Najbliższe okolice”), to samo w sprzedaży; Mapa → warstwy OSM.
- Ok. 7 listopada zrobić kolejne pełne zebranie ofert najmu.
- Opcjonalnie: wgrać własne logo, dodać umowy domów/lokali/hal, uruchomić eksport RCN dla Chełma, Zamościa, Puław.
- Decyzja prawna (15) przed lutym 2027.

## 12. Znane pułapki (żeby nie powtarzać błędów)

- Środek ulicy/współrzędne RCN do odległości — **zabronione** (zasada 5).
- Nie podstawiać „podobnej” nazwy ulicy automatycznie (Rokickiego≠Ruckiego).
- Zmiana nazwy importu w `app.js`: `suggest` z geokod.js importować jako `suggestAddr` (kolizja z `ui.js`).
- Po zmianie CSS/JS zawsze bump `VERSION` i `mksw.py`, inaczej telefon pokazuje starą wersję.
- Filtry testów oferty/RCN: wolnyRynek to `rynek` w RCN — dopasowywać wartości do rzeczywistych (błąd z fixture `'wolnyRynek'` w przeszłości).
- Do analiz na serwerze: `node` nie jest domyślnie zainstalowany (`apt install -y nodejs`), do uruchamiania modułów ES potrzebny `package.json` z `"type":"module"`.
- Panel przeglądarki Claude ma własny service worker — przed testem świeżego kodu wyrejestrować SW i wyczyścić cache.
- Termius skleja wieloliniowe wklejki — komendy dla właściciela zawsze jednolinijkowe.
- Ostrożnie z kodem „AMSYNC1:…”: to klucz; nie wypisywać, nie robić zrzutów.
- W repo znajdują się przypadkowo śledzone pliki: katalog `undefined/shots/*.png` i `tools/__pycache__/*.pyc` (do usunięcia przy okazji, np. `git rm -r --cached undefined tools/__pycache__` i dopisanie do `.gitignore`).

## 13. Inne aplikacje właściciela

Poza OPERAT SZACUNKOWY właściciel prowadzi inne projekty (warsztat, auta/push, nawigacja, forge, „znajomy”, zakupy, migracja serwera). Ten plik dotyczy WYŁĄCZNIE aplikacji OPERAT SZACUNKOWY. Dla pozostałych potrzebne są osobne pliki przekazania.
