#!/usr/bin/env bash
# Przycisk „Zbierz oferty teraz” w aplikacji: aktualizuje serwer synchronizacji i dodaje usługę, która podejmuje prośbę z aplikacji.
# Nie rusza innych aplikacji na serwerze ani Caddy.
set -euo pipefail
B=https://lewym90.github.io/operatszacunkowy
F=/opt/operat-sync/sync_server.py; T=$(mktemp)
curl -fsSL "$B/server/sync_server.py" -o "$T"; python3 -m py_compile "$T"; grep -q "zbieranie" "$T"
cp -p "$F" "$F.bak"; cp "$T" "$F"; rm -f "$T"; systemctl restart operat-sync; sleep 2
systemctl is-active --quiet operat-sync || { cp -p "$F.bak" "$F"; systemctl restart operat-sync; echo "BŁĄD: serwer synchronizacji nie wstał, przywrócono poprzednią wersję"; exit 1; }
mkdir -p /var/lib/operat-otodom /opt/operat-otodom
cat > /etc/systemd/system/operat-otodom-start.service <<'EOF'
[Unit]
Description=Operat: start zbierania ofert na prośbę z aplikacji
[Service]
Type=oneshot
ExecStartPre=/bin/rm -f /var/lib/operat-sync/zbieraj.req
ExecStart=/bin/bash -c 'curl -fsSL https://lewym90.github.io/operatszacunkowy/server/otodom_zbieraj.sh -o /opt/operat-otodom/start.sh && bash /opt/operat-otodom/start.sh'
EOF
cat > /etc/systemd/system/operat-otodom-start.path <<'EOF'
[Unit]
Description=Operat: prośba o zbieranie ofert z aplikacji
[Path]
PathExists=/var/lib/operat-sync/zbieraj.req
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl enable --now operat-otodom-start.path >/dev/null 2>&1
systemctl is-active --quiet operat-otodom-start.path && echo "OK: przycisk zbierania gotowy (serwer synchronizacji zaktualizowany, usługa startowa działa)" || { echo "BŁĄD: usługa startowa nie działa"; exit 1; }
