#!/usr/bin/env bash
# Cerberus: prepara todo lo que falte y abre la web (captura, identificacion por voz y cara, cedula/QR, API).
#
# Uso:  ./run.sh                    deja todo listo, arranca el servidor y abre una pestana en Google Chrome
#       ./run.sh --sim              ademas abre el club simulado (MuJoCo de robotA) movido por la API  (--sim-lite: liviano)
#       ./run.sh --kiosco           ventana aparte de Chrome a pantalla de recepcion (voz y camara sin ningun clic)
#       ./run.sh --reiniciar        detiene un servidor de Cerberus que ya este corriendo y arranca uno nuevo
#       ./run.sh --pruebas          corre las pruebas automaticas (sin camara) antes de arrancar
#       ./run.sh --puerto 8001      otro puerto (si el 8000 esta ocupado)
#       ./run.sh --sin-navegador    no abre el navegador
#       ./run.sh --traer-datos      baja las fotos, galeria, roles y cedulas del equipo (rama privada cerberus-datos) y arranca
#       ./run.sh --subir-datos      sube tus datos actuales a esa rama (despues de enrolar gente nueva) y termina
# Ctrl+C detiene todo. La primera vez tarda unos minutos (crea el entorno y descarga YOLO y Whisper).
# Linux (Ubuntu 22.04+) y macOS. En Linux: sudo apt install ffmpeg espeak-ng tesseract-ocr libheif-examples
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(pwd)
PORT=8000 RESTART=0 TESTS=0 BROWSER=1 KIOSK=0 SIM=0 FETCH=0 UPLOAD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --reiniciar) RESTART=1 ;;
    --pruebas) TESTS=1 ;;
    --puerto) PORT=${2:?falta el numero de puerto}; shift ;;
    --sin-navegador) BROWSER=0 ;;
    --kiosco) KIOSK=1 ;;
    --navegador-normal) KIOSK=0 ;;
    --sim) SIM=1 ;;
    --sim-lite) SIM=lite ;;
    --traer-datos) FETCH=1; RESTART=1 ;;
    --subir-datos) UPLOAD=1 ;;
    -h|--help) sed -n 2,13p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opcion desconocida: $1 (ver ./run.sh --help)"; exit 2 ;;
  esac
  shift
done
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
URL="http://127.0.0.1:$PORT"

# 1. El repo del equipo (vision, sim, registros): robotB vive dentro de el (../vision) o al lado (../robotA)
if [ ! -d ../vision ] && [ ! -d ../robotA/vision ]; then
  step "Clonando robotA (repo del equipo)..."
  git clone -q https://github.com/andresazcona/SABANAHACK2026.git ../robotA || fail "no se pudo clonar robotA"
fi

# Datos del equipo (fotos, galeria, roles, cedulas): no van con el codigo; viven en la rama privada cerberus-datos
DATA_BRANCH=cerberus-datos
team_repo() { git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null || git -C "$ROOT/../robotA" rev-parse --show-toplevel 2>/dev/null; }
if [ "$FETCH" = 1 ]; then
  TOP=$(team_repo) || fail "no encuentro el repo del equipo (robotB debe estar dentro de el o al lado, en ../robotA)"
  step "Bajando los datos del equipo (rama $DATA_BRANCH)..."
  git -C "$TOP" fetch -q origin "$DATA_BRANCH" || fail "no se pudo bajar la rama $DATA_BRANCH (permiso en el repo?)"
  if [ -e datos/gallery.npz ] || [ -e datos/personas.json ]; then   # no pisar datos locales sin copia
    BK="datos-respaldo-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BK" && cp -R datos "$BK/" && { [ -d identificacion ] && cp -R identificacion "$BK/" || true; }
    step "Tus datos anteriores quedaron en $BK/"
  fi
  rm -rf datos/dataset datos/validacion                            # se reemplazan completos (si no, quedan fotos viejas)
  git -C "$TOP" archive "origin/$DATA_BRANCH" robotB/datos robotB/identificacion | tar -x -C "$ROOT/.." \
    || fail "no se pudieron instalar los datos"
  step "Datos instalados: $(ls datos/dataset | wc -l | tr -d ' ') personas"
fi
if [ "$UPLOAD" = 1 ]; then
  TOP=$(team_repo) || fail "no encuentro el repo del equipo"
  [ -e datos/gallery.npz ] || fail "no hay datos que subir (datos/gallery.npz)"
  WT=$(mktemp -d)/datos
  git -C "$TOP" fetch -q origin "$DATA_BRANCH" || fail "no se pudo bajar la rama $DATA_BRANCH"
  git -C "$TOP" worktree add -q -f -B "$DATA_BRANCH" "$WT" "origin/$DATA_BRANCH" || fail "no se pudo preparar la rama"
  rm -rf "$WT/robotB/datos" "$WT/robotB/identificacion" && mkdir -p "$WT/robotB/datos"
  cp -R datos/dataset datos/validacion datos/gallery.npz datos/personas.json "$WT/robotB/datos/"
  [ -e datos/calibration.json ] && cp datos/calibration.json "$WT/robotB/datos/"
  [ -d identificacion ] && cp -R identificacion "$WT/robotB/"
  find "$WT" -name .DS_Store -delete
  git -C "$WT" add -A
  if git -C "$WT" diff --cached --quiet; then step "Los datos de la rama $DATA_BRANCH ya estaban al dia"
  else
    git -C "$WT" commit -q -m "datos: actualizacion $(date '+%Y-%m-%d %H:%M')" && git -C "$WT" push -q origin "$DATA_BRANCH" \
      && step "Datos subidos a la rama $DATA_BRANCH: $(ls datos/dataset | wc -l | tr -d ' ') personas" || { git -C "$TOP" worktree remove --force "$WT"; fail "no se pudo subir"; }
  fi
  git -C "$TOP" worktree remove --force "$WT"
  exit 0
fi

# 2. Python: entorno conda 'cerberus' (Python 3.10, como el host del X2); sin conda, un .venv
CONDA_BASE=""
command -v conda >/dev/null 2>&1 && CONDA_BASE=$(conda info --base 2>/dev/null || true)
for d in /opt/homebrew/Caskroom/miniconda/base "$HOME/miniconda3" "$HOME/anaconda3" "$HOME/miniforge3" /opt/miniconda3; do
  [ -z "$CONDA_BASE" ] && [ -x "$d/bin/conda" ] && CONDA_BASE=$d
done
if [ -n "$CONDA_BASE" ]; then
  PY="$CONDA_BASE/envs/cerberus/bin/python"
  if [ ! -x "$PY" ]; then
    step "Creando el entorno conda 'cerberus' (solo la primera vez, ~5 min)..."
    "$CONDA_BASE/bin/conda" env create -q -f environment.yml || fail "fallo conda env create"
  fi
else
  PY="$ROOT/.venv/bin/python"
  if [ ! -x "$PY" ]; then
    step "No hay conda: creando .venv con $(python3 --version)..."
    python3 -m venv .venv || fail "no se pudo crear .venv"
  fi
fi
CHECK="import cv2, numpy, ultralytics, fastapi, uvicorn, zxingcpp, PIL, faster_whisper, mujoco"
[ "$(uname)" = Darwin ] && CHECK="$CHECK, Vision"
if ! "$PY" -c "$CHECK" 2>/dev/null; then
  step "Instalando dependencias (requirements.txt)..."
  "$PY" -m pip install -q -r requirements.txt || fail "fallo pip install -r requirements.txt"
  "$PY" -c "$CHECK" || fail "faltan librerias despues de instalar"
fi

# Programas del sistema: sin ellos lo demas funciona, pero se pierde esa parte
missing=""
for c in ffmpeg tesseract espeak-ng; do command -v "$c" >/dev/null 2>&1 || missing="$missing $c"; done
if [ -n "$missing" ] && [ "$(uname)" != Darwin ]; then
  printf '\033[1;33m! Faltan:%s. Instalar con: sudo apt install ffmpeg tesseract-ocr espeak-ng libheif-examples\033[0m\n' "$missing"
  printf '  (ffmpeg: audio y videos; tesseract: numero de la cedula digital; espeak-ng: voz del robot/laptop)\n'
fi

# 3. Pesos YOLO-face (publicos, akanametov/yolo-face)
W=modelos/yolov11n-face.pt
if [ ! -s "$W" ]; then
  step "Descargando el detector YOLO-face (5 MB)..."
  mkdir -p modelos
  curl -fsSL -o "$W" https://github.com/akanametov/yolo-face/releases/download/1.0.0/yolov11n-face.pt || { rm -f "$W"; fail "no se pudieron bajar los pesos YOLO"; }
fi

# 4. Pruebas automaticas (opcional): no usan camara ni fotos del equipo
if [ "$TESTS" = 1 ]; then
  step "Corriendo pruebas..."
  "$PY" captura/test_capturar.py
  "$PY" qr_lector.py --autotest 2>&1 | grep -v 'WARN:'
  "$PY" documentos.py 2>&1 | grep -v 'WARN:'
  "$PY" x2/cerberus_x2.py --autotest
  "$PY" web/voz.py 2>&1 | tail -1
  "$PY" sim/puente_mujoco.py --autotest | cut -c1-60
fi

# 5. Servidor
running() { curl -fs "$URL/api/salud" >/dev/null 2>&1; }
port_busy() { (echo > "/dev/tcp/127.0.0.1/$PORT") >/dev/null 2>&1; }
kill_port() {  # lsof en macOS / la mayoria de Linux; fuser si no hay lsof
  if command -v lsof >/dev/null 2>&1; then lsof -ti "tcp:$PORT" | xargs kill 2>/dev/null || true
  else fuser -k "$PORT/tcp" >/dev/null 2>&1 || true; fi
}
page() {  # con gente enrolada abre la identificacion; si no, la captura
  local n
  n=$(curl -fs "$URL/api/salud" | "$PY" -c "import json,sys; print(json.load(sys.stdin)['personas_en_galeria'])" 2>/dev/null || echo 0)
  [ "$n" -gt 0 ] && echo "$URL/identificar" || echo "$URL/captura"
}
if [ "$(uname)" = Darwin ]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; [ -x "$CHROME" ] || CHROME=""
else
  CHROME=$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true)
fi
KIOSK_FLAGS=(--user-data-dir="$ROOT/datos/chrome-kiosco" --no-first-run --no-default-browser-check
             --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream)
open_browser() {
  [ "$BROWSER" = 1 ] || return 0
  local u; u=$(page)
  # Kiosco: Chrome/Chromium con su propio perfil (datos/chrome-kiosco), camara y microfono aceptados y voz sin el clic
  # que exige el navegador. No toca el Chrome de siempre.
  if [ "$KIOSK" = 1 ] && [ -n "$CHROME" ]; then
    if [ "$(uname)" = Darwin ]; then open -na "Google Chrome" --args "${KIOSK_FLAGS[@]}" --app="$u"
    else nohup "$CHROME" "${KIOSK_FLAGS[@]}" --app="$u" >/dev/null 2>&1 & fi
  elif [ "$(uname)" = Darwin ]; then open -a "Google Chrome" "$u" 2>/dev/null || open "$u"
  elif [ -n "$CHROME" ]; then nohup "$CHROME" "$u" >/dev/null 2>&1 &
  else xdg-open "$u" >/dev/null 2>&1 || echo "  Abra $u en Chrome o Chromium"; fi
}
if running; then
  if [ "$RESTART" = 1 ]; then
    step "Deteniendo el servidor de Cerberus que ya corria..."
    kill_port
    for _ in $(seq 1 20); do running || break; sleep 0.5; done
  else
    step "Cerberus ya esta corriendo en $URL (para reiniciarlo: ./run.sh --reiniciar)"
    open_browser
    exit 0
  fi
elif port_busy; then
  fail "el puerto $PORT lo usa otro programa: ./run.sh --puerto 8001"
fi

step "Arrancando el servidor (carga YOLO y el OCR)..."
PORT=$PORT "$PY" web/app.py &
SERVER=$!
BRIDGE=""
trap 'kill $SERVER $BRIDGE 2>/dev/null; wait $SERVER 2>/dev/null; echo; echo "Cerberus detenido."' EXIT
trap 'exit 0' INT TERM
for _ in $(seq 1 120); do
  running && break
  kill -0 "$SERVER" 2>/dev/null || fail "el servidor no arranco (mira el error de arriba)"
  sleep 0.5
done
running || fail "el servidor no respondio en 60 s"

cat <<EOF

  Cerberus listo  ·  Ctrl+C para detener
    Captura de datos   $URL/captura
    Identificacion     $URL/identificar   (cara dudosa o desconocida -> cedula o pase QR)
    API (docs)         $URL/docs
    Pases QR           curl -X POST $URL/api/pases/generar   -> robotB/pases/
    Voz                hablale en espanol, ingles, mandarin o portugues: detecta el idioma solo

EOF
open_browser
if [ "$SIM" != 0 ]; then
  step "Abriendo el club simulado (MuJoCo) conectado a la API..."
  "$PY" sim/puente_mujoco.py --api "$URL" $([ "$SIM" = lite ] && echo --lite) &
  BRIDGE=$!
fi
wait "$SERVER"
