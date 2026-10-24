#!/usr/bin/env bash
# Arranca Cerberus COMPLETO dentro del X2 Ultra (modo A): el cerebro (API) y el cuerpo (ROS 2 + AimDK) en el Orin.
# Se corre DENTRO del robot, en ~/cerberus. Lo instala ./deploy/instalar_en_robot.sh desde el laptop.
#
#   ./deploy/arrancar_en_robot.sh                  # API + recepcion en vivo (camara, voz, cara, LED)
#   ./deploy/arrancar_en_robot.sh --diagnostico    # checklist del turno y salir
#   ./deploy/arrancar_en_robot.sh --probar todos   # los 6 flujos, sin camara
# Variables: ROS_SETUP SDK_SETUP WHISPER (base) PUERTO_API (8000) VOLUMEN (80)
set -uo pipefail
cd "$(dirname "$0")/.."
ROS_SETUP=${ROS_SETUP:-/opt/ros/humble/setup.bash}
SDK_SETUP=${SDK_SETUP:-$HOME/aimdk/install/local_setup.bash}   # lo que genera colcon build
PUERTO_API=${PUERTO_API:-8000}
VOLUMEN=${VOLUMEN:-80}
export CERBERUS_WHISPER=${WHISPER:-base}
PY=$PWD/.venv/bin/python
[ -x "$PY" ] || { echo "falta el entorno: corre ./deploy/instalar_en_robot.sh desde el laptop"; exit 1; }
# shellcheck disable=SC1090
source "$ROS_SETUP"
[ -f "$SDK_SETUP" ] && source "$SDK_SETUP"
python3 -c 'import aimdk_msgs' 2>/dev/null \
  || { echo "sin aimdk_msgs: compila el SDK (./deploy/compilar_sdk.sh desde el laptop) o corrige SDK_SETUP=$SDK_SETUP"; exit 1; }

API="http://127.0.0.1:$PUERTO_API"
if curl -fs "$API/api/salud" >/dev/null 2>&1; then
  echo "▸ el cerebro ya corria en $API"
else
  echo "▸ arrancando el cerebro (YOLO, SFace y Whisper $CERBERUS_WHISPER; la 1a vez tarda ~1 min)"
  PORT=$PUERTO_API "$PY" web/app.py > datos/api.log 2>&1 &
  SRV=$!
  trap 'kill $SRV 2>/dev/null; echo; echo "Cerberus detenido."' EXIT
  for _ in $(seq 1 240); do curl -fs "$API/api/salud" >/dev/null 2>&1 && break; kill -0 $SRV 2>/dev/null || { tail -20 datos/api.log; exit 1; }; sleep 1; done
  curl -fs "$API/api/salud" >/dev/null 2>&1 || { echo "el cerebro no respondio (datos/api.log)"; exit 1; }
fi
curl -fs "$API/api/salud"; echo
# el venv se crea con --system-site-packages, asi que rclpy (del sistema) se importa igual desde el
exec "$PY" -u x2/cerberus_x2.py --api "$API" --tts auto --volumen "$VOLUMEN" --escuchar "$@"
