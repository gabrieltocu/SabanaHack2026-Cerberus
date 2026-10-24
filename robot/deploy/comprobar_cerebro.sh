#!/usr/bin/env bash
# Prueba el cerebro (la API del laptop) justo antes del turno de robot: lo que el X2 va a usar, en el orden que lo usa.
# No necesita robot ni camara. Si todo sale OK, el unico riesgo que queda esta en el robot.
#
#   ./deploy/comprobar_cerebro.sh                  # salud, galeria, voz en 4 idiomas, pases, log
#   ./deploy/comprobar_cerebro.sh FOTO.jpg         # ademas identifica esa foto, como lo haria el robot
# Variables: PUERTO_API (8000)
set -uo pipefail
cd "$(dirname "$0")/.."
API="http://127.0.0.1:${PUERTO_API:-8000}"
FOTO=${1:-}
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FALLOS=$((FALLOS + 1)); }
FALLOS=0
printf '\033[1;34m▸\033[0m Cerebro en %s\n' "$API"

SALUD=$(curl -fsS "$API/api/salud" 2>/dev/null) || { bad "la API no responde: ./run.sh --sin-navegador"; exit 1; }
ok "API viva: $SALUD"
PERSONAS=$(printf '%s' "$SALUD" | sed -n 's/.*"personas_en_galeria":\([0-9]*\).*/\1/p')
[ "${PERSONAS:-0}" -gt 0 ] && ok "$PERSONAS personas en la galeria" \
  || bad "galeria vacia: el robot mandaria todo a recepcion (/captura o ./run.sh --traer-datos)"

for L in es en zh pt; do
  N=$(curl -fsS -X POST "$API/api/tts?lang=$L" -H 'Content-Type: text/plain; charset=utf-8' \
        -d 'Bienvenido a N Club' 2>/dev/null | wc -c)
  [ "$N" -gt 4000 ] && ok "voz $L: $((N / 32)) ms de PCM 16 kHz" || bad "voz $L: /api/tts devolvio $N bytes"
done

TEXTOS=$(curl -fsS "$API/api/textos?lang=en" 2>/dev/null | wc -c)
[ "$TEXTOS" -gt 100 ] && ok "frases del visitante en ingles disponibles" || bad "/api/textos no responde"

if [ -n "$FOTO" ]; then
  [ -s "$FOTO" ] || { bad "no existe $FOTO"; exit 1; }
  R=$(curl -fsS -X POST "$API/api/identificar?camara=x2&lang=es" -H 'Content-Type: image/jpeg' \
        --data-binary "@$FOTO" 2>/dev/null)
  case "$R" in
    *'"decision"'*) ok "identificar: $(printf '%s' "$R" | cut -c1-220)" ;;
    *) bad "identificar devolvio: $(printf '%s' "$R" | cut -c1-200)" ;;
  esac
fi

curl -fsS -X POST "$API/api/pases/generar" -o /dev/null 2>/dev/null && ok "pases QR generados en pases/" \
  || bad "no se pudieron generar los pases (necesita personas enroladas)"
curl -fsS "$API/api/registros?limit=1" -o /dev/null 2>/dev/null && ok "log de visitas accesible" || bad "log inaccesible"

echo
[ "$FALLOS" = 0 ] && printf '\033[32mCerebro listo para el turno de robot.\033[0m  Siguiente: ./deploy/desplegar.sh --diagnostico\n' \
  || printf '\033[31m%s comprobacion(es) fallaron.\033[0m  Ver deploy/deploy.md seccion 7\n' "$FALLOS"
exit "$FALLOS"
