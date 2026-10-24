#!/usr/bin/env bash
# Arranca el cerebro de Cerberus (la API) en la MacBook, listo para que el robot lo use.
# El X2 nunca ejecuta codigo nuestro de vision: manda frames y audio aqui por un tunel ssh.
#
#   ./deploy-mac/arrancar_cerebro.sh              # entorno + modelos + API, sin abrir navegador
#   ./deploy-mac/arrancar_cerebro.sh --web        # ademas abre la pagina en Chrome (para enrolar o ensayar)
#   ./deploy-mac/arrancar_cerebro.sh --datos      # antes, baja fotos/galeria/roles del equipo (rama privada)
#   ./deploy-mac/arrancar_cerebro.sh --reiniciar  # mata el que estuviera corriendo y arranca uno nuevo
# Variables: PUERTO_API (8000) CERBERUS_WHISPER (small)
set -uo pipefail
cd "$(dirname "$0")/.."
PUERTO=${PUERTO_API:-8000}
ARGS=(--puerto "$PUERTO")
WEB=0
for a in "$@"; do
  case "$a" in
    --web) WEB=1 ;;
    --datos) ARGS+=(--traer-datos) ;;
    --reiniciar) ARGS+=(--reiniciar) ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opcion desconocida: $a"; exit 2 ;;
  esac
done
[ "$(uname)" = Darwin ] || { echo "esto es solo para macOS; en Linux: ./run.sh"; exit 1; }
[ "$WEB" = 1 ] || ARGS+=(--sin-navegador)

# run.sh ya sabe de macOS: usa el entorno conda 'cerberus' (o un .venv), instala lo que falte, baja los pesos
# de YOLO y precalienta el OCR de Apple. Aqui solo ponemos los valores que convienen para un turno de robot.
printf '\033[1;34m▸\033[0m Cerebro en la MacBook, puerto %s (Ctrl+C para detener)\n' "$PUERTO"
echo "   la API escucha SOLO en 127.0.0.1: el robot la alcanza por el tunel de desplegar_desde_mac.sh"
exec ./run.sh "${ARGS[@]}"
