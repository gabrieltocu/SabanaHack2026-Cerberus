#!/usr/bin/env bash
# Todo Juan (Cerberus en el X2 Ultra) con un comando:
#   ./goodRun.sh            RAG (n8n + DeepSeek, ../rag) + cerebro en este Mac + recepcion en el robot (voz de fabrica
#                           de AgiBot, microfonos del robot -> Whisper local) + panel en Chrome + monitor en otra Terminal
#   ./goodRun.sh --orin     igual, pero el LLM corre en el Orin del robot: pide la contrasena de la boveda, guarda todo
#                           cifrado en el robot (deploy/boveda.sh) y lo abre solo en RAM; si algo falla, LLM en el Mac
#   ./goodRun.sh --parar    para todo (cliente del robot, parlante, despliegue, cerebro, n8n y el LLM del Orin)
# Panel /llm: interruptor entre DeepSeek + RAG y el modo clasico (solo palabras clave y frases fijas).
# Requisitos: cable al puerto Ethernet trasero del X2 con este Mac en 10.0.1.2 (deploy-mac/preparar_mac.sh --red),
# entorno conda `cerberus` (./run.sh lo crea la primera vez). Usuario del robot: run.
set -uo pipefail
cd "$(dirname "$0")"
export ROBOT=${ROBOT:-10.0.1.41} USUARIO=${USUARIO:-run} PUERTO_API=${PUERTO_API:-8000}
URL=http://127.0.0.1:$PUERTO_API
LOG=$PWD/datos/cerebro.log
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

parar() {
  curl -fsS -m 20 -X POST "$URL/api/robot/parar_todo" >/dev/null 2>&1   # cliente del robot + parlante + despliegue
  pkill -f "run.sh --puerto $PUERTO_API" 2>/dev/null
  kill -9 $(lsof -tiTCP:"$PUERTO_API" -sTCP:LISTEN) 2>/dev/null           # el cerebro de este puerto, aunque este colgado
  pkill -f "deploy/desplegar.sh" 2>/dev/null
}
TUNEL_LLM="21434:127.0.0.1:11434"                      # este Mac -> Ollama del Orin
if [ "${1:-}" = --parar ]; then
  parar; ../rag/rag.sh --parar >/dev/null 2>&1
  pkill -f "$TUNEL_LLM" 2>/dev/null; ./deploy/boveda.sh cerrar >/dev/null 2>&1
  step "Todo detenido."; exit 0
fi
ORIN=0; [ "${1:-}" = --orin ] && ORIN=1

# 1. Red y ssh al robot
step "Robot $USUARIO@$ROBOT ..."
ping -c1 -W1000 "$ROBOT" >/dev/null 2>&1 \
  || fail "no responde $ROBOT: cable al puerto trasero y este Mac en 10.0.1.2 (./deploy-mac/preparar_mac.sh --red)"
if ! ssh -o BatchMode=yes -o ConnectTimeout=4 "$USUARIO@$ROBOT" true 2>/dev/null; then
  step "Instalando la clave ssh de este Mac en el robot (pide la contrasena del robot una vez)"
  ./deploy-mac/preparar_mac.sh --ssh || fail "sin ssh al robot"
fi

# 2. SDK (aimdk_msgs) en el robot: si no esta, se sube el compilado que guardamos (robot_sdk/), sin compilar
if ! ssh -o BatchMode=yes "$USUARIO@$ROBOT" '[ -f ~/aimdk/install/local_setup.bash ]'; then
  step "Subiendo el SDK compilado (robot_sdk/aimdk-install-run.tgz) a ~/aimdk ..."
  ssh -o BatchMode=yes "$USUARIO@$ROBOT" 'cd ~ && tar xzf -' < robot_sdk/aimdk-install-run.tgz || fail "no se pudo subir el SDK"
fi

# 2b. RAG: n8n + DeepSeek R1 7B ajustado (juan-deepseek). Sin el, Juan sigue con sus frases fijas (modo clasico)
if [ "$ORIN" = 1 ]; then
  step "Boveda cifrada y LLM en el Orin ..."
  [ -n "${CERBERUS_CLAVE:-}" ] || { read -r -s -p "   Contraseña de la bóveda de Juan: " CERBERUS_CLAVE; echo; }
  export CERBERUS_CLAVE                                 # solo para boveda.sh (por la entrada de ssh); se borra enseguida
  if ./deploy/boveda.sh publico && ./deploy/boveda.sh guardar && ./deploy/boveda.sh abrir; then
    pkill -f "$TUNEL_LLM" 2>/dev/null
    ssh -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -L "$TUNEL_LLM" "$USUARIO@$ROBOT" \
      && export CERBERUS_OLLAMA=http://127.0.0.1:21434 OLLAMA_URL=http://host.docker.internal:21434
  fi
  unset CERBERUS_CLAVE
  [ -n "${OLLAMA_URL:-}" ] || printf '\033[1;33m! el LLM del Orin no quedo arriba: sigue el del Mac\033[0m\n'
fi
step "RAG (n8n + DeepSeek${OLLAMA_URL:+ en el Orin}) ..."
../rag/rag.sh 2>&1 | grep -E '▸|✗' | sed 's/^/   /' || true
unset OLLAMA_URL

# 3. Cerebro limpio (un cerebro viejo en el mismo puerto deja paginas nuevas hablando con una API vieja)
step "Cerebro en $URL (log: $LOG) ..."
parar; sleep 1
mkdir -p datos
nohup ./run.sh --puerto "$PUERTO_API" --reiniciar --sin-navegador >"$LOG" 2>&1 &
for _ in $(seq 90); do curl -fsS -m 2 "$URL/openapi.json" 2>/dev/null | grep -q parar_todo && break; sleep 2; done
curl -fsS -m 2 "$URL/openapi.json" 2>/dev/null | grep -q parar_todo || fail "el cerebro no arranco: tail $LOG"

# 4. Panel y monitor (que corre en el Orin y que en este Mac)
open -a "Google Chrome" "$URL/robot" 2>/dev/null || open "$URL/robot"
osascript -e "tell application \"Terminal\" to do script \"cd '$PWD' && USUARIO=$USUARIO ./deploy/monitor.sh\"" >/dev/null 2>&1

# 5. Recepcion en el robot (camara de arriba, lidar, microfonos, voz de fabrica, DNS vigilado)
step "Arrancando la recepcion en el robot ..."
curl -fsS -m 10 -X POST "$URL/api/robot/recepcion" >/dev/null || fail "no arranco la recepcion (ver el log en el panel)"
step "Listo. Panel: $URL/robot · Se le habla diciendo «Juan». Para todo: boton rojo, o ./goodRun.sh --parar"
