> **Cerberus · Sabana Hack 2026** — equipo: Andres Azcona, Gabriel José Torres Cuellar y Marshall Gomez.
>
> | Rama | Qué tiene |
> |---|---|
> | [`main`](../../tree/main) | N Club simulado en MuJoCo, recepción por voz (HRI), visión y registros simulados del club |
> | [`robot-x2`](../../tree/robot-x2) | Juan en el AgiBot X2 Ultra real: cerebro (FastAPI), cliente ROS 2, voz, RAG local y despliegue |
>
> Las fotos, cédulas, pases y demás datos personales del equipo no se publican.

# Cerberus — robot de recepcion para N Club

Sabana Hack 2026 · reto "El reto de Cerberus" (N Club) · robot AgiBot X2 Ultra

> **"Cerberus no interroga, reconoce."** El reconocimiento facial del club solo dice *miembro / no miembro*.
> Cerberus lo cruza con lo que el club ya sabe (socios, invitados anunciados, turnos, ordenes de trabajo),
> pregunta solo cuando duda y, si la evidencia no alcanza o se contradice, **llama a recepcion: nunca abre
> acceso por defecto**.

## Link Presentación:
[https://canva.link/cxd4nircftk3omf](https://canva.link/cxd4nircftk3omf)


## El simulador (lo principal)

```bash
pip install -r requirements.txt
python sim/run_club.py --control      # club en la ventana de MuJoCo + tablero en http://127.0.0.1:8090
```

El club se ve en la ventana de MuJoCo (camara que sigue al robot; si la mueves con el mouse te la deja 15 s):
lobby, pasillo y 5 salas; afuera la piscina y la cancha de tenis; arriba el segundo piso (gimnasio, terraza bar y
spa), semitransparente, que se oculta con el boton "2.º piso".
Juan acompana a VIP, invitados y contratistas (a la piscina, la cancha, o en ascensor al 2.o piso, con un mapa SLAM
por piso); al socio y al personal les indica el camino. Prueba: `python sim/run_club.py --check-lugares`.

Un escenario por rol (tablero: Escenarios) y su video:
`python sim/run_club.py --video vip.mp4 --escenario rol_vip` (rol_vip, rol_socio, rol_invitado, rol_personal,
rol_contratista, rol_sin_registro). El
tablero del navegador es para controlar: subtitulos, el panel de decision, las camaras del robot, lo que percibe (lidar + SLAM), la bitacora y las apps del concierge y del anfitrion.
Botones para lanzar **escenarios** (manana normal, hora pico, gente sin cita, problemas en el camino, pasillo
cerrado, turnos, bateria baja, el concierge tarda...), **mandar personas** una a una e **imprevistos**. El robot
atiende a una persona a la vez: la mide con la camara delantera y el lidar y le pide que se acerque para verla bien;
los demas hacen fila afuera.

- Todo lo que hace el robot (flujos, frases, gestos, decisiones, eventos, LLM): [docs/cerebro-robot.md](docs/cerebro-robot.md)
- Flujos de salida (para la vision): [docs/flujos-salida.md](docs/flujos-salida.md)
- Con la API real del club: `--control --api http://127.0.0.1:8080/api` · pruebas: `python sim/run_club.py --check`

## El reto

- Reto y rubrica: [docs/reto-cerberus.md](docs/reto-cerberus.md)
- Diseno (supuestos, confirmacion, 5 flujos, privacidad, KPIs, demo): [docs/diseno-cerberus.md](docs/diseno-cerberus.md)
- Interaccion por voz en la recepcion (HRI): [docs/hri-recepcion.md](docs/hri-recepcion.md)

## Estructura

| Carpeta | Que hay |
|---|---|
| `sim/` | N Club en MuJoCo: lobby, recepcion, 5 salas con puertas por categoria; el X2 (modelo oficial) recibe, hace el gesto de cada categoria, arma su mapa con un lidar simulado (SLAM: mapa de ocupacion + pose por alineacion de escaneos) y planea sus rutas sobre el (A*, esquiva obstaculos, replanea en cada giro); escolta conversando como edecan (LLM en Bedrock con respaldo fijo: charla, lo que queda a cada lado, responde preguntas, espera si el visitante se queda), se para al lado de la puerta y la senala, y vuelve a HOME; ante imprevistos que no conoce (carrito, persona en el pasillo, puerta atascada, pasillo cerrado, alarma) decide con `hri/decision.py` y muestra el motivo |
| `vision/` | Reconocimiento facial propio (YuNet + SFace), facial del club simulado, enrolamiento con consentimiento, evaluacion/calibracion y escalera de verificacion (reintento guiado -> pase QR firmado -> tercero -> recepcion) |
| `hri/` | Recepcion por voz: confirmacion de la categoria con los registros, dialogo de entrada y salida, voz en espanol (Windows SAPI) y reconocimiento de voz local (Whisper); en el X2 real habla con su propia voz y escucha con sus microfonos (`voz_x2.py`) |
| `registros/` | Datos simulados del club: socios, agenda de invitados, turnos, ordenes de trabajo |
| `assets/x2_urdf/` | Modelo oficial del AgiBot X2 para MuJoCo (v1.3.0 Ultra, v1.4.0 Ultra -N/EDU) y su version lite |
| `robots/d1/` | Teleop por teclado del cuadrupedo D1 + SDK oficial (`robots/d1/sdk`) |
| `tools/` | `decimate_x2.py`: version lite del modelo del X2 para laptops |
| `setup/aws/` | Maquina GPU en AWS (simulacion y entrenamiento) |

## Puesta en marcha

Todo lo necesario esta en el repo (modelo del X2, modelos de vision, SDK del D1):
```bash
pip install -r requirements.txt
```

### Club simulado
```bash
python sim/run_club.py              # escenario: 5 categorias + desconocido, fuera de turno, salida, bateria baja
python sim/run_club.py --robotb http://127.0.0.1:8000   # recibe a quien decida robotB (cara + cedula / QR)
python sim/run_club.py --api http://127.0.0.1:8080/api   # con la API real del club (en AWS: setup/aws/nclub_api.sh)
python sim/run_club.py --video demo.mp4 --speed 2   # graba la demo completa en MP4 (titulos, subtitulos, camara del robot)
python tools/ver_api.py --seguir                     # lo que recibe la API del club, en vivo (vista del concierge)
python sim/run_club.py --manual     # comandos por terminal: vip regular invitado personal externo home demo
python sim/run_club.py --check      # sin ventana: verifica salas, puertas y HOME
```
En laptops con GPU integrada: `CERBERUS_MODELO=lite` (misma fisica, render ~10x mas rapido).

### Recepcion por voz
```bash
python hri/recepcion.py --camara                 # camara -> verificacion -> conversacion por voz
python hri/recepcion.py --persona sofia          # ensayo sin camara (sofia, carlos, laura, marta, luis)
python hri/recepcion.py --persona luis --hoy 2026-10-24   # la orden de trabajo de Luis es del dia de la demo
python hri/recepcion.py --persona sofia --salida # despedida
python sim/run_club.py --voz                     # el club simulado habla en espanol
# AWS_PROFILE=ia (o rol con Bedrock) activa el LLM del edecan; ventana 'Percepcion del robot' = mapa del SLAM
# ventana 'Panel de decision': lo que dice la vision, que registro lo confirma, el flujo que sigue y cada decision
# En el X2 (contenedor de PC2 con el SDK): primero robots/x2/solo_voz.sh y decir una vez la palabra de activacion
python3 hri/recepcion.py --persona carlos --x2               # voz del robot (PlayTts), plan B WAV si falla
python3 hri/recepcion.py --persona carlos --x2 --voz-x2 wav  # forzar plan B (Piper) si su espanol no convence
python3 hri/recepcion.py --persona carlos --x2 --mic crudo   # microfono crudo sin palabra de activacion
```
Pruebas: `python hri/test_dialogo.py` (flujos) y `python hri/test_voz.py` (voz en circuito cerrado), `python hri/test_voz_x2.py` (adaptador X2 con ROS simulado), `python hri/edecan.py` (edecan), `python hri/llm.py` (LLM sin red; `--real` lo llama), `python sim/percepcion.py` (SLAM y rutas), `python hri/decision.py` (motor de decision).

### Vision
```bash
python vision/enroll.py --id ana --nombre "Ana Perez" --consentimiento --camara 0
python vision/live.py               # n: sin pase  s/x: tercero confirma/niega  r: reiniciar  q: salir
python vision/qr_pass.py --tipo invitado --id laura --nombre "Laura Diaz"   # pase de prueba
```
Pruebas (con LFW como dataset publico de reemplazo: http://vis-www.cs.umass.edu/lfw/ , carpeta `lfw/` con una subcarpeta por persona):
```bash
cd vision && python test_vision.py RUTA/lfw && python test_fallback.py RUTA/lfw && python test_session.py RUTA/lfw
```

## Que es real y que es simulado

| Pieza | Estado |
|---|---|
| Reconocimiento facial propio (dataset del equipo) | **Real** — 99.9 % de identificacion en LFW; umbral calibrado: 1.1 % de desconocidos aceptados |
| Sistema facial del club (miembro / no miembro) | **Simulado** (lo permite el reto) |
| Registros del club (socios, agenda, turnos, OT) | Simulados con datos de prueba |
| Dialogo de recepcion y confirmacion por reglas | **Real** — 5 flujos + no registrado + recepcion + salida |
| Voz (hablar en espanol, entender por palabras clave) | **Real** — local, sin internet |
| Confirmacion del anfitrion / supervisor | Simulada (la responde el operador) |
| Escalera de verificacion y pases QR firmados | **Real** |
| N Club y recorridos del robot | Simulado (MuJoCo); el robot camina sostenido por un arnes virtual |
| X2 fisico: voz y microfonos | Codigo listo y probado con ROS simulado; falta probar en el robot |
| X2 fisico: gestos, LED, cara | Pendiente de turno con el robot |

## Estado (23-oct-2026)

Hecho: club simulado manejado por el dialogo real (confirmacion con registros), gestos, HOME y modo manual;
vision con escalera de verificacion; recepcion por voz (entrada y salida).
Siguiente: probar la voz en el X2; gestos, LED y cara del X2; enrolar al equipo; presentacion.
