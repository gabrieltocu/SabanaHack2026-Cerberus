# Cómo funciona Cerberus, de punta a punta

Este documento explica **todo** el sistema (y en §15–17, cada tecnología a fondo, las preguntas del jurado y las cifras para el pitch): qué hace cada pieza, por qué está hecha así, qué es real y qué es
simulado, cómo correrlo y qué falta. Se actualiza con cada cambio importante (historial al final).
- Para el equipo y el cronograma: [plan.md](plan.md).
- Para usar la API: [api.md](api.md).
- Para los pasos de instalación: [README.md](README.md).
- El reto: [challenge.md](challenge.md).

---

## 1. La idea en una frase

**Un solo «cerebro» (la API, en un laptop del equipo con Linux o macOS) y varios «cuerpos» que lo usan:** la página web (kiosco), el club simulado en
MuJoCo y el robot AgiBot X2. El cerebro ve la cara, confirma la categoría del visitante (con un documento si la cara
no basta), habla en el idioma de la persona y registra cada visita. **Nunca abre acceso por defecto**: si falta
evidencia o se contradice, manda a recepción.

```
                       ┌──────────────── CEREBRO: web/app.py (FastAPI, 127.0.0.1:8000) ────────────────┐
  cámara (frames) ───► │ YOLO-face → YuNet (5 puntos) → SFace (embedding) → galería → veredicto (8 frames) │
  audio (frases)  ───► │ Whisper local → idioma (es/en/zh/pt) + intención                                 │
  documento       ───► │ pase QR firmado / cédula amarilla (PDF417) / cédula digital (OCR)                │
                       │ rol: personas.json (+ invitados con anfitrión) · log SQLite → base de datos ext.  │
                       └───────▲───────────────────────────▲──────────────────────────▲─────────────────────┘
                               │ HTTP                      │ HTTP                     │ HTTP (túnel ssh -R)
                   Web kiosco (Chrome)          Puente MuJoCo (sim/)          X2 real (x2/cerberus_x2.py --api)
                   cámara+mic del laptop        club simulado de robotA       cámara de la cabeza, voz, LED, cara
                   panel /robot: ve las cámaras, el log y el semáforo, y despliega al X2 con botones
```

## 2. Qué hay en cada carpeta

| Carpeta | Qué es |
|---|---|
| `robotA/` | El repo del equipo tal cual (clonado de GitHub). Su visión (`vision/`), el club simulado (`sim/`), el padrón simulado (`registros/`) y el modelo del X2. **No lo modificamos**: robotB lo importa. |
| `robotB/` | Todo lo nuevo, en este orden de importancia: |
| `web/app.py` | El cerebro: API REST + páginas. |
| `web/static/` | Páginas `captura`, `identificar`, `confirmar`, `roles` y `robot` (panel del X2: cámaras en vivo, log, semáforo y botones de despliegue), `comun.js` (cámara, voz, idioma) e `i18n.js` (interfaz en 4 idiomas). |
| `web/textos.py` | Todo lo que Cerberus le **dice** al visitante, en 4 idiomas. |
| `web/voz.py` | Whisper (voz a texto + idioma) e intenciones. |
| `yolo_face.py` | Detector YOLO-face delante del reconocedor SFace. |
| `captura/capturar.py` | Selección de fotos sin duplicados, evaluación, calibración y export YOLO. |
| `documentos.py` | Qué documento se mostró: pase QR, cédula amarilla o cédula digital. |
| `qr_lector.py` | Lector de QR robusto y sesión cara + QR (usada por el modo local del robot). |
| `x2/cerberus_x2.py` | El cuerpo X2: cliente de la API (`--api`) o visión local; `--camara 0` lo imita en un laptop. |
| `sim/puente_mujoco.py` | Conecta la API con el club simulado de robotA. |
| `deploy/` | Despliegue en el X2: instalarlo dentro del Orin, túnel para el modo laptop, modo `only_voice`, diagnóstico y red ([deploy/deploy.md](deploy/deploy.md)). |
| `deploy-mac/` | Lo mismo desde una MacBook: Homebrew, IP fija en el dongle USB-C a Ethernet, clave ssh, arranque del cerebro y comprobación ([deploy-mac/deploy-mac.md](deploy-mac/deploy-mac.md)). Los botones del panel `/robot` corren estos scripts. |
| `robot.md` | Puesta en marcha de todo, de cero a que el robot hable. |
| `datos/` | Fotos, galería, calibración, personas, log, perfil del kiosco. **No va a git** (datos biométricos). |
| `identificacion/` | Fotos de cédulas, una carpeta por persona. **No va a git.** |
| `pases/` | Pases QR generados para el celular. **No va a git.** |
| `run.sh` | Arranca todo. |

## 3. Cómo se arranca

```bash
cd ~/SabanaHack/robotB
./run.sh            # entorno + dependencias + modelos + servidor + pestaña en Google Chrome
./run.sh --sim      # además el club simulado de MuJoCo, movido por la API
```
Qué hace `run.sh`:
1. Si falta robotA, lo clona.
2. Usa el entorno conda `cerberus` (Python 3.10, igual que el host Ubuntu del robot), y si falta lo crea con `environment.yml`.
3. Instala lo que falte de `requirements.txt` y baja los pesos YOLO si no están.
4. Arranca el servidor y abre la página.

Al arrancar, el servidor además:
- prepara el OCR (Tesseract en Linux; en macOS precalienta el de Apple, que la primera vez tarda unos 20 s);
- lee la carpeta `identificacion/`;
- carga Whisper (la primera vez lo descarga, unos 460 MB).

**Para el turno del robot** basta con el cerebro y el panel: `./deploy-mac/arrancar_cerebro.sh` (o `./run.sh
--sin-navegador`) y abrir http://127.0.0.1:8000/robot. Desde ahí se conecta y se despliega al X2 con botones (§9).

**Chrome normal o kiosco:** por defecto la página se abre en el Google Chrome de siempre. Chrome no deja sonar hasta
el primer toque en la página (una vez por pestaña); la escucha empieza sola cuando se da permiso al micrófono. Para una
pantalla de recepción sin ningún clic existe `./run.sh --kiosco`: una ventana aparte con su propio perfil
(`datos/chrome-kiosco`), con cámara, micrófono y audio permitidos de antemano.

## 4. Los datos: cómo se arma el dataset sin sobreajustar

**Problema:** un video a 30 fps da cientos de frames casi iguales. Si todos entran a la galería, esa persona «pesa» más
que las otras (gana más empates contra desconocidos) y, si se prueba con el mismo video, los aciertos salen inflados.

**Cómo se evita** (`captura/capturar.py`, usado por la página `/captura` y por la línea de comandos):
1. **Calidad.** Cada frame pasa por `robotA/vision/quality.py`: una sola cara, de al menos 80 px, con brillo entre 55
   y 190, nítida, casi de frente y con puntaje de detección alto. Si no, se descarta y se dice por qué («acérquese»…).
2. **Las N más distintas.** Entre los candidatos se elige con *muestreo del punto más lejano* sobre los embeddings: el
   siguiente es siempre el más distinto a lo ya elegido. Uno con coseno ≥ 0.93 respecto a algo elegido es la misma toma
   y no entra. Probado: un video de 90 frames idénticos deja 1 foto, con el aviso «faltan variaciones».
3. **Mismo tope para todos:** 15 fotos de enrolamiento y 8 de validación por persona, sumando todas las fuentes.
4. **Validación de otra sesión:** se graba con otra luz u otro lugar. Lo que se parezca demasiado a lo enrolado se descarta (fuga).
5. **Solo la persona que se enrola.** Si alguien más pasa frente a la cámara durante la captura, sus tomas se
   descartan: las que se parecen a **otra persona ya registrada** (coseno ≥ 0.438) y las que no se parecen al resto de
   la captura o a las fotos que ya tenía (mediana < 0.30). La página avisa cuántas se descartaron y de quién parecían.
   Así se arregló el caso real «Vale» confundida con «Gabriel»: 6 de sus 15 fotos eran de Gabriel. Las 6 están en
   `datos/descartadas/vale/`, y el candado nuevo, aplicado a las 15 originales, saca exactamente esas 6.
6. **El mismo detector en todas partes:** la galería sale de YOLO + SFace, igual que en vivo. Los embeddings de YuNet y
   de YOLO para la misma foto dan 0.94, no 1.0, así que mezclar detectores degradaría el reconocimiento.

**Captura guiada en la web:** 8 posturas de 3 s cada una (de frente, izquierda, derecha, arriba, abajo, sonrisa, cerca,
lejos), con voz y texto en el idioma elegido. Cada frame va a `POST /api/captura/{id}/frame` y al final
`/finalizar` elige, guarda, rehace la galería y exporta a YOLO (`datos/yolo/{train,val}/<id>/`).

**Sobre YOLO:** YOLO **detecta** caras con un modelo público ya entrenado (`yolov11n-face`, WIDER FACE). La identidad
la decide **SFace** comparando contra la galería, sin entrenar nada. El export YOLO queda para comparar, pero un
clasificador entrenado con 15 fotos por persona memorizaría las fotos.

**Datos actuales:** Gabriel (VIP) y Andres (REGULAR), con 15 + 8 fotos cada uno. Evaluación: 16/16 aciertos y 0 %
de impostores aceptados. Similitudes reales: contigo mismo entre 0.745 y 0.81; contra la otra persona, como mucho 0.23.

## 5. Reconocer una cara: qué pasa con cada frame

```
frame JPEG ─► YOLO (¿dónde hay caras?) ─► YuNet en el recorte (5 puntos: ojos, nariz, boca)
          ─► SFace alinea y da un vector de 128 números (embedding, normalizado)
          ─► galería: coseno contra cada foto de cada persona; gana la mejor de cada persona
          ─► calidad (robotA/vision/quality.py) + identidad se guardan en una ventana de 8 frames
          ─► cada 8 frames: veredicto (robotA/vision/verify.py)
```
**Veredicto de la ventana**:
- **RECONOCIDO:** al menos el 60 % de los frames buenos coinciden, el coseno medio es ≥ `cos_sure` y la persona le
  saca ≥ 0.08 a la segunda más parecida.
- **PROBABLE:** se parece, pero no alcanza.
- **DESCONOCIDO:** el coseno está por debajo de `cos_reject`.
- **SIN_CALIDAD**, **VARIAS_PERSONAS**, **SIN_ROSTRO**.

**Umbrales** (`datos/calibration.json`; se ven y se ajustan en `/identificar` → «Umbrales», o con `PUT /api/umbrales`):
| Umbral | Valor | De dónde sale |
|---|---|---|
| `cos_reject` | 0.438 | Calibrado en LFW (dataset público, 40 personas) para que solo el 1 % de los desconocidos pase. Con 2 personas el dato propio es ruidoso, así que nunca se baja de ahí. |
| `cos_sure` | 0.600 | El percentil 5 de las fotos de validación, **con tope en 0.60** y siempre al menos 0.10 por encima de `cos_reject`. Antes daba 0.757 y una mano en la cara ya lo tumbaba. |
| Piso permitido | 0.363 | El umbral «misma persona» que recomienda OpenCV para SFace. No se puede configurar menos. |

**La ventana de 5 segundos:** si la cara sale dudosa, desconocida o tapada, durante 5 s el sistema dice «No te veo bien.
Retira la mano…» y sigue intentando; si en ese tiempo te reconoce, entras directo. Pasados los 5 s pide el documento.
**Más datos no arreglan la mano en la cara:** el reconocedor no ve lo que está tapado. Lo que ayuda es el umbral bien
calibrado y la oportunidad de corregir. No se enrolan fotos con la mano en la cara, porque el sistema aprendería «mano»
como rasgo.

## 6. Del rostro a la categoría (el corazón del reto)

El facial **del club** solo dice miembro / no miembro, y está **SIMULADO**, como lo permite el reto: se deriva del rol.
La identidad la da nuestro reconocedor **REAL**. La categoría sale de los registros del club (`datos/personas.json`,
SIMULADOS con datos de prueba):

| Rol | Qué lo confirma | Qué hace Cerberus (voz + LED + cara) |
|---|---|---|
| VIP | cara + padrón (nivel VIP) | «¡Bienvenido de nuevo, Gabriel! Ya avisé al concierge…» · dorado · cara de adoración |
| REGULAR | cara + padrón (regular) | «Siga al salón principal: primera puerta a la derecha» · azul |
| INVITADO | cara (aunque sea **una sola foto**) + invitación vigente con su **anfitrión** | «{Anfitrión} lo espera en la sala de anfitriones; ya le avisé» · verde |
| PERSONAL | cara + rol de personal (turno) | «Turno marcado. Acceso de empleados a su izquierda» · blanco |
| EXTERNO | cara + orden de trabajo | «Use casco y chaleco; ya avisé a su supervisor» · naranja intermitente |
| ESCALAMIENTO | evidencia que no alcanza o se contradice, invitación vencida, documento ajeno | «Un momento: ya viene alguien de recepción» · rojo |

- **Invitados con una sola foto:** un socio, o el sistema del club, manda nombre, foto, anfitrión y fecha de vigencia
  (`POST /api/invitados`), o Cerberus los trae de la base de invitaciones (`POST /api/invitados/sincronizar`). La foto
  entra a la galería y desde ahí lo reconoce y sabe **quién lo invitó**. Vencida la fecha, va a recepción.
- **Página Roles** (`/roles`, en la barra de arriba de todas las páginas): tabla de todas las personas, editable fila por
  fila: nombre, rol, cédula y, para invitados, anfitrión y vigencia; abrir su pase QR o borrarla. Usa `PUT /api/personas/{id}`, que conserva lo que no se cambia (la foto
  del invitado, su origen) y lleva el cambio de nombre a la galería, para que la identificación diga el nombre nuevo.
- **Log:** cada decisión final queda en `datos/registros.db` (SQLite), con fecha, cámara, estado, persona, rol, miembro,
  confianza, coseno, idioma y lo que se le dijo. Se descarga en CSV o JSON y se envía por POST JSON a la base de datos
  externa configurada; si falla, queda pendiente para reenviar. La misma persona no se registra dos veces en 15 s.

## 7. Confirmar con un documento

Si después de 5 s la cara no basta, `/identificar` pasa a **/confirmar**: «No te identifiqué, muéstrame tu cédula o tu
pase QR». Durante 30 s, cada frame va a `POST /api/confirmar/{cid}` y `documentos.py` detecta **solo** qué le mostraron:

| Documento | Cómo se lee | Límite conocido |
|---|---|---|
| Pase QR de N Club | QR firmado con HMAC y con vencimiento (`robotA/vision/qr_pass.py`); lector OpenCV Aruco con un reintento ampliado sobre el recorte | Necesita ≥ ~150 px en la imagen (unos 25–35 cm de la cámara del X2) |
| Cédula amarilla | PDF417 del reverso con `zxing-cpp`. Número en los bytes 48–58 y, además, se buscan los números registrados en todo el contenido. | Las posiciones vienen de la comunidad, no de la Registraduría: falta probar con una cédula real |
| Cédula digital | Su QR está **cifrado** por la Registraduría y no se puede leer, así que se lee el **número del frente** con OCR: Tesseract en Linux, Vision de Apple en macOS (`CERBERUS_OCR` fuerza uno) | Necesita la cédula cerca y sin reflejos |

**Reglas para aceptar** (`check_document` + `face_matches` en `web/app.py`):
1. El documento debe ser válido. Un pase vencido, con la firma alterada o de un tipo que no corresponde al rol va a
   recepción. Una cédula cuyo número no está registrado también.
2. **La cara debe ser compatible con el titular del documento:**
   - si era dudosa, coseno ≥ `cos_reject` contra sus fotos;
   - si no se reconoció, coseno ≥ 0.30 contra sus fotos **o contra la cara impresa en su cédula** (carpeta
     `identificacion/`); un extraño con la cédula de otro queda por debajo (probado: 0.04);
   - si el titular no tiene ninguna foto, decide el documento.
3. Si se acepta: «¡Listo, Gabriel! Ya te identifiqué con tu cédula» + la orientación de su rol. Si no, recepción y el
   motivo queda en el log. En el log la cédula aparece solo con sus últimos 4 dígitos.

**La carpeta `identificacion/<id>/`:** fotos de la cédula de cada persona. Al arrancar se leen solas: el número queda
registrado y la cara de la cédula queda como referencia.

## 8. Voz e idiomas

- **Escuchar (web).** `comun.js` escucha el micrófono todo el tiempo y detecta cuándo alguien habla (energía sobre el
  ruido de fondo, 0.4 s antes del inicio, cierra tras 0.8 s de silencio). No escucha mientras Cerberus habla, para no
  oírse a sí mismo. Manda la frase como WAV a `POST /api/voz`.
- **Entender.** `web/voz.py` usa **Whisper `small`** local, con int8 y en CPU, a ~2 s por frase (detalle en §15.9).
  - Detecta el idioma entre español, inglés, mandarín y portugués, y **solo lo cambia si la detección es segura (≥ 0.7)**:
    una palabra suelta como «start» no cambia el idioma.
  - Descarta las frases que Whisper inventa con el silencio («gracias por ver…»).
  - Entiende intenciones con palabras clave en los 4 idiomas: comandos («empezar», «detener», «validación»), preguntas
    («¿dónde está el baño?», «restaurante», «ayuda», «recepción»), «no tengo cédula» (una negación + una palabra de
    documento, aunque Whisper meta palabras de más), «me llamo…», «soy invitado», «trabajo aquí»…
- **Responder.** Si detectó otro idioma, la **interfaz completa** y la **voz** cambian a ese idioma: el navegador usa
  su voz de ese idioma, y el robot o el modo laptop usan espeak-ng (Linux) o say (macOS). Basta una frase completa en
  otro idioma, por ejemplo «I do not understand», para pasar a inglés y explicar en inglés lo que Cerberus puede hacer.
- **«No te entiendo» siempre cambia el idioma.** Si la persona dice que no entiende, de cualquier forma («no te estoy
  entendiendo», «no entendí», «I'm not understanding», «não estou entendendo», «听不懂»), Cerberus pasa al idioma en
  que lo dijo **aunque la detección no llegue a 0.7**: esa frase es justo la señal de que le hablan en el idioma
  equivocado. Para eso Whisper transcribe primero en el idioma que detectó, y solo si no hace falta cambiar usa el
  idioma de la página (`voz.listen`). Las frases para el visitante están en `web/textos.py`; los textos de la interfaz, en
  `web/static/i18n.js` (140 textos × 4 idiomas).
- **Probado con voz sintetizada:** con voces naturales (las de macOS) los 4 idiomas se detectan con 0.96–0.99 de
  confianza y se entienden. Con espeak-ng (Linux) el inglés y el español también; su portugués y su mandarín suenan
  demasiado robóticos para Whisper, pero eso es un límite de la voz de prueba, no de una persona real. El silencio no produce texto.

## 9. El robot X2 Ultra

**El robot camina solo**, con su propio sistema (control remoto e interacción de fábrica). El único movimiento que le
mandamos es el **saludo con la mano** (un movimiento predefinido del brazo, sin caminar). Todo es del SDK oficial
AimDK (ROS 2 Humble, `aimdk_msgs`).

> **`aimdk_msgs` hay que compilarlo.** Es un paquete de interfaces de ROS 2: los bindings de Python que importamos
> (igual que los `py_examples` oficiales) los genera `colcon build` en el workspace del SDK. Sin ese build el
> cliente del robot no arranca. Lo resuelve `./deploy/compilar_sdk.sh`, y `deploy/verificar_mensajes.py` comprueba
> después que cada campo que usamos existe en el SDK compilado — el SDK debe ser de la misma versión que el
> firmware. Detalle: [deploy/deploy.md](deploy/deploy.md) §3b.

| Qué | Interfaz oficial | Cómo lo usamos |
|---|---|---|
| Cámara | `/aima/hal/sensor/rgbd_head_front/rgb_image/compressed` (JPEG, 1280×720, 30 Hz) | Cada frame, tal cual, a `POST /api/identificar?camara=x2` (y a `/api/confirmar` durante el documento) |
| Hablar | `PlayTts` (TTS nativo: chino e inglés) o `/aima/hal/audio/playback` (PCM S16LE 16 kHz mono) | Dice la `accion` de la API en el idioma del visitante: PCM para español y portugués, TTS nativo para inglés y chino. El PCM lo genera espeak-ng donde esté instalado, o el propio cerebro con `POST /api/tts` (`--tts api`): así el host del robot no necesita instalar nada |
| Foco y volumen | `RequestAudioFocus`, `AbandonAudioFocus`, `SetVolume` | El topic de playback **no pide foco solo**: se pide una vez al arrancar (prioridad 8), se confirma por `/aima/hal/audio/focus_response` y se devuelve al salir, para que el X2 recupere su voz de fábrica. `--volumen 80` evita el clásico robot mudo |
| Escuchar | El X2 escucha de fábrica tras la palabra de activación **«linchilinchi»**. En modo `only_voice` publica el audio de cada frase en `/agent/process_audio_output` (`audio_vad_state.value`: 1 empieza, 2 procesando, 3 termina) | `--escuchar`: cada frase (VAD de inicio a fin) va como WAV a `POST /api/voz`; si cambia el idioma, el robot sigue en el idioma del visitante. Si ese topic no publica nada en 20 s, pasa solo al micrófono crudo `/aima/hal/audio/capture` con VAD por energía (`MicVad`) |
| Cara y LED | `PlayEmoji`, `SetPmuLed` | Color y expresión de cada rol (el LED tarda ~5 s en responder: todo es asíncrono) |
| Saludo con la mano | `SetMcPresetMotion` (motion 1002 «saludar», area 2 mano derecha) y `SetMcInputSource` (registrar la fuente `node.cerberus`, prioridad 40, como el ejemplo oficial `preset_motion_client`) | Al reconocer a alguien con rol, saluda con la mano mientras dice su nombre (recepción no). Exige el robot de pie en **Stable Stand** (`set_mc_action SD`); si no, el MC lo rechaza y solo queda en el log. `interrupt=False`: si ya hay un gesto en curso, el nuevo se descarta. `--sin-gestos` lo apaga |

**Cómo se conecta** (los dos modos, con sus comandos, en [deploy/deploy.md](deploy/deploy.md)):

1. **Modo A — todo dentro del Orin** (recomendado): el cerebro *y* el cliente corren en la unidad de desarrollo del
   X2 Ultra (`10.0.1.41`), que es el entorno oficial del SDK (Ubuntu 22.04, ROS 2 Humble, `aimdk_msgs`, AimDK ya
   compilado). Durante la demo no hay red de por medio: todo es `127.0.0.1` dentro del robot.
   `./deploy/instalar_en_robot.sh` copia código, pesos de YOLO, galería y caché de Whisper y crea el entorno
   (`venv --system-site-packages`, para reusar el numpy y el opencv del Orin y no compilar nada);
   `./deploy/desplegar.sh --todo-en-robot` lo arranca. En el Orin, Whisper usa el modelo `base` (`WHISPER=base`).
2. **Modo B — cerebro en el laptop**: `./deploy/desplegar.sh` copia `x2/cerberus_x2.py` al robot, abre un túnel SSH
   **inverso** (`ssh -R 8000:127.0.0.1:8000`) y lo arranca allí con `--api http://127.0.0.1:8000 --tts api`. La API
   nunca se abre a la red (son datos biométricos) y el robot solo necesita `rclpy` y `aimdk_msgs`: ni OpenCV, ni
   torch, ni Whisper, ni espeak-ng.

La unidad de **control de movimiento** (`10.0.1.40`) no se toca: la documentación oficial prohíbe usarla como
entorno de desarrollo. Checklist del turno: `./deploy/desplegar.sh --diagnostico` (cámara, servicios, foco, escucha
y un flujo completo).

**Saludo y pregunta del tenis:** al reconocer a un socio (VIP o REGULAR), la decisión de la API trae además una
`pregunta` («¿Quieres ir a la cancha de tenis?»). El robot la dice en la misma frase que el saludo (cada `say` nuevo
corta el anterior) y durante 30 s manda lo que oye a `POST /api/voz?contexto=tenis`. Con ese contexto, «sí»,
«claro», «vamos a la cancha» → `tenis_si`: «¡Ven, te acompaño a la cancha de tenis!»; «no, gracias» → `tenis_no`:
«Perfecto. Si necesitas algo, aquí estoy.» En los 4 idiomas (sí/no por palabras enteras: «no» no se confunde con
«nombre»; en mandarín 好/是/要 y 不). Sin pregunta pendiente, «quiero ir a la cancha de tenis» recibe la misma
respuesta. La voz en español sale por el parlante del robot como PCM generado por el cerebro: el TTS nativo del X2
(`PlayTts`) solo habla inglés y chino.

**Usuario y SDK del X2 Ultra del evento:** se entra como `run` (no `agi`): `USUARIO=run` para los scripts y el
panel. El SDK compilado queda en `/home/run/aimdk` (una copia; `/home/agi/aimdk` no se toca). El último SDK
publicado es el **v1.1.0** (`aimdk v1.1.0-gfaf4c94`, trae `aimdk_msgs` precompilado para aarch64 y `extra/COLCON_IGNORE`);
no existe un SDK 1.3.0: «v1.3.0» es la versión del modelo URDF del X2 Ultra. `compilar_sdk.sh` ya no usa `set -u`
(los `setup.bash` de ROS 2 leen variables sin definir y el script se caía).

**Modos de voz del X2:**
1. **De fábrica (normal):** el robot conversa con su propio modelo de lenguaje (LinkSoul). Sirve para charlar, pero lo
   que oye no llega a Cerberus.
2. **`only_voice`:** se desactiva su modelo de lenguaje y el audio llega a nosotros. Así responde Cerberus en el idioma
   detectado. Se cambia con el servicio `SetAgentPropertiesRequest` (clave 2 = `'only_voice'` o `'normal'`) y reiniciando el
   agente (`aima em stop-app agent && aima em start-app agent`).

**Plan B sin robot:** `python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000` hace exactamente lo mismo que el
X2, con la cámara y la voz del laptop.

**Panel del robot (`/robot`)**: todo el turno desde Chrome, sin terminal.
- **Semáforo** (`GET /api/robot/conexion`, cada 4 s): un punto verde o rojo por pieza, de lo más cercano a lo más
  lejano: Cerebro (API) · Galería (hay personas) · Voz en español (espeak-ng o `say`) · Red al robot (ping a
  10.0.1.41) · SSH (entra sin contraseña) · SDK del robot (`rclpy` + `aimdk_msgs` importables) · Cliente en el X2
  (la recepción corre) · Cámara del X2 (frame de hace < 5 s). El primer rojo dice qué botón pulsar.
- **Una sola cámara decide:** mientras el X2 hace la recepción (lanzada desde el panel, o mandando frames por
  cualquier otro camino), `/api/identificar` rechaza las demás cámaras con 409 y `/identificar` suelta la webcam del
  computador y lo dice; vuelve sola cuando el robot para. Así nadie queda registrado dos veces.
- **Cámaras en vivo:** cada cámara que manda frames a `/api/identificar` (el X2 es `x2`, la web es `web`) aparece con
  su último frame (`GET /api/camaras/{camara}.jpg`, ~4 por segundo), las caras que ve, quién es y la última decisión.
  No se abre ningún puerto nuevo en el robot: son los mismos frames que ya manda por el túnel. Si el frame tiene más
  de 5 s, la etiqueta se pone roja (el cliente del robot se cayó o el túnel se cortó).
- **Pasos con botones**, en orden: 1. Red (IP 10.0.1.2) · 2. Clave ssh · 3. Comprobar · 4. Compilar SDK ·
  5. Diagnóstico · 6. Recepción en vivo (`only_voice` + cliente) · Probar los 6 flujos · Voz de fábrica. Cada uno corre
  el script de `deploy/` o `deploy-mac/` de siempre (`POST /api/robot/{accion}`), uno a la vez, y **Detener** lo para.
- **Log del robot:** la salida del script —y durante la recepción, la del cliente dentro del X2, por el ssh— llega al
  panel en vivo (`GET /api/robot/estado?desde=n`), junto con las últimas decisiones del log.
- **Contraseñas:** cada paso corre dentro de una pseudo-terminal, así que si ssh o sudo piden contraseña se ve la
  pregunta en el log y se contesta en la casilla de abajo (`POST /api/robot/entrada`; no queda en el log porque la
  terminal no la repite). La pseudo-terminal también hace que `ssh -t` reserve terminal en el robot: al pulsar
  Detener, el cliente del X2 recibe la señal de colgado y para, en vez de quedar huérfano.
- **Seguridad:** estas rutas ejecutan comandos, así que solo aceptan peticiones con `Host` 127.0.0.1/localhost y sin
  `Origin` de otra página (ni otra web abierta en Chrome ni un DNS que apunte a este equipo pueden usarlas). Solo
  corren las acciones de la lista `ACCIONES` de `web/app.py`: ningún texto del navegador llega a la línea de comandos.
- **■ PARAR TODO** (botón rojo grande, `POST /api/robot/parar_todo`): mata el despliegue en curso, el cliente dentro
  del X2 (`pkill`) y vacía el parlante (`StopAudioPlay`). Deja la cámara del computador libre otra vez.
- **Monitor** (`./deploy/monitor.sh`, en una ventana de Terminal aparte): qué corre en este computador (el cerebro:
  YOLO + SFace + Whisper + decisiones) y qué en el **Orin** del X2 (el cliente: cámara, micrófonos, voz de fábrica, LED,
  gesto, lidar), con su CPU, y el log del robot.

### 9.x Recepción en el X2 real (24-oct)
- **Voz de fábrica del robot** (`PlayTts`, prioridad `SYSTEM_L7` para que su `interaction_slave` en L6 no la corte).
  Habla español: sintetiza en la nube de AgiBot. Si responde `offline_cache_miss` es que el robot **no resuelve DNS**
  (el `dnsmasq` del gateway se traba): `sudo systemctl restart agibot_gateway_dnsmasq`. `desplegar.sh` lo revisa solo
  y pide la contraseña si hace falta. Ya no se usa la voz del cerebro/página.
- **Micrófonos del robot**, escucha continua: `/aima/hal/audio/capture` (4 micrófonos + 2 de referencia; canal 0) con
  VAD propio, sin palabra de activación; mientras el robot habla, el micrófono no escucha (no se contesta a sí mismo).
  Cada frase va a `/api/voz`, una a la vez (si llega otra mientras, se descarta). El log muestra `<<< OYO: "..."`.
- **«Hola»** → «¡Hola, Andres! ¿En qué te puedo ayudar?» si acaba de reconocerlo (2 min); si no, el saludo general.
- **Una persona a la vez:** al reconocer a alguien (`>>> ATENDIENDO A ...`) los frames se botan hasta que termina de
  hablar y de esperar su sí/no al tenis (20 s). La misma persona no se saluda de nuevo en 60 s. Un cambio de idioma
  solo con una frase clara (≥ 3 palabras): el ruido no lo pasa al chino.
- **Solo gente cerca:** caras con ancho < 5 % del frame no cuentan (`--min-cara`), la más cercana va primero, y el
  **lidar del pecho** (`lidar_chest_front/lidar_pointcloud_down_sampling`) debe ver algo delante a < 3 m (`--lidar-max`,
  0 = sin lidar; si el lidar no publica, no bloquea).

## 10. La simulación MuJoCo (lo de tu compañero) como «servidor»

`robotA/sim/run_club.py` modela el N Club (lobby, recepción, 5 salas con puertas por categoría) con el X2 oficial:
recibe, escolta, se para al lado de la puerta, la señala y vuelve a HOME. En modo `--manual` lee comandos por la
terminal: `vip`, `regular`, `invitado`, `personal`, `externo`, `home`.

**`sim/puente_mujoco.py`** abre esa simulación y le escribe el comando de cada registro **nuevo** de la API:
- `ESCALAMIENTO` no tiene sala, así que el robot se queda en HOME;
- si el robot simulado está ocupado, reintenta;
- no repite la historia al arrancar;
- no toca el código de robotA.

Dónde correrla:
| Opción | Cómo | Cuándo |
|---|---|---|
| **En el laptop** (lo más simple) | `./run.sh --sim`, o `--sim-lite` para el modelo liviano. En Linux corre con el `python` del entorno; en macOS el visor exige `mjpython`, que el puente usa solo. | La demo, junto a la web |
| **Servidor GPU en AWS** (`robotA/setup/aws`) | g6.xlarge con escritorio remoto DCV, ROS 2 y MuJoCo. Se enciende con `aws ec2 start-instances` y se entra por un túnel SSM. Para que la sim alcance la API del laptop: `ssh -R 8000:127.0.0.1:8000 ubuntu@<instancia>`, y en la instancia `python sim/puente_mujoco.py --api http://127.0.0.1:8000`. | Si el laptop no da con el render; ~0.82 USD/h |

Probado: con la simulación real, el `vip` entra, el `regular` contesta «ocupado» mientras el primer recorrido sigue
(caso que el puente reintenta) y `salir` la cierra.

## 11. Requisitos del reto: cómo se cumplen

| Requisito ([challenge.md](challenge.md)) | Cómo lo cumple Cerberus | Real / simulado |
|---|---|---|
| 1. Orientación liderada por un robot | El X2 dice la orientación de cada rol con su voz, su cara y su LED; en la sim además escolta a cada sala | X2 real (falta el turno); sim real en MuJoCo |
| 2. Dataset facial propio | 15 + 8 fotos por integrante, sin duplicados, validación de otra sesión, evaluación con métricas | **Real** |
| 3. Confirmar la categoría | Cara + padrón e invitaciones; si duda: 5 s de reintento y luego cédula o pase QR, siempre cruzado con la cara; contradicción → recepción | Reconocimiento y documentos **reales**; padrón e invitaciones **simulados** |
| 4. Un flujo distinto por categoría | 5 flujos + escalamiento, con distinto texto, voz, color, expresión y sala | Real (web y X2) / sim |
| Demo 1: uso del facial en el proceso | Panel con «MIEMBRO / NO MIEMBRO (facial del club simulado)» junto a la identidad real, y cómo cambia la decisión | Facial del club **simulado** |
| Demo 2 y 3: las 5 categorías y sus flujos | Los 5 actores pasan frente a la cámara | — |

| Criterio (pts) | Evidencia que mostramos |
|---|---|
| Comprensión (10) | Necesidades por rol (tabla de la sección 6), supuestos declarados de El Nogal |
| Integración facial (15) | La salida miembro / no miembro y la identidad alimentan la decisión en vivo; el log lo muestra |
| Confirmación (20) | Ventana de 5 s, cédula y QR detectados solos, 13 casos trampa probados (documento ajeno, vencido, alterado…) |
| Flujos (20) | 6 flujos distintos y justificados, en 4 idiomas |
| Experiencia (10) | Manos libres, en el idioma del visitante, sin pasos innecesarios (VIP < 10 s) |
| Demostración (15) | Web + X2 + sim con el mismo cerebro; el panel `/robot` muestra en vivo lo que ve el X2 y cada decisión; tabla real vs simulado |
| Justificación (10) | Umbrales con datos, límites honestos (sección 13) |

## 12. Pruebas (todas sin cámara)

| Prueba | Qué cubre |
|---|---|
| `python web/test_api.py CARA1.jpg CARA2.jpg` | Toda la API: captura, evaluación, identificación en 4 idiomas, log y base externa (caída incluida), ventana de 5 s, umbrales, cédula y QR (13 casos), fotos de cédulas, invitados con 1 foto (vigente, vencido, sincronizados), voz real, el robot como cliente, migración de una base vieja, panel `/robot` (frame por cámara, paso en pseudo-terminal con pregunta y respuesta, detener, rechazo de otra web) |
| `python captura/test_capturar.py` | Selector anti-duplicados |
| `python qr_lector.py --autotest` | Lector de QR (tamaños, dos a la vez, frame vacío ~14 ms) |
| `python documentos.py` | Pase, cédula amarilla y cédula digital |
| `python web/voz.py --audio` | Whisper con voz sintetizada (say en macOS, espeak-ng en Linux) y silencio |
| `python x2/cerberus_x2.py --autotest` | Categorías, flujos y el robot como cliente de la API |
| `python sim/puente_mujoco.py --autotest` | Puente con una simulación falsa (orden, reintento, escalamiento) |
| `./run.sh --pruebas` | Todas las anteriores que no necesitan fotos |

## 13. Lo que sigue (en orden)

1. **Capturar a los 5 actores** (uno por rol) y volver a evaluar. Hoy hay 2 personas: el 100 % todavía dice poco.
2. **Turno en el X2** (`plan.md` sección 6), desde el panel `/robot`, siguiendo el semáforo hasta que todo esté verde:
   - pasos 1 a 5 con el cable al puerto trasero; si **1. Red** no acepta la contraseña del Mac desde el panel, correr
     `./deploy-mac/preparar_mac.sh --red` en la terminal (es la única vez que hace falta);
   - confirmar «linchilinchi» y el modo `only_voice`;
   - ver que lleguen las frases (`/agent/process_audio_output`);
   - correr `--api --escuchar` y medir a qué distancia lee el QR la cámara de la cabeza.
3. Probar una **cédula amarilla real** (las posiciones del PDF417 no son oficiales) y una **digital** en vivo.
4. Grabar el **video de respaldo** del X2 y ensayar la demo completa: web + X2 + `./run.sh --sim`.

## 14. Límites conocidos (decirlos en la presentación suma puntos)

- **Facial del club y registros:** el facial del club (miembro / no miembro), el padrón, las invitaciones y los turnos
  son **simulados**, como lo permite el reto.
- **Robot sin probar:** el código del robot usa las interfaces oficiales de AimDK y sus campos están verificados
  **contra la documentación** (`PlayTts.tts_req`, `SetPmuLed`, `PlayEmoji`, `AudioPlayback`, `RequestAudioFocus`,
  `ProcessedAudioOutput`), pero **aún no ha corrido en el X2**. De esa revisión salieron tres correcciones: el VAD
  llega como `audio_vad_state.value` (antes se comparaba el mensaje entero, y la escucha nunca habría funcionado),
  el foco de audio hay que pedirlo y confirmarlo antes de publicar PCM, y el `priority` del LED es un umbral que se
  queda puesto. El plan B del micrófono (`MicVad`) está probado con audio sintético, no con el micrófono del robot.
- **Palabra de activación:** «linchilinchi» la dio el equipo; la documentación pública no la nombra.
- **OCR:** Tesseract (Linux) lee bien el número impreso, pero es más sensible a reflejos y tamaño que el de Apple. Conviene probarlo con la cédula real.
- **Pocos datos:** con 2 personas, el umbral `cos_sure` está acotado por diseño (tope 0.60) más que medido.
- **Licencias:** los pesos YOLO-face son AGPL y WIDER FACE es de uso no comercial. Sirven para la hackathon; un
  despliegue comercial en el club requiere revisar las licencias.
- **API sin autenticación:** solo escucha en 127.0.0.1. Para otra máquina se usa un túnel; no se abre a la red.
  Las rutas del panel que ejecutan comandos (`/api/robot/...`) además rechazan otro `Host` y otro `Origin`, y solo
  corren la lista fija de `ACCIONES`.
- **Panel `/robot` sin robot todavía:** probado con un proceso falso que pide y recibe una respuesta, y con
  «3. Comprobar» de verdad (todo verde salvo el robot, que no estaba conectado). Falta verlo con el X2: el túnel,
  `ssh -t` detenido desde el panel y la contraseña de sudo de «1. Red» escrita en la página.
- **Una cámara a la vez:** mientras el X2 identifica, la cámara del computador queda en pausa. Si el robot deja de
  mandar frames, el computador vuelve a identificar a los 5 s.
- **macOS:** OpenCV y la librería de audio de Whisper traen cada una su copia de `libavdevice`, y macOS avisa «implemented in both» al arrancar. No ha causado fallos y en Linux no pasa.

## 15. Las tecnologías, a fondo (para hablar con seguridad en el pitch)

Cada tecnología con cinco partes:
- **qué es;**
- **cómo funciona por dentro;**
- **por qué la elegimos** frente a las alternativas;
- **números**, medidos por nosotros en un laptop con CPU de 10 núcleos y sin GPU dedicada, salvo que diga otra cosa;
- **límites.**

### 15.1 Detección de caras: YOLO (`yolov11n-face`)

- **Qué es.** YOLO («You Only Look Once») es una familia de detectores de objetos que mira la imagen **una sola vez**
  con una red convolucional y devuelve todas las cajas a la vez. No recorre la imagen con ventanas, como los detectores
  clásicos. Usamos YOLO11 *nano* de Ultralytics, reentrenado por la comunidad (akanametov/yolo-face) **solo para caras**
  con **WIDER FACE**: 32 203 imágenes y 393 703 caras etiquetadas, con multitudes, oclusión, perfiles, desenfoque y
  poca luz.
- **Cómo funciona.**
  1. La imagen pasa por un *backbone*, una red que extrae rasgos a varias escalas.
  2. Un *neck* mezcla esas escalas, para encontrar caras grandes y chicas.
  3. Una *head* sin anclas predice para cada zona si hay una cara, su caja y su confianza.
  4. Al final, la *supresión de no máximos* (NMS) elimina las cajas repetidas.
- **Por qué esta y no otra.**
  - Es un modelo **público y ya entrenado**: no hubo que entrenar nada, que con 10 horas y un puñado de personas
    habría sobreajustado.
  - El modelo *nano* tiene ~2.6 millones de parámetros, así que corre en CPU.
  - Aguanta mejor que YuNet, el detector original de robotA, las caras lejanas, de lado o con poca luz, que son las
    de una entrada real.
- **Números.** Todo el camino de una cara (YOLO + YuNet + SFace) tarda **44 ms por frame de 1280×720**, unos 20
  frames por segundo en CPU.
- **Límites.** Pesos con licencia AGPL-3.0 y dataset de uso no comercial: sirven para la hackathon; un despliegue
  comercial requiere revisar las licencias o entrenar con datos propios.

### 15.2 Puntos de la cara: YuNet

- **Qué es.** Un detector de caras diminuto de OpenCV Zoo (~75 000 parámetros) que además da **5 puntos**: los dos
  ojos, la nariz y las dos comisuras de la boca.
- **Cómo lo usamos.** Solo dentro del recorte que encontró YOLO, para obtener los 5 puntos. Con ellos SFace **alinea**
  la cara: la rota y la escala para que los ojos queden siempre en el mismo lugar de una imagen de 112×112. Sin
  alinear, una cabeza inclinada parecería otra persona.
- **También sirve de juez de calidad.** Su puntaje de detección indica si la cara está tapada, y la posición de la
  nariz respecto a los ojos indica si está de perfil (`robotA/vision/quality.py`).

### 15.3 Reconocimiento: SFace y los embeddings

- **Qué es.** SFace (Zhong et al., 2021) es una red tipo MobileFaceNet que convierte una cara alineada en un
  **embedding**: un vector de **128 números** que resume los rasgos de la persona. Fue entrenada con millones de caras
  y una función de pérdida («sigmoid-constrained hypersphere loss») que junta las fotos de la misma persona en el
  espacio y separa las de personas distintas. OpenCV Zoo reporta alrededor de 99.4 % en LFW.
- **Cómo se reconoce a alguien sin entrenar.**
  1. Cada foto enrolada se convierte en un vector, y esa colección es la **galería**.
  2. En vivo, la cara se convierte en un vector y se compara contra la galería con la **similitud coseno**: el
     coseno del ángulo entre los dos vectores. 1 es idéntico, 0 no tiene relación.
  3. Gana la persona con la mejor foto parecida.

  Esto es **reconocimiento de conjunto abierto**: además de decir «es Gabriel», el sistema debe saber decir «no es nadie
  que conozca». Para eso están los umbrales.
- **Por qué así y no entrenando un clasificador.**
  - Agregar a una persona cuesta segundos (15 fotos) y no hay que reentrenar nada.
  - Un invitado se agrega con **una sola foto**.
  - Un clasificador entrenado con 15 fotos por persona memorizaría esas fotos y no sabría decir «desconocido».
- **Números.** Comparar contra la galería tarda 0.02 ms (es solo un producto de matrices). Contigo mismo, las fotos
  dan entre 0.745 y 0.81; contra otra persona, como mucho 0.23. Evaluación con validación de otra sesión: 16/16 y 0 %
  de impostores. En LFW (5 749 personas públicas), el umbral de rechazo se calibró para que solo el 1 % de los
  desconocidos pase.

### 15.4 Umbrales y decisión en el tiempo

- **Dos umbrales, tres zonas:**
  - debajo de `cos_reject` (0.438) es **desconocido**;
  - sobre `cos_sure` (0.600) es **reconocido** y se actúa sin preguntar;
  - entre ambos está **por confirmar** y se pide un documento.

  Bajar `cos_reject` deja pasar más impostores (*falsos aceptados*); subirlo rechaza a más socios legítimos (*falsos
  rechazados*). En un club el error caro es dejar pasar a alguien, por eso ese umbral nunca baja del calibrado en LFW
  y el piso absoluto es 0.363 (recomendación de OpenCV para SFace).
- **Votación en 8 frames.** Un solo frame puede engañar (un parpadeo, un movimiento). Cerberus decide sobre una ventana
  de 8 frames, en menos de medio segundo:
  - el 60 % de los frames buenos tiene que coincidir;
  - la persona tiene que sacarle 0.08 de ventaja a la segunda más parecida, para no confundir a dos que se parecen.
- **La ventana de 5 s.** Si la cara no alcanza, Cerberus no castiga de inmediato: pide corregir («retira la mano») y
  sigue intentando 5 s antes de pedir el documento.

### 15.5 Selección de fotos sin duplicados (farthest point sampling)

- **El problema.** Los frames de un video se parecen casi por completo entre sí. Con la galería llena de copias, esa
  persona tendría más «boletos» para ganar empates, y las pruebas mentirían.
- **El algoritmo.**
  1. Se arranca por la foto más de frente.
  2. Cada siguiente es la candidata **más lejana**, en coseno, de todas las ya elegidas.
  3. Se para al llegar a 15, o cuando todo lo que queda está a menos de 0.07 (coseno ≥ 0.93) de algo ya elegido.

  Es el algoritmo «k-center greedy», usado para elegir muestras representativas de un conjunto.
- **Resultado medido.** 90 frames idénticos dejan 1 foto, con el aviso «faltan variaciones». La validación descarta lo
  que se parezca demasiado al enrolamiento, para que la métrica sea honesta.

### 15.6 Calidad de imagen (por qué te pide acercarte o quedarte quieto)

| Medida | Cómo se calcula | Umbral |
|---|---|---|
| Tamaño | Lado de la cara en píxeles | ≥ 80 px (SFace trabaja a 112) |
| Luz | Brillo medio de la cara | Entre 55 y 190 |
| Nitidez | Varianza del Laplaciano (cuánto «borde» tiene la imagen) con contraste normalizado | ≥ 50 |
| Perfil | Cuánto se corre la nariz respecto al centro de los ojos | ≤ 0.35 de la distancia entre ojos |
| Tapada | Confianza de la detección | ≥ 0.85 |

Los umbrales salen de LFW: 300 caras nítidas contra las mismas desenfocadas (`robotA/vision/quality.py`).

### 15.7 Pases QR firmados (HMAC)

- **Qué es un QR.** Un código de matriz con corrección de errores (Reed-Solomon), que se lee aunque esté algo tapado
  o sucio. Tres cuadrados en las esquinas le dicen al lector dónde está y cómo está girado.
- **El contenido de un pase:** `NCLUB1|tipo|id|nombre|vence|firma`.
  - La **firma** es un HMAC-SHA256: un resumen criptográfico del contenido hecho con una clave secreta que solo tiene
    el servidor. Si alguien cambia un solo carácter (el nombre, la fecha, el tipo), la firma deja de coincidir. Sin la
    clave no se puede fabricar un pase válido.
  - El **vencimiento** impide reutilizar pases viejos.
- **La regla clave.** Una foto del pase de otra persona *sí* tiene una firma válida. Por eso el pase **siempre se cruza
  con la cara**: si la cara no corresponde al titular, va a recepción.
- **El lector.** OpenCV *QRCodeDetectorAruco*, más un reintento ampliado sobre el recorte del QR. Lee desde ~150 px
  (el lector original pedía ~230 px) y tarda 5 ms en un frame sin QR, así que puede buscar QR todo el tiempo sin
  frenar la cámara.

### 15.8 Cédula colombiana: PDF417 y OCR

- **Cédula amarilla (la tradicional).** Al reverso tiene un **PDF417**, un código de barras «apilado» (filas de barras
  una sobre otra) muy usado en documentos de identidad y pases de abordar. Guarda en binario el número, los apellidos,
  los nombres, el sexo, la fecha de nacimiento y el RH. Lo lee **zxing-cpp** (port C++ de ZXing, la librería de
  códigos de barras de Google) en **7 ms**.
- **Cédula digital.** Su QR está **cifrado** por la Registraduría: no se puede leer sin sus claves. Por eso leemos el
  **número impreso del frente** con OCR:
  - **Tesseract** en Linux: motor de código abierto, originalmente de HP y luego de Google, con redes LSTM desde la
    versión 4; tarda **121 ms**;
  - **Apple Vision** en macOS: tarda **67 ms**.

  El número se busca con un patrón (1.012.345.678) y se compara con los números registrados.
- **Privacidad.** En la API y en el log la cédula aparece solo con sus últimos 4 dígitos.

### 15.9 Voz: Whisper (faster-whisper)

- **Qué es.** Whisper es un modelo de reconocimiento de voz de OpenAI, entrenado con **680 000 horas** de audio en
  decenas de idiomas. Es un *transformer* codificador-decodificador:
  1. el audio se convierte en un espectrograma (cómo cambian las frecuencias en el tiempo);
  2. el codificador lo resume;
  3. el decodificador escribe el texto palabra por palabra.

  Su **primera** predicción es el **idioma**: por eso detecta solo si hablas español, inglés, mandarín o portugués.
- **faster-whisper.** Es Whisper reimplementado sobre CTranslate2, un motor de inferencia optimizado, con pesos
  **cuantizados a int8**: números de 8 bits en vez de 32. Ocupa ~4 veces menos memoria y corre varias veces más
  rápido en CPU, con casi la misma precisión. Usamos el modelo `small` (244 millones de parámetros, ~460 MB).
- **Lo que le agregamos.**
  - **Idioma:** solo se cambia si la detección es segura (≥ 0.7), para que una palabra suelta no lo cambie por error.
  - **Silencio:** se usa el VAD Silero, un detector de voz incluido en faster-whisper, y se descartan los segmentos
    sin habla y las frases que Whisper inventa con el silencio («gracias por ver el video»).
  - **Hilos:** van fijos, porque compartiendo el proceso con YOLO pasaba de 2 a 6 s.
- **Números.** Una frase de 2 s tarda **~2.0 s** con YOLO cargado, incluida la detección de idioma. Confianza de idioma
  medida: inglés 0.99, español 0.99, portugués 0.96, mandarín 0.996. Con `CERBERUS_WHISPER=base` baja a ~0.6 s, a
  cambio de detectar peor el idioma.
- **Entender lo dicho.** No usamos un modelo de lenguaje para las intenciones, sino palabras clave en los 4 idiomas:
  es instantáneo, predecible y explicable. «No tengo cédula» se reconoce aunque Whisper transcriba mal una palabra,
  porque basta una negación más una palabra de documento.
- **Por qué local y no en la nube.** La voz y la cara son datos personales. Todo se procesa en el computador del club,
  sin enviar audio a terceros, y funciona sin internet una vez descargado el modelo.

### 15.10 Escucha continua en el navegador

- **Micrófono y cámara:** API `getUserMedia` del navegador.
- **Detector de habla propio (VAD por energía).** Mide el volumen (RMS) cada ~43 ms y aprende el ruido de fondo. La
  frase empieza cuando el volumen supera 3 veces ese ruido y termina tras 0.8 s de silencio. Se guardan además 0.4 s
  de antes del inicio, para no cortar la primera sílaba.
- **Envío:** la frase se empaqueta como WAV (PCM de 16 bits) y va a `/api/voz`.
- **No se oye a sí mismo:** mientras Cerberus habla, el micrófono se ignora. También se pide al navegador cancelar el
  eco.
- **Hablar:** `speechSynthesis`, la voz del navegador en el idioma detectado, elegida de una lista de voces naturales por
  idioma (Samantha, Paulina, Luciana o Tingting en macOS; las voces de Google en Linux), con las «Premium/Enhanced»
  primero y sin las voces de juguete de macOS (Eddy, Albert, Zarvox…), que suenan feas y bajas. El robot habla con su propio TTS o con
  espeak-ng.

### 15.11 La API: FastAPI, SQLite y webhooks

- **FastAPI** es un framework web de Python sobre Starlette, un servidor asíncrono (ASGI), y Pydantic, que valida los
  datos. Genera solo la **documentación OpenAPI** (`/docs`): cualquier persona, sistema o IA puede usar la API sin
  leer el código. Corre con **Uvicorn**.
- **Un solo cerebro, muchos cuerpos.** La web, el robot y la simulación hablan la misma API REST. Para cambiar de
  robot o agregar un panel basta otro cliente HTTP.
- **SQLite:** base de datos en un solo archivo, sin servidor aparte; guarda el log de visitas.
- **Webhook:** cada visita se envía por POST JSON a la base de datos externa del club. Si falla, queda pendiente y
  se reintenta.
- **Concurrencia:** YOLO y SFace no son seguros entre hilos, así que un *lock* procesa un frame a la vez.
- **Panel del robot:** el último frame de cada cámara se guarda en memoria al pasar por `/api/identificar`, y la
  página lo pide unas 4 veces por segundo (`/api/camaras/{camara}.jpg`): no hace falta otro canal de video. Los
  botones lanzan un script de `deploy/` con `subprocess` dentro de una **pseudo-terminal** (`pty`), igual que si se
  escribiera en una terminal: así se ven y se contestan las preguntas de contraseña, y al detenerlo se manda la
  señal a todo su grupo de procesos (y por el ssh, al cliente dentro del robot).

### 15.12 El robot: AgiBot X2 Ultra, ROS 2 y AimDK

- **El X2 (serie Lingxi, AgiBot)** es un humanoide de unos 45 kg (según el modelo oficial del fabricante en `robotA/assets`) con:
  - cámaras en la cabeza: RGB-D frontal de 1280×720 a 30 Hz, estéreo y trasera;
  - un arreglo de micrófonos de 4 micrófonos más 2 de referencia, que sirven para cancelar el eco;
  - parlante, pantalla de cara (expresiones) y tira de LED;
  - **interacción de voz de fábrica**, que se activa diciendo **«linchilinchi»**.
- **ROS 2 Humble** (versión con soporte largo hasta 2027) es el «sistema nervioso» del robot. Los programas
  intercambian datos por **tópicos** (flujos continuos, como la cámara) y piden acciones por **servicios** (como
  «reproduce esta voz»). Todo viaja sobre DDS, un estándar de mensajería en red con políticas de calidad de servicio
  (fiable o «el último gana»).
- **AimDK** es el SDK oficial de AgiBot: los mensajes `aimdk_msgs` y los nombres de tópicos y servicios del X2.
- **Lo que usamos y lo que no.**
  - Usamos: la cámara, la voz (`PlayTts` / audio PCM), la escucha (`/agent/process_audio_output` en modo `only_voice`),
    la cara y el LED.
  - **No le mandamos ningún movimiento:** el X2 camina y gesticula con su propio sistema. Así es más seguro y no
    competimos con su control de equilibrio.

### 15.13 La simulación: MuJoCo

- **Qué es.** MuJoCo («Multi-Joint dynamics with Contact») es un motor de física para robótica, de código abierto
  desde 2022 (DeepMind). Simula cuerpos articulados con contactos de forma rápida y estable. Es estándar en
  investigación de robots que caminan.
- **Cómo lo usamos.** robotA modela el N Club (lobby, recepción, 5 salas con puertas por categoría) con el **modelo
  oficial del X2** del fabricante (formato MJCF/URDF). El puente `sim/puente_mujoco.py` convierte cada decisión de la
  API en un comando: el X2 simulado escolta, se para junto a la puerta, la señala y vuelve a HOME.
- **Por qué importa en el pitch.** Muestra los **recorridos** (escoltar a cada sala) que el robot real no hace solos en
  la demo, sin arriesgar el robot ni a las personas.

### 15.14 Entorno, idiomas y kiosco

- **Conda (Python 3.10)**, la misma versión del host Ubuntu del robot: lo que funciona en un laptop funciona en el
  robot. `requirements-lock.txt` fija las versiones probadas.
- **4 idiomas:** 140 textos de interfaz y 37 frases para el visitante por idioma, revisados para que no falte ninguno.
- **Kiosco:** Chrome o Chromium con un perfil propio que acepta cámara y micrófono y deja sonar sin clic, como en la
  pantalla de una recepción.

### 15.15 Privacidad y seguridad (Ley 1581 de 2012)

- En Colombia los datos biométricos (la cara) son **datos sensibles** según la Ley 1581 de 2012 (habeas data).
- **Qué hacemos:**
  - todo se procesa localmente, sin nube;
  - la galería guarda vectores, no se publican fotos;
  - la cédula se muestra y se registra solo con sus últimos 4 dígitos;
  - la API escucha solo en la máquina local;
  - quien no quiere reconocimiento facial puede usar su pase QR o su cédula;
  - los datos del equipo se borran al terminar el evento.
- **Seguridad del acceso:**
  - **nunca se abre por defecto**;
  - un documento debe coincidir con la cara;
  - un pase alterado o vencido se rechaza;
  - toda decisión queda auditada en el log con su motivo.

## 16. Preguntas probables del jurado (y cómo responderlas)

| Pregunta | Respuesta corta y honesta |
|---|---|
| ¿Por qué no basta el facial del club? | Solo dice miembro / no miembro. No distingue VIP de regular ni invitado de personal o externo. Cruzamos la identidad con los registros del club y, si dudamos, pedimos un documento. |
| ¿Entrenaron un modelo? | No, a propósito. Usamos modelos públicos ya entrenados (YOLO para detectar, SFace para describir la cara) y reconocemos por similitud contra una galería. Con 15 fotos por persona, entrenar habría memorizado las fotos. Así, agregar a alguien toma segundos y un invitado se agrega con una sola foto. |
| ¿Qué tan preciso es? | En nuestro equipo, 16/16 con fotos de otra sesión y 0 % de impostores. El umbral de rechazo está calibrado en LFW para que solo el 1 % de los desconocidos pase. Con más personas las cifras serán más representativas, y lo decimos. |
| ¿Y si alguien se tapa la cara o lleva gafas? | Tiene 5 s para corregir («retira la mano»). Si no, se identifica con cédula o pase QR, siempre cruzados con la cara. Nunca se abre por defecto. |
| ¿Y si muestra la cédula de otro? | La cara debe ser compatible con el titular. Probado: un extraño con la cédula de otro da coseno 0.04 y va a recepción. |
| ¿Puedo falsificar un pase QR? | Está firmado con HMAC-SHA256 con una clave del servidor: cambiar un carácter invalida la firma. Una foto de un pase real tampoco sirve, porque se cruza con la cara. |
| ¿Por qué no leen el QR de la cédula digital? | Está cifrado por la Registraduría. Leemos el número impreso con OCR y lo comparamos con el registrado. |
| ¿Qué pasa con la privacidad? | Procesamiento local, galería de vectores, cédula con solo 4 dígitos visibles, nada en la nube, alternativa sin facial (QR o cédula). Está alineado con la Ley 1581. |
| ¿Cómo sabe el club si funciona? | Cada visita queda en el log con su estado, confianza y motivo, y se envía a su base de datos. Los indicadores son: tiempo hasta la orientación, % sin preguntas, % escalado y aciertos por categoría. |
| ¿Qué es real y qué es simulado? | Real: reconocimiento, documentos, voz, flujos en el X2. Simulado: el facial del club, el padrón, las invitaciones y los turnos (datos de prueba, como permite el reto) y los recorridos por el edificio (MuJoCo). |
| ¿Por qué no usan el modelo de lenguaje del robot para todo? | El del robot está en la nube y no conoce el club. Usamos Whisper local para entender el idioma e intenciones concretas; es predecible y no comparte audio. El robot conserva su conversación de fábrica si el club la quiere. |
| ¿Cuánto tarda? | Cara: 44 ms por frame y decisión en menos de 1 s para un socio. Voz: ~2 s por frase. Cédula: 7 ms (amarilla) a ~120 ms (digital). |
| ¿Escala a todo el club? | Comparar contra la galería cuesta 0.02 ms. Con miles de socios sigue siendo instantáneo (o se usa un índice vectorial). El límite real es la cámara y la luz de la entrada, no el cómputo. |

## 17. Cifras para el pitch (todas medidas)

| Cifra | Valor |
|---|---|
| Detección + reconocimiento por frame (1280×720, CPU) | **44 ms** (~20 fps) |
| Comparación contra la galería | **0.02 ms** |
| Decisión | Ventana de **8 frames** (< 1 s); **5 s** para corregir antes de pedir documento |
| Precisión con el equipo (validación de otra sesión) | **16/16**, **0 %** impostores |
| Separación medida | Contigo mismo **0.75–0.81** · contra otro **≤ 0.23** · umbrales **0.438 / 0.600** |
| Lectura de documentos | PDF417 **7 ms** · OCR **67–121 ms** · QR **5 ms** por frame (desde ~150 px) |
| Voz | **~2 s** por frase, idioma con **0.96–0.99** de confianza en 4 idiomas |
| Casos trampa probados | **13** (documento ajeno, vencido, alterado, de otro rol, sin documento, QR ajeno…) → todos a recepción |
| Idiomas | **4** (español, inglés, mandarín, portugués), interfaz y voz |
| Dataset sin duplicados | 90 frames iguales → **1** foto |

---

## Historial de cambios

| Fecha | Cambio |
|---|---|
| 23-oct-2026 | robotA clonado; robotB con captura anti-sobreajuste (Mac, iPhone, X2), YOLO-face + SFace, nodo del X2, plan, README, challenge |
| 23-oct-2026 | Pases QR: lector robusto (~150 px en vez de ~230), sesión cara + QR, entorno conda `cerberus`, `run.sh` |
| 23-oct-2026 | API + páginas `/captura` e `/identificar` con log SQLite enviable a una base externa; confirmación por QR |
| 23-oct-2026 | Cédula (amarilla PDF417, digital OCR) detectada sola y cruzada con la cara; carpeta `identificacion/` |
| 23-oct-2026 | Voz manos libres con Whisper local y detección de idioma; interfaz y voz en es/en/zh/pt; kiosco sin clics |
| 23-oct-2026 | `cos_sure` 0.757 → 0.600 (tope con datos reales) y ventana de 5 s antes de pedir documento; umbrales ajustables |
| 23-oct-2026 | Invitados con una sola foto (anfitrión, vigencia, sincronización con base externa) |
| 23-oct-2026 | El X2 ya no mueve nada (solo cámara, voz, escucha, cara y LED) y es cliente de la API (`--api --escuchar`); palabra de activación «linchilinchi» |
| 23-oct-2026 | Puente API → club simulado en MuJoCo (`./run.sh --sim`); `api.md` y este `work.md` |
| 23-oct-2026 | Todo funciona en **Linux**: OCR con Tesseract, voz local con espeak-ng, HEIC con heif-convert, kiosco con Chrome/Chromium, `run.sh` sin lsof; documentos genéricos con Linux primero |
| 23-oct-2026 | Intención «no entiendo» en 4 idiomas: «I do not understand» pasa todo a inglés y explica en inglés |
| 23-oct-2026 | Whisper con hilos fijos: 5.8 s → 2.0 s por frase con YOLO en el mismo proceso. Secciones 15–17: tecnologías a fondo, preguntas del jurado y cifras medidas |
| 23-oct-2026 | Datos del equipo (fotos, galería, roles, cédulas) en la rama privada `cerberus-datos`, separada del código: `./run.sh --traer-datos` / `--subir-datos` (con respaldo de los datos locales) |
| 23-oct-2026 | Subido al repo del equipo: rama `cerberus-robotB`, PR #2 (`robotB/` como subcarpeta; funciona dentro del repo o al lado como `../robotA`) |
| 23-oct-2026 | Voz en inglés fea y baja: el navegador tomaba la primera voz en-US (una de juguete de macOS). Ahora se elige una voz natural por idioma |
| 23-oct-2026 | Arreglado: «Vale» se confundía con «Gabriel» porque 6 fotos de Gabriel habían entrado a la galería de Vale (él estaba frente a la cámara durante su captura). Datos limpiados (Vale vs Gabriel: 0.79 → 0.25) y candado en la captura contra tomas de otra persona. Evaluación con 4 personas: 32/32, 0 % impostores. También: una captura nueva ya no puede pisar fotos existentes |
| 23-oct-2026 | Página **Roles** (`/roles`, enlace en la barra de todas las páginas) para editar a cada persona; reemplaza al panel que estaba escondido al final de `/captura` |
| 23-oct-2026 | Arreglado: Chrome seguía usando JS viejo de la caché y la página nueva se caía (panel en blanco). Ahora el servidor exige revalidar páginas y scripts (`Cache-Control: no-cache`); `/confirmar` con una confirmación vencida vuelve sola a `/identificar` |
| 23-oct-2026 | Panel «Administrar personas» en `/captura`. Arreglado: re-guardar a un invitado borraba su anfitrión y su vigencia, y renombrar no llegaba a la galería |
| 23-oct-2026 | «No entiendo» con palabras intercaladas («não **o** estou entendendo», «I'm not really understanding»): probado con audio real en los 4 idiomas y la página en otro idioma |
| 24-oct-2026 | Despliegue del X2 Ultra (`deploy/` y `deploy-mac/`), `/api/tts` y correcciones del SDK (rama `deploy`) |
| 24-oct-2026 | El X2 saluda con la mano (`SetMcPresetMotion` 1002) al reconocer a alguien y le pregunta a los socios si quieren ir a la cancha de tenis («¡Ven, te acompaño!»), en 4 idiomas; `--sin-gestos`. Usuario `run` en el robot; arreglado `compilar_sdk.sh` (`set -u` con el setup de ROS) |
| 24-oct-2026 | Semáforo de conexión en `/robot` (puntos verdes y rojos) y la identificación del computador en pausa mientras el robot identifica |
| 24-oct-2026 | Panel **Robot** (`/robot`): cámaras en vivo, log del robot y del despliegue, botones para conectar y desplegar (red, ssh, comprobar, compilar SDK, diagnóstico, recepción, voz de fábrica) y casilla para la contraseña de ssh/sudo |
| 23-oct-2026 | «No te estoy entendiendo» (y equivalentes en 4 idiomas) siempre pasa al idioma en que se dijo; probado con audio real con la página en el otro idioma. Chrome normal por defecto (`--kiosco` opcional). La voz no andaba porque seguía corriendo un servidor viejo: `./run.sh --reiniciar` |
| 24-oct-2026 | X2 real: voz de fábrica en español (arreglo de DNS), micrófonos del robot en escucha continua, «hola» con el nombre, una persona a la vez, lidar + tamaño de cara para ignorar a los lejanos, botón rojo PARAR TODO, `deploy/monitor.sh` |
| 24-oct-2026 | Robot «Juan»: solo atiende si lo llaman por su nombre; despedida por categoría al salir (invitado: rostro borrado); 4 micrófonos promediados; cámara realzada de noche y sin congelarse; DNS del robot vigilado; `goodRun.sh` y `trabajo.md` |
