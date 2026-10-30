#!/usr/bin/env bash
# Codzienna kopia bazy synchronizacji (oferty, umowy, wyceny, teczki). Używa mechanizmu kopii SQLite (bezpiecznej przy działającym serwerze),
# sprawdza integralność kopii i trzyma: 14 ostatnich dziennych + 8 tygodniowych (niedziele). Zmienne: OPERAT_SYNC_DB, OPERAT_BACKUP_DIR.
set -euo pipefail
DB="${OPERAT_SYNC_DB:-/var/lib/operat-sync/sync.db}"; DIR="${OPERAT_BACKUP_DIR:-/var/backups/operat-sync}"
mkdir -p "$DIR"; chmod 700 "$DIR"
STAMP="$(date +%Y-%m-%d)"; OUT="$DIR/sync-$STAMP.db"
python3 - "$DB" "$OUT.tmp" <<'PY'
import sqlite3, sys
src = sqlite3.connect('file:%s?mode=ro' % sys.argv[1], uri=True); dst = sqlite3.connect(sys.argv[2])
src.backup(dst); r = dst.execute('PRAGMA integrity_check').fetchone()[0]; n = dst.execute('select count(*) from rec where del=0').fetchone()[0]
dst.close(); src.close()
if r != 'ok': sys.exit('kopia uszkodzona: ' + r)
print('rekordów w kopii:', n)
PY
mv -f "$OUT.tmp" "$OUT"; gzip -f "$OUT"
# retencja: dzienne starsze niż 14 dni usuwamy, z wyjątkiem niedzielnych (tygodniowe trzymamy 8 tygodni)
find "$DIR" -name 'sync-*.db.gz' -mtime +14 -print0 | while IFS= read -r -d '' f; do
  d="$(basename "$f" | sed -E 's/sync-(.*)\.db\.gz/\1/')"
  if [ "$(date -d "$d" +%u)" != "7" ]; then rm -f "$f"; fi
done
find "$DIR" -name 'sync-*.db.gz' -mtime +56 -delete
echo "kopia: $OUT.gz ($(du -h "$OUT.gz" | cut -f1)); w katalogu: $(ls "$DIR" | wc -l) plików"
