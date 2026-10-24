#!/usr/bin/env bash
# Prepara una MacBook para desplegar Cerberus en el AgiBot X2 Ultra.
# Solo macOS. El equivalente para Linux es ../deploy/preparar_host.sh.
#
#   ./deploy-mac/preparar_mac.sh            # --deps y --red, y un resumen al final
#   ./deploy-mac/preparar_mac.sh --deps     # Homebrew: ffmpeg, espeak-ng, tesseract, libheif
#   ./deploy-mac/preparar_mac.sh --red      # IP fija 10.0.1.2 en el adaptador Ethernet USB-C
#   ./deploy-mac/preparar_mac.sh --wifi     # en vez del cable: el AP del robot (jump host 192.168.88.88)
#   ./deploy-mac/preparar_mac.sh --ssh      # clave ssh al robot, para no escribir la contrasena cada vez
#   ./deploy-mac/preparar_mac.sh --deshacer-red   # devuelve el adaptador a DHCP
# Variables: ROBOT (10.0.1.41) USUARIO (agi) IP_HOST (10.0.1.2) SERVICIO (se detecta)
set -uo pipefail
cd "$(dirname "$0")/.."
ROBOT=${ROBOT:-10.0.1.41}
USUARIO=${USUARIO:-agi}
IP_HOST=${IP_HOST:-10.0.1.2}
MASCARA=255.255.255.0
DEPS=0 RED=0 WIFI=0 SSHK=0 DESHACER=0
[ $# -eq 0 ] && { DEPS=1; RED=1; }
for a in "$@"; do
  case "$a" in
    --deps) DEPS=1 ;; --red) RED=1 ;; --wifi) WIFI=1 ;; --ssh) SSHK=1 ;; --deshacer-red) DESHACER=1 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opcion desconocida: $a"; exit 2 ;;
  esac
done
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; }
avisa() { printf '  \033[33m!\033[0m %s\n' "$*"; }

[ "$(uname)" = Darwin ] || { bad "esto es solo para macOS; en Linux usa ./deploy/preparar_host.sh"; exit 1; }
step "MacBook: $(sw_vers -productName) $(sw_vers -productVersion) ($(uname -m))"

# --- Programas del sistema (el cerebro corre aqui) ---
if [ "$DEPS" = 1 ]; then
  step "Programas del sistema, con Homebrew"
  if ! command -v brew >/dev/null; then
    bad "no hay Homebrew. Instalalo y vuelve a correr esto:"
    echo '     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  else
    ok "brew $(brew --version | head -1 | cut -d' ' -f2)"
    FALTAN=""
    for c in ffmpeg espeak-ng tesseract; do command -v "$c" >/dev/null || FALTAN="$FALTAN $c"; done
    command -v heif-convert >/dev/null || FALTAN="$FALTAN libheif"
    if [ -n "$FALTAN" ]; then
      echo "   instalando:$FALTAN"
      # espeak-ng: la voz en espanol del robot. ffmpeg: audio y videos. tesseract: numero de la cedula.
      # libheif: fotos HEIC del iPhone. En macOS el OCR de Apple ya lee la cedula, tesseract es el respaldo.
      brew install ffmpeg espeak-ng tesseract tesseract-lang libheif
    fi
    for c in ffmpeg espeak-ng tesseract; do command -v "$c" >/dev/null && ok "$c" || bad "$c"; done
  fi
  # Sin espeak-ng el espanol del robot sale de la voz del sistema (`say`), que esta en todos los Mac
  if command -v espeak-ng >/dev/null; then
    ok "voz del robot en espanol: espeak-ng"
  elif command -v say >/dev/null; then
    avisa "sin espeak-ng: el espanol saldra de la voz del sistema (say). Voces instaladas:"
    say -v '?' 2>/dev/null | grep -E 'es_|pt_|zh_' | awk '{printf "       %s %s\n", $1, $2}' | head -6
    avisa "si falta Paulina/Monica: Ajustes > Accesibilidad > Contenido leido > Voz del sistema > Gestionar voces"
  fi
  command -v google-chrome >/dev/null || [ -d "/Applications/Google Chrome.app" ] \
    && ok "Google Chrome instalado" || avisa "instala Chrome para las paginas (camara y voz)"
  avisa "la 1a vez, macOS pide permiso de camara y microfono para Chrome:"
  echo "       Ajustes del Sistema > Privacidad y seguridad > Camara / Microfono"
fi

# --- Red cableada: la MacBook no tiene puerto Ethernet ---
if [ "$DESHACER" = 1 ] || [ "$RED" = 1 ]; then
  step "Adaptador Ethernet (la MacBook no trae puerto: hace falta un dongle USB-C/Thunderbolt a Ethernet)"
  if [ -z "${SERVICIO:-}" ]; then
    # Nombre del servicio de red tal como lo conoce macOS ("USB 10/100/1000 LAN", "Thunderbolt Ethernet", ...)
    SERVICIO=$(networksetup -listallnetworkservices 2>/dev/null | grep -iE 'ethernet|lan' | grep -v '^An asterisk' | head -1)
  fi
  if [ -z "$SERVICIO" ]; then
    bad "no encontre un servicio Ethernet. Enchufa el dongle y mira como se llama:"
    echo "     networksetup -listallnetworkservices"
    echo "     SERVICIO='USB 10/100/1000 LAN' $0 --red"
    exit 1
  fi
  ok "servicio de red: $SERVICIO"
  if [ "$DESHACER" = 1 ]; then
    sudo networksetup -setdhcp "$SERVICIO" && ok "$SERVICIO de vuelta en DHCP"
    exit 0
  fi
  # Sin router a proposito: este enlace es solo para el robot y no debe robar la ruta por defecto (el wifi sigue dando internet)
  if sudo networksetup -setmanual "$SERVICIO" "$IP_HOST" "$MASCARA" 2>/dev/null; then
    ok "IP fija $IP_HOST/$MASCARA en $SERVICIO"
  else
    bad "networksetup -setmanual fallo; pruebalo a mano:"
    echo "     sudo networksetup -setmanual \"$SERVICIO\" $IP_HOST $MASCARA"
    echo "   o en Ajustes del Sistema > Red > $SERVICIO > Detalles > TCP/IP > Manualmente"
  fi
  DEV=$(networksetup -listallhardwareports | awk -v s="$SERVICIO" '/^Hardware Port:/{p=substr($0,16)} /^Device:/{if (p==s) print $2}')
  [ -n "$DEV" ] && ifconfig "$DEV" | sed -n 's/^\t\(inet .*\)/       \1/p'
  echo "   (el cable va al puerto Ethernet TRASERO del X2, el de desarrollo)"
  if ping -c 2 -t 2 "$ROBOT" >/dev/null 2>&1; then
    ok "el robot responde en $ROBOT"
  else
    bad "$ROBOT no responde: robot apagado, cable en el puerto equivocado, dongle sin enlace,"
    echo "     o es un X2 EDU (10.0.1.40, y el EDU no tiene modulo de interaccion)"
  fi
fi

# --- Wi-Fi: el AP del robot, como alternativa al cable ---
if [ "$WIFI" = 1 ]; then
  step "Wi-Fi del robot (solo para depurar: la doc oficial no lo recomienda para la demo)"
  echo "   1. Activa el AP Hotspot del robot desde su app."
  echo "   2. Conecta la MacBook a esa red."
  echo "   3. El X2 Ultra se alcanza por el jump host 192.168.88.88 (el EDU, directo en esa IP)."
  echo "   Las credenciales ssh las da el soporte de AgiBot."
  ping -c 2 -t 2 192.168.88.88 >/dev/null 2>&1 && ok "192.168.88.88 responde" || bad "192.168.88.88 no responde"
fi

# --- ssh sin contrasena ---
if [ "$SSHK" = 1 ]; then
  step "Clave ssh para $USUARIO@$ROBOT"
  [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519
  if command -v ssh-copy-id >/dev/null; then
    ssh-copy-id -i ~/.ssh/id_ed25519.pub "$USUARIO@$ROBOT" && ok "clave instalada"
  else   # macOS antiguo no trae ssh-copy-id
    ssh "$USUARIO@$ROBOT" 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys' < ~/.ssh/id_ed25519.pub \
      && ok "clave instalada"
  fi
fi

echo
step "Siguiente: ./deploy-mac/arrancar_cerebro.sh   y luego   ./deploy-mac/desplegar_desde_mac.sh --diagnostico"
