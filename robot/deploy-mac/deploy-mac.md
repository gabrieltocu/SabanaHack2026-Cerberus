# Desplegar Cerberus en el X2 Ultra desde una MacBook

Sí se puede, y de hecho es casi igual que desde Linux. Esta carpeta tiene lo único que cambia.

## 1. Por qué funciona desde un Mac

El cliente de ROS 2 (`x2/cerberus_x2.py`) **nunca corre en tu laptop**: corre **dentro del robot**, que es quien
tiene Ubuntu 22.04, ROS 2 Humble, `aimdk_msgs` y el SDK oficial AimDK. La MacBook hace de **cerebro** (la API:
visión, Whisper, padrón) y se comunica con el robot por `ssh`.

```
   MacBook (cerebro)                                  X2 Ultra · Orin (cuerpo)
   ┌───────────────────────────┐   ssh -R 8000       ┌──────────────────────────────┐
   │ web/app.py  :8000         │◄───────────────────►│ x2/cerberus_x2.py --api      │
   │ YOLO + SFace + Whisper    │   (túnel inverso)   │ ROS 2 Humble + aimdk_msgs    │
   │ padrón, pases, log        │                     │ cámara, voz, micro, cara, LED│
   └───────────────────────────┘                     └──────────────────────────────┘
      brew, conda, Chrome                               colcon build (deploy/compilar_sdk.sh)
```

Lo único que la MacBook necesita es `ssh`, `scp`, `rsync`, `curl` y Python: **nada de ROS 2**. Eso importa porque
**ROS 2 Humble no existe para macOS** (soporte Tier 3, sin binarios), así que si el cliente tuviera que correr en
la laptop, un Mac no serviría. Con este reparto, sí.

## 2. Lo que un Mac **no** puede hacer

| | Por qué |
|---|---|
| Correr el cliente ROS 2 en la laptop | No hay ROS 2 Humble para macOS. Siempre va dentro del robot |
| Hacer de «host PC» del modo 3 de AimDK | Ese modo pide Ubuntu 22.04 + Humble en la laptop |
| Usar `deploy/Dockerfile.humble` para hablar con el robot | Docker Desktop en macOS corre en una VM: `--network host` no se comporta como en Linux y el descubrimiento DDS no llega al robot |
| Compilar el SDK en la laptop | `colcon build` del SDK necesita Humble. Se compila **en el robot**: `./deploy/compilar_sdk.sh` |
| Conectarse por cable sin más | La MacBook no tiene puerto Ethernet: hace falta un **dongle USB-C/Thunderbolt a Ethernet** |

Ninguna es un problema real: todas caen del lado del robot, que es donde la documentación oficial quiere que estén.

## 3. Qué hay en esta carpeta

| Archivo | Qué hace |
|---|---|
| `deploy-mac.md` | esto |
| `preparar_mac.sh` | Homebrew (ffmpeg, espeak-ng, tesseract, libheif), IP fija 10.0.1.2 en el dongle, clave ssh |
| `arrancar_cerebro.sh` | levanta la API en el Mac (envuelve `run.sh` con lo que conviene para un turno) |
| `desplegar_desde_mac.sh` | el despliegue: comprueba, copia al robot, abre el túnel y arranca |
| `comprobar_mac.sh` | ¿está el Mac listo? Mac, cerebro, voz, robot y `aimdk_msgs`, una línea cada uno |

Los scripts de `../deploy/` son **portables** (sólo `ssh`, `scp`, `curl`, `rsync` y bash 3.2, el que trae macOS),
así que `desplegar_desde_mac.sh` los reusa en vez de duplicarlos: así no hay dos versiones que se desincronicen.
`../deploy/preparar_host.sh` es la única que es sólo de Linux (usa `apt` y `nmcli`), y su equivalente aquí es
`preparar_mac.sh`.

## 4. Paso a paso

```bash
cd robotB

# 1) la MacBook (una vez)
./deploy-mac/preparar_mac.sh --deps        # Homebrew: ffmpeg, espeak-ng, tesseract, libheif
#    enchufa el dongle USB-C a Ethernet y el cable al puerto ethernet TRASERO del X2
./deploy-mac/preparar_mac.sh --red         # IP fija 10.0.1.2/24 -> ping 10.0.1.41
./deploy-mac/preparar_mac.sh --ssh         # clave ssh, para no escribir la contrasena en cada paso

# 2) el cerebro, en el Mac
./deploy-mac/arrancar_cerebro.sh --datos   # entorno + datos del equipo + API (deja esta terminal abierta)

# 3) el SDK del robot, si no esta compilado (otra terminal)
./deploy/compilar_sdk.sh --solo-revisar
./deploy/compilar_sdk.sh                   # colcon build --packages-up-to aimdk_msgs, EN el robot

# 4) ¿todo listo?
./deploy-mac/comprobar_mac.sh datos/validacion/gabriel/00.jpg

# 5) el turno
./deploy-mac/desplegar_desde_mac.sh --diagnostico   # camara, servicios, foco de audio, escucha, flujo VIP
./deploy-mac/desplegar_desde_mac.sh --only-voice    # only_voice + recepcion en vivo
./deploy-mac/desplegar_desde_mac.sh --normal        # al terminar: el X2 vuelve a su voz de fabrica
```

Para ensayar sin robot, exactamente como lo hará el X2 pero con la cámara del Mac:

```bash
python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000
```

## 5. Lo que cambia en macOS (y ya está resuelto en el código)

| Pieza | En macOS |
|---|---|
| **Voz en español del robot** | `espeak-ng` por Homebrew. Si no está, `voice_pcm` usa la **voz del sistema** (`say`, en todos los Mac) y la convierte a PCM 16 kHz. Suenan mejor que espeak-ng — con las voces de macOS los 4 idiomas se detectan con 0.96–0.99 de confianza (`work.md` §8) |
| **Número de la cédula (OCR)** | El OCR de **Apple Vision** (`pyobjc-framework-Vision`), que no necesita tesseract y acierta más. `CERBERUS_OCR` fuerza uno u otro |
| **Entorno de Python** | `run.sh` usa el entorno conda `cerberus` (Miniconda para macOS) o un `.venv`. Igual que en Linux |
| **Cámara y micrófono** | macOS pide permiso para Chrome la primera vez: Ajustes del Sistema → Privacidad y seguridad → Cámara / Micrófono |
| **Club simulado (MuJoCo)** | El visor exige `mjpython`; `sim/puente_mujoco.py` ya lo usa solo. Sólo afecta a `--sim`, no al robot |
| **Voces del sistema** | Si falta Paulina (es) o Luciana (pt): Ajustes → Accesibilidad → Contenido leído → Voz del sistema → Gestionar voces. Para mejor calidad, descarga «Samantha (mejorada)» o «Ava (Premium)» |
| **Aviso al arrancar** | OpenCV y la librería de audio de Whisper traen cada una su copia de `libavdevice` y macOS dice «implemented in both». No causa fallos (`work.md` §14) |

## 6. Problemas típicos en un Mac

| Síntoma | Qué hacer |
|---|---|
| `no encontre un servicio Ethernet` | Enchufa el dongle y mira cómo se llama: `networksetup -listallnetworkservices`; luego `SERVICIO='USB 10/100/1000 LAN' ./deploy-mac/preparar_mac.sh --red` |
| `10.0.1.41 no responde` | Cable al puerto **trasero** del X2; comprueba el enlace del dongle; el X2 EDU es `10.0.1.40` |
| Se cae el internet al poner la IP fija | No debería: el script **no** pone router en ese servicio, así que el Wi-Fi sigue siendo la ruta por defecto. Si lo pusiste a mano, borra el router en Ajustes → Red → Detalles → TCP/IP |
| El robot habla en inglés en vez de español | Falta la voz: `brew install espeak-ng`, o revisa que `say -v Paulina` funcione. Compruébalo con `./deploy-mac/comprobar_mac.sh` |
| `brew` no existe | Instálalo y repite: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| Chrome no oye ni ve | Ajustes del Sistema → Privacidad y seguridad → Cámara / Micrófono → Google Chrome |
| `aimdk_msgs no importable` | Es del robot, no del Mac: `./deploy/compilar_sdk.sh` (ver `deploy/deploy.md` §3b) |
| Todo falla y la demo es ya | Plan B, sin robot: `./deploy-mac/arrancar_cerebro.sh --web` + `python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000` |

## 7. Qué no está probado

Esta carpeta **no se ha ejecutado en un Mac todavía** (se escribió en la máquina Linux del equipo, sin el robot
conectado). Lo que sí está comprobado: los scripts no usan nada de bash 4 ni utilidades GNU, así que corren con el
bash 3.2 de macOS; y los scripts compartidos de `../deploy/` sólo usan `ssh`, `scp`, `rsync`, `curl` y `sed`
portables. Lo que hay que mirar con lupa la primera vez en el Mac:

- el nombre del servicio de red del dongle (`networksetup -setmanual` acepta 3 argumentos, sin router);
- la salida de `say --data-format=LEI16@16000 --file-format=WAVE`: si no sale mono 16 bits a 16 kHz, `voice_pcm`
  devuelve `None` a propósito y el X2 usa su TTS nativo, en vez de mandarle ruido;
- que el entorno de Python del repo (conda o `.venv`) se cree bien en Apple Silicon.

`./deploy-mac/comprobar_mac.sh` cubre los tres de un tirón.
