# trabajo.md — Juan (Cerberus) en el AgiBot X2 Ultra: estado y AI handoff

Para la próxima IA (o persona) que continúe este trabajo. Estado al **24-oct-2026, 03:30**. Todo lo de aquí funcionó
en el robot real salvo lo marcado **(sin probar en el robot)**. Detalle técnico completo: [work.md](work.md) (§9 el
robot). Plan del reto: [plan.md](plan.md). API: [api.md](api.md).

## 0. Reglas que no se negocian

- **Esta carpeta es privada.** `goodRobot/` vive solo en el Mac del dueño (excluida de git en `../.git/info/exclude`).
  No hacer push de ella ni copiarla a otro equipo. La rama `deploy` del repo tiene una versión anterior (robotB).
- Commits: **sin atribución a Claude** (ni co-author ni "Generated with Claude Code").
- Robot: usuario `run`, contraseña la da el dueño. El dueño pidió **no dejar nada en el robot** cuando termine:
  ver §8.
- Nunca bajar umbrales de reconocimiento para "arreglar" una confusión (ver work.md §4).

## 1. Qué es

Recepcionista de un club (N Club) en un humanoide **AgiBot X2 Ultra**. El robot se llama **Juan** (en los 4 idiomas:
es, en, zh, pt). Reconoce a la persona por la cara (o por cédula / pase QR), dice su categoría (VIP, REGULAR,
INVITADO, PERSONAL, EXTERNO o ESCALAMIENTO a recepción), la saluda con su voz de fábrica y con la mano, a los socios
les pregunta si quieren ir a la cancha de tenis («¡Ven, te acompaño!»), y al salir se despide según su categoría.

## 2. Arquitectura (qué corre dónde)

```
 Mac (cerebro, web/app.py en 127.0.0.1:8000)          X2 Ultra · Orin, unidad de desarrollo 10.0.1.41
 ───────────────────────────────────────────          ───────────────────────────────────────────────
 YOLO-face + YuNet + SFace (reconocer caras)   <───── x2/cerberus_x2.py (ROS 2 Humble + aimdk_msgs)
 Whisper small (voz -> texto, 4 idiomas)          ssh  · cámara de arriba (rgb_head_front_center)
 decisiones, registros SQLite, panel /robot     -R   · lidar del pecho (¿hay alguien a < 3 m?)
 pases QR, cédula (PDF417/OCR)                  8000 · 4 micrófonos (/aima/hal/audio/capture) + VAD
                                                      · voz de fábrica PlayTts (nube AgiBot) · LED · cara
                                                      · saludo con la mano (SetMcPresetMotion 1002)
```

El robot llega a la API del Mac por un **túnel ssh inverso** (`ssh -R 8000`): la API no se abre a la red.
`./deploy/monitor.sh` (se abre solo en otra Terminal) muestra en vivo los procesos de cada lado y el log.

## 3. Cómo se corre (exactamente como funcionó)

```bash
cd goodRobot
./goodRun.sh            # cerebro + recepción en el robot + panel en Chrome + monitor
./goodRun.sh --parar    # para todo
```

`goodRun.sh` hace, en orden: ping al robot → instala la clave ssh si falta (`deploy-mac/preparar_mac.sh --ssh`, pide
la contraseña una vez) → si el robot no tiene `~/aimdk/install`, sube el SDK ya compilado
(`robot_sdk/aimdk-install-run.tgz`, 2.5 MB, sin compilar) → mata cerebros viejos y arranca `./run.sh` con `USUARIO=run`
→ espera a que la API tenga la ruta nueva → abre `http://127.0.0.1:8000/robot` y el monitor → `POST /api/robot/recepcion`
(que corre `deploy/desplegar.sh`: copia el cliente a `/tmp/cerberus` del robot, revisa el DNS y lo arranca).

Requisitos del Mac: cable al puerto **Ethernet trasero** del X2 por un dongle USB-C, con IP fija **10.0.1.2/24**
(`./deploy-mac/preparar_mac.sh --red`, pide sudo); entorno conda `cerberus` (`./run.sh` lo crea). Datos de las
personas en `datos/` (galería `gallery.npz`, `personas.json`, fotos): ya están en esta carpeta.

Pruebas (todas sin robot):
```bash
PY=$(conda info --base)/envs/cerberus/bin/python
$PY x2/cerberus_x2.py --autotest          # cliente del robot: flujo, foco, lidar, "Juan", despedida, VAD
$PY web/voz.py                            # 38+ frases en 4 idiomas, nombre "Juan", despedidas
$PY web/test_api.py datos/dataset/andres/00.jpg datos/dataset/gabriel/00.jpg   # API completa (OJO: sin 2 fotos solo imprime la ayuda)
```

## 4. El robot: hechos verificados (no re-descubrir)

| Cosa | Valor |
|---|---|
| Firmware | `release-v1.1.0` (interfaz v1.1.0.4) → SDK **AimDK v1.1.0** (`aimdk v1.1.0-gfaf4c94`). "1.3.0" no existe |
| SDK | zip oficial en `robot_sdk/aimdk-sdk-v1_1_0.zip`; compilado en el robot en `~/aimdk/install` (solo `aimdk_msgs`); `/home/agi/aimdk` es de fábrica: no tocar |
| Red | Orin desarrollo 10.0.1.41 · PC3 interacción 10.0.1.42 · otra PC 10.0.1.40 · Mac 10.0.1.2 · internet del robot por `wifi0` |
| Cámara buena | `/aima/hal/sensor/rgb_head_front_center/rgb_image/compressed`: 2688×1944, 30 fps, derecha (0°), ojo de pez. La `rgbd_head_front` mira abajo y va al revés (180°) |
| Voz | `PlayTts` con `priority_level` **SYSTEM_L7** (el `interaction_slave` de PC3 habla en L6 y cortaría). Sintetiza **en la nube**: habla español si hay DNS |
| Micrófonos | `/aima/hal/audio/capture`: 6 canales intercalados (4 micrófonos + 2 de referencia del eco). Se promedian los 4 |
| Lidar | `/aima/hal/sensor/lidar_chest_front/lidar_pointcloud_down_sampling` (PointCloud2 x,y,z float32). Zona: x>0.6, \|y\|<0.6, -0.9<z<0.6 |
| Gesto | `SetMcPresetMotion` motion 1002 (saludo), area 2 (mano derecha); antes `SetMcInputSource` ADD/ENABLE "node.cerberus" prioridad 40. Solo en Stable Stand |
| Parar audio | servicio `StopAudioPlay` |
| sudo | el usuario `run` tiene sudo **sin contraseña** |

## 5. Problemas encontrados y su arreglo (la parte cara de aprender)

1. **La voz de fábrica decía `offline_cache_miss`** con todo (también inglés y chino). No era el idioma: el robot
   **no resolvía DNS**. La PC 10.0.1.40 (software de AgiBot) inunda al `dnsmasq` del gateway (servicio
   `agibot_gateway_dnsmasq`, en 10.0.1.41) con cientos de consultas repetidas (`sig01-*.trro.qcloud.com`,
   `www.baidu.com`) y se traba. Arreglo: el cliente vigila `getent hosts agibot.com` cada 5 s y reinicia el servicio
   (`sudo -n systemctl restart agibot_gateway_dnsmasq`); si una frase falla por eso, reinicia y la repite una vez.
   `desplegar.sh` también lo revisa antes de arrancar. **Raíz no resuelta** (es software de AgiBot): ver §7.
2. **La cámara del panel se congelaba** cuando el robot estaba ocupado (hablando, esperando el sí/no, pidiendo el
   documento) o el lidar no veía a nadie: el cliente dejaba de mandar frames. Ahora manda 4 fps "solo para ver"
   (`POST /api/camaras/x2`) y `/api/confirmar` también actualiza el panel.
3. **De noche / a contraluz** la imagen sale casi negra (media ~10/255) y no hay caras: `realzar()` (gamma + CLAHE)
   antes de detectar, solo si está oscura.
4. **Acumulaba trabajo y hablaba encima**: un flujo a la vez (`ocupado_hasta`), frames descartados mientras habla o
   espera respuesta, una frase de voz a la vez (lock), y el micrófono no escucha mientras el robot habla.
5. **Cambiaba solo al chino** por ruido: el cambio de idioma exige una frase clara (≥ 3 palabras).
6. **Respondía a conversaciones ajenas**: ahora solo atiende si lo llaman **«Juan»** (o mientras conversa: 10 s tras
   hablar, la pregunta del tenis abierta o pidiendo el documento). Whisper recibe `hotwords='Juan'`.
7. **`pkill -f cerberus_x2.py` por ssh se mataba a sí mismo** (la línea de comando del bash remoto contiene el patrón):
   usar `pkill -f "[c]erberus_x2.py"`.
8. **`aima em stop-app agent` se colgaba** y bloqueaba el despliegue: tope de 30 s en `deploy/modo_agente.py`; además
   el agente no corre en 10.0.1.41 (está en PC3), así que desde aquí no se reinicia. No se usa `only_voice`.
9. **`compilar_sdk.sh`**: los `setup.bash` de ROS fallan con `set -u` → `set +u` en el guion remoto. La primera
   compilación tomó `extra/x2_rl_deploy`; el SDK oficial v1.1.0 trae `extra/COLCON_IGNORE`.
10. **Al reiniciar el cerebro quedaban procesos viejos** de `web/app.py` vivos (sin puerto): `goodRun.sh` los mata con
    `pkill -9`. Siempre verificar con `lsof -nP -iTCP:8000 -sTCP:LISTEN` quién sirve.
11. Lentitud: endpoints pesados en `run_in_threadpool`, frames en un hilo propio del cliente (siempre el último),
    panel por MJPEG a 1280 px (~11 fps) en vez de pedir JPEG de 400 KB.

## 6. Comportamiento (lo que el dueño pidió, y dónde está)

| Pedido | Dónde |
|---|---|
| Saludar por voz y con la mano; preguntar por la cancha de tenis; «¡Ven, te acompaño!» | `ApiBrain.finish`, `pregunta()` en app.py, `voz.py` contexto `tenis` |
| Hablar poco y no repetir | `NO_REPETIR` 60 s por frase y por persona |
| Una persona a la vez, en orden, sin atender a otros | `ocupado_hasta`, `PREGUNTA_S` 20 s; la cara más grande primero |
| Ignorar gente lejana | `--min-cara 0.05` (ancho de la cara / ancho del frame) + `--lidar-max 3.0` m |
| Sin cara: pedir cédula/QR y reconocer solo con el documento | `document_without_face()` |
| «Mírame a los ojos» cuando no detecta | `textos.py` `hint.perfil`, `reintento` |
| «Hola» → «¡Hola, Andres! ¿En qué te puedo ayudar?» | `HOLA` en el cliente (2 min tras reconocerlo) |
| Nombre de comando «Juan» | `NOMBRE_ROBOT` en voz.py; `atento` en `ApiBrain._on_voice` |
| Despedida al salir **(sin probar en el robot)** | app.py `salida()`: si la persona deja de verse 20 s (`AUSENTE_S`) y vuelve pasados 60 s (`SALIDA_MIN_S`) de su entrada → frase por categoría (spec de `hri/`), registro `SALIDA`, invitado borrado de la galería. También «Adiós, Juan» → `POST /api/salida/{id}` |
| Botón rojo que para todo | `/robot` «■ PARAR TODO» → `POST /api/robot/parar_todo` |
| Ver qué corre en el Orin y qué en el Mac | `deploy/monitor.sh` |

Trato formal en la despedida (VIP, externo): usa el campo opcional `trato` de `personas.json` (p. ej. "señor Azcona");
si no está, el nombre. **No se adivina el género** por el nombre.

## 7. Pendiente / riesgos (en orden)

1. **Probar en el robot** la despedida, «Juan» y el promedio de 4 micrófonos (se escribieron cuando el robot perdió la
   red; pasan las pruebas sin robot). Al volver: `./goodRun.sh`, decir «Juan, hola», salir 20 s de cuadro y volver
   pasado 1 min, y «Adiós, Juan».
2. **DNS del robot**: el vigilante lo destraba pero la inundación vuelve en segundos. Arreglo de raíz (requiere
   decisión del dueño, toca config del robot): en `/etc/dnsmasq-local_dns.conf` agregar `dns-forward-max=1000` o
   resolver localmente los dominios que se repiten; o pedir a AgiBot que lo corrija.
3. **Reconocimiento de voz de AgiBot**: AimDK no entrega texto. El ASR de AgiBot es **LinkSoul** (nube) y exige
   `appId`/`appSecret` de una cuenta configurada en su plataforma (docs: Interface → LinkSoul). Sin eso, el texto lo
   saca Whisper en el Mac. El audio limpio de AgiBot (`/agent/process_audio_output`, `--mic auto`) exige el modo
   `only_voice` y decir «linchilinchi» antes; no se validó.
4. El modo del agente quedó en **`normal`** (fábrica): el chatbot del robot puede contestar si alguien dice
   «linchilinchi».
5. El filtro del lidar usa una zona estimada, no calibrada. Si bloquea a alguien cercano: `--lidar-max 0`.
6. Visitas en memoria: reiniciar el cerebro olvida quién entró (shortcut marcado en el código).

## 8. Lo que quedó en el robot (para borrarlo si el dueño lo pide)

Creado por este trabajo (nada más): `~/aimdk` y `~/aimdk.anterior` (SDK), `~/.ros`, `~/log`, `~/.aima`, `/tmp/cerberus`,
`/tmp/{agp,lid,modo_agente,tts_t}.py`, `/tmp/aimdk-sdk-v1_1_0.zip`, la clave de este Mac en `~/.ssh/authorized_keys`.
**No tocar** (ya estaban): `~/x2_ultra`, `~/.docker`, `/home/agi/aimdk`, `~/.ssh/backdoor.pub`, `~/.ssh/known_hosts`.
El borrado se intentó y lo frenó el control de permisos (es irreversible): hacerlo solo con orden explícita del dueño.
Tras borrar, `goodRun.sh` vuelve a dejar todo funcionando (clave + SDK desde `robot_sdk/`).

## 9. Mapa de archivos

| Archivo | Qué |
|---|---|
| `goodRun.sh` | arranque y parada de todo |
| `web/app.py` | API/cerebro: identificar, confirmar, salida, voz, panel del robot, parar todo |
| `web/voz.py` · `web/textos.py` | Whisper + intenciones · todas las frases en 4 idiomas |
| `web/static/robot.html` | panel: cámaras MJPEG, luces verde/rojo, pasos, log, PARAR TODO |
| `x2/cerberus_x2.py` | cliente del robot (`X2` acciones, `ApiBrain` flujo, `MicVad`, `lidar`, `listen`) |
| `deploy/desplegar.sh` · `deploy/monitor.sh` · `deploy/modo_agente.py` · `deploy/compilar_sdk.sh` | despliegue, monitor, modo del agente, SDK |
| `robot_sdk/` | SDK oficial v1.1.0 (zip) y el `install/` compilado para el robot |
| `datos/` | galería, personas, fotos (privado) |
