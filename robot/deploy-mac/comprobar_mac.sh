#!/usr/bin/env bash
# ¿Esta la MacBook lista para el turno de robot? Una linea por comprobacion, sin tocar nada.
#   ./deploy-mac/comprobar_mac.sh            # el Mac y el robot
#   ./deploy-mac/comprobar_mac.sh FOTO.jpg   # ademas identifica esa foto, como lo haria el robot
set -uo pipefail
cd "$(dirname "$0")/.."
ROBOT=${ROBOT:-10.0.1.41}
USUARIO=${USUARIO:-agi}
API="http://127.0.0.1:${PUERTO_API:-8000}"
FALLOS=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FALLOS=$((FALLOS + 1)); }
avisa() { printf '  \033[33m!\033[0m %s\n' "$*"; }
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }

step "La MacBook"
[ "$(uname)" = Darwin ] && ok "macOS $(sw_vers -productVersion) ($(uname -m))" || bad "no es macOS"
for c in ssh scp rsync curl python3; do command -v "$c" >/dev/null && ok "$c" || bad "falta $c"; done
command -v ffmpeg >/dev/null && ok "ffmpeg" || bad "falta ffmpeg (brew install ffmpeg)"
if command -v espeak-ng >/dev/null; then ok "espeak-ng: voz del robot en espanol"
elif command -v say >/dev/null; then avisa "sin espeak-ng: el espanol saldra de la voz del sistema (say)"
else bad "ni espeak-ng ni say: el X2 solo podria hablar ingles y chino (su TTS nativo)"; fi
command -v tesseract >/dev/null && ok "tesseract" || avisa "sin tesseract (en macOS el OCR de Apple lee la cedula)"

step "El cerebro"
SALUD=$(curl -fsS "$API/api/salud" 2>/dev/null) && ok "API viva en $API" \
  || bad "la API no responde: ./deploy-mac/arrancar_cerebro.sh"
case "${SALUD:-}" in
  *'"personas_en_galeria":0'*) bad "galeria vacia: el robot mandaria todo a recepcion (--datos o /captura)" ;;
  *personas_en_galeria*) ok "galeria: $(printf '%s' "$SALUD" | sed -n 's/.*"personas_en_galeria":\([0-9]*\).*/\1/p') personas" ;;
esac
if [ -n "${SALUD:-}" ]; then
  N=$(curl -fsS -X POST "$API/api/tts?lang=es" -H 'Content-Type: text/plain; charset=utf-8' -d 'prueba' 2>/dev/null | wc -c | tr -d ' ')
  [ "${N:-0}" -gt 4000 ] && ok "voz en espanol para el robot: $((N / 32)) ms de PCM" \
    || bad "/api/tts no da audio: el X2 hablaria solo ingles/chino"
fi
[ -n "${1:-}" ] && { R=$(curl -fsS -X POST "$API/api/identificar?camara=x2&lang=es" -H 'Content-Type: image/jpeg' --data-binary "@$1" 2>/dev/null)
  case "$R" in *'"decision"'*) ok "identificar: $(printf '%s' "$R" | cut -c1-200)" ;; *) bad "identificar: ${R:-sin respuesta}" ;; esac; }

step "El robot"
if ping -c 2 -t 2 "$ROBOT" >/dev/null 2>&1; then
  ok "$ROBOT responde"
  if ssh -o ConnectTimeout=5 -o BatchMode=yes "$USUARIO@$ROBOT" true 2>/dev/null; then
    ok "ssh sin contrasena a $USUARIO@$ROBOT"
    ssh -o ConnectTimeout=5 "$USUARIO@$ROBOT" \
      'bash -lc "source /opt/ros/humble/setup.bash 2>/dev/null; if [ -f ~/aimdk/install/local_setup.bash ]; then source ~/aimdk/install/local_setup.bash; fi; python3 -c \"import rclpy, aimdk_msgs\""' 2>/dev/null \
      && ok "aimdk_msgs compilado en el robot" \
      || bad "aimdk_msgs no importable: ./deploy/compilar_sdk.sh (colcon build)"
  else
    bad "sin ssh sin contrasena: ./deploy-mac/preparar_mac.sh --ssh"
  fi
else
  bad "$ROBOT no responde: ./deploy-mac/preparar_mac.sh --red (dongle USB-C a Ethernet, puerto TRASERO del X2)"
fi

echo
[ "$FALLOS" = 0 ] && printf '\033[32mLa MacBook esta lista.\033[0m  Siguiente: ./deploy-mac/desplegar_desde_mac.sh --diagnostico\n' \
  || printf '\033[31m%s comprobacion(es) fallaron.\033[0m  Ver deploy-mac/deploy-mac.md\n' "$FALLOS"
exit "$FALLOS"
