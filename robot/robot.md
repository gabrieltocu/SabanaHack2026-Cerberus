# Cerberus en el robot: de cero a que el X2 te hable

Guía de puesta en marcha de **todo** el sistema: reconocimiento facial, identificación por cédula y pase QR,
escucha por voz y el robot hablando en el idioma del visitante. Un solo camino, en orden, con lo que hay que ver
después de cada paso.

- El **despliegue en el robot** paso a paso, con sus dos modos y sus fallas: [deploy/deploy.md](deploy/deploy.md).
- Si trabajas **desde una MacBook**: [deploy-mac/deploy-mac.md](deploy-mac/deploy-mac.md).
- Cómo funciona por dentro y qué es real o simulado: [work.md](work.md).
- La API: [api.md](api.md) · El reto y la rúbrica: [challenge.md](challenge.md) · El plan del equipo: [plan.md](plan.md).

---

## 0. La idea en un diagrama

**Un cerebro, varios cuerpos.** El cerebro es la API (`web/app.py`): ve una cara, confirma la categoría del
visitante, decide qué decirle y lo registra. Los cuerpos la usan por HTTP: la página web, el club simulado en
MuJoCo y el **X2 Ultra**.

```
                 ┌──────────── CEREBRO (web/app.py) ────────────┐
  frames JPEG ──►│ YOLO-face → YuNet → SFace → galeria          │
  audio WAV  ──►│ Whisper local → idioma (es/en/zh/pt)          │──► decision: rol + frase + cara + LED
  documento  ──►│ pase QR firmado / cedula amarilla / digital   │
                 │ padron + invitaciones + turnos + ordenes     │
                 └──────▲──────────────▲──────────────▲─────────┘
                        │              │              │  HTTP
                 web (Chrome)   club simulado    X2 Ultra  ← este documento
                                 (MuJoCo)        camara, voz, micro, cara, LED
```

El X2 **se mueve solo**, con su propio sistema. Cerberus no le manda ningún comando de movimiento: le pide la
cámara, la voz, la escucha, la cara y el LED, que es justo lo que el reto necesita.

## 1. Lo que necesitas

| | Para qué | Si falta |
|---|---|---|
| Linux (Ubuntu 22.04+) o macOS | el cerebro | — |
| `ffmpeg`, `espeak-ng`, `tesseract-ocr`, `libheif-examples` | audio, voz en español, número de la cédula, fotos HEIC | `./deploy/preparar_host.sh --deps` |
| Chrome o Chromium | las páginas, con cámara y voz | otro navegador sirve, menos el modo kiosco |
| Acceso al repo privado del equipo | las fotos, la galería y los roles | sin eso Cerberus manda todo a recepción |
| X2 Ultra + su cable ethernet | la demo en el robot | plan B: la cámara del laptop hace lo mismo |

## 2. Puesta en marcha (sin robot, 10 minutos)

```bash
cd robotB
./deploy/preparar_host.sh --deps          # programas del sistema y grupo video
./run.sh --traer-datos                    # datos del equipo (rama privada cerberus-datos) + servidor
```

`run.sh` crea el entorno, instala las dependencias, baja los pesos de YOLO, arranca el servidor y abre la página.
La primera vez tarda unos minutos (torch ~1 GB, Whisper ~460 MB).

Deberías ver:

```
  Cerberus listo  ·  Ctrl+C para detener
    Captura de datos   http://127.0.0.1:8000/captura
    Identificacion     http://127.0.0.1:8000/identificar
```

| Página | Qué hacer ahí |
|---|---|
| `/captura` | enrolar a una persona: 8 posturas guiadas por voz, y una **validación en otra luz u otro lugar** |
| `/roles` | ponerle a cada quien su rol: VIP, REGULAR, INVITADO (con anfitrión y vigencia), PERSONAL, EXTERNO |
| `/identificar` | la recepción: ve la cara, dice quién es y lo orienta; si duda, pasa sola a `/confirmar` |
| `/confirmar` | «muéstrame tu cédula o tu pase QR»: detecta sola cuál es y la cruza con la cara |

## 3. Comprobar que el cerebro está completo

```bash
./run.sh --pruebas --sin-navegador        # autopruebas (sin camara ni fotos)
./deploy/comprobar_cerebro.sh             # lo que el robot va a usar, en el orden en que lo usa
```

`comprobar_cerebro.sh` tiene que decir, en verde: API viva, **personas en la galería > 0**, voz en `es`, `en`, `zh`
y `pt`, frases del visitante, pases QR y log. Si la galería está en 0, el robot mandaría todo a recepción: enrola
en `/captura` o trae los datos del equipo.

Las cuatro piezas del reto, cada una probada por su lado:

```bash
# cara: identifica una foto como lo haria el robot
./deploy/comprobar_cerebro.sh datos/validacion/gabriel/00.jpg

# pase QR: genera los pases (y dos trampas: vencido y alterado) y pruebalos en /confirmar
curl -X POST localhost:8000/api/pases/generar        # -> pases/*.png y pases/pases.pdf

# cedula: deja las fotos en identificacion/<id>/ y se leen al arrancar
cat identificacion/LEEME.md

# voz: Whisper con voz sintetizada, en los 4 idiomas
python web/voz.py --audio
```

## 4. El robot imitado (el plan B, y el ensayo del modo real)

```bash
python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000
```

Es **el mismo código** que corre en el X2 (`ApiBrain`): manda frames a `/api/identificar`, obedece lo que decide
el cerebro, pide el documento si la cara no basta y ejecuta el flujo. Lo único distinto es que la voz sale por los
parlantes del laptop y la cara y el LED se imprimen en la terminal:

```
  dice [es]: Bienvenido de nuevo, Gabriel. Ya avise al concierge; lo acompano a su reserva.
  cara 200
  LED rgb(255, 200, 30) modo 1
```

Si esto funciona, lo único que falta probar es el robot. **Ensaya la demo así antes del turno.**

## 5. Los seis flujos

Cada categoría se ve y se oye distinta: frase, cara (`PlayEmoji`) y color del LED (`SetPmuLed`).

| Categoría | Qué dice (resumen) | Cara | LED |
|---|---|---|---|
| **VIP** | «Bienvenido de nuevo, {nombre}. Ya avisé al concierge; lo acompaño a su reserva.» | adoración (200) | dorado, respirando |
| **REGULAR** | «Hola {nombre}. Siga al salón principal, primera puerta a la derecha.» | feliz (90) | azul, fijo |
| **INVITADO** | «{Anfitrión} lo espera en la sala de anfitriones; ya le avisé que llegó.» | muy feliz (100) | verde, respirando |
| **PERSONAL** | «Buenos días {nombre}. Turno marcado. Acceso de empleados a su izquierda.» | tranquilo (10) | blanco, fijo |
| **EXTERNO** | «Orden {ot} confirmada. Use casco y chaleco; ya avisé a su supervisor.» | serio (160) | naranja, intermitente |
| **ESCALAMIENTO** | «Un momento por favor, ya viene alguien de recepción a atenderlo.» | pensando (170) | rojo, respirando |

Probarlos todos sin cámara, en el robot o imitado:

```bash
./deploy/desplegar.sh --todo-en-robot --probar todos     # en el X2
python x2/cerberus_x2.py --camara 0 --probar todos       # en el laptop
```

## 6. En el robot

El detalle está en [deploy/deploy.md](deploy/deploy.md) — incluido **qué hay que compilar y dónde**
([sección 3b](deploy/deploy.md)); el resumen es:

```bash
# cable al puerto ethernet TRASERO del X2 y IP fija en el laptop
./deploy/preparar_host.sh --red

# el SDK oficial AimDK hay que COMPILARLO: aimdk_msgs son interfaces de ROS 2 y sus
# bindings de Python los genera colcon build. El script primero averigua si ya esta hecho.
./deploy/compilar_sdk.sh --solo-revisar
./deploy/compilar_sdk.sh

# una vez: instalar todo dentro del Orin del robot (modo A, el recomendado)
./deploy/instalar_en_robot.sh

# en cada encendido: que el robot nos deje oírlo
ssh agibot@10.0.1.41 'cd cerberus && python3 deploy/modo_agente.py only_voice'

# el turno
./deploy/desplegar.sh --todo-en-robot --diagnostico      # checklist: camara, servicios, voz, escucha, flujo
./deploy/desplegar.sh --todo-en-robot                    # recepcion en vivo
./deploy/desplegar.sh --normal                           # al terminar: el X2 vuelve a su voz de fabrica
```

**Hablarle al robot:** se dice primero **«linchilinchi»** (su palabra de activación) y luego la frase. En modo
`only_voice` el VAD queda abierto y no hay que repetirla en cada turno de la conversación. Se le puede hablar en
español, inglés, mandarín o portugués: Cerberus detecta el idioma y le responde en ese idioma; «no te estoy
entendiendo» (en cualquiera de los cuatro) siempre lo cambia al idioma en que se dijo.

**Si el robot no reconoce igual que el laptop** (su cámara ve desde otra altura y con otro lente):

```bash
# en el robot, guarda 2 frames/s de su camara
python3 x2/cerberus_x2.py --guardar-frames x2_gabriel/
# en el laptop, enrola con esos frames (misma persona, otra sesion: sirve de validacion)
python captura/capturar.py importar --id gabriel --nombre Gabriel --validacion x2_gabriel/
python captura/capturar.py evaluar
```

Nunca bajes los umbrales para «arreglar» un fallo de reconocimiento: `cos_reject` está calibrado en LFW para que
solo pase el 1 % de los desconocidos. Se ven y se ajustan en `/identificar` → «Umbrales».

## 7. El club simulado, junto al robot

```bash
./run.sh --sim            # MuJoCo: el X2 simulado escolta a cada visitante a la sala de su categoria
./run.sh --sim-lite       # igual, con el modelo liviano (laptops sin GPU dedicada)
```

El puente (`sim/puente_mujoco.py`) le manda a la simulación **cada decisión real** de la API: sirve para mostrar
los recorridos por el edificio, que el X2 físico no hace (eso queda declarado como simulado).

## 8. Qué es real y qué es simulado

| Pieza | Estado |
|---|---|
| Reconocimiento facial propio (dataset del equipo), umbrales calibrados | **Real** |
| Lectura de pase QR firmado, cédula amarilla (PDF417) y cédula digital (OCR) | **Real** |
| Voz: hablar en 4 idiomas y entender por palabras clave (Whisper local, sin internet) | **Real** |
| Diálogo, confirmación de la categoría por reglas y escalamiento | **Real** |
| Flujos en el X2: voz, cara y LED por categoría | **Real** (contra el SDK oficial AimDK) |
| Facial del club (miembro / no miembro) | **Simulado** — lo permite el reto |
| Padrón de socios, agenda de invitados, turnos y órdenes de trabajo | Simulados, con datos de prueba |
| Aviso al concierge / anfitrión / supervisor | Simulado (lo responde el operador) |
| Recorridos por el edificio | Simulados (MuJoCo) |

Decirlo así, sin rodeos, es parte de la rúbrica (criterios 6 y 7 de [challenge.md](challenge.md)).

## 9. Privacidad

Procesamiento **local**, sin internet. En la galería van **embeddings**, no fotos. La cédula se guarda enmascarada
(últimos 4 dígitos) en el log. Las fotos de enrolamiento, la galería y las cédulas viven en la rama privada
`cerberus-datos`, no salen del repo del equipo y **se borran al terminar el evento**; si se copiaron al robot
(modo A), hay que borrarlas del robot también:

```bash
ssh agibot@10.0.1.41 'rm -rf ~/cerberus/datos ~/cerberus/identificacion'
```

Quien no quiera reconocimiento facial entra con el pase QR. Alineado con la Ley 1581 de 2012 (habeas data).
