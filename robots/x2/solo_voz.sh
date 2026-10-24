#!/usr/bin/env bash
# Asistente nativo del X2 en modo "solo voz": deja de conversar por su cuenta (su LLM) pero mantiene la voz y la
# deteccion de voz de los microfonos, para que hable y escuche nuestro dialogo (hri/recepcion.py --x2).
# En only_voice la deteccion queda activa tras decir UNA vez la palabra de activacion del robot.
# Uso (en el contenedor de PC2 con el SDK cargado):  ./solo_voz.sh        -> only_voice
#                                                     ./solo_voz.sh normal -> restaurar el asistente
# Manual AimDK_X2, seccion voz. Solo X2 Ultra.
set -euo pipefail
modo="${1:-only_voice}"
ros2 service call /aimdk_5Fmsgs/srv/SetAgentPropertiesRequest aimdk_msgs/srv/SetAgentPropertiesRequest "
contents:
  properties:
    - key:
        value: 2
      value: '$modo'
"
if [ "$modo" = normal ]; then
  echo "Reiniciar el agente para terminar de restaurar:  aima em stop-app agent && aima em start-app agent"
fi
