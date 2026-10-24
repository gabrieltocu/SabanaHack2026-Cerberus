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

## Real vs simulado

Real: dialogo, confirmacion por reglas, voz (hablar y escuchar), reconocimiento facial propio.
Simulado: facial del club, registros del club, confirmacion del anfitrion/supervisor (la responde el operador),
recorridos (club en MuJoCo).
