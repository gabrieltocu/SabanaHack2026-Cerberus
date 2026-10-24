#!/usr/bin/env bash
# Despliega Cerberus en el X2 Ultra DESDE UNA MACBOOK.
#
# Por que funciona desde un Mac: el cliente de ROS 2 (x2/cerberus_x2.py) nunca corre aqui — corre dentro del
# robot, que es quien tiene ROS 2 Humble, aimdk_msgs y el SDK AimDK. La MacBook solo necesita ssh, scp y curl.
# ROS 2 Humble no existe para macOS, y por este reparto no hace falta.
#
#   ./deploy-mac/desplegar_desde_mac.sh --diagnostico   # checklist del turno (camara, servicios, voz, LED)
#   ./deploy-mac/desplegar_desde_mac.sh                 # recepcion en vivo (cerebro en el Mac, cuerpo en el X2)
#   ./deploy-mac/desplegar_desde_mac.sh --only-voice    # ademas pone el modo only_voice en el robot
#   ./deploy-mac/desplegar_desde_mac.sh --probar todos  # los 6 flujos seguidos, sin camara
#   ./deploy-mac/desplegar_desde_mac.sh --compilar-sdk  # antes: colcon build de aimdk_msgs en el robot
#   ./deploy-mac/desplegar_desde_mac.sh --normal        # al terminar: el X2 vuelve a su voz de fabrica
# Variables: ROBOT (10.0.1.41) USUARIO (agi) PUERTO_API (8000) SDK_SETUP
set -uo pipefail
cd "$(dirname "$0")/.."
[ "$(uname)" = Darwin ] || { echo "esto es el atajo para macOS; en Linux usa ./deploy/desplegar.sh"; exit 1; }
for a in "$@"; do case "$a" in -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac; done

# El Mac no necesita nada propio para desplegar: se reusan los scripts compartidos de deploy/, que son
# portables (ssh, scp, curl, rsync y bash 3.2, el de macOS). Asi no hay dos versiones que se desincronicen.
SDK=0; RESTO=()
for a in "$@"; do
  case "$a" in
    --compilar-sdk) SDK=1 ;;
    *) RESTO+=("$a") ;;
  esac
done
if [ "$SDK" = 1 ]; then
  ./deploy/compilar_sdk.sh --solo-revisar || true
  ./deploy/compilar_sdk.sh || { echo "sin aimdk_msgs no arranca el cliente; ver deploy/deploy.md seccion 3b"; exit 1; }
fi
exec ./deploy/desplegar.sh ${RESTO[@]+"${RESTO[@]}"}
