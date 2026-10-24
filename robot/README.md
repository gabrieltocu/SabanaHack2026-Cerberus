# Cerberus · robotB

Equipo **Cerberus** · Sabana Hack 2026 · reto «El reto de Cerberus» ([challenge.md](challenge.md)) · robot AgiBot X2 Ultra.

Cerberus recibe a cada persona en la entrada del club. La reconoce por la cara y, si duda, por su cédula o su pase QR.
Confirma si es socio VIP, socio regular, invitado (y de quién), personal o trabajador externo, y la orienta según esa
categoría, hablándole en su idioma. Funciona en **Linux** (el sistema del equipo y del robot) y en macOS.

| Documento | Para qué |
|---|---|
| **Este README** | Instalar, usar y probar |
| [robot.md](robot.md) | **Poner todo a funcionar**, de cero a que el X2 te hable (cara, cédula, QR, voz) |
| [deploy/deploy.md](deploy/deploy.md) | **Desplegar en el X2 Ultra**: los dos modos, el checklist del turno y las fallas |
| [deploy-mac/deploy-mac.md](deploy-mac/deploy-mac.md) | Lo mismo **desde una MacBook** (qué cambia y qué no se puede) |
| [work.md](work.md) | **Cómo funciona todo por dentro**, qué es real y qué es simulado, qué falta |
| [api.md](api.md) | Referencia de la API, para personas u otra IA |
| [plan.md](plan.md) | Cronograma, roles, guion de la demo y checklist del robot |
| [challenge.md](challenge.md) | El enunciado y la rúbrica oficiales |

`robotA/` (al lado de esta carpeta) es el repo del equipo tal cual, clonado de
https://github.com/andresazcona/SABANAHACK2026. robotB lo usa sin modificarlo.

---

## 1. Instalación

### Linux (Ubuntu 22.04 o más nuevo)

```bash
# 1) programas del sistema
sudo apt update
sudo apt install -y git curl ffmpeg tesseract-ocr espeak-ng libheif-examples
#    Chrome o Chromium para la pagina (cualquiera de los dos):  sudo snap install chromium
#    camara: el usuario debe estar en el grupo video  ->  sudo usermod -aG video $USER  (y volver a entrar)

# 2) Miniconda (si no esta): https://docs.conda.io/en/latest/miniconda.html
curl -fsSLo /tmp/mc.sh https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh   # o ...-aarch64.sh
bash /tmp/mc.sh -b -p "$HOME/miniconda3" && "$HOME/miniconda3/bin/conda" init bash && exec bash

# 3) el proyecto: robotA y robotB lado a lado
mkdir -p ~/SabanaHack && cd ~/SabanaHack
git clone https://github.com/andresazcona/SABANAHACK2026.git robotA
#    robotB: copiarlo aqui (o clonarlo del repo donde se haya subido)
cd robotB && ./run.sh
```

`./run.sh` hace el resto:
1. Crea el entorno conda `cerberus` con Python 3.10 (el mismo del host del robot) desde `environment.yml`.
2. Instala `requirements.txt`.
3. Baja los pesos de YOLO.
4. Arranca el servidor y abre la página.

La primera vez tarda unos minutos: torch pesa ~1 GB y Whisper descarga ~460 MB. Sin conda, crea un `.venv` con el
`python3` del sistema.

| Programa del sistema | Para qué | Si falta |
|---|---|---|
| `ffmpeg` | Audio y videos | No se importan videos del celular |
| `tesseract-ocr` | Leer el número de la cédula digital | La cédula digital no se lee (la amarilla y el QR sí) |
| `espeak-ng` | Voz del robot en español/portugués y del modo laptop | El robot habla con su TTS nativo (solo chino/inglés) |
| `libheif-examples` | Fotos HEIC del iPhone | Hay que exportarlas como JPG |
| Chrome o Chromium | Las páginas, con voz y cámara | Se puede usar otro navegador, pero el modo kiosco es de Chrome |

### macOS

Igual, con Homebrew: `brew install ffmpeg tesseract espeak-ng libheif` y Miniconda para macOS. En Mac, el número de la
cédula digital se lee con el OCR de Apple, que no necesita tesseract. La primera vez, macOS pide permiso de cámara y
micrófono para Chrome (Ajustes del Sistema → Privacidad y seguridad).

---

## 2. Uso diario

```bash
cd ~/SabanaHack/robotB
./run.sh                    # servidor + pestana en Google Chrome. Ctrl+C detiene todo
./run.sh --sim              # ademas el club simulado en MuJoCo (de robotA), movido por las decisiones
./run.sh --sim-lite         # lo mismo con el modelo liviano del X2 (laptops sin GPU dedicada)
./run.sh --pruebas          # corre las pruebas automaticas antes de arrancar
./run.sh --kiosco           # ventana aparte a pantalla de recepcion: voz y camara sin ningun clic
./run.sh --reiniciar | --puerto 8001 | --sin-navegador | --help
```

| Página | Qué hace |
|---|---|
| `http://localhost:8000/captura` | Registra a una persona: nombre, rol, cédula y fotos guiadas por voz. También invitados con una sola foto, |
| `http://localhost:8000/roles` | **Roles**: tabla de todas las personas para cambiar nombre, rol, cédula y, si es invitado, anfitrión y vigencia; abrir su pase QR o borrarla. |
| `http://localhost:8000/identificar` | Con solo ver la cara dice quién es y su rol, le habla y lo registra en el log. Si duda, pasa sola a `/confirmar`. |
| `http://localhost:8000/confirmar` | «Muéstrame tu cédula o tu pase QR»: detecta sola cuál es y la cruza con la cara |
| `http://localhost:8000/docs` | La API interactiva ([api.md](api.md)) |

**Voz, sin botones.** La página escucha todo el tiempo (en Chrome, el primer toque en la página activa el sonido: lo
exige el navegador, una vez por pestaña). Se le habla en español, inglés, mandarín o portugués: detecta
el idioma, cambia la interfaz y la voz a ese idioma y responde. Si dices que no entiendes («no te estoy entendiendo»,
«I don't understand», «não entendo», «听不懂»), pasa siempre al idioma en que lo dijiste. Comandos: «empezar», «detener», «enrolamiento»,
«validación», «evaluar», «me llamo…», «soy invitado / trabajo aquí / vengo a hacer mantenimiento», «no tengo cédula»,
«volver». Preguntas: «¿dónde está el baño?», «restaurante», «ayuda», «recepción». También hay botones y un selector de
idioma arriba.

**Chrome.** Por defecto se usa tu Google Chrome normal (en Linux, Chrome o Chromium). `--kiosco` abre en cambio una
ventana aparte con un perfil propio (`datos/chrome-kiosco`) que acepta cámara y micrófono y deja sonar sin clic, como la
pantalla de una recepción.

---

## 3. Tomar los datos del equipo

### En la página (lo más fácil)
1. `/captura`: escribe (o di «me llamo…») el nombre, elige el rol y di «enrolamiento» o pulsa **1. Enrolamiento**.
   Son 8 posturas de 3 s guiadas por voz. Se guardan las **15 fotos más distintas**.
2. Cambia de **luz o de lugar** y di «validación» o pulsa **2. Validación** (8 fotos). Tiene que ser otra sesión: lo
   que se parezca demasiado a lo enrolado se descarta.
3. Repite con cada persona, uno por rol para la demo, y di «evaluar» o pulsa **Evaluar modelo**. La meta es top-1 ≥ 95 %
   con 0 % de impostores aceptados. Esto también calibra los umbrales.

Las reglas que impiden el sobreajuste:
- solo entran caras de buena calidad;
- solo entra la persona que se enrola: si otro aparece en cámara, sus tomas se descartan y la página lo avisa
  (durante la captura, mejor que nadie más esté frente a la cámara);
- se eligen las más distintas entre sí (un video con frames iguales deja una sola foto);
- todos tienen el mismo tope de fotos;
- la validación es de otra sesión.

El detalle está en [work.md §4](work.md). Cada captura deja además `datos/yolo/{train,val}/<id>/`, en el formato de
clasificación de Ultralytics. YOLO aquí solo **detecta** caras; quién es cada uno lo decide SFace contra la galería,
sin entrenar nada.

### Con el celular (fotos o videos)
- Video a 1080p y 30 fps, sin modo retrato ni filtros, con el celular a la altura de la cabeza a 1–1.5 m.
- Por persona:
  - un clip de 10 s girando la cabeza;
  - un clip de 10 s caminando hacia la cámara;
  - unas fotos con y sin gafas;
  - **un clip en otro lugar u otra luz para la validación**.
- Copia los archivos al computador (cable, carpeta compartida o AirDrop) e impórtalos:
```bash
conda activate cerberus
python captura/capturar.py importar --id ana_perez --nombre "Ana Perez" -n 15 ~/fotos/ana/clip1.mp4 ~/fotos/ana/fotos/
python captura/capturar.py importar --id ana_perez --nombre "Ana Perez" --validacion ~/fotos/ana/clip_otra_luz.mp4
python captura/capturar.py evaluar
```
Con la cámara del computador sin página: `python captura/capturar.py camara --id ana_perez --nombre "Ana Perez"`.

### Los datos del equipo (fotos, galería, roles, cédulas)
No van con el código: viven en la rama **privada** `cerberus-datos` del repo del equipo, para que nunca lleguen a
`main`. En `robotB/` quedan ignorados por git.
```bash
./run.sh --traer-datos     # tus companeros: los baja, los instala y arranca (si tenian datos propios, deja un respaldo)
./run.sh --subir-datos     # tu: despues de enrolar gente nueva, sube los datos actuales a esa rama
```
El robot no necesita los datos: con `--api` usa la API de la máquina que los tiene. Son datos personales: no
copiarlos fuera del repo privado y borrarlos al terminar el evento.

### Mano en la cara, gafas, de lado
Durante 5 s el sistema dice «retira la mano…» y sigue intentando; si en ese tiempo te reconoce, entras directo, y
después pide documento. **No se arregla con más datos ni enrolando fotos tapadas** (el sistema aprendería «mano» como
rasgo): el reconocedor no ve lo que está tapado. Los umbrales se ven y se ajustan en `/identificar` → «Umbrales».

---

## 4. Cédulas, pases QR e invitados

- **Cédulas (`identificacion/<id>/`):** deja fotos de la cédula de cada persona (frente de la digital, reverso de la
  amarilla) o súbelas en `/captura`. Al arrancar se leen solas: el número queda registrado y la cara impresa queda como
  referencia. Ver `identificacion/LEEME.md`.
- **Pases QR para el celular:** `curl -X POST localhost:8000/api/pases/generar` escribe en `pases/` un PNG por persona,
  dos de prueba (vencido y alterado) y un PDF con todos. Vencen en 48 h. Se muestran a pantalla completa con el brillo
  al máximo.
- **Invitados con una sola foto:** en `/captura` → «Invitado con una sola foto» (nombre, quién lo invita, vigencia y
  foto), o por API (`POST /api/invitados`), o sincronizando la base de invitaciones del club
  (`POST /api/invitados/sincronizar`). Cerberus lo reconoce y le dice quién lo espera.
- **Log de visitas:** en `/identificar` se descarga en CSV o JSON y se configura la URL de la base de datos externa:
  cada registro se envía por POST JSON.

---

## 5. Robot X2 y simulación

- **El X2 se mueve solo**, con su propio sistema. Cerberus usa su cámara, su voz y su escucha (palabra de activación
  **«linchilinchi»**), su cara y su LED. Todo el despliegue está en [deploy/](deploy/), en un comando:
  ```bash
  ./deploy/compilar_sdk.sh                          # una vez: compila aimdk_msgs del SDK oficial (colcon build)
  ./deploy/instalar_en_robot.sh                     # una vez: Cerberus completo dentro del Orin del X2
  ./deploy/desplegar.sh --todo-en-robot --diagnostico   # checklist del turno (camara, servicios, voz, cara, LED)
  ./deploy/desplegar.sh --todo-en-robot             # recepcion en vivo
  ```
  El cliente corre en la unidad de desarrollo del robot (10.0.1.41), que ya trae ROS 2 Humble, `aimdk_msgs` y el
  SDK oficial AimDK; el laptop solo necesita el cable y la IP 10.0.1.2 (`./deploy/preparar_host.sh --red`). Si
  prefieres dejar el cerebro en el laptop, `./deploy/desplegar.sh` hace lo mismo por un túnel SSH inverso.

  Paso a paso y problemas conocidos: [deploy/deploy.md](deploy/deploy.md) · puesta en marcha completa:
  [robot.md](robot.md) · detalles: [work.md §9](work.md).
- **Sin robot (plan B):** `python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000` hace lo mismo que el X2
  con la cámara y la voz del laptop.
- **Club simulado (MuJoCo de robotA):** `./run.sh --sim` lo abre y el puente `sim/puente_mujoco.py` le manda cada
  decisión: el X2 simulado va a la sala de esa categoría. Cómo correrlo en un servidor GPU (AWS): [work.md §10](work.md).

---

## 6. Pruebas

```bash
conda activate cerberus
./run.sh --pruebas                                  # todas las que no necesitan fotos
python web/test_api.py CARA1.jpg CARA2.jpg          # toda la API con dos fotos cualesquiera de personas distintas
python web/voz.py --audio                           # Whisper con voz sintetizada (espeak-ng en Linux, say en macOS)
```
Qué cubre cada una: [work.md §12](work.md).

---

## 7. Cómo ganamos el contrato con El Nogal

El reto llama al cliente «N Club»; nosotros presentamos la propuesta como si El Nogal fuera el cliente real.
Todo supuesto sobre el club se declara como supuesto (condición del reto) y no se inventa ninguna cifra del club.

**La propuesta en una frase:** *«Cerberus no interroga, reconoce.»* Cruza el facial que el club ya tiene con lo que el
club ya sabe (socios, invitados anunciados, turnos, órdenes de trabajo), pregunta solo cuando duda y, si la evidencia
no alcanza o se contradice, llama a recepción: **nunca abre acceso por defecto**.

| Lo que compra el club | Evidencia que mostramos en vivo | Criterio (pts) |
|---|---|---|
| Socio reconocido sin fricción (VIP < 10 s) | El X2 lo saluda por nombre en su idioma, con la cara y el LED de su categoría | 4 Flujos (20), 5 Experiencia (10) |
| Invitado bienvenido y anfitrión avisado | Invitado registrado con **una sola foto**: el robot le dice quién lo espera | 4 (20) |
| Personal y externos sin rodeos ni acceso indebido | Rol verificado; una cédula o un pase de otra persona va a recepción | 3 Confirmación (20) |
| Recepción dedicada a excepciones | Cara (5 s para corregir) → cédula o QR detectados solos → recepción, con el motivo en pantalla | 3 (20), 2 Integración (15) |
| Control y auditoría | Log de cada visita, enviado a la base de datos del club; matriz de confusión de los casos de prueba | 6 Demo (15), 7 Justificación (10) |
| Visitantes internacionales | Detecta el idioma por la voz (es, en, zh, pt) y responde en ese idioma | 5 Experiencia (10) |
| Privacidad | Procesamiento local, galería de embeddings, cédula guardada solo con los últimos 4 dígitos | 7 (10) |

**Qué decimos sin rodeos (suma puntos en el criterio 7):**
- **Real:** detección YOLO y reconocimiento SFace con fotos del equipo; umbrales calibrados con validación de otra
  sesión; lectura de cédula y pase QR; voz con detección de idioma; flujos ejecutados en el X2 físico.
- **Simulado:** el facial del club (solo dice miembro / no miembro, como permite el reto); el padrón, las invitaciones,
  los turnos y las órdenes de trabajo (datos de prueba); la navegación por el edificio (MuJoCo en `robotA/sim`).

**Ruta de implementación que le proponemos al club** (diapositiva final):
1. **Semanas 1–2, en sombra:** el robot clasifica y la recepción decide. Se mide cuántas veces acierta la categoría.
2. **Semanas 3–4, asistido:** el robot orienta a socios y personal; invitados y externos siguen con confirmación humana.
3. **Después, autónomo en horas valle**, con el escalamiento siempre activo y los indicadores en el panel: tiempo hasta
   la orientación, % resuelto sin preguntas, % escalado y aciertos de categoría.
4. **Integraciones reales:** base de socios con nivel, app de invitaciones (el socio registra al invitado con una
   foto), turnos de personal y órdenes de trabajo. Hoy están simuladas con la misma forma de datos y la misma API.

---

## 8. Fuentes
- AgiBot X2, SDK AimDK: [interfaces](https://x2-aimdk.agibot.com/en/latest/Interface/index.html) ·
  [voz](https://x2-aimdk.agibot.com/en/latest/Interface/interactor/voice.html) ·
  [LED](https://x2-aimdk.agibot.com/en/latest/Interface/interactor/lights.html) ·
  [pantalla/caras](https://x2-aimdk.agibot.com/en/latest/Interface/interactor/screen.html) ·
  [cámaras](https://x2-aimdk.agibot.com/en/latest/Interface/hal/sensor.html) ·
  [red](https://x2-aimdk.agibot.com/en/latest/quick_start/prerequisites.html) ·
  [modo only_voice](https://x2-aimdk.agibot.com/en/latest/faq/temp_works.html) ·
  [ejemplos Python](https://x2-aimdk.agibot.com/en/latest/example/Python.html)
- YOLO face: [akanametov/yolo-face](https://github.com/akanametov/yolo-face). Pesos derivados de Ultralytics (AGPL-3.0);
  WIDER FACE es de uso no comercial, así que para un despliegue comercial hay que revisar la licencia.
- Reconocimiento: OpenCV Zoo (YuNet, SFace), [opencv/opencv_zoo](https://github.com/opencv/opencv_zoo).
- Voz: [faster-whisper](https://github.com/SYSTRAN/faster-whisper). Códigos de barras: [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp).
  OCR: [Tesseract](https://github.com/tesseract-ocr/tesseract).
- Cédula: [folleto de la cédula digital (Registraduría)](https://www.registraduria.gov.co:443/IMG/pdf/20210521_folleto-cedula-digital.pdf) ·
  [posiciones del PDF417, comunidad](https://github.com/Eitol/colombian-cedula-reader).
- Duplicados en datasets de video: [Wild Selfie Dataset, arXiv 2302.07245](https://arxiv.org/pdf/2302.07245).
