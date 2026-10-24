#!/usr/bin/env bash
# RAG de Juan: Ollama en este Mac (juan-deepseek = DeepSeek R1 7B ajustado, + embeddings multilingues) y n8n en Docker.
#   ./rag.sh           deja todo listo, arranca n8n y le carga los datos del club (conocimiento/*.md)
#   ./rag.sh --parar   apaga n8n (Ollama sigue: solo gasta cuando le preguntan)
# El cerebro (../robot) le pregunta a http://127.0.0.1:5678/webhook/juan; el panel /llm tiene el interruptor.
set -euo pipefail
cd "$(dirname "$0")"
N8N=http://127.0.0.1:5678; EMB=paraphrase-multilingual; BASE=$(sed -n 's/^FROM //p' Modelfile)
# OLLAMA_URL: el Ollama que usa n8n (visto desde el contenedor). Vacio = el de este Mac; goodRun.sh --orin pasa el del
# Orin por el tunel (http://host.docker.internal:21434) y entonces este Mac no corre el modelo.
OLLAMA_URL=${OLLAMA_URL:-}
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
esperar() { for _ in $(seq "$2"); do eval "$1" >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }

if [ "${1:-}" = --parar ]; then docker compose down; step "n8n apagado"; exit 0; fi

# 1. Ollama y los modelos (la primera vez baja ~5.3 GB). Con OLLAMA_URL (el del Orin) no hace falta aqui.
if [ -z "$OLLAMA_URL" ]; then
command -v ollama >/dev/null || { step "Instalando Ollama (brew)"; brew install ollama; }
curl -fsS 127.0.0.1:11434/api/version >/dev/null 2>&1 || brew services start ollama >/dev/null
esperar 'curl -fsS 127.0.0.1:11434/api/version' 30 || fail "Ollama no arranco (brew services list)"
for m in "$BASE" "$EMB"; do ollama show "$m" >/dev/null 2>&1 || { step "ollama pull $m ..."; ollama pull "$m"; }; done
ollama create juan-deepseek -f Modelfile >/dev/null 2>&1 || fail "ollama create juan-deepseek fallo"
step "Modelo juan-deepseek listo (desde $BASE)"
fi

# 2. Docker
docker info >/dev/null 2>&1 || { step "Abriendo Docker Desktop ..."; open -a Docker; }
esperar 'docker info' 90 || fail "Docker no arranco"

# 3. n8n: la credencial de Ollama y el flujo se importan cada vez (mismo id: quedan iguales a n8n/*.json), activo
mkdir -p n8n/datos
docker compose stop n8n >/dev/null 2>&1 || true
n8n() { docker compose run --rm --no-deps -T --entrypoint n8n n8n "$@" 2>&1 | grep -v -i -E 'deprecat|^$' || true; }
step "Importando el flujo Juan RAG en n8n ..."
IMPORTAR=/importar
if [ -n "$OLLAMA_URL" ]; then                          # mismo flujo, apuntando al Ollama del Orin
  mkdir -p n8n/orin
  for f in credenciales.json juan_rag.json; do sed "s#http://host.docker.internal:11434#$OLLAMA_URL#g" "n8n/$f" > "n8n/orin/$f"; done
  IMPORTAR=/importar/orin
  step "n8n usara el LLM del Orin ($OLLAMA_URL)"
fi
n8n import:credentials --input=$IMPORTAR/credenciales.json
n8n import:workflow --input=$IMPORTAR/juan_rag.json
if docker compose run --rm --no-deps -T --entrypoint n8n n8n --help 2>/dev/null | grep -q 'publish:workflow'; then
  n8n publish:workflow --id=JuanRAG000000001          # n8n 2.x
else
  n8n update:workflow --id=JuanRAG000000001 --active=true
fi
docker compose up -d --force-recreate >/dev/null 2>&1   # contenedor nuevo: nunca sirve la version anterior del flujo
esperar "curl -fsS $N8N/healthz" 60 || fail "n8n no arranco: docker compose logs n8n"

# 4. Los datos del club al Simple Vector Store (vive en memoria: se recarga cada vez que n8n arranca)
step "Cargando conocimiento/ en n8n ..."
esperar "python3 -c \"
import json, pathlib, urllib.request
docs = [{'nombre': f.name, 'texto': l.strip()} for f in sorted(pathlib.Path('conocimiento').glob('*.md'))
        for l in f.read_text().splitlines() if l.strip() and not l.lstrip().startswith('#')]   # un documento por dato
urllib.request.urlopen(urllib.request.Request('$N8N/webhook/ingesta', json.dumps({'docs': docs}).encode(),
                       {'Content-Type': 'application/json'}), timeout=120).read()
\"" 15 || fail "n8n no recibio los documentos (el webhook /ingesta no esta activo?): docker compose logs n8n"

# 5. Prueba
R=$(curl -fsS -m 90 "$N8N/webhook/juan" -H 'Content-Type: application/json' \
  -d '{"texto":"¿A qué hora cierra el club?","idioma":"es"}' || true)
[ -n "$R" ] || fail "el RAG no respondio: docker compose logs n8n"
step "Listo. Juan: $(printf '%s' "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin)["respuesta"])')"
step "n8n: $N8N (el flujo «Juan RAG»; la primera vez pide crear un usuario local)"
