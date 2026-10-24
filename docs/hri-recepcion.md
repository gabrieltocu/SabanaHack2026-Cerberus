# Interaccion humano-robot: recepcion de N Club

Alcance: solo la recepcion (saludar, confirmar quien es, orientar o acompanar) y la despedida a la salida.
Sin bebidas, actividades ni encuestas. Interaccion **solo por voz**. Codigo: `hri/`.

## Principios

- **0 preguntas en el caso normal**: la categoria se confirma con los registros del club, no preguntando.
- **1 pregunta solo cuando falta un dato** (socio sin destino conocido, persona que no esta en ningun registro).
- Cada pregunta se repite **una vez**; si no se entiende, el robot no adivina: **llama a recepcion**.
- Frases cortas. Trato formal (senor/senora + apellido) con VIP y externos; por el nombre con los demas.
  Concordancia de genero segun el registro.
- Senales no verbales por categoria: gesto, color del LED, expresion en la cara del robot.
- Ante contradiccion entre fuentes (p. ej. el club dice MIEMBRO pero no esta en el padron, orden de trabajo
  de otro dia, pase QR que no coincide con el registro) -> recepcion, sin preguntar.

## Confirmacion desde el modelo de vision (camino principal)

El modelo de vision entrega la categoria de una vez (VIP, regular, empleado, visitante o desconocido) con el id de la
persona; los registros aportan la ficha y cruzan que no se contradigan. Contrato y tabla: `docs/contrato-vision.md`.
La tabla de abajo es el camino alterno cuando solo se sabe miembro / no miembro.

## Confirmacion de la categoria (`hri/registros.py`)

| Facial del club (SIMULADO) | Registro donde aparece | Categoria |
|---|---|---|
| MIEMBRO | padron de socios, nivel VIP | VIP |
| MIEMBRO | padron de socios, nivel regular | Regular |
| NO MIEMBRO | agenda de invitados de hoy (anunciado por un socio) | Invitado |
| NO MIEMBRO | turnos del personal | Personal |
| NO MIEMBRO | orden de trabajo vigente hoy | Externo |
| NO MIEMBRO | ninguno | 1 pregunta: "invitado / trabajo aqui / servicio" |
| contradiccion | — | recepcion |

## Flujos de entrada (`hri/dialogo.py`)

| Categoria | Robot | Preguntas | Accion operativa | Gesto / LED |
|---|---|---|---|---|
| VIP | "Buenas tardes, senora Restrepo. Bienvenida de nuevo." "La acompano al Lounge VIP." escolta, "Que disfrute su visita." | 0 (1 si no tiene destino: "¿la acompano al Lounge?") | aviso al concierge | reverencia / dorado |
| Regular | "Hola Carlos, bienvenido." destino conocido o "¿A donde se dirige hoy?"; indica la ruta y senala | 0-1 | registro de ingreso | saludo con la mano / azul |
| Invitado | "Hola Laura, bienvenida a N Club. Andres la espera en la sala de anfitriones. La acompano." | 0 | aviso al anfitrion | bienvenida / verde |
| Personal | "Buenos dias, Marta. Entrada marcada a las 08:57." pasa sola | 0 | marca de entrada | asentir / blanco |
| Externo | "Buenos dias, senor Pena, de Climatec. Viene por la orden 1042: ... Lo espera Jorge, de mantenimiento. Por seguridad lo acompano; use su chaleco." | 0 | aviso al supervisor | senala la ruta / naranja |
| No registrado | "¿Viene invitado, trabaja aqui o viene a prestar un servicio?" -> invitado: "¿Quien lo invita?" y confirma el anfitrion (SIMULADO); personal/externo sin registro -> recepcion | 1-2 | — | — |
| Recepcion | "Un momento, por favor. Ya lo atiende recepcion." | 0 | alerta a recepcion | — / rojo suave |

## Edecan: conversacion mientras acompana (`hri/edecan.py`)

Cuando escolta (VIP, invitado, externo) el robot conversa caminando, por prioridad:
1. Si el visitante se queda atras (> 2.8 m) se detiene, se gira a mirarlo y dice "Por aqui, por favor"; sigue
   cuando vuelve a estar cerca (< 1.9 m).
2. Responde las preguntas del visitante sin detenerse: banos, horario, wifi, parqueadero, cuanto falta (con los
   metros que quedan), gimnasio/piscina. Lo que no sabe no lo inventa: lo remite a recepcion.
3. Cuenta lo que va quedando a cada lado ("A su izquierda, el Lounge VIP; a su derecha, el salon principal").
4. Charla por categoria con pausas: VIP (el concierge ya sabe que llego), invitado (su anfitrion ya sabe),
   externo (normas de seguridad: chaleco, zona autorizada, registrar la salida con su supervisor).
Al llegar: "Llegamos, senora Restrepo. Es aqui, el Lounge VIP." mientras senala la puerta.
Datos del club para las respuestas (horario, wifi, parqueadero): SIMULADOS.

**Con LLM (`hri/llm.py`)**: la charla y las respuestas a preguntas libres las escribe un modelo barato en Amazon
Bedrock (Amazon Nova 2 Lite por defecto, ~0.8 s; `CERBERUS_LLM_MODELO` para otro). Solo conoce los datos del club y
del visitante que se le pasan; las reglas le prohiben inventar, hablar de otras personas, decidir accesos o cambiar
el destino. Las decisiones (categoria, destino, escalamiento, llamar al visitante, anunciar la llegada) siguen en
reglas. Si no hay credenciales, tarda mas de 6 s o falla, responde la version fija: la demo no se cae.

## Motor de decision: imprevistos (`hri/decision.py`)

Un solo motor decide que hacer ante lo que pasa, normal o esporadico. El que mueve el robot (club simulado o X2
real) le reporta lo que percibe (Situacion) y recibe UNA decision con accion, frase, a quien avisar y motivo; el
panel muestra cada decision con su motivo. Reglas fijas en orden de prioridad (el LLM nunca decide):

| Prioridad | Percibe | Decide | Dice / avisa |
|---|---|---|---|
| 0 | bateria <= 8 % | se detiene; recepcion sigue con la persona | "Me queda muy poca bateria..." / recepcion, mantenimiento |
| 1 | no hay ruta en su mapa | avisar y esperar (replanea cada 1 s); a los 45 s recepcion | "El paso esta bloqueado..." / mantenimiento |
| 2 | algo invade la ruta a < 1.5 m (lidar) | detenerse; si sigue a los 3 s, rodear | "Con permiso." / "tomamos otro camino" / "Gracias." |
| 3 | visitante a > 2.8 m | esperarlo mirandolo; a los 15 s recepcion | "Por aqui, por favor." |
| 4 | puerta sin abrir 2 s tras la orden | avisar y esperar con el visitante | "La puerta no abre..." / mantenimiento (+ anfitrion) |
| 5 | bateria <= 20 % y sin acompanar a nadie (si acompana, primero termina) | va al area de mantenimiento del robot, se agacha y espera el cambio | "Voy a cambiar mi bateria..." / recepcion, mantenimiento; latido `sin_servicio` |
| 6 | nada | seguir | |

Imprevistos que simula el club (el robot no los conoce: no estan en su mapa ni en su guion, solo los percibe):
carrito de limpieza en la ruta (lo rodea), mesero parado en el pasillo (espera a que se quite), puerta atascada
(avisa; el anfitrion sale y mantenimiento la libera), valla que cierra el pasillo (sin ruta: avisa, espera y sigue
cuando la retiran). Alarmas y evacuacion: fuera de alcance.

## API real del club (Marshal) en AWS

La imagen de la API corre en podman en la instancia (`setup/aws/nclub_api.sh`: servicio `container-nclub-api` de
systemd, arranca solo al encender la instancia; base en el volumen `nclub-data`). El robot habla con ella con
`hri/api_cliente.py` (mismos metodos que la API simulada; cola de eventos y copia de registros si la API cae).

```bash
python3 sim/run_club.py --api http://127.0.0.1:8080/api          # el club simulado con la API real
python3 sim/run_club.py --check-api http://127.0.0.1:8080/api    # prueba: VIP, invitada de la agenda, desconocido
                                                                  # (Andres aprueba en su app) y empleado fuera de turno
```

Con la API real la hora es la real (turnos y agenda). El dialogo avanza paso a paso: la respuesta del anfitrion llega
de su app cuando llega. La API acepta solo las categorias `VIP`, `REGULAR`, `INVITADO`, `PERSONAL`, `EXTERNO` (o
ninguna) y escribe `senor` / `senora` sin enie: el robot traduce las dos cosas.

### Escalamiento: como funciona y como verlo en la API

1. El robot no puede confirmar a la persona (la vision escalo, contradiccion con el registro, fuera de turno, el
   anfitrion dijo "No lo conozco"...) y dice "Un momento, por favor. Ya lo atiende recepcion".
2. Envia `POST /bot/eventos` tipo `ESCALADO_RECEPCION` (urgente, con el motivo) y **se queda con la persona**.
3. El concierge lo ve en su app como alerta `NUEVO` con el motivo y pulsa **Atender**.
4. El robot consulta `GET /bot/eventos/{id}` cada 2 s; cada 20 s le dice a la persona "Ya casi lo atienden". Al ver
   `ATENDIDO`: "Ya lo atienden en recepcion", la persona pasa al mostrador y el robot vuelve a su puesto.

Si nadie pulsa Atender el robot sigue esperando con la persona (no la deja sola ni abre el acceso).

```bash
python3 tools/ver_api.py              # lo que ve el concierge: robot en linea, indicadores y ultimos eventos
python3 tools/ver_api.py --seguir     # en vivo, cada evento nuevo y cada cambio de estado (Atender)
python3 tools/prueba_escalado.py      # prueba: cedula ajena y anfitrion que rechaza, vistos del lado del robot y de la API
```

## Vision de robotB (Gabo) en la simulacion

`python sim/run_club.py --robotb http://127.0.0.1:8000`: cada decision de robotB (cara + cedula / pase QR) entra como
contrato de vision y pasa por la recepcion completa (registros, dialogo, decision, panel, bitacora, eventos). Detalle
en `docs/contrato-vision.md`.

## Casos con la API del club (`hri/api_sim.py`, SIMULADA mientras la real esta lista)

La simulacion usa una API en memoria con los mismos metodos que tendra el cliente real (docs/mvp-app-api.md). Las
verificaciones de fecha y horario las hace la API; el robot lee el resultado.

| Caso | Que pasa |
|---|---|
| Desconocido (Pedro) | "¿Viene invitado...?" → "¿Quien lo invita?" → confirmacion en la app de Andres (`POST /bot/confirmaciones`, consulta cada 2 s) → aprobada → lo acompana |
| Empleado fuera de turno (Pablo, 06-09 h, llega 09:10) | la API dice `en_turno: false` → contradiccion → `ESCALADO_RECEPCION` → **se queda con el** hasta que el concierge pulsa Atender → pasa al mostrador |
| Llega alguien mientras acompana | al salir el robot manda latido `acompanando` ("entrada sin robot"); quien llega espera a un lado; al volver: "Disculpe la espera" |
| Salida (Laura) | sale de la sala, el robot la reconoce, se despide, evento `SALIDA` (avisa al anfitrion), la invitacion pasa a `SALIO`, deja la agenda y se borra su rostro |
| Bateria baja | entre visitantes: avisa, va al area de mantenimiento, se agacha, espera a mantenimiento, vuelve a HOME |

## Salida (version base, se afina despues)

VIP/Regular: despedida cordial e invitacion a volver · Invitado: despedida + "si le interesa ser socio,
recepcion le cuenta como" · Personal: "Nos vemos pronto", marca salida · Externo: agradecimiento, registra salida
y avisa al supervisor.

## Voz (`hri/voz.py`)

- Habla: voz de Windows **Microsoft Sabina (es-MX)** via SAPI. Para el X2 se genera el WAV en 16 kHz mono 16 bits
  (el TTS propio del X2 solo habla chino e ingles).
- Escucha: microfono -> fin de frase por energia -> **Whisper local** (faster-whisper `base`, sin internet) ->
  palabras clave (`hri/intenciones.py`, tolerante a tildes y errores de transcripcion).
- Prueba en circuito cerrado (voz sintetica): 7/7 intenciones, ~1.1 s por respuesta en CPU. Con personas
  reales y ruido rinde menos: por eso el reintento y el escalamiento.

## Voz en el X2 real (`hri/voz_x2.py`)

Nuestro dialogo decide que decir; el robot lo dice con **su voz** y escucha con **sus microfonos**.
No se usa su asistente conversacional (improvisa y no sigue los flujos): `robots/x2/solo_voz.sh` lo deja en
modo `only_voice` (sin LLM, con voz y deteccion de voz). `./solo_voz.sh normal` lo restaura.

- Hablar: `PlayTts` (voz del robot). El manual dice chino e ingles; el equipo lo ha oido fluido en espanol:
  confirmar en el robot. Si `PlayTts` falla salta solo al **plan B**: WAV en espanol (Piper `es_MX-claude-high`
  en Linux, voz de Windows en PC) enviado por stream al parlante con foco de audio. `--voz-x2 wav` lo fuerza.
- Escuchar: `--mic vad` (defecto) usa la reduccion de ruido y la deteccion de voz del robot
  (`/agent/process_audio_output`, pide decir una vez la palabra de activacion). `--mic crudo` lee el microfono
  sin procesar y corta por energia. En los dos, transcribe nuestro Whisper.
- Calibrar en el robot: `PRIORIDAD_TTS` (6; 7 si interaction_slave lo interrumpe) y `CPS` (velocidad para esperar
  a que termine de hablar antes de escuchar).

## Real vs simulado

Real: dialogo, confirmacion por reglas, voz (hablar y escuchar), reconocimiento facial propio.
Simulado: facial del club, registros del club, confirmacion del anfitrion/supervisor (la responde el operador),
recorridos (club en MuJoCo).
