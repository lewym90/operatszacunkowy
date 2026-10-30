#!/usr/bin/env bash
# Instaluje codzienną kopię bazy synchronizacji (timer systemd, 03:10). Uruchom jako root:  curl -fsSL https://lewym90.github.io/operatszacunkowy/server/install_backup.sh | bash
set -euo pipefail
install -d /opt/operat-sync
curl -fsSL https://lewym90.github.io/operatszacunkowy/server/backup_sync.sh -o /opt/operat-sync/backup_sync.sh && chmod 755 /opt/operat-sync/backup_sync.sh
cat > /etc/systemd/system/operat-backup.service <<'UNIT'
[Unit]
Description=Kopia bazy synchronizacji Operatu
[Service]
Type=oneshot
ExecStart=/opt/operat-sync/backup_sync.sh
UNIT
cat > /etc/systemd/system/operat-backup.timer <<'UNIT'
[Unit]
Description=Codzienna kopia bazy synchronizacji Operatu
[Timer]
OnCalendar=*-*-* 03:10:00
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload && systemctl enable --now operat-backup.timer
systemctl start operat-backup.service && journalctl -u operat-backup.service -n 3 --no-pager
echo "Gotowe. Kopie: /var/backups/operat-sync (14 dziennych + 8 tygodniowych). Przywracanie: zatrzymaj operat-sync, rozpakuj plik gzip i podmień /var/lib/operat-sync/sync.db."
