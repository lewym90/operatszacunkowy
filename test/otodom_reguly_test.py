# Reguły odczytu ogłoszeń Otodom (parking, rok budowy, meble) i zamiana rekordu listy. Bez sieci.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import otodom_zbieraj as Z
T = [('Miejsce parkingowe w hali garażowej dodatkowo 250 zł/mc.', 'dodatkowo', 250), ('Czynsz 2500 zł + opłaty. Miejsce postojowe w cenie najmu.', 'wliczony', None),
     ('Parking ogólnodostępny przed blokiem.', 'brak', None), ('Możliwość wynajęcia garażu.', 'nieznany', None), ('Ładne mieszkanie, 2500 zł.', None, None),
     ('Garaż podziemny wliczony w czynsz 300 zł', 'wliczony', None), ('Miejsce parkingowe + 150 PLN', 'dodatkowo', 150), ('Parking osiedlowy 100 zł', 'nieznany', None)]
for t, s, k in T:
    p = Z.parking(t); assert (p or {}).get('stan') == s and (p or {}).get('kwota') == k, (t, p)
assert Z.meble('Mieszkanie w pełni umeblowane') and not Z.meble('Mieszkanie nieumeblowane') and not Z.meble('lokal bez mebli')
assert Z.rok_z({'target': {'Build_year': '2016'}}, '') == 2016 and Z.rok_z({}, 'apartamentowca z 2016 roku przy') == 2016 and Z.rok_z({}, 'cena z 2024 r.') is None and Z.rok_z({'target': {'Build_year': '3016'}}, '') is None
i = {'id': 5, 'slug': 'ladne-ID4abc', 'totalPrice': {'value': 2500}, 'rentPrice': {'value': 400}, 'roomsNumber': 'TWO', 'areaInSquareMeters': 45, 'floorNumber': 'GROUND', 'isPrivateOwner': True, 'title': ' Ładne ',
     'location': {'address': {'street': {'name': 'ul. Lipowa', 'number': '5'}}, 'reverseGeocoding': {'locations': [{'locationLevel': 'voivodeship', 'name': 'lubelskie'}, {'locationLevel': 'city_or_village', 'name': 'Lublin'}, {'locationLevel': 'district', 'name': 'Śródmieście'}]}}}
assert Z.rekord(i) == {'portalId': 'ID4abc', 'url': 'https://www.otodom.pl/pl/oferta/ladne-ID4abc', 'cena': 2500, 'czynsz': 400, 'pokoje': 2, 'm2': 45, 'pietro': 0, 'ulica': 'Lipowa', 'dzielnica': 'Śródmieście', 'miasto': 'Lublin', 'tytul': 'Ładne', 'sprzedawca': 'prywatna'}
assert Z.rekord({**i, 'images': [{'small': 'https://x.olxcdn.com/a.jpg'}]})['foto'] == 'https://x.olxcdn.com/a.jpg' and 'foto' not in Z.rekord({**i, 'images': [{'small': 'javascript:x'}]})
assert Z.rekord({**i, 'hidePrice': True}) is None and Z.rekord({**i, 'estate': 'INVESTMENT'}) is None
assert Z.czynsz_ad({'target': {'Rent': 500}}) == 500 and Z.czynsz_ad({'target': {'Rent': '450.0'}}) == 450 and Z.czynsz_ad({'target': {}}) is None and Z.czynsz_ad({'target': {'Rent': 'x'}}) is None
print('otodom_reguly: OK')
