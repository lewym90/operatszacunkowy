"""Test narzędzia osm_silnik.mjs na danych sztucznych: cena zależy od odległości do przystanków (a silnik tego nie wie), reszta warstw bez wpływu."""
import json, math, random, subprocess, os, tempfile, shutil
R = random.Random(5); KX, KY = 111.32 * .6258, 111.32
def rp(n, c=(51.25, 22.55), s=(.04, .07)): return [[round(c[0] + R.gauss(0, s[0]), 5), round(c[1] + R.gauss(0, s[1]), 5)] for _ in range(n)]
def d(a, pts): return min(math.hypot((a[0] - p[0]) * KY, (a[1] - p[1]) * KX) for p in pts) * 1000
L = {'przystanki': rp(150), 'szkoly': rp(60), 'parki': rp(40)}
rows = []
for i in range(9000):
    la, lo = rp(1)[0]; m2 = R.uniform(30, 80); dpr = d((la, lo), L['przystanki']); yr = 2022 + R.random() * 4; ym = int((yr % 1) * 12) + 1
    ppm2 = 9000 * math.exp(-.0010 * min(dpr, 1500) + R.gauss(0, .05))
    rows.append([str(i), str(i), round(ppm2 * m2), 'rynekWtorny', 'wolnyRynek', int(yr), 'mieszkalna', 2 + (i % 2), 1, round(m2, 1), None, 'Ul' + str(i % 40), str(i % 30), None, la, lo, None, f'{int(yr)}-{ym:02d}-15', None, None])
cols = ['id', 'tran', 'cena', 'rynek', 'rodzaj', 'rok', 'funkcja', 'izby', 'kond', 'm2', 'm2p', 'ulica', 'nr', 'udzial', 'lat', 'lon', 'sprz', 'data', 'cena_nier', 'cena_lok']
t = tempfile.mkdtemp(); root = os.path.join(os.path.dirname(__file__), '..')
shutil.copytree(os.path.join(root, 'js'), t + '/js'); shutil.copy(os.path.join(root, 'tools/osm_silnik.mjs'), t + '/osm_silnik.mjs')
json.dump(dict(cols=cols, rows=rows), open(t + '/r.json', 'w')); json.dump(dict(meta=dict(nazwy={}), layers=L), open(t + '/o.json', 'w'))
out = subprocess.run(['node', t + '/osm_silnik.mjs', t + '/r.json', t + '/o.json', '500'], capture_output=True, text=True, timeout=900, cwd=t)
print(out.stdout[-2500:], out.stderr[-800:]); assert out.returncode == 0
ln = {l.split('  ')[0].strip(): l for l in out.stdout.splitlines()}
assert any('POMAGA' in l for k, l in ln.items() if k.startswith('przystanki')), 'przystanki powinny pomagać'
for k in ('szkoly', 'parki'): assert not any('POMAGA' in l for kk, l in ln.items() if kk.startswith(k)), k
print('OK')
