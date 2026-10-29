#!/usr/bin/env bash
# Instalacja serwera synchronizacji OPERAT SZACUNKOWY na serwerze z Caddy (uruchom jako root).
# Użycie:  bash install.sh        (po wgraniu sync_server.py obok tego pliku)
set -euo pipefail
DIR=/opt/operat-sync; DATA=/var/lib/operat-sync; ENVF=/etc/operat-sync.env
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR" "$DATA"
cp "$here/sync_server.py" "$DIR/sync_server.py"
if [ ! -f "$ENVF" ]; then
  KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  umask 077; printf 'OPERAT_SYNC_KEY=%s\nOPERAT_SYNC_DB=%s/sync.db\n' "$KEY" "$DATA" > "$ENVF"
fi
cat > /etc/systemd/system/operat-sync.service <<'EOF'
[Unit]
Description=Operat szacunkowy: synchronizacja
After=network.target
[Service]
EnvironmentFile=/etc/operat-sync.env
ExecStart=/usr/bin/python3 /opt/operat-sync/sync_server.py
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/operat-sync
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now operat-sync
for i in 1 2 3 4 5 6 7 8; do systemctl is-active --quiet operat-sync && break; sleep 1; done
systemctl is-active operat-sync || { echo 'Usługa nie wstała. Sprawdź: journalctl -u operat-sync -n 30 --no-pager'; }
echo
echo "Klucz synchronizacji (wpisz go w aplikacji: Ustawienia -> Synchronizacja):"
grep '^OPERAT_SYNC_KEY=' "$ENVF" | cut -d= -f2-
echo
echo "Test lokalny:"
KEY="$(grep '^OPERAT_SYNC_KEY=' "$ENVF" | cut -d= -f2-)"
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:8787/v1/ping || true; echo
