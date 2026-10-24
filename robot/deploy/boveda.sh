#!/usr/bin/env bash
# Boveda cifrada de Juan en el X2 Ultra: lo que creamos queda en el robot solo cifrado y solo se abre con la contrasena
# del dueno.
#   ./deploy/boveda.sh publico   (una vez) sube lo publico que no es nuestro: Ollama para Jetson y los pesos de
#                                DeepSeek R1 7B y de los embeddings -> ~/.cerberus/publico (sin cifrar, ~6 GB)
#   ./deploy/boveda.sh guardar   cifra SabanaHack2 en el robot: ~/.cerberus/boveda.gpg (AES256, 700/600)
#   ./deploy/boveda.sh abrir     la descifra en RAM (/dev/shm/juan, 700) y levanta juan-deepseek en el Orin (GPU)
#   ./deploy/boveda.sh cerrar    apaga el LLM del Orin y borra la copia en RAM (la boveda cifrada queda)
#   ./deploy/boveda.sh estado
# La contrasena se pide una vez (o llega en CERBERUS_CLAVE) y viaja solo por la entrada de ssh hasta gpg en el robot:
# nunca en un archivo, un log ni la linea de comandos (gpg la lee del descriptor 3, sin cache de agente).
# Las reglas de Juan (Modelfile) solo existen descifradas en RAM: el modelo juan-deepseek se crea en un directorio de
# modelos en /dev/shm cuyos pesos publicos son enlaces a ~/.cerberus/publico.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=$(cd .. && pwd)                                    # .../SabanaHack2
ROBOT=${ROBOT:-10.0.1.41} USUARIO=${USUARIO:-run}
SSH=(ssh -o ConnectTimeout=5 -o BatchMode=yes "$USUARIO@$ROBOT")
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
clave() {
  if [ -z "${CERBERUS_CLAVE:-}" ]; then
    read -r -s -p "Contraseña de la bóveda de Juan: " CERBERUS_CLAVE </dev/tty; echo >&2
  fi
  [ -n "$CERBERUS_CLAVE" ] || fail "sin contraseña"
}
# en el robot: P = primera linea de la entrada; GPG = gpg con la contrasena por el descriptor 3
REMOTO_INICIO='set -euo pipefail; umask 077; IFS= read -r P
GPG() { gpg --batch -q --yes --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 "$@" 3< <(printf %s "$P"); }
B=~/.cerberus/boveda.gpg; R=/dev/shm/juan; PUB=~/.cerberus/publico
OLL() { OLLAMA_HOST=127.0.0.1:11434 "$PUB/ollama/bin/ollama" "$@"; }'

case "${1:-}" in
publico)
  "${SSH[@]}" 'mkdir -p -m 700 ~/.cerberus ~/.cerberus/publico/ollama ~/.cerberus/publico/models'
  if ! "${SSH[@]}" '[ -x ~/.cerberus/publico/ollama/bin/ollama ] && [ -d ~/.cerberus/publico/ollama/lib/ollama/cuda_jetpack6 ]'; then
    for f in ollama-linux-arm64 ollama-linux-arm64-jetpack6; do
      step "Subiendo $f (Ollama para Jetson) ..."
      "${SSH[@]}" 'zstd -dc | tar -x -C ~/.cerberus/publico/ollama' < "$BASE/rag/robot_llm/$f.tar.zst"
    done
  fi
  # pesos publicos: los blobs que nombran los manifiestos de deepseek-r1:7b y paraphrase-multilingual del Mac
  M=~/.ollama/models
  LISTA=$(python3 - "$M" <<'EOF'
import json, sys, pathlib
m = pathlib.Path(sys.argv[1])
for man in ('registry.ollama.ai/library/deepseek-r1/7b', 'registry.ollama.ai/library/paraphrase-multilingual/latest'):
    d = json.loads((m / 'manifests' / man).read_text())
    print('manifests/' + man)
    for l in [d['config']] + d['layers']:
        print('blobs/' + l['digest'].replace(':', '-'))
EOF
)
  FALTAN=$(printf '%s\n' "$LISTA" | "${SSH[@]}" 'cd ~/.cerberus/publico/models; while read -r f; do [ -s "$f" ] || echo "$f"; done')
  if [ -n "$FALTAN" ]; then
    step "Subiendo los pesos de DeepSeek R1 7B y de los embeddings (~5.3 GB) ..."
    printf '%s\n' "$FALTAN" | tar -C "$M" -cf - -T - | "${SSH[@]}" 'tar -x -C ~/.cerberus/publico/models'
  fi
  step "Lo publico ya esta en el robot (~/.cerberus/publico)"
  ;;
guardar)
  clave
  step "Cifrando SabanaHack2 en el robot (~/.cerberus/boveda.gpg) ..."
  { printf '%s\n' "$CERBERUS_CLAVE"
    COPYFILE_DISABLE=1 tar -C "$BASE/.." -cz --exclude='SabanaHack2/rag/robot_llm' --exclude='SabanaHack2/rag/n8n/datos' \
      --exclude='__pycache__' --exclude='*.log' --exclude='.DS_Store' SabanaHack2
  } | "${SSH[@]}" "bash -c '$REMOTO_INICIO
mkdir -p -m 700 ~/.cerberus
if [ -f \$B ] && ! GPG -d \$B >/dev/null 2>&1; then echo \"la contrasena no abre la boveda que ya hay: no se pisa\" >&2; exit 3; fi
GPG --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 -o \$B.nuevo
GPG -d \$B.nuevo | tar -tz >/dev/null
mv \$B.nuevo \$B; chmod 600 \$B; ls -l \$B'" || fail "no se guardo la boveda"
  ;;
abrir)
  clave
  step "Abriendo la boveda en RAM y levantando juan-deepseek en el Orin ..."
  printf '%s\n' "$CERBERUS_CLAVE" | "${SSH[@]}" "bash -c '$REMOTO_INICIO
[ -f \$B ] || { echo \"no hay boveda: ./deploy/boveda.sh guardar\" >&2; exit 2; }
pkill -u \$(id -u) -f \"ollama serve\" || true
rm -rf \$R; mkdir -m 700 \$R
GPG -d \$B | tar -xz -C \$R || { rm -rf \$R; echo \"contrasena incorrecta\" >&2; exit 3; }
mkdir -p \$R/modelos/blobs; ln -sf \$PUB/models/blobs/* \$R/modelos/blobs/; cp -r \$PUB/models/manifests \$R/modelos/
OLLAMA_MODELS=\$R/modelos OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NOPRUNE=1 OLLAMA_KEEP_ALIVE=60m \
  nohup \$PUB/ollama/bin/ollama serve >\$R/ollama.log 2>&1 </dev/null &
for i in \$(seq 60); do curl -fsS 127.0.0.1:11434/api/version >/dev/null 2>&1 && break; sleep 1; done
OLL create juan-deepseek -f \$R/SabanaHack2/rag/Modelfile >/dev/null
curl -fsS 127.0.0.1:11434/api/generate -d \"{\\\"model\\\":\\\"juan-deepseek\\\",\\\"prompt\\\":\\\"hola\\\",\\\"stream\\\":false,\\\"options\\\":{\\\"num_predict\\\":1}}\" >/dev/null
OLL list | sed -n 1,4p'" || fail "no se abrio la boveda"
  ;;
cerrar)
  "${SSH[@]}" 'pkill -u "$(id -u)" -f "ollama serve" || true; rm -rf /dev/shm/juan; echo "LLM del Orin apagado; copia en RAM borrada"'
  ;;
estado)
  "${SSH[@]}" 'ls -l ~/.cerberus/boveda.gpg 2>/dev/null || echo "sin boveda"; [ -d /dev/shm/juan ] && echo "abierta en RAM" || echo "cerrada"
    curl -fsS -m 3 127.0.0.1:11434/api/tags 2>/dev/null | grep -o "\"name\":\"[^\"]*\"" || echo "LLM del Orin apagado"'
  ;;
*) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
