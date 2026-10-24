#!/usr/bin/env bash
# Instala TODO Cerberus dentro del X2 Ultra: el cerebro (API: vision, Whisper, padron) y el cuerpo (ROS 2 + AimDK)
# corriendo los dos en la unidad de desarrollo del robot (Jetson Orin, aarch64, Ubuntu 22.04 + ROS 2 Humble).
# Es el modo A de deploy/deploy.md: sin laptop, sin tunel, sin red de por medio durante la demo.
#
#   ./deploy/instalar_en_robot.sh              # copiar + instalar + probar (lo normal, con internet en el robot)
#   ./deploy/instalar_en_robot.sh --wheels     # 1) en el laptop: baja las ruedas aarch64 a deploy/wheels/
#   ./deploy/instalar_en_robot.sh --copiar     # 2) solo copia codigo, modelos, Whisper y datos al robot
#   ./deploy/instalar_en_robot.sh --instalar   # 3) solo crea el entorno en el robot (usa deploy/wheels/ si no hay red)
#   ./deploy/instalar_en_robot.sh --probar     # 4) autopruebas + arranque de la API dentro del robot
#   ./deploy/instalar_en_robot.sh --sin-datos  # no copiar fotos ni galeria (datos biometricos)
#   ./deploy/instalar_en_robot.sh --compilar-sdk   # ademas: colcon build del SDK AimDK si aimdk_msgs no importa
# Variables: ROBOT (10.0.1.41) USUARIO (agibot) DESTINO (~/cerberus) ROS_SETUP SDK_SETUP WHISPER (base)
#
# Despues:  ./deploy/desplegar.sh --todo-en-robot
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
ROBOT=${ROBOT:-10.0.1.41}
USUARIO=${USUARIO:-agi}
DESTINO=${DESTINO:-cerberus}                  # relativo al home del robot
ROS_SETUP=${ROS_SETUP:-/opt/ros/humble/setup.bash}
SDK_SETUP=${SDK_SETUP:-'~/aimdk/install/local_setup.bash'}
WHISPER=${WHISPER:-base}                      # en el Orin, 'base' responde ~2x mas rapido que 'small'
PLATAFORMA=manylinux2014_aarch64
PY_ROBOT=3.10
SSH_ROBOT=(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "$USUARIO@$ROBOT")
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

WHEELS=0 COPIAR=0 INSTALAR=0 PROBAR=0 DATOS=1 SDK_BUILD=0
for a in "$@"; do
  case "$a" in
    --wheels) WHEELS=1 ;; --copiar) COPIAR=1 ;; --instalar) INSTALAR=1 ;; --probar) PROBAR=1 ;;
    --sin-datos) DATOS=0 ;; --compilar-sdk) SDK_BUILD=1 ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opcion desconocida: $a"; exit 2 ;;
  esac
done
# sin ningun paso elegido (o solo --compilar-sdk / --sin-datos): se hace el flujo completo
[ "$WHEELS$COPIAR$INSTALAR$PROBAR" = "0000" ] && { COPIAR=1; INSTALAR=1; PROBAR=1; }

# --- 1. Ruedas aarch64 en el laptop (solo si el robot no tiene internet) ---
if [ "$WHEELS" = 1 ]; then
  step "Bajando ruedas $PLATAFORMA para Python $PY_ROBOT a deploy/wheels/ (torch pesa ~100 MB)"
  mkdir -p deploy/wheels
  python3 -m pip download -q -d deploy/wheels -r deploy/requirements-robot.txt \
    --only-binary=:all: --platform "$PLATAFORMA" --python-version "$PY_ROBOT" --implementation cp \
    || fail "pip download fallo: alguna dependencia no tiene rueda aarch64 (mirala en el log y bajala a mano)"
  ok "$(ls deploy/wheels | wc -l | tr -d ' ') ruedas en deploy/wheels ($(du -sh deploy/wheels | cut -f1))"
fi

if [ "$COPIAR" = 1 ] || [ "$INSTALAR" = 1 ] || [ "$PROBAR" = 1 ]; then
  step "Comprobando el robot ($USUARIO@$ROBOT)"
  "${SSH_ROBOT[@]}" true 2>/dev/null || fail "sin ssh al robot: ./deploy/preparar_host.sh --red"
  INFO=$("${SSH_ROBOT[@]}" "bash -lc 'uname -m; python3 -V; nproc; df -h \$HOME | tail -1'")
  echo "$INFO" | sed 's/^/   /'
  case "$INFO" in *aarch64*) ok "Orin (aarch64)" ;; *) printf '   (no es aarch64: usa --wheels con la plataforma correcta)\n' ;; esac
  PRELUDIO="source $ROS_SETUP; if [ -f $SDK_SETUP ]; then source $SDK_SETUP; fi; "
  if ! "${SSH_ROBOT[@]}" "bash -lc '$PRELUDIO python3 -c \"import rclpy, aimdk_msgs\"'" 2>/dev/null; then
    # aimdk_msgs son interfaces de ROS 2: los bindings de Python los genera colcon build (doc oficial 4.5)
    if [ "$SDK_BUILD" = 1 ]; then
      step "aimdk_msgs no importa: compilando el SDK oficial en el robot"
      ROBOT="$ROBOT" USUARIO="$USUARIO" ROS_SETUP="$ROS_SETUP" ./deploy/compilar_sdk.sh \
        || fail "no se pudo compilar el SDK (ver deploy/deploy.md seccion 4a)"
    fi
  fi
  "${SSH_ROBOT[@]}" "bash -lc '$PRELUDIO python3 -c \"import rclpy, aimdk_msgs\"'" 2>/dev/null \
    && ok "ROS 2 y aimdk_msgs (SDK oficial, compilado) listos en el robot" \
    || fail "en el robot no se puede importar aimdk_msgs: el SDK AimDK hay que compilarlo (colcon build).
   Hazlo primero con:  ./deploy/compilar_sdk.sh      (informa, compila y te dice que sourcear)"
fi

# --- 2. Copiar codigo, modelos y datos ---
if [ "$COPIAR" = 1 ]; then
  step "Copiando el proyecto a $ROBOT:~/$DESTINO (rsync, solo lo que cambio)"
  command -v rsync >/dev/null || fail "falta rsync en el laptop: sudo apt install rsync"
  "${SSH_ROBOT[@]}" "mkdir -p ~/$DESTINO"
  EXCL=(--exclude .venv --exclude __pycache__ --exclude '*.pyc' --exclude deploy/wheels --exclude pases
        --exclude datos/chrome-kiosco --exclude datos/descartadas --exclude 'datos-respaldo-*')
  [ "$DATOS" = 0 ] && EXCL+=(--exclude datos --exclude identificacion)
  rsync -az --delete "${EXCL[@]}" "$ROOT/" "$USUARIO@$ROBOT:$DESTINO/"
  ok "codigo, modelos YOLO y $([ "$DATOS" = 1 ] && echo 'datos del equipo' || echo 'sin datos')"
  # robotA (vision, padron): el cliente lo busca en ../vision o ../robotA/vision
  step "Copiando robotA (vision y padron del club)"
  rsync -az --delete --exclude .git --exclude __pycache__ --exclude assets --exclude robotB \
        "$ROOT/../" "$USUARIO@$ROBOT:$DESTINO/../robotA_tmp/" 2>/dev/null || true
  "${SSH_ROBOT[@]}" "rm -rf ~/robotA && mv ~/robotA_tmp ~/robotA 2>/dev/null || true"
  ok "robotA en ~/robotA (sin assets: el modelo MuJoCo del X2 no hace falta en el robot)"
  if [ -d "$HOME/.cache/huggingface" ]; then
    step "Copiando el modelo de Whisper ($WHISPER) para que el robot no necesite internet"
    rsync -az "$HOME/.cache/huggingface/" "$USUARIO@$ROBOT:.cache/huggingface/" && ok "cache de Whisper copiada"
  else
    printf '   (sin cache de Whisper en el laptop: el robot la bajara, o corre antes ./run.sh una vez)\n'
  fi
  [ -d deploy/wheels ] && { rsync -az deploy/wheels/ "$USUARIO@$ROBOT:$DESTINO/deploy/wheels/"; ok "ruedas aarch64 copiadas"; }
fi

# --- 3. Entorno de Python dentro del robot ---
if [ "$INSTALAR" = 1 ]; then
  step "Creando el entorno en el robot (venv con --system-site-packages: reusa el numpy y el opencv del Orin)"
  "${SSH_ROBOT[@]}" bash -s <<REMOTO
set -e
cd ~/$DESTINO
source $ROS_SETUP
${SDK_SETUP:+source $SDK_SETUP}
[ -x .venv/bin/python ] || python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install -q --upgrade pip
if [ -d deploy/wheels ] && [ "\$(ls deploy/wheels 2>/dev/null | wc -l)" -gt 0 ]; then
  echo "   instalando sin internet desde deploy/wheels/"
  .venv/bin/python -m pip install -q --no-index --find-links deploy/wheels -r deploy/requirements-robot.txt
else
  echo "   instalando desde PyPI (necesita internet en el robot)"
  .venv/bin/python -m pip install -q -r deploy/requirements-robot.txt
fi
.venv/bin/python -c "import cv2, numpy, ultralytics, fastapi, uvicorn, zxingcpp, PIL, faster_whisper; print('   librerias OK')"
REMOTO
  ok "entorno listo en ~/$DESTINO/.venv"
  # La voz en espanol se genera con espeak-ng + ffmpeg. Sin ellos el X2 solo habla con su TTS nativo (ingles/chino).
  if "${SSH_ROBOT[@]}" "bash -lc 'command -v espeak-ng >/dev/null && command -v ffmpeg >/dev/null'" 2>/dev/null; then
    ok "espeak-ng y ffmpeg en el robot: el espanol y el portugues salen del propio Orin"
  else
    printf '\033[1;33m   ! al robot le faltan espeak-ng y/o ffmpeg: sin ellos no hay voz en espanol.\n'
    printf '     Con internet en el robot:  ssh %s@%s "sudo apt-get install -y espeak-ng ffmpeg"\n' "$USUARIO" "$ROBOT"
    printf '     Sin internet: deja el cerebro en el laptop (modo B) y arranca con --tts api\033[0m\n'
  fi
fi

# --- 4. Pruebas dentro del robot ---
if [ "$PROBAR" = 1 ]; then
  step "Autopruebas y arranque del cerebro dentro del robot"
  "${SSH_ROBOT[@]}" bash -s <<REMOTO
set -e
cd ~/$DESTINO
source $ROS_SETUP
${SDK_SETUP:+source $SDK_SETUP}
export CERBERUS_WHISPER=$WHISPER
python3 deploy/verificar_mensajes.py || echo "   ! revisa los campos del SDK antes de la demo"
.venv/bin/python x2/cerberus_x2.py --autotest
.venv/bin/python captura/test_capturar.py 2>&1 | tail -1
.venv/bin/python qr_lector.py --autotest 2>&1 | grep -v 'WARN:' | tail -1
PORT=8000 .venv/bin/python web/app.py & SRV=\$!
for i in \$(seq 1 180); do curl -fs http://127.0.0.1:8000/api/salud >/dev/null && break; sleep 1; done
curl -fs http://127.0.0.1:8000/api/salud && echo
curl -fs -X POST 'http://127.0.0.1:8000/api/tts?lang=es' -H 'Content-Type: text/plain' -d 'Cerberus listo en el robot' | wc -c
kill \$SRV
REMOTO
  ok "el cerebro arranca dentro del robot"
fi

echo
step "Listo. En la demo, desde el laptop:  ./deploy/desplegar.sh --todo-en-robot"
printf '   (o dentro del robot: cd ~/%s && ./deploy/arrancar_en_robot.sh)\n' "$DESTINO"
[ "$DATOS" = 1 ] && printf '\033[1;33m   Recuerda: copiaste fotos y galeria al robot. Borralas al terminar:\n     ssh %s@%s "rm -rf ~/%s/datos ~/%s/identificacion"\033[0m\n' "$USUARIO" "$ROBOT" "$DESTINO" "$DESTINO"
