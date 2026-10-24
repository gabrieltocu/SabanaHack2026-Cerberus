#!/usr/bin/env bash
# Despliega Cerberus en el AgiBot X2 Ultra desde el laptop del equipo, en un solo comando.
#
# Reparto: el LAPTOP es el cerebro (API: vision, Whisper, padron) y el ROBOT es el cuerpo (camara, voz, cara, LED).
# El cliente del robot (x2/cerberus_x2.py) corre en la unidad de desarrollo del X2 (10.0.1.41), que ya trae ROS 2
# Humble, aimdk_msgs y el SDK; alcanza la API del laptop por un tunel SSH inverso. Asi no hay que compilar
# aimdk_msgs en el laptop ni instalar nada en el robot.
#
#   ./deploy/desplegar.sh                      # copia el cliente, abre el tunel y arranca la recepcion
#   ./deploy/desplegar.sh --diagnostico        # checklist del turno (camara, servicios, escucha, flujo VIP)
#   ./deploy/desplegar.sh --probar todos       # los 6 flujos seguidos, sin camara
#   ./deploy/desplegar.sh --only-voice         # ademas pone el modo only_voice y reinicia el agente
#   ./deploy/desplegar.sh --todo-en-robot      # MODO A: cerebro y cuerpo dentro del Orin, sin laptop ni tunel
#                                              # (instalalo antes con ./deploy/instalar_en_robot.sh)
#   ./deploy/desplegar.sh --normal             # devuelve el robot a su voz de fabrica y sale
#   ./deploy/desplegar.sh --solo-copiar        # solo copia los archivos (para trabajar dentro del robot)
#   ./deploy/desplegar.sh --sin-gestos         # sin el saludo con la mano (el resto igual)
# Variables: ROBOT (10.0.1.41) USUARIO (agibot) PUERTO_API (8000) ROS_SETUP SDK_SETUP
# Paso a paso y problemas conocidos: deploy/deploy.md
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
ROBOT=${ROBOT:-10.0.1.41}
USUARIO=${USUARIO:-agi}          # el SDK vive en /home/agi/aimdk (doc oficial); si tu unidad usa otro, USUARIO=...
PUERTO_API=${PUERTO_API:-8000}
DESTINO=${DESTINO:-/dev/shm/cerberus}   # en RAM: nada nuestro queda en claro en el disco del robot
DESTINO_ROBOT=${DESTINO_ROBOT:-cerberus}        # modo A (instalar_en_robot.sh): ~/cerberus dentro del Orin
ROS_SETUP=${ROS_SETUP:-/opt/ros/humble/setup.bash}
SDK_SETUP=${SDK_SETUP:-'~/aimdk/install/local_setup.bash'}   # lo que genera colcon build (deploy/compilar_sdk.sh)
SSH_ROBOT=(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "$USUARIO@$ROBOT")

MODO=recepcion ARGS=() ONLY_VOICE=0 ESCUCHAR=1
while [ $# -gt 0 ]; do
  case "$1" in
    --diagnostico) ARGS+=(--diagnostico) ;;
    --probar) ARGS+=(--probar "${2:?falta la categoria: VIP REGULAR INVITADO PERSONAL EXTERNO ESCALAMIENTO todos}"); shift ;;
    --only-voice) ONLY_VOICE=1 ;;
    --todo-en-robot) MODO=todo ;;
    --normal) MODO=normal ;;
    --solo-copiar) MODO=copiar ;;
    --sin-escuchar) ESCUCHAR=0 ;;
    --sin-gestos) ARGS+=(--sin-gestos) ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opcion desconocida: $1 (ver --help)"; exit 2 ;;
  esac
  shift
done
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Modo A: todo dentro del robot. No hace falta cerebro en el laptop ni tunel: solo entrar y arrancar.
if [ "$MODO" = todo ]; then
  step "Arrancando Cerberus completo dentro del robot ($ROBOT) ..."
  "${SSH_ROBOT[@]}" true 2>/dev/null || fail "sin ssh al robot: ./deploy/preparar_host.sh --red"
  "${SSH_ROBOT[@]}" "test -x ${DESTINO_ROBOT:-cerberus}/deploy/arrancar_en_robot.sh" 2>/dev/null \
    || fail "no esta instalado en el robot: ./deploy/instalar_en_robot.sh"
  [ "$ONLY_VOICE" = 1 ] && "${SSH_ROBOT[@]}" "bash -lc 'cd ${DESTINO_ROBOT:-cerberus}; python3 deploy/modo_agente.py only_voice'"
  exec ssh -o ConnectTimeout=5 -t "$USUARIO@$ROBOT" \
       "bash -lc 'cd ${DESTINO_ROBOT:-cerberus} && ./deploy/arrancar_en_robot.sh ${ARGS[*]:-}'"
fi

# 1. El cerebro: tiene que estar corriendo en el laptop ANTES del turno (el robot no tiene la galeria ni Whisper)
step "Comprobando el cerebro en http://127.0.0.1:$PUERTO_API ..."
SALUD=$(curl -fsS "http://127.0.0.1:$PUERTO_API/api/salud" 2>/dev/null) \
  || fail "la API no responde. Arrancala primero:  ./run.sh --sin-navegador"
echo "   $SALUD"
case "$SALUD" in *'"personas_en_galeria":0'*)
  printf '\033[1;33m! la galeria esta vacia: el robot mandara todo a recepcion. Enrola en /captura o ./run.sh --traer-datos\033[0m\n' ;;
esac
curl -fsS -X POST "http://127.0.0.1:$PUERTO_API/api/tts?lang=es" -H 'Content-Type: text/plain' -d 'prueba' -o /dev/null \
  || printf '\033[1;33m! /api/tts no responde: el robot hablara con su TTS nativo (solo ingles y chino)\033[0m\n'

# 2. El robot: ssh, ROS 2 y aimdk_msgs
step "Conectando con el robot ($USUARIO@$ROBOT) ..."
"${SSH_ROBOT[@]}" true 2>/dev/null \
  || fail "sin ssh al robot. Revisa el cable y la IP del laptop (10.0.1.2/24): ./deploy/preparar_host.sh --red"
REMOTO="source $ROS_SETUP; if [ -f $SDK_SETUP ]; then source $SDK_SETUP; fi; "
"${SSH_ROBOT[@]}" "bash -lc '$REMOTO python3 -c \"import rclpy, aimdk_msgs\"'" 2>/dev/null \
  || fail "en el robot no se puede importar aimdk_msgs: hay que COMPILAR el SDK (colcon build).
   Haz primero:  ./deploy/compilar_sdk.sh
   O indica otro install:  SDK_SETUP=~/otro/install/local_setup.bash $0 ..."

# 3. Copiar el cliente (solo lo que el robot necesita: con --api la vision corre en el cerebro)
step "Copiando el cliente a $ROBOT:$DESTINO ..."
"${SSH_ROBOT[@]}" "umask 077; mkdir -p $DESTINO/x2 $DESTINO/deploy && chmod -R go-rwx $DESTINO"   # solo el usuario run
scp -q "$ROOT/x2/cerberus_x2.py" "$USUARIO@$ROBOT:$DESTINO/x2/"
scp -q "$ROOT/x2/registros_hoy.json" "$USUARIO@$ROBOT:$DESTINO/x2/"
scp -q "$ROOT/deploy/modo_agente.py" "$USUARIO@$ROBOT:$DESTINO/deploy/"
[ "$MODO" = copiar ] && { step "Copiado. En el robot: cd $DESTINO && $REMOTO python3 x2/cerberus_x2.py --help"; exit 0; }

# 4. Modo de interaccion
if [ "$MODO" = normal ]; then
  step "Devolviendo el robot a su voz de fabrica (modo normal) ..."
  "${SSH_ROBOT[@]}" "bash -lc 'cd $DESTINO; $REMOTO python3 deploy/modo_agente.py normal'"
  exit 0
fi
if [ "$ONLY_VOICE" = 1 ]; then
  step "Poniendo el modo only_voice (lo que oye el robot pasa a Cerberus) ..."
  "${SSH_ROBOT[@]}" "bash -lc 'cd $DESTINO; $REMOTO python3 deploy/modo_agente.py only_voice'" \
    || printf '\033[1;33m! no se pudo cambiar el modo; la camara, la voz y el LED siguen funcionando\033[0m\n'
fi

# 4b. La voz de fabrica (PlayTts) sintetiza en la nube de AgiBot: si el dnsmasq del robot se traba, dice
# 'offline_cache_miss' y se queda muda. Se revisa y, si hace falta, se reinicia (pide la contrasena del robot).
step "Revisando el DNS del robot (la voz de fabrica lo necesita) ..."
if ! "${SSH_ROBOT[@]}" "timeout 4 getent hosts agibot.com >/dev/null"; then
  printf '\033[1;33m! el robot no resuelve nombres: reinicio agibot_gateway_dnsmasq (escribe la contrasena del robot)\033[0m\n'
  ssh -o ConnectTimeout=5 -t "$USUARIO@$ROBOT" "sudo systemctl restart agibot_gateway_dnsmasq && sleep 2 && getent hosts agibot.com" \
    || printf '\033[1;33m! sigue sin DNS: revisa el wifi del robot (aima nm); sin el, la voz de fabrica no habla\033[0m\n'
fi

# 5. Tunel SSH inverso + cliente. -R: el robot ve la API del laptop en su propio 127.0.0.1 (la API no se abre a la red)
[ "$ESCUCHAR" = 1 ] && ESCUCHA=--escuchar || ESCUCHA=
CMD="cd $DESTINO && $REMOTO python3 -u x2/cerberus_x2.py --api http://127.0.0.1:$PUERTO_API --tts api $ESCUCHA ${ARGS[*]:-}"
step "Arrancando en el robot (Ctrl+C para detener):"
echo "   $CMD"
exec ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -t \
     -R "$PUERTO_API:127.0.0.1:$PUERTO_API" "$USUARIO@$ROBOT" "bash -lc '$CMD'"
