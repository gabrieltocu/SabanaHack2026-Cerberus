#!/usr/bin/env bash
# Borra del robot todo lo que dejamos (todo es de hoy, 24-oct desde las 02:05) y al final la clave ssh de este Mac.
# No toca ~/x2_ultra, ~/.docker, /home/agi/aimdk, ~/.ssh/backdoor.pub, ~/.ssh/known_hosts ni los fastrtps de /dev/shm.
# Despues, ./goodRun.sh vuelve a subir el SDK (robot_sdk/) y pide la contrasena del robot una vez para la clave.
set -euo pipefail
ROBOT=${ROBOT:-10.0.1.41}; USUARIO=${USUARIO:-run}
ssh -o ConnectTimeout=5 "$USUARIO@$ROBOT" '
  pkill -f "[c]aminar.py|[c]erberus_x2.py|[m]odo_agente.py|[o]llama serve" || true
  rm -rf /dev/shm/cerberus /dev/shm/juan ~/.cerberus ~/aimdk ~/aimdk.anterior ~/.aima ~/log ~/.ros
  sed -i "/gabriel@MacbookBradPitt/d" ~/.ssh/authorized_keys
  ls -A ~; echo "claves que quedan: $(grep -c "" ~/.ssh/authorized_keys)"'
echo "robot limpio"
