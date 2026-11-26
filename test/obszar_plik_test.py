# Pliki obszaru: łączenie powiatów, filtr daty, wersje w rcn_meta, OSM przycięte do prostokąta.
import json, os, subprocess, sys, tempfile
d = tempfile.mkdtemp(); w = os.path.join(d, 'woj'); o = os.path.join(d, 'out'); os.makedirs(w)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools')); import obszar_plik as P
pw = P.OBSZARY['krakow']['powiaty']
for i, t in enumerate(pw):
    json.dump(dict(meta=dict(powiat='p' + t), cols=['id', 'data', 'cena'], rows=[['a' + t, '2017-05-01', 1], ['b' + t, '2018-01-01', 2], ['c' + t, '2025-03-03', 3]]), open(os.path.join(w, f'rcn_{t}.json'), 'w'))
    json.dump(dict(meta=dict(powiat='p' + t), cols=['tran', 'data'], rows=[['x' + t, '2019-01-01']]), open(os.path.join(w, f'rcn_inne_{t}.json'), 'w'))
json.dump(dict(meta=dict(zrodlo='OSM'), layers=dict(szkoly=[[50.06, 19.94], [52.0, 22.0]])), open(os.path.join(w, 'osm_woj.json'), 'w'))
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), '..', 'tools', 'obszar_plik.py'), '--woj', w, '--obszar', 'krakow', '--out', o], check=True, capture_output=True)
L = json.load(open(os.path.join(o, 'rcn_lokale.json'))); M = json.load(open(os.path.join(o, 'rcn_meta.json'))); S = json.load(open(os.path.join(o, 'osm.json')))
assert len(L['rows']) == 2 * len(pw) and all(r[1] >= '2018-01-01' for r in L['rows']), 'od 2018, wszystkie powiaty'
assert M['wersja'] == L['meta']['wersja'] and M['inne']['rekordow'] == len(pw) and M['bajtow'] > 0, 'rcn_meta jak dla Lublina'
assert S['layers']['szkoly'] == [[50.06, 19.94]], 'OSM tylko z obszaru'
print('obszar_plik: OK')
