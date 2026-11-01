"""Sprawdza narzędzie osm_analiza.py na danych sztucznych ze znanym efektem: cena zależy od odległości do przystanków (i od położenia), parki i szkoły są bez wpływu."""
import json, math, random, subprocess, sys, tempfile, os
R = random.Random(3); KX, KY = 111.32 * .6258, 111.32
def rp(n, c=(51.25, 22.55), s=(.05, .09)): return [[round(c[0] + R.gauss(0, s[0]), 5), round(c[1] + R.gauss(0, s[1]), 5)] for _ in range(n)]
def d(a, pts): return min(math.hypot((a[0] - p[0]) * KY, (a[1] - p[1]) * KX) for p in pts) * 1000
L = {'przystanki': rp(400), 'szkoly': rp(80), 'parki': rp(60), 'przedszkola': rp(70)}
rows = []
for i in range(3000):
    la, lo = rp(1)[0]; m2 = R.uniform(25, 90); dpr = d((la, lo), L['przystanki'])
    ppm2 = 9000 * math.exp(-.35 * (math.hypot((la - 51.25) * KY, (lo - 22.55) * KX) / 10) - .0006 * min(dpr, 1500) + R.gauss(0, .06))
    rows.append([str(i), str(i), round(ppm2 * m2), 'wolnyRynek', 'x', 2022, 'mieszkalna', 3, 1, round(m2, 1), None, 'a', '1', None, la, lo, None, f'{2020 + R.randint(0, 5)}-{R.randint(1, 12):02d}-15', None, None])
cols = ['id', 'tran', 'cena', 'rynek', 'rodzaj', 'rok', 'funkcja', 'izby', 'kond', 'm2', 'm2p', 'ulica', 'nr', 'udzial', 'lat', 'lon', 'sprz', 'data', 'cena_nier', 'cena_lok']
t = tempfile.mkdtemp(); json.dump(dict(cols=cols, rows=rows), open(t + '/r.json', 'w')); json.dump(dict(meta=dict(nazwy={}), layers=L), open(t + '/o.json', 'w'))
out = subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(__file__), '..', 'tools', 'osm_analiza.py'), t + '/r.json', t + '/o.json'], capture_output=True, text=True, timeout=900)
print(out.stdout, out.stderr[-500:]); assert out.returncode == 0
lines = {l.split('  ')[0].strip(): l for l in out.stdout.splitlines() if l.startswith('M1 + ')}
assert 'POMAGA' in lines['M1 + przystanki'], 'przystanki powinny pomagać'
for k in ('szkoly', 'parki', 'przedszkola'): assert 'POMAGA' not in lines['M1 + ' + k], k + ' nie powinno pomagać'
print('OK analiza wykrywa prawdziwy efekt i nie wymyśla nieprawdziwych')
