import os, json, sys
root = sys.argv[1]; files = []
for d, _, fs in os.walk(root):
    for f in fs:
        p = os.path.relpath(os.path.join(d, f), root)
        if p in ('sw.js', 'sw.template.js') or p.startswith(('.', 'tools', 'test', 'node_modules')) or p.endswith('.md') or '/.' in p: continue
        files.append(p)
files = sorted(files) + ['./']
t = open(os.path.join(root, 'sw.template.js')).read()
open(os.path.join(root, 'sw.js'), 'w').write(t.replace('__ASSETS__', json.dumps(files)))
print(len(files), 'plików w pamięci offline')
