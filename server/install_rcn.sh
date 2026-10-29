#!/usr/bin/env bash
# Instaluje codzienne odświeżanie danych RCN (uruchom jako root). Pierwsze uruchomienie od razu.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p /opt/operat-rcn /var/www/operat-data
cp "$here/../tools/rcn_export.py" /opt/operat-rcn/rcn_export.py
cp "$here/rcn_refresh.sh" /opt/operat-rcn/rcn_refresh.sh; chmod +x /opt/operat-rcn/rcn_refresh.sh
cat > /etc/systemd/system/operat-rcn.service <<'UNIT'
[Unit]
Description=Operat szacunkowy: odświeżenie danych RCN
[Service]
Type=oneshot
ExecStart=/opt/operat-rcn/rcn_refresh.sh
TimeoutStartSec=3600
UNIT
cat > /etc/systemd/system/operat-rcn.timer <<'UNIT'
[Unit]
Description=Codzienne odświeżenie danych RCN
[Timer]
OnCalendar=*-*-* 03:40:00
RandomizedDelaySec=900
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now operat-rcn.timer
systemctl start --no-block operat-rcn.service
echo "Timer włączony. Pierwsze pobranie trwa kilka minut. Podgląd: journalctl -u operat-rcn -f"
systemctl list-timers operat-rcn.timer --no-pager | head -3
