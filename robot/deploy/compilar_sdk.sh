#!/usr/bin/env bash
# Compila el SDK oficial AimDK en el robot y comprueba que quedo usable por Cerberus.
#
# POR QUE HACE FALTA: `aimdk_msgs` es un paquete de interfaces de ROS 2. Los bindings de Python
# (aimdk_msgs.msg / aimdk_msgs.srv, que es lo que importa x2/cerberus_x2.py, igual que los ejemplos oficiales
# `py_examples`) los genera `colcon build`. Sin ese build —o sin un install ya hecho que se pueda sourcear— el
# cliente no arranca: falla en `import aimdk_msgs`. La documentacion oficial lo pone como paso previo obligatorio
# («4.5 Before Your First Run: Build the SDK»):
#     source /opt/ros/humble/setup.bash
#     cd ~/aimdk && colcon build
#     source install/local_setup.bash
# https://x2-aimdk.agibot.com/en/latest/quick_start/run_example.html
#
#   ./deploy/compilar_sdk.sh                 # mira si ya esta compilado; si no, compila solo aimdk_msgs (rapido)
#   ./deploy/compilar_sdk.sh --completo      # colcon build de todo el workspace, como la doc (lento, mas dependencias)
#   ./deploy/compilar_sdk.sh --limpiar       # borra build/ install/ log/ y vuelve a compilar
#   ./deploy/compilar_sdk.sh --solo-revisar  # no compila nada: solo informa que hay
#   ./deploy/compilar_sdk.sh --local         # compila en ESTE equipo (dentro del contenedor Humble), no por ssh
# Variables: ROBOT (10.0.1.41) USUARIO (agi) SDK (~/aimdk) ROS_SETUP (/opt/ros/humble/setup.bash)
set -uo pipefail
cd "$(dirname "$0")/.."
ROBOT=${ROBOT:-10.0.1.41}
USUARIO=${USUARIO:-agi}
SDK=${SDK:-'~/aimdk'}
ROS_SETUP=${ROS_SETUP:-/opt/ros/humble/setup.bash}
PAQUETES=${PAQUETES:---packages-up-to aimdk_msgs}
LIMPIAR=0 SOLO=0 LOCAL=0
for a in "$@"; do
  case "$a" in
    --completo) PAQUETES="" ;;
    --limpiar) LIMPIAR=1 ;;
    --solo-revisar) SOLO=1 ;;
    --local) LOCAL=1 ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opcion desconocida: $a (ver --help)"; exit 2 ;;
  esac
done
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# El guion que se ejecuta donde este el SDK (en el robot por ssh, o aqui con --local)
GUION=$(cat <<'REMOTO'
set +u   # sin -u: los setup.bash de ROS 2 leen variables sin definir (AMENT_TRACE_SETUP_FILES)
VERDE='\033[32m'; ROJO='\033[31m'; AMA='\033[33m'; FIN='\033[0m'
ok()  { printf "  ${VERDE}OK${FIN}    %s\n" "$*"; }
bad() { printf "  ${ROJO}FALTA${FIN} %s\n" "$*"; }
avisa() { printf "  ${AMA}!${FIN}     %s\n" "$*"; }

echo "--- el equipo ---"
echo "  $(uname -m)  $( . /etc/os-release 2>/dev/null; echo "$PRETTY_NAME")  python $(python3 -V 2>&1 | cut -d' ' -f2)  $(nproc) nucleos"
[ -r /etc/nv_tegra_release ] && echo "  JetPack: $(head -1 /etc/nv_tegra_release)"

echo "--- ROS 2 ---"
for d in /opt/ros/*/; do ok "ROS 2 $(basename "$d")"; done
[ -f "$ROS_SETUP" ] || bad "no existe $ROS_SETUP (AimDK pide ROS 2 Humble)"
# shellcheck disable=SC1090
[ -f "$ROS_SETUP" ] && . "$ROS_SETUP"

echo "--- version del SDK y del firmware ---"
for f in "$SDK_DIR"/version* "$SDK_DIR"/VERSION "$SDK_DIR"/*.md; do
  [ -f "$f" ] && { echo "  $(basename "$f"): $(head -3 "$f" | tr '\n' ' ' | cut -c1-120)"; break; }
done
command -v aima >/dev/null && { echo "  aima: $(aima --version 2>&1 | head -1)"; aima em list-app 2>/dev/null | head -5 | sed 's/^/    /'; } || avisa "sin el comando 'aima' (no parece la unidad de desarrollo del X2)"

echo "--- ¿aimdk_msgs ya es importable? ---"
YA=0
if python3 -c 'import aimdk_msgs' 2>/dev/null; then
  ok "aimdk_msgs ya esta en el entorno del sistema: NO hay que compilar"
  python3 -c 'import aimdk_msgs, os; print("    desde:", os.path.dirname(aimdk_msgs.__file__))'
  YA=1
elif [ -f "$SDK_DIR/install/local_setup.bash" ] && . "$SDK_DIR/install/local_setup.bash" 2>/dev/null && python3 -c 'import aimdk_msgs' 2>/dev/null; then
  ok "ya compilado en $SDK_DIR/install (sourcear install/local_setup.bash)"
  YA=1
else
  bad "aimdk_msgs no importable: hay que compilar"
fi

echo "--- el workspace del SDK ---"
if [ -d "$SDK_DIR" ]; then
  ok "$SDK_DIR ($(du -sh "$SDK_DIR" 2>/dev/null | cut -f1))"
  ls "$SDK_DIR" | head -12 | sed 's/^/    /'
  FUENTE=$(find "$SDK_DIR" -maxdepth 4 -type d -name aimdk_msgs 2>/dev/null | head -1)
  [ -n "$FUENTE" ] && ok "fuentes de aimdk_msgs: $FUENTE" || bad "no encontre las fuentes de aimdk_msgs bajo $SDK_DIR"
else
  bad "no existe $SDK_DIR: el SDK se copia de la unidad de desarrollo o se baja de x2-aimdk.agibot.com"
fi
command -v colcon >/dev/null && ok "colcon $(colcon version-check 2>/dev/null | head -1)" || bad "falta colcon (pip install -U colcon-common-extensions)"

[ "$SOLO_REVISAR" = 1 ] && exit 0
[ "$YA" = 1 ] && [ "$LIMPIAR" = 0 ] && { echo; echo "Nada que compilar."; exit 0; }
[ -d "$SDK_DIR" ] || exit 1

echo "--- compilando ---"
cd "$SDK_DIR" || exit 1
[ "$LIMPIAR" = 1 ] && { echo "  borrando build/ install/ log/"; rm -rf build install log; }
echo "  colcon build $PAQUETES  (en $SDK_DIR; puede tardar varios minutos)"
# shellcheck disable=SC2086
if colcon build $PAQUETES 2>&1 | tail -25; then
  . "$SDK_DIR/install/local_setup.bash" 2>/dev/null
  if python3 -c 'import aimdk_msgs' 2>/dev/null; then
    ok "aimdk_msgs compilado e importable"
    echo
    echo "  Sourcea esto en cada shell (y pasalo como SDK_SETUP a los scripts de deploy):"
    echo "    source $ROS_SETUP"
    echo "    source $SDK_DIR/install/local_setup.bash"
  else
    bad "compilo pero aimdk_msgs sigue sin importarse: ¿se genero el binding de Python?"
    exit 1
  fi
else
  bad "colcon build fallo (mira el log de arriba y $SDK_DIR/log/latest_build)"
  exit 1
fi
REMOTO
)

if [ "$LOCAL" = 1 ]; then
  step "Compilando en este equipo ($SDK)"
  SDK_DIR=$(eval echo "$SDK") ROS_SETUP="$ROS_SETUP" PAQUETES="$PAQUETES" LIMPIAR="$LIMPIAR" SOLO_REVISAR="$SOLO" \
    bash -c "$GUION"
  RC=$?
else
  step "Compilando el SDK en el robot ($USUARIO@$ROBOT)"
  ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "$USUARIO@$ROBOT" true 2>/dev/null \
    || fail "sin ssh a $USUARIO@$ROBOT. Cable y red: ./deploy/preparar_host.sh --red   ·   otro usuario: USUARIO=... $0"
  ssh -o ConnectTimeout=5 "$USUARIO@$ROBOT" \
    "SDK_DIR=$SDK ROS_SETUP='$ROS_SETUP' PAQUETES='$PAQUETES' LIMPIAR=$LIMPIAR SOLO_REVISAR=$SOLO bash -s" <<<"$GUION"
  RC=$?
fi

echo
if [ "$RC" = 0 ]; then
  step "Siguiente: comprobar que los campos del SDK coinciden con lo que usa Cerberus"
  if [ "$LOCAL" = 1 ]; then
    echo "   python3 deploy/verificar_mensajes.py --vivo"
  else
    echo "   ./deploy/desplegar.sh --solo-copiar"
    echo "   ssh $USUARIO@$ROBOT 'cd /tmp/cerberus && source $ROS_SETUP && source $SDK/install/local_setup.bash"
    echo "                        && python3 deploy/verificar_mensajes.py --vivo'"
  fi
else
  printf '\033[1;31mEl SDK no quedo listo. Sin aimdk_msgs el cliente del robot no arranca.\033[0m\n'
  echo "Alternativas: contenedor en el Orin (deploy/deploy.md seccion 4b) o pedir el SDK de la version del firmware."
fi
exit "$RC"
