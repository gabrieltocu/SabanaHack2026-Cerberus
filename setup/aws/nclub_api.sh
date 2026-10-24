#!/usr/bin/env bash
# Levanta la API de N Club (imagen de Marshal) en podman sin root, como servicio de systemd del usuario ubuntu.
# Antes: ~/nclub/nclub-api.tar.gz (podman save | gzip). Genera llaves nuevas en ~/nclub/.env (no las de otro servidor)
# y deja la del robot en ~/.config/nclub/bot-key. La API queda en http://127.0.0.1:8080/api (solo dentro de la maquina).
# Probar: python3 hri/api_cliente.py http://127.0.0.1:8080/api ; python3 sim/run_club.py --check-api http://127.0.0.1:8080/api
set -e
cd ~/nclub
podman image exists localhost/nclub-api:latest || gunzip -c nclub-api.tar.gz | podman load 2>&1 | tail -1
if [ ! -f .env ]; then                       # llaves nuevas, solo en esta maquina (no las del zip)
  umask 077
  { for k in CERBERUS_JWT_SECRET CERBERUS_BOT_KEY CERBERUS_QR_SECRET CERBERUS_PHOTO_KEY; do
      echo "$k=$(openssl rand -base64 32)"; done; echo DOMAIN=; } > .env
fi
chmod 600 .env
mkdir -p ~/.config/nclub
grep '^CERBERUS_BOT_KEY=' .env | cut -d= -f2- | tr -d '\n' > ~/.config/nclub/bot-key
grep '^CERBERUS_QR_SECRET=' .env | cut -d= -f2- | tr -d '\n' > ~/.config/nclub/qr-secret
chmod 600 ~/.config/nclub/*
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user stop container-nclub-api.service 2>/dev/null || true
podman rm -f nclub-api >/dev/null 2>&1 || true
podman create --name nclub-api --env-file /home/ubuntu/nclub/.env -p 127.0.0.1:8080:8080 -v nclub-data:/data localhost/nclub-api:latest >/dev/null
mkdir -p ~/.config/systemd/user
(cd ~/.config/systemd/user && podman generate systemd --new --name nclub-api --files >/dev/null)
podman rm nclub-api >/dev/null
systemctl --user daemon-reload
systemctl --user enable --now container-nclub-api.service
for i in $(seq 1 20); do curl -sf http://127.0.0.1:8080/api/club-health && break; sleep 1; done
echo
systemctl --user is-active container-nclub-api.service
