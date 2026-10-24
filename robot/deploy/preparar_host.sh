#!/usr/bin/env bash
# Prepara un host Ubuntu cableado al X2 (plan B del despliegue: ROS 2 en el laptop en vez de en el robot).
# Si vas a correr el cliente dentro del robot (lo recomendado, deploy/desplegar.sh), de aqui solo necesitas --deps.
#
#   ./deploy/preparar_host.sh            # --deps y --red, y al final un resumen
#   ./deploy/preparar_host.sh --deps     # programas del sistema del cerebro (ffmpeg, espeak-ng, tesseract...)
#   ./deploy/preparar_host.sh --red      # IP fija 10.0.1.2/24 en la interfaz cableada y ping al robot
#   ./deploy/preparar_host.sh --ros      # comprueba ROS 2 y aimdk_msgs en ESTE equipo
# Variables: IFACE (se detecta) IP_HOST (10.0.1.2) ROBOT (10.0.1.41)
set -uo pipefail
cd "$(dirname "$0")/.."
ROBOT=${ROBOT:-10.0.1.41}
IP_HOST=${IP_HOST:-10.0.1.2}
PREFIJO=24
DEPS=0 RED=0 ROS=0
[ $# -eq 0 ] && { DEPS=1; RED=1; }
for a in "$@"; do
  case "$a" in
    --deps) DEPS=1 ;; --red) RED=1 ;; --ros) ROS=1 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opcion desconocida: $a"; exit 2 ;;
  esac
done
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; }

if [ "$DEPS" = 1 ]; then
  step "Programas del sistema (cerebro: audio, OCR, voz, fotos del iPhone)"
  FALTAN=""
  for c in ffmpeg espeak-ng tesseract; do command -v "$c" >/dev/null || FALTAN="$FALTAN $c"; done
  if [ -n "$FALTAN" ]; then
    echo "   faltan:$FALTAN -> instalando"
    sudo apt-get update -qq && sudo apt-get install -y ffmpeg espeak-ng tesseract-ocr tesseract-ocr-spa libheif-examples
  fi
  for c in ffmpeg espeak-ng tesseract; do command -v "$c" >/dev/null && ok "$c" || bad "$c"; done
  espeak-ng -v es-419 -s 150 --stdout "prueba de voz" >/dev/null 2>&1 && ok "espeak-ng habla espanol (es-419)" \
    || bad "espeak-ng no genero audio en espanol"
  groups | grep -qw video && ok "el usuario esta en el grupo video (camara)" \
    || bad "falta el grupo video: sudo usermod -aG video $USER (y volver a entrar)"
fi

if [ "$RED" = 1 ]; then
  step "Red cableada hacia el robot ($IP_HOST/$PREFIJO -> $ROBOT)"
  IFACE=${IFACE:-$(ls /sys/class/net | grep -E '^(en|eth)' | head -1)}
  [ -z "${IFACE:-}" ] && { bad "no encontre interfaz cableada (define IFACE=...)"; exit 1; }
  echo "   interfaz: $IFACE  (enchufa el cable al puerto ethernet TRASERO del X2, el de desarrollo)"
  if command -v nmcli >/dev/null && nmcli -t device status | grep -q "^$IFACE:"; then
    sudo nmcli connection delete cerberus-x2 >/dev/null 2>&1
    sudo nmcli connection add type ethernet ifname "$IFACE" con-name cerberus-x2 \
      ip4 "$IP_HOST/$PREFIJO" ipv4.method manual ipv6.method ignore >/dev/null \
      && sudo nmcli connection up cerberus-x2 >/dev/null && ok "perfil cerberus-x2 activo en $IFACE" \
      || bad "nmcli no pudo configurar $IFACE"
  else
    sudo ip link set "$IFACE" up
    sudo ip addr replace "$IP_HOST/$PREFIJO" dev "$IFACE" && ok "IP $IP_HOST/$PREFIJO en $IFACE (se pierde al reiniciar)"
  fi
  ip -br addr show "$IFACE"
  if ping -c 2 -W 2 "$ROBOT" >/dev/null 2>&1; then
    ok "el robot responde en $ROBOT"
    ssh -o ConnectTimeout=5 -o BatchMode=yes "${USUARIO:-agi}@$ROBOT" true 2>/dev/null \
      && ok "ssh sin contrasena listo" || echo "   (ssh pedira contrasena: ssh-copy-id ${USUARIO:-agi}@$ROBOT)"
  else
    bad "$ROBOT no responde: robot apagado, cable en el puerto equivocado, o es un X2 EDU (10.0.1.40)"
  fi
fi

if [ "$ROS" = 1 ]; then
  step "ROS 2 y aimdk_msgs en este equipo"
  for d in /opt/ros/*/setup.bash; do [ -e "$d" ] && ok "ROS 2 $(basename "$(dirname "$d")")"; done
  [ -e /opt/ros/humble/setup.bash ] || bad "falta ROS 2 Humble (AimDK pide Humble; otra version no esta soportada)"
  if bash -lc 'source /opt/ros/*/setup.bash 2>/dev/null; python3 -c "import aimdk_msgs"' 2>/dev/null; then
    ok "aimdk_msgs importable"
  else
    bad "sin aimdk_msgs: viene en el SDK AimDK (copialo de la unidad de desarrollo del robot o bajalo de"
    echo "     https://x2-aimdk.agibot.com/en/latest/get_sdk/index.html ) — o corre el cliente DENTRO del robot:"
    echo "     ./deploy/desplegar.sh   (no necesita aimdk_msgs aqui)"
  fi
fi
echo
step "Siguiente paso: ./run.sh --sin-navegador  (cerebro)  y luego  ./deploy/desplegar.sh --diagnostico"
