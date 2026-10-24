#!/usr/bin/env bash
# Que corre donde, en vivo: el cerebro en este computador (vision YOLO/SFace, Whisper, decisiones) y el cliente en
# el Orin del X2 (camara, microfonos, voz de fabrica, LED, gesto, lidar). Abajo, el log del robot del panel.
#   ./deploy/monitor.sh            (Ctrl+C para salir)
ROBOT=${ROBOT:-10.0.1.41}; USUARIO=${USUARIO:-run}; PUERTO_API=${PUERTO_API:-8000}
N=0
while true; do
  clear
  printf '\033[1m=== ESTE COMPUTADOR (cerebro: YOLO + SFace + Whisper + decisiones) — %s ===\033[0m\n' "$(date +%T)"
  ps -Ao pid,%cpu,%mem,etime,command | grep -E "[u]vicorn|[w]eb/app.py|[d]esplegar.sh" | cut -c1-150 || echo "  (nada)"
  printf '\n\033[1m=== ORIN DEL X2 %s (cliente: camara, microfonos, voz de fabrica, LED, gesto, lidar) ===\033[0m\n' "$ROBOT"
  ssh -o BatchMode=yes -o ConnectTimeout=2 "$USUARIO@$ROBOT" \
    "ps -eo pid,%cpu,%mem,etime,args | grep -E '[c]erberus_x2|[m]odo_agente' | cut -c1-150; echo; uptime" 2>/dev/null \
    || echo "  sin ssh al robot"
  printf '\n\033[1m=== LOG DEL ROBOT (ultimas lineas) ===\033[0m\n'
  curl -fsS -m 2 "http://127.0.0.1:$PUERTO_API/api/robot/estado?desde=0" 2>/dev/null \
    | python3 -c 'import json,sys; r=json.load(sys.stdin); print("\n".join(l[:160] for l in r["lineas"][-22:]))' \
    || echo "  el cerebro no responde en :$PUERTO_API"
  sleep 2
done
