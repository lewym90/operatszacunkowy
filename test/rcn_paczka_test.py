# Przetwarzanie paczek RCN: geometria, układ, adresy, kody powiatów, ULDK, PRG. Bez sieci.
import datetime, io, os, struct, sys, tempfile, zipfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import rcn_paczka as P
assert P.srodek(None) is None
assert P.srodek(b'\x01' + struct.pack('<I', 1) + struct.pack('<dd', 750000.0, 380000.0)) == (750000.0, 380000.0)
pierscien = struct.pack('<I', 1) + struct.pack('<I', 2) + struct.pack('<dddd', 0, 0, 10, 20)
assert P.srodek(b'\x01' + struct.pack('<I', 3) + pierscien) == (5, 10)
assert P.srodek(b'\x01' + struct.pack('<I', 6) + struct.pack('<I', 1) + b'\x01' + struct.pack('<I', 3) + pierscien) == (5, 10)
la, lo = P.wgs((748000, 381000)); assert 51.2 < la < 51.3 and 22.5 < lo < 22.6, (la, lo)
assert P.adres('MSC:Chełm;UL:Graniczna;NR_PORZ:4 lok. 5') == ('Graniczna', '4', 'Chełm'); assert P.adres(None) == ('', '', '')
assert P.teryt_z({'teryt': '0612', 'x': '061101_1.0001.5_BUD_LOK'}, 'x') == '0611', 'kod z identyfikatora, nie z błędnego pola'
assert P.teryt_z({'teryt': '0603', 'x': ''}, 'x') == '0603'; assert P.teryt_z({'teryt': '0619', 'x': ' 061901_1.0001.5'}, 'x') == '0619'
assert P.dobra_data(datetime.date(3022, 2, 23)) is None and P.dobra_data(datetime.date(6, 4, 21)) is None and P.dobra_data(datetime.date(2024, 1, 1))
assert P.sprz('osobaFizyczna') == 'osobaFizyczna' and P.sprz('Jan Kowalski') is None and P.sprz(None) is None
class F(P.ULDK):
    def __init__(s): s.plik, s.limit, s.n, s.c, s.pyt = None, None, 0, {}, []
    def _wkt(s, req, i): s.pyt.append((req, i)); return 0 if i.endswith('.57') else [1.0, 2.0]
import time as _t; _t.sleep = lambda x: None
u = F(); assert u.punkt('061801_1.0001.5_BUD_LOK') == ([1.0, 2.0], 2); assert u.punkt('061801_1.0001.5_BUD.3_LOK') == ([1.0, 2.0], 2) and len(u.pyt) == 1, 'pamięć podręczna'
assert u.punkt('061801_1.0001.AR_55.193_BUD_LOK') == ([1.0, 2.0], 2) and u.pyt[-1][1] == '061801_1.0001.AR_55.193'
assert u.punkt('061801_1.0001.57_BUD_LOK') == ([1.0, 2.0], 3), 'nieznana działka: obręb'
assert u.punkt('061809_2.0012.AR_ul.0Leśna02_BUD_LOK') == ([1.0, 2.0], 3) and u.pyt[-1] == ('GetRegionById', '061809_2.0012')
assert u.punkt('061805_5.0007._BUD_LOK') == ([1.0, 2.0], 3); assert u.punkt('') == (None, None)
assert u.punkt('061701_1.0001.1597/1')[1] == 2 and '061701_1.0001.1597/1' in u.c
g = b'''<a xmlns:prgad="p" xmlns:gml="g" xmlns:xlink="x"><prgad:AD_Miejscowosc gml:id="M1"><prgad:nazwa>Wola</prgad:nazwa></prgad:AD_Miejscowosc><prgad:AD_UlicaPlac gml:id="U1"><prgad:nazwaPelna>Lipowa</prgad:nazwaPelna></prgad:AD_UlicaPlac>
<prgad:AD_PunktAdresowy gml:id="P1"><prgad:numerPorzadkowy>7</prgad:numerPorzadkowy><gml:pos>381000 748000</gml:pos><prgad:miejscowosc xlink:href="#M1"/><prgad:ulica xlink:href="#U1"/></prgad:AD_PunktAdresowy>
<prgad:AD_PunktAdresowy gml:id="P2"><prgad:numerPorzadkowy>9</prgad:numerPorzadkowy><gml:pos>381500.5 748000</gml:pos><prgad:miejscowosc xlink:href="#M1"/></prgad:AD_PunktAdresowy></a>'''
d = tempfile.mkdtemp(); z = os.path.join(d, 'p.zip')
with zipfile.ZipFile(z, 'w') as q: q.writestr('a.gml', g)
p = P.PRG(z); assert p.najblizszy((748010, 381010)) == ('Lipowa', '7', 'Wola'), 'PRG: y przed x w pliku'
assert p.najblizszy((748000, 381480)) == ('', '9', 'Wola'), 'wieś bez ulic'; assert p.najblizszy((750000, 381000)) is None, 'za daleko: brak'
print('rcn_paczka: OK')
