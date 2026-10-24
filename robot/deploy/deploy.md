# Despliegue de Cerberus en el AgiBot X2 Ultra

Todo lo que hay que hacer para que Cerberus corra en el robot físico, en el orden en que se hace, con los dos
reparto posibles y qué hacer cuando algo falla. Para entender **qué** hace el sistema: [../robot.md](../robot.md)
(puesta en marcha completa) y [../work.md](../work.md) (cómo funciona por dentro).

> Lo que el robot aporta: su **cámara** de la cabeza, su **voz**, su **micrófono**, su **cara** y su **LED**.
> Cerberus **no le manda ni un comando de movimiento**: el X2 camina y gesticula con su propio sistema.

---

## 1. Los dos modos de despliegue

| | **Modo A — todo en el Orin** | **Modo B — cerebro en el laptop** |
|---|---|---|
| Dónde corre la visión, Whisper y el padrón | en la unidad de desarrollo del robot (Jetson Orin, aarch64) | en el laptop del equipo |
| Dónde corre el cliente ROS 2 | en el robot | en el robot (por SSH) |
| Red durante la demo | **ninguna**: todo es `127.0.0.1` dentro del robot | cable + túnel SSH inverso |
| Instalar | `./deploy/instalar_en_robot.sh` (una vez, ~15 min) | nada: el robot solo recibe un archivo |
| Arrancar | `./deploy/desplegar.sh --todo-en-robot` | `./run.sh --sin-navegador` + `./deploy/desplegar.sh` |
| Ventaja | nada que se caiga a mitad de la demo; el robot es autónomo | el laptop tiene más CPU y ya tiene todo instalado |
| Costo | Whisper y YOLO compiten con los procesos del robot; hay que copiar los datos al robot | si se cae el cable o el túnel, el robot se queda mudo |

**Recomendación:** instala el **modo A** con tiempo (es el que pide el reto: el robot se sostiene solo) y deja el
**modo B** listo como plan B — el mismo `cerberus_x2.py`, la misma API, solo cambia quién la sirve.

Un tercer reparto, solo si hace falta correr ROS 2 en el laptop: contenedor con Ubuntu 22.04 + ROS 2 Humble
(`Dockerfile.humble`). Este laptop tiene Ubuntu 24.04 + ROS 2 Jazzy, y los mensajes de ROS no son compatibles
entre distribuciones, así que **sin contenedor no se puede hablar con el robot desde aquí**.

## 2. Qué hay en esta carpeta

| Archivo | Qué hace | Dónde se corre |
|---|---|---|
| `deploy.md` | esto | — |
| `instalar_en_robot.sh` | **modo A**: copia código, modelos, Whisper y datos al robot, crea el entorno y prueba | laptop |
| `arrancar_en_robot.sh` | **modo A**: levanta la API y la recepción dentro del robot | robot |
| `desplegar.sh` | **modo B** (y lanzador del modo A): copia el cliente, abre el túnel y arranca | laptop |
| `compilar_sdk.sh` | **informa y compila el SDK AimDK** (`colcon build`): sin eso no hay `aimdk_msgs` | laptop → robot |
| `verificar_mensajes.py` | compara campo por campo lo que usa Cerberus contra el SDK ya compilado | robot |
| `modo_agente.py` | pone el robot en `only_voice` (para que oiga Cerberus) o lo devuelve a `normal` | robot |
| `preparar_host.sh` | programas del sistema, IP fija 10.0.1.2 y comprobación de ROS 2 / `aimdk_msgs` | laptop |
| `comprobar_cerebro.sh` | prueba la API antes del turno: salud, galería, voz en 4 idiomas, pases, log | laptop |
| `requirements-robot.txt` | las dependencias del cerebro sin lo que solo sirve en el laptop (MuJoCo, etc.) | — |
| `Dockerfile.humble` | ROS 2 Humble + `aimdk_msgs` en el laptop, si no se puede correr dentro del robot | laptop |

**¿Desde una MacBook?** Sí: el cliente de ROS 2 siempre corre dentro del robot, así que la laptop sólo necesita
`ssh`, `scp` y `curl`. Lo único que cambia (Homebrew, IP fija con `networksetup`, voz del sistema, OCR de Apple)
está en [../deploy-mac/deploy-mac.md](../deploy-mac/deploy-mac.md). De esta carpeta, `preparar_host.sh` es la única
que es sólo de Linux; el resto es portable y los scripts del Mac la reusan.

## 3. Antes de llegar al robot (se puede hacer sin robot)

```bash
cd robotB
./deploy/preparar_host.sh --deps          # ffmpeg, espeak-ng, tesseract, grupo video
./run.sh --traer-datos                    # fotos, galeria, roles y cedulas (rama privada cerberus-datos)
./run.sh --pruebas --sin-navegador        # todas las autopruebas y el cerebro arriba
./deploy/comprobar_cerebro.sh             # lo que el robot va a usar, en el orden en que lo usa
python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000    # el robot imitado con la camara del laptop
```

Si la última línea reconoce a alguien, dice su flujo en voz y el LED/cara aparecen impresos en la terminal, **lo
único que falta probar es el robot**. Eso es exactamente el plan B de la demo.

## 3b. ¿Hay que compilar algo? **Sí: el SDK**

Nuestro código es Python puro, pero importa `aimdk_msgs.msg` y `aimdk_msgs.srv` — igual que los ejemplos
oficiales `py_examples`. **`aimdk_msgs` es un paquete de interfaces de ROS 2: sus bindings de Python los genera
`colcon build`.** Sin ese build (o sin un `install/` ya hecho que se pueda sourcear), el cliente del robot no
arranca: muere en `import aimdk_msgs`. La documentación oficial lo pone como paso previo obligatorio
([4.5 Before Your First Run: Build the SDK](https://x2-aimdk.agibot.com/en/latest/quick_start/run_example.html)):

```bash
source /opt/ros/humble/setup.bash
cd ~/aimdk && colcon build
source install/local_setup.bash
```

**Lo que NO hay que compilar:** nada nuestro. Nuestro cliente no es un paquete de ROS, no se instala con colcon y
no hay que `ros2 run`earlo: es un script que se ejecuta con `python3` una vez que `aimdk_msgs` está en el entorno.
Tampoco hay que compilar los ejemplos en C++ ni el resto del workspace si no se van a usar.

**Hazlo con un comando**, que primero averigua si de verdad hace falta:

```bash
./deploy/compilar_sdk.sh --solo-revisar   # informa: arquitectura, ROS, version del SDK, ¿aimdk_msgs importa ya?
./deploy/compilar_sdk.sh                  # si no importa: colcon build --packages-up-to aimdk_msgs (lo rapido)
./deploy/compilar_sdk.sh --completo       # colcon build de todo el workspace, como la doc
./deploy/compilar_sdk.sh --limpiar        # borra build/ install/ log/ y recompila (si el build quedo a medias)
```

Puede que **no haya que compilar nada**: si la unidad de desarrollo ya trae `aimdk_msgs` instalado en el sistema,
o ya tiene su `~/aimdk/install/`, el script lo detecta y no toca nada. Por eso se corre `--solo-revisar` primero.

Sólo compilamos `aimdk_msgs` por defecto (`--packages-up-to`) porque el workspace completo arrastra las
dependencias de los ejemplos en C++ (OpenCV, Ruckig, ncurses, libcurl, cv_bridge) y tarda mucho más, sin darnos
nada: nosotros sólo necesitamos los mensajes.

### Después de compilar: comprobar que los campos coinciden

El SDK tiene que ser **de la misma versión que el firmware**, y los nombres de los campos cambian entre versiones.
Nuestro código se escribió contra la documentación, así que hay un paso más, de 2 segundos, que compara campo por
campo lo que usamos contra los mensajes realmente compilados:

```bash
source /opt/ros/humble/setup.bash && source ~/aimdk/install/local_setup.bash
python3 deploy/verificar_mensajes.py            # las definiciones (no necesita el robot en marcha)
python3 deploy/verificar_mensajes.py --vivo     # ademas: que los topics y servicios esten publicando
```

Comprueba las 13 piezas que tocamos: `PlayTts.tts_req.*`, `PlayEmoji`, `SetPmuLed`, `RequestAudioFocus` /
`AbandonAudioFocus`, `SetVolume`, `AudioPlayback`, `FocusResponse`, `ProcessedAudioOutput.audio_vad_state.value`,
`AudioCapture`, `SetAgentPropertiesRequest.contents.properties[].key.value` y `CompressedImage`. Si algo sale
`FALTA`, ese campo cambió de nombre en esa versión del SDK y hay que ajustar `x2/cerberus_x2.py` **antes** de la
demo. `instalar_en_robot.sh --probar` ya lo corre solo.

### Dónde se puede compilar (y dónde no)

| Equipo | ¿Se puede? |
|---|---|
| Unidad de desarrollo del X2 Ultra (Orin) | **Sí.** Trae Ubuntu 22.04, ROS 2 Humble y las dependencias preinstaladas |
| Contenedor en esa misma unidad | **Sí**, y es lo que la doc **recomienda** (sección 4b) |
| Este laptop | **No directamente:** es Ubuntu 24.04 con ROS 2 Jazzy, y AimDK pide Humble. Sólo dentro del contenedor `Dockerfile.humble` |
| Unidad de **control de movimiento** (`10.0.1.40`) | **No.** La documentación oficial lo prohíbe expresamente |

> ⚠️ **Aviso de la documentación oficial:** el modo «SDK directamente en la unidad de desarrollo» *«a partir de
> v1.2.0 ya no soporta ejecutar programas de desarrollo secundario»*. Si el firmware del robot es v1.2.0 o más
> nuevo, el camino soportado es el **contenedor** (sección 4b). `./deploy/compilar_sdk.sh --solo-revisar` imprime
> la versión del SDK y la salida de `aima em list-app` para saber en qué caso estamos **antes** de gastar el turno.

## 4. Modo A: todo dentro del Orin

La unidad de desarrollo del X2 Ultra (`10.0.1.41`) es el entorno **oficial** del SDK: trae Ubuntu 22.04,
ROS 2 Humble, `aimdk_msgs` y AimDK ya compilados. La documentación permite desarrollar ahí y **prohíbe** usar para
esto la unidad de control de movimiento (`10.0.1.40`): no la toques.

```bash
# 0) cable al puerto ethernet TRASERO del X2 (el de desarrollo) y IP fija en el laptop
./deploy/preparar_host.sh --red                  # 10.0.1.2/24 -> ping 10.0.1.41
ssh-copy-id agi@10.0.1.41                        # para no escribir la clave en cada paso

# 1) el SDK: ver si ya esta compilado y, si no, compilarlo (seccion 3b)
./deploy/compilar_sdk.sh --solo-revisar
./deploy/compilar_sdk.sh                         # colcon build --packages-up-to aimdk_msgs

# 2) instalar Cerberus (una vez; ~15 min la primera vez)
./deploy/instalar_en_robot.sh                    # copiar + entorno + verificar mensajes + autopruebas
#    si el robot NO tiene internet:
./deploy/instalar_en_robot.sh --wheels           # baja las ruedas aarch64 en el laptop
./deploy/instalar_en_robot.sh --copiar --instalar --probar

# 3) que el robot nos deje oírlo (una vez por encendido)
ssh agi@10.0.1.41 'cd cerberus && python3 deploy/modo_agente.py only_voice'

# 4) checklist del turno y demo
./deploy/desplegar.sh --todo-en-robot --diagnostico
./deploy/desplegar.sh --todo-en-robot            # recepcion en vivo
```

`instalar_en_robot.sh --compilar-sdk` encadena los pasos 1 y 2 en uno.

Lo que copia el instalador: el código de `robotB/`, `robotA/` (visión y padrón), los pesos de YOLO, la galería y las
fotos (`datos/`, `identificacion/`) y la caché de Whisper, para que el robot **no necesite internet** en la demo.

**Whisper en el Orin:** por defecto usa el modelo `base` (variable `WHISPER`), no `small`: en el Orin `small` se
siente lento. Si la voz responde con retraso, `WHISPER=tiny`.

**Voz en español:** la genera `espeak-ng` + `ffmpeg`. En el modo A tienen que estar **en el robot** (el instalador lo
avisa si faltan: `sudo apt-get install -y espeak-ng ffmpeg`). Si no se pueden instalar, el X2 solo hablaría con su
TTS nativo, que únicamente sabe chino e inglés; en ese caso usa el modo B con `--tts api`, que trae el audio ya
generado desde el laptop.

## 4b. Si el firmware es v1.2.0 o más nuevo: contenedor en el Orin

La documentación oficial recomienda el **contenedor sobre la propia unidad de desarrollo**, y para v1.2.0+ es el
único camino soportado para ejecutar código de desarrollo secundario. El contenedor **no trae el SDK compilado**:
monta `~/aimdk` y `/opt/ros` del Orin y el `colcon build` se hace dentro.

No vendoramos aquí su `Dockerfile` y su `run.sh`: son largos, están afinados para espejos de China (`ngc.nju.edu.cn`,
`mirrors.aliyun.com`, `pypi.tuna.tsinghua.edu.cn`) y hacen traducción de GIDs y bind-mounts de CUDA/cuDNN/TensorRT
que dependen de la unidad. Cópialos tal cual de la página oficial, que es la versión que corresponde al firmware:
[4.4 Develop in a Container](https://x2-aimdk.agibot.com/en/latest/quick_start/container_dev.html). El resumen:

```bash
mkdir -p ~/aimdk-image && cd ~/aimdk-image      # en el Orin
#  ... pegar Dockerfile y run.sh de la pagina oficial ...
podman build -t agi/aimdk-dev:dev .
./run.sh
podman exec -it aimdk-dev bash
# dentro del contenedor:
source /opt/ros/humble/setup.bash
cd ~/aimdk && colcon build && source install/local_setup.bash
```

Fuera de China hay que cambiar esos espejos por los oficiales (`nvcr.io`, `ports.ubuntu.com`,
`packages.ros.org`, `pypi.org`) o el build se queda esperando. Una vez dentro, Cerberus se instala igual
(`./deploy/instalar_en_robot.sh`, con `DESTINO` apuntando a una ruta montada en el contenedor) y se arranca con
`./deploy/arrancar_en_robot.sh`.

`Dockerfile.humble` de esta carpeta es **otra cosa**: ROS 2 Humble + `aimdk_msgs` en **este laptop** (amd64), para
el modo B si alguna vez hace falta hablar con el robot desde aquí.

## 5. Modo B: el cerebro en el laptop

```bash
./run.sh --sin-navegador                         # 1) el cerebro, en el laptop
./deploy/desplegar.sh --diagnostico              # 2) checklist del turno
./deploy/desplegar.sh --only-voice               # 3) only_voice + recepcion en vivo
```

`desplegar.sh` copia `x2/cerberus_x2.py` al robot, abre un **túnel SSH inverso**
(`ssh -R 8000:127.0.0.1:8000`) y arranca el cliente allí con `--api http://127.0.0.1:8000 --tts api`. Así:

- la API **nunca se abre a la red** (son datos biométricos: escucha solo en `127.0.0.1`);
- el robot no necesita ni OpenCV ni torch ni Whisper ni espeak-ng: solo `rclpy` y `aimdk_msgs`;
- el español sale del laptop por `POST /api/tts` (PCM S16LE 16 kHz mono, justo lo que pide
  `/aima/hal/audio/playback`).

## 6. El checklist del turno de robot

```bash
./deploy/desplegar.sh --todo-en-robot --diagnostico     # modo A
./deploy/desplegar.sh --diagnostico                     # modo B
```

Imprime una línea por prueba, en este orden:

1. **cerebro alcanzable** — `POST /api/tts` devuelve PCM (prueba red y voz de una vez).
2. **cámara de la cabeza** — fps y tamaño de frame en `/aima/hal/sensor/rgbd_head_front/rgb_image/compressed`.
3. **servicios** — `PlayTts`, `PlayEmoji`, `SetPmuLed`, `RequestAudioFocus`, `SetVolume`.
4. **foco de audio concedido** — sin foco el PCM no suena (el topic de playback no lo pide solo).
5. **escucha** — di «linchilinchi» y una frase: debe llegar algo a `/agent/process_audio_output`.
6. **flujo VIP** — frase en español, cara de adoración y LED dorado.

Si los seis pasan, la demo está lista. Después:

```bash
./deploy/desplegar.sh --todo-en-robot --probar todos    # los 6 flujos seguidos, para grabar el video de respaldo
```

## 7. Problemas conocidos y qué hacer

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `10.0.1.41 no responde` | cable en el puerto equivocado, robot apagado, o es un X2 EDU | puerto ethernet **trasero**; el EDU es `10.0.1.40` y **no tiene** módulo de interacción |
| `sin ssh al robot` | IP del laptop | `./deploy/preparar_host.sh --red` (10.0.1.2/24) |
| `no se puede importar aimdk_msgs` | el SDK no está compilado, o su `install/` no se sourceó | `./deploy/compilar_sdk.sh` (sección 3b); si está en otra ruta, `SDK_SETUP=…/install/local_setup.bash` |
| `colcon build` falla por dependencias | se está compilando todo el workspace | `./deploy/compilar_sdk.sh` sin `--completo`: sólo `aimdk_msgs` |
| Un campo sale `FALTA` en `verificar_mensajes.py` | el SDK no es de la misma versión que el firmware | pedir el SDK de esa versión, o ajustar ese campo en `x2/cerberus_x2.py` |
| El robot no dice nada, pero el log muestra el flujo | sin foco de audio, o volumen en 0 | mira el paso 4 del diagnóstico; `--volumen 80` |
| Habla en inglés o chino en vez de español | no hay PCM: falta `espeak-ng`/`ffmpeg` donde se genera | modo A: instalarlos en el robot · modo B: `--tts api` |
| La frase se corta a mitad | otro módulo pidió TTS con prioridad `SAFETY_L10` (caída, sobretemperatura) | es del robot, no nuestro: repetir el flujo |
| No llega nada a `/agent/process_audio_output` | falta el modo `only_voice`, o el agente no se reinició | `python3 deploy/modo_agente.py only_voice` (reinicia el agente solo) |
| Sigue sin llegar nada | el firmware no publica ese topic | el cliente pasa **solo** al micrófono crudo (`/aima/hal/audio/capture`) con VAD propio a los 20 s; forzarlo con `--mic solo` |
| El LED no cambia | otro módulo tiene prioridad más alta, o tarda | el LED tarda **~5 s** (es asíncrono); el diagnóstico deja 8 s |
| La cara no cambia | prioridad | usamos `priority=20` (> 10) justo para que el sistema no la pise |
| Reconoce peor que en el laptop | la cámara del X2 ve distinto (altura, luz, gran angular) | `--guardar-frames x2_ana/` y enrolar con esos frames: `captura/capturar.py importar … x2_ana/` |
| No lee el pase QR | distancia | el QR necesita ~150 px: acercar el celular a 25–35 cm, brillo al máximo, o pases impresos grandes |
| La demo es ya y el robot no está | — | plan B: `python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000` + `./run.sh --sim` + el video grabado |

## 8. Al terminar el turno

```bash
./deploy/desplegar.sh --normal                   # devuelve al X2 su conversacion de fabrica
ssh agibot@10.0.1.41 'rm -rf ~/cerberus/datos ~/cerberus/identificacion'   # modo A: borrar los datos biometricos
```

Las fotos, la galería y las cédulas son datos personales del equipo: viven en la rama privada `cerberus-datos`, no
se copian fuera del repo y se borran al terminar el evento (25-oct-2026), como dice
`docs/diseno-cerberus.md`. Si se copiaron al robot, hay que borrarlas del robot también.

## 9. Qué está verificado y qué no

**Verificado en el laptop** (sin robot): las autopruebas, la API completa (incluido `POST /api/tts`), la
identificación con la galería del equipo, los pases QR, la voz en 4 idiomas, y el cliente del robot corriendo con la
cámara del laptop (`--camara 0`), que ejecuta exactamente el mismo código de decisión.

**Comprobable en el robot en 2 segundos:** `python3 deploy/verificar_mensajes.py --vivo` compara cada campo y
cada topic que usamos contra el SDK compilado y el grafo de ROS vivo. Es el puente entre «verificado contra la
documentación» y «verificado contra este robot». Su lógica de recorrido de campos (incluido entrar en secuencias de
mensajes) está probada aquí contra mensajes reales de ROS 2.

**Contra la documentación oficial de AimDK**, no contra nuestro robot todavía: nombres de servicios y topics, campos
de los mensajes, `emotion_id` de cada cara, modos del LED, prioridades, el estado del VAD
(`audio_vad_state.value`) y el cambio a `only_voice`. Todo sale de
[x2-aimdk.agibot.com](https://x2-aimdk.agibot.com/en/latest/Interface/index.html); las páginas usadas están citadas
en `../work.md` §9 y en el encabezado de `../x2/cerberus_x2.py`.

**Sin verificar, por diseño:** el micrófono crudo como plan B de la escucha (`MicVad`) está probado con audio
sintético en `x2/cerberus_x2.py --autotest`, pero no con el micrófono del robot. La palabra de activación
«linchilinchi» la dio el equipo: la documentación pública no la nombra.
