#!/usr/bin/env bash
# Instaluje cotygodniowe odświeżanie punktów otoczenia z OpenStreetMap (uruchom jako root). Pierwsze pobranie od razu.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p /opt/operat-rcn /var/www/operat-data
cp "$here/../tools/osm_export.py" /opt/operat-rcn/osm_export.py
cp "$here/osm_refresh.sh" /opt/operat-rcn/osm_refresh.sh; chmod +x /opt/operat-rcn/osm_refresh.sh
cat > /etc/systemd/system/operat-osm.service <<'UNIT'
[Unit]
Description=Operat szacunkowy: odświeżenie punktów otoczenia z OpenStreetMap
[Service]
Type=oneshot
ExecStart=/opt/operat-rcn/osm_refresh.sh
TimeoutStartSec=1800
UNIT
cat > /etc/systemd/system/operat-osm.timer <<'UNIT'
[Unit]
Description=Cotygodniowe odświeżenie punktów OSM
[Timer]
OnCalendar=Sun *-*-* 04:20:00
RandomizedDelaySec=900
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now operat-osm.timer
systemctl start --no-block operat-osm.service
echo "Timer włączony. Pierwsze pobranie trwa 1-3 min. Podgląd: journalctl -u operat-osm -f"
