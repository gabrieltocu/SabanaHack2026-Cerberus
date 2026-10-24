#!/usr/bin/env bash
# Sube x2/caminar.py al robot (en RAM, como el cliente) y lo corre alli con ROS 2 + aimdk. Los argumentos pasan tal cual:
#   deploy/caminar.sh --metros 3 --si     deploy/caminar.sh --manual --si     (lo lanza el panel /robot, recuadro Caminar)
set -euo pipefail
cd "$(dirname "$0")/.."
ROBOT=${ROBOT:-10.0.1.41}; USUARIO=${USUARIO:-run}; DESTINO=${DESTINO:-/dev/shm/cerberus}
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=5)
"${SSH[@]}" "$USUARIO@$ROBOT" "umask 077; mkdir -p $DESTINO/x2"
scp -q -o BatchMode=yes x2/caminar.py "$USUARIO@$ROBOT:$DESTINO/x2/"
# -tt: terminal en el robot aunque aqui la entrada sea un pipe; al cortar el ssh, caminar.py recibe SIGHUP y frena
exec "${SSH[@]}" -tt "$USUARIO@$ROBOT" "source /opt/ros/humble/setup.bash; source ~/aimdk/install/local_setup.bash; exec python3 -u $DESTINO/x2/caminar.py $*"
