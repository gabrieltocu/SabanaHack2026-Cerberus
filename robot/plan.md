# Plan Cerberus — 10 horas hasta la demo

Para todo el equipo **Cerberus**. Qué hacer, quién, en qué orden y qué mostrar.
Cómo se hace cada paso: [README.md](README.md). El enunciado y la rúbrica: [challenge.md](challenge.md).
Diseño completo (supuestos, flujos, privacidad, KPIs): `robotA/docs/diseno-cerberus.md`.
Cómo funciona todo por dentro: [work.md](work.md). La API: [api.md](api.md).

## 0. Dónde estamos (23-oct-2026)

| Ya funciona (robotA) | Nuevo hoy (robotB) | Falta |
|---|---|---|
| Visión YuNet + SFace, escalera de verificación, pases QR firmados | API + web (`./run.sh`): captura, identificación, cédula/QR, invitados con 1 foto, log a base externa, voz en 4 idiomas | Enrolar a los **5 actores** (hoy: Gabriel y Andres) |
| Club simulado en MuJoCo con 5 flujos y HOME | Puente API → club simulado (`./run.sh --sim`) | **Turno en el X2 real** (sección 6) |
| Facial del club simulado (miembro / no miembro), padrón de socios | Nodo del X2: cámara → cara/QR → rol → voz, cara y LED (sin mover al robot) | Presentación y video de respaldo |
| | Página **Roles** (`/roles`): asignar y corregir el rol de cada actor antes de la demo | |
| | Página **Robot** (`/robot`, 24-oct): cámaras en vivo, log del X2 y botones para conectar y desplegar | |

## 1. Roles (asignar nombres al empezar)

| Rol | Responsable | Entrega |
|---|---|---|
| **R1 Datos y visión** | ______ | Los 5 actores enrolados, `evaluar` con top-1 ≥ 95 %, galería copiada al host |
| **R2 Robot X2** | ______ | Host Ubuntu con ROS 2 + `aimdk_msgs`, checklist del turno pasado, flujos ajustados |
| **R3 Cerebro y simulación** | ______ | `categorize` de `x2/cerberus_x2.py` alimentando `robotA/sim/run_club.py` (hoy el guion es fijo) y casos trampa |
| **R4 Panel y KPIs** | ______ | Vista que lee las líneas JSON: evidencia, categoría, real vs simulado, matriz de confusión |
| **R5 Pitch** | ______ | Diapositivas, guion de la demo, video de respaldo, respuestas al jurado |

Con 3 personas: R1+R4, R2, R3+R5.

## 2. Cronograma (H = hora desde que empezamos)

| Hora | R1 Datos | R2 Robot | R3 Cerebro/sim | R4 Panel | R5 Pitch |
|---|---|---|---|---|---|
| **H0–1** | Instalar en cada laptop (README §1, Linux) y probar `./run.sh` contigo mismo | Pedir turno de robot **ya**; preparar el host Ubuntu (README §5) | Leer `run_club.py` y `verify.py`; definir los casos trampa | Formato del panel sobre el JSON de salida | Estructura de la presentación sobre la rúbrica |
| **H1–3** | Capturar a los 5 actores en `/captura` (README §3); validación en otra sala | Compilar `aimdk_msgs`, `ros2 topic hz` de la cámara | Generar los pases QR (README §4) y probarlos en `/confirmar`; `./run.sh --sim` con las 5 categorías | `/identificar` + log como panel; matriz de confusión | Supuestos de El Nogal y tabla real vs simulado |
| **H3** | `evaluar`: top-1 ≥ 95 %, impostores ≈ 0 %; los 5 actores pasan en `/identificar`. **Punto de control** | | | | |
| **H3–6** (turno de robot) | Probar a los actores frente a la cámara del X2; solo si reconoce peor que el laptop, recalibrar | Sección 6: «linchilinchi», voz, cámara, `--probar` de las 6 categorías; medir a qué distancia lee el QR. **Grabar en video cada flujo** | Casos trampa en la sim | Matriz de confusión con los casos | Grabar el video de respaldo con R2 |
| **H6–8** | Galería final en el host; caso "integrante sin registro" | Recepción en vivo con los 5 actores, 2 vueltas completas | Sim con las 5 categorías y el escalamiento | Panel en vivo junto al robot | Diapositivas finales |
| **H8–9** | **Ensayo completo cronometrado** (todos), anotar fallos | | | | |
| **H9–10** | Arreglar solo lo que falló en el ensayo. **Congelar el código.** Push de robotB | | | | Ensayo de preguntas del jurado |

Regla: si algo no funciona en 30 min, pasa al plan B de esa pieza (sección 5) y sigue.
Después de actualizar el código: `./run.sh --reiniciar`. Si queda corriendo un servidor viejo, las páginas nuevas
llaman a una API vieja y fallan cosas como la voz.

## 3. Casos de prueba (la matriz de confusión del criterio 3)

| # | Quién | Esperado |
|---|---|---|
| 1–5 | Los 5 actores, de frente | VIP, REGULAR, INVITADO, PERSONAL, EXTERNO |
| 6 | Socio con gorra y gafas oscuras | reintento guiado → QR del socio → su categoría |
| 7 | Integrante enrolado sin registro hoy | ESCALAMIENTO ("verificado sin registro") |
| 8 | `personal_1` mostrando un pase de externo | ESCALAMIENTO (el pase contradice el registro) |
| 9 | Persona no enrolada | QR → si no tiene: tercero → recepción |
| 10 | Dos personas en cuadro | "De a una persona a la vez" |
| 11 | Pase QR vencido (`robotA/vision/qr_pass.py --horas -1`) | ESCALAMIENTO |

## 4. Guion de la demo (7 minutos)

1. **(45 s) El problema.** El facial dice miembro / no miembro y hay 5 categorías. Equivocarse manda a alguien
   a un área restringida o trata como desconocido a un socio.
2. **(3 min) X2 en vivo.** Pasan los 5 actores, uno por uno; el panel muestra al lado facial del club (SIMULADO) →
   identidad (REAL) → registro → categoría. Cada flujo se oye y se ve distinto: lo que dice el X2, su cara y el color
   del LED (dorado VIP, azul regular, verde invitado con el nombre de su anfitrión, blanco personal, naranja
   intermitente y reglas de seguridad para el externo). Uno de los actores le habla en inglés y el robot le contesta en inglés; otro dice «no te estoy entendiendo» y
   Cerberus vuelve al español.
3. **(1 min) Casos trampa:** 7 y 8 en vivo → el robot llama a recepción y dice por qué.
4. **(1 min) Club simulado:** la escolta a cada sala y la tabla real vs simulado.
5. **(1 min) Evidencia:** aciertos con validación de otra sesión, matriz de confusión, privacidad y ruta de
   implementación para El Nogal (README §6).

## 5. Riesgos y plan B

| Riesgo | Plan B |
|---|---|
| No hay turno de robot a la hora de la demo | Video grabado en el turno (H3–6) + `./run.sh --sim` + `python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000` en un laptop (lo mismo que el robot, con su cámara y su voz) |
| Un servicio del X2 no responde (LED o caras) | Se quita de `FLOWS` y se muestra el resto; el LED tarda ~5 s, no se lo espera |
| No hay espeak-ng en el host | `sudo apt install espeak-ng`; si no se puede, `--voz tts` (TTS nativo: inglés y chino) |
| Poca luz en el salón | Repetir la validación ahí mismo (`/captura` → 2. Validación) y «Evaluar modelo» |
| ultralytics no instala en el host | No hace falta: con `--api` el host solo manda frames; la visión corre en la máquina de la API |
| Aciertos < 95 % | Más variación para quien falla (otra luz, gafas); nunca bajar `cos_reject` |
| La voz suena fea o baja | Recargar la página. Para mejor calidad en macOS: Ajustes → Accesibilidad → Contenido leído → Voz del sistema → descargar «Samantha (mejorada)» o «Ava (Premium)»; se usan solas. Subir el volumen del equipo |
| Confunde a dos personas | Casi siempre hay fotos de una en la galería de la otra (alguien pasó frente a la cámara al capturar). La captura ya las descarta y avisa; para revisar datos viejos, ver el caso «Vale» en work.md §4. Nunca bajar umbrales para «arreglarlo» |
| El X2 no lee el QR a la distancia de la demo | Pase a pantalla completa con brillo al máximo, acercarlo a la cabeza; o imprimir los pases grandes en papel |

## 6. El X2 en Cerberus: qué hace el robot y qué hacemos nosotros

- **El robot camina solo**, con su propio sistema (control remoto y su interacción de fábrica). Lo único que le
  mandamos mover es el **saludo con la mano** al reconocer a alguien (`SetMcPresetMotion`, robot de pie en Stable Stand).
- **Saludo y tenis:** a cada socio lo saluda por su nombre con la mano y le pregunta «¿Quieres ir a la cancha de
  tenis?»; si dice que sí: «¡Ven, te acompaño a la cancha de tenis!». Probarlo en el turno con 2 socios.
- **Acceso al robot del evento:** usuario `run` (contraseña la da el equipo), cable al puerto Ethernet trasero.
- **Nosotros usamos tres cosas del X2:**
  1. **Cámara:** la de arriba de la cabeza, `/aima/hal/sensor/rgb_head_front_center/rgb_image/compressed`, para cara, cédula y QR; y el lidar del pecho para atender solo a quien está cerca.
  2. **Voz:** la de fábrica (`PlayTts`, también en español si el robot tiene DNS), más la cara (`PlayEmoji`) y el LED (`SetPmuLed`).
  3. **Escucha:** el X2 ya escucha y habla de fábrica. Se le habla diciendo primero **«linchilinchi»** (su palabra de
     activación, siempre en español). Para que lo que dice la persona llegue a nuestra API: modo `only_voice`
     (servicio `SetAgentPropertiesRequest`, clave 2 = `'only_voice'`, y luego `aima em stop-app agent && aima em start-app agent`).
     Desde ahí el robot publica el audio después de la palabra de activación en `/agent/process_audio_output`
     (PCM 16 kHz, `audio_vad_state` 1 = empieza, 3 = termina), y ese audio va a `POST /api/voz`. Para volver al modo
     de fábrica, la misma llamada con `'normal'`.
- **Checklist del turno, desde el panel `/robot`** (`./run.sh` y abrir http://127.0.0.1:8000/robot; cable al puerto
  Ethernet **trasero** del X2, en la MacBook por un dongle USB-C):
  1. **1. Red** (pide la contraseña del Mac: escríbela en la casilla bajo el log) y **2. Clave ssh** (la del robot, una vez).
  2. Arriba del panel, un punto por pieza (cerebro, galería, voz, red, ssh, SDK, cliente, cámara): el primero en
     rojo dice qué falta. **3. Comprobar** da el detalle en el log. Si falta `aimdk_msgs`: **4. Compilar SDK**.
  3. **5. Diagnóstico**: cámara, servicios, foco de audio, escucha («linchilinchi») y un flujo completo.
  4. **Probar los 6 flujos** sin cámara, y luego **6. Recepción en vivo**: la cámara del X2 aparece en el panel y
     cada decisión en la tabla. Grabar la pantalla del panel junto al video del robot. Mientras tanto `/identificar`
     en el computador queda en pausa: solo identifica el robot.
  5. Al terminar: **Detener** y **Voz de fábrica**. Si algo se sale de control: el botón rojo **■ PARAR TODO**.
  6. Si el robot no habla y el log dice `offline_cache_miss`: el robot perdió el DNS (ver work.md §9.x).
  Para ver qué corre en el Orin y qué en el computador: `./deploy/monitor.sh` en otra terminal.
  Lo mismo por terminal: `deploy-mac/deploy-mac.md` (o `deploy/deploy.md` en Linux).

## 7. Al terminar

- `robotB/` no es un repo git todavía. Para subirlo: `cd robotB && git init && git add . && git commit` (el
  `.gitignore` deja fuera `datos/`, videos, entornos y los pesos `.pt`), o copiarlo dentro de `robotA/` y hacer push al repo del equipo.
- Las fotos, la galería, los roles y las cédulas están en la rama privada `cerberus-datos`, separada del código.
  Cada compañero: `./run.sh --traer-datos`. Quien enrole gente nueva: `./run.sh --subir-datos`. El robot no las
  necesita: usa la API de la máquina que las tiene.
- Las fotos y la galería se comparten solo dentro del equipo y se borran al terminar el evento (25-oct-2026),
  como dice `robotA/docs/diseno-cerberus.md`.
