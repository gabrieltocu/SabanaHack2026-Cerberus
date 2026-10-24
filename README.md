> **Cerberus · Sabana Hack 2026** — equipo: Andres Azcona, Gabriel José Torres Cuellar y Marshall Gomez.
>
> | Rama | Qué tiene |
> |---|---|
> | [`main`](../../tree/main) | N Club simulado en MuJoCo, recepción por voz (HRI), visión y registros simulados del club |
> | [`robot-x2`](../../tree/robot-x2) | Juan en el AgiBot X2 Ultra real: cerebro (FastAPI), cliente ROS 2, voz, RAG local y despliegue |
>
> Las fotos, cédulas, pases y demás datos personales del equipo no se publican.

# SabanaHack2 — Juan (Cerberus) en el AgiBot X2 Ultra, con RAG local (n8n + DeepSeek)

Lo esencial del deploy (copiado de `SabanaHack/deploy/goodRobot`, lo que funcionó en el robot el 24-oct-2026) más un
RAG para preguntas libres. Todo corre en este Mac y en el robot; nada sale a la nube salvo la voz de fábrica del X2.

| Carpeta | Qué hay |
|---|---|
| `robot/` | El cerebro (`web/app.py`, FastAPI), el cliente del X2 (`x2/cerberus_x2.py`), el deploy (`deploy/`, `goodRun.sh`), el SDK compilado (`robot_sdk/aimdk-install-run.tgz`), los datos de reconocimiento (`datos/`). Handoff detallado del robot: `robot/trabajo.md` |
| `vision/` | Reconocimiento facial del equipo (YuNet + SFace); el cerebro lo busca en `../vision` |
| `rag/` | `Modelfile` (juan-deepseek: DeepSeek R1 7B con las reglas de Juan), `conocimiento/club.md` (los datos del club), `n8n/juan_rag.json` (el flujo), `docker-compose.yml` (n8n 2.44.6), `rag.sh` |
| `docs/` | Reto, diseño y HRI |

No se copió: el perfil de Chrome del kiosco, los logs, `datos/descartadas` y el zip del SDK (270 MB, solo para recompilar;
sigue en `SabanaHack/deploy/goodRobot/robot_sdk/`).

## Arrancar

```bash
cd robot && ./goodRun.sh            # RAG + cerebro (:8000) + recepción en el robot + panel + monitor
cd robot && ./goodRun.sh --parar    # para todo, n8n incluido
cd rag && ./rag.sh                  # solo el RAG (Ollama + n8n); la 1a vez baja ~5.3 GB
cd robot && ./run.sh --puerto 8003  # solo el cerebro, sin robot (para probar)
```
Ojo: `goodRun.sh` usa el puerto 8000; si `SabanaHack/deploy/goodRobot` está corriendo ahí, lo reemplaza.

### LLM en el robot y bóveda cifrada (`./goodRun.sh --orin`)

- Pide la contraseña de la bóveda una vez (escríbala usted en su Terminal; no se guarda en ningún archivo).
- `deploy/boveda.sh guardar`: todo SabanaHack2 queda en el robot **solo cifrado** (`~/.cerberus/boveda.gpg`, AES-256,
  700/600). Con otra contraseña no se pisa la bóveda que ya hay.
- `deploy/boveda.sh abrir`: la descifra en RAM (`/dev/shm/juan`) y levanta `juan-deepseek` en la GPU del Orin; las reglas
  de Juan solo existen descifradas en RAM. n8n sigue en el Mac (en el robot Docker viene enmascarado de fábrica) y llega
  al Orin por un túnel ssh. Si algo falla, el LLM sigue en el Mac.
- `./goodRun.sh --parar` apaga el LLM del Orin y borra la copia en RAM; la bóveda cifrada queda.
- Lo público (Ollama para Jetson, pesos de DeepSeek y embeddings, ~6 GB) va sin cifrar en `~/.cerberus/publico`.

### Interacción (24-oct-2026)

- Escucha siempre con los 4 micrófonos del robot; mientras suena su parlante (Juan o el asistente de fábrica) no oye.
  Con alguien frente a la cámara conversa sin que le digan «Juan».
- Voz → texto: Whisper large-v3-turbo en la GPU del Mac (mlx-whisper, ~0.8 s). El ASR de fábrica de AgiBot no publica
  texto por el SDK (solo LinkSoul en la nube).
- Gestos (tabla oficial de AimDK, probados): saluda o hace reverencia (VIP), da la mano, señala con el brazo el lado de
  su destino. Lo demás, según lo que se dice (nada al azar): mano al pecho al presentarse, reverencia a un «gracias»,
  corazón a un «me encanta», aplauso con un chiste, y el brazo al lado que nombra su respuesta.
- Idioma: español por defecto. La app lo cambia con `PUT /api/idioma {"idioma": "en"}` (es, en, zh, pt; `GET /api/idioma`
  lo lee); el robot lo toma en ≤ 5 s y oye y habla en ese idioma (Whisper fijado al idioma: más preciso). No se guarda:
  al reiniciar el cerebro vuelve a español.
- Dos personas conocidas a la vez: saluda a las dos (cada una con su rol y destino), da la mano a cada una, las llama
  por su nombre («¡Hola, Ana y Luis!») y conversa con quien hable. Una cara desconocida al lado no frena a la conocida.
- Gestos por palabras (4 idiomas): «choca esos cinco» → choca la mano; «mucho gusto» → la mano; «me encanta» → corazón;
  «cumpleaños», «ganamos» → celebra; «genial», «increíble» → aplaude; «no lo sé» → se rasca la cabeza; «tranquilo» →
  saludo suave; «gracias» → reverencia.
- Memoria: a quien ya saludó no lo vuelve a saludar mientras siga enfrente o hablándole, ni 15 min después de irse.
  Conversando, una cara de lado o tapada no dispara «retira las gafas» ni pide la cédula.
- Escucha más de lo que habla: respuestas del LLM de una sola frase; una frase que llega mientras procesa otra queda en
  espera (no se pierde); espera 1 s de silencio antes de cerrar la frase.
- Si oyó mal (Whisper poco seguro, `DUDOSA_LP` en `web/voz.py`) o no entendió una frase, pide que se la repitan
  («¿Me lo repites, por favor?») y se rasca la cabeza; no adivina. El ruido solo, sin palabras, no lo hace hablar.
- Se llama Juan: a «¿cómo te llamas?» / «what's your name?» / «qual é o seu nome?» / «你叫什么名字?» lo dice en ese idioma.
- Chistes y datos curiosos en los 4 idiomas (banco curado en `web/textos.py`, sin repetir); el resto de la charla, DeepSeek.
- LED del pecho: azul oye, verde habla, amarillo camina; quieto, ojos tiernos en la pantalla.
- La despedida automática por cara viene apagada (solo «adiós, Juan»); `CERBERUS_SALIDA_AUTO=1` la prende.

## Voz

- Oír: micrófonos del robot → Whisper local en el Mac (`faster-whisper`, gratis, sin nube), con "Juan" como palabra clave.
- Hablar: voz de fábrica de AgiBot (PlayTts, `--voz tts`, el valor por defecto del deploy). Sintetiza en la nube de
  AgiBot: el robot necesita DNS (el cliente vigila `agibot_gateway_dnsmasq`).

## Cómo responde Juan (panel `/llm`)

1. Palabras clave de siempre (`web/voz.py`): saludo, baño, tenis, despedida… — instantáneo.
2. Lo que no entienden (frase de 3+ palabras), si el interruptor del panel `/llm` está en **DeepSeek + RAG**:
   - **Guardia determinista** (`web/rag.py`): emergencia o molestia → recepción; pedir acceso → recepción; otras
     personas → no da datos (al invitado: "Su anfitrión ya sabe que usted llegó"); política, religión, médico, legal o
     "ignora tus reglas" → no le corresponde; traer o servir algo → recepción. Nunca llega al modelo.
   - **RAG en n8n** (`POST :5678/webhook/juan`): embeddings `paraphrase-multilingual` → Simple Vector Store (un
     documento por línea de `club.md`) → los 2 datos más parecidos → `juan-deepseek` en modo raw (reglas del Modelfile
     leídas con `/api/show`, ejemplos como turnos, `<think>` vacío) → una sola frase limpia. ~1 s por respuesta.
3. Interruptor en **Modo clásico**: como antes, solo palabras clave y frases fijas. Se guarda en `robot/datos/llm.json`.

El cliente del robot manda `pid` de la persona que atiende: el modelo recibe su trato (nombre), categoría y destino.

## Cambiar lo que sabe o cómo habla

- Datos del club: editar `rag/conocimiento/club.md` (una idea por línea) → botón **Recargar datos del club** en `/llm`.
- Reglas de Juan (el system prompt): editar `rag/Modelfile` → `./rag/rag.sh` (recrea el modelo).
- El flujo: n8n en http://127.0.0.1:5678 (la primera vez pide crear un usuario local); `rag.sh` lo reimporta desde
  `rag/n8n/juan_rag.json` cada vez, así que los cambios hechos en la UI se pisan: exportarlos a ese archivo.

## Límites conocidos (medidos el 24-oct-2026)

- DeepSeek R1 7B sin razonar acierta los datos del club, pero a veces parafrasea con imprecisión (p. ej. "a la derecha
  del lobby" en vez de "del pasillo") o comete errores de gramática. Razonando tardaba 9–17 s y no acertaba más; la
  1.5B no servía (inventaba horarios, mezclaba idiomas).
- Ollama 0.40 ignora una `TEMPLATE` propia (usa la del GGUF); por eso el prompt se arma en n8n en modo raw.
- El Simple Vector Store vive en memoria: si n8n se reinicia solo, recargar (lo hacen `rag.sh`, el arranque del cerebro y
  el botón del panel).
- Sin probar en el robot real: el envío de `pid` y el RAG por voz desde los micrófonos del X2 (probado en el Mac con
  audio en español → Whisper → RAG).

Pruebas: `python web/rag.py`, `python web/voz.py`, `python x2/cerberus_x2.py --autotest`,
`python web/test_api.py datos/dataset/andres/00.jpg datos/dataset/gabriel/00.jpg` (desde `robot/`, entorno `cerberus`).
