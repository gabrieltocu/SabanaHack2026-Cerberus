# Flujos de SALIDA de Juan, el robot de recepcion (para la vision de robotB)

Que hace el robot cuando alguien **sale** del club y que necesita de la vision para hacerlo. Sale del codigo:
`hri/dialogo.py: salida()` (frases), `sim/run_club.py: despedir()` (el recorrido en el club simulado) y
`hri/eventos.py` (lo que se le avisa a la API del club).

## 1. Que necesita el robot de la vision

La misma confirmacion de la entrada, mas el sentido:

```json
{"categoria": "INVITADO", "persona_id": "inv-00000001", "confianza": 0.93, "metodo": "rostro", "sentido": "sale"}
```

| Campo | Para que |
|---|---|
| `persona_id` | quien sale (el mismo id de los registros del club y de la galeria) |
| `categoria` | la que se confirmo a la entrada (VIP, REGULAR, INVITADO, EMPLEADO, EXTERNO) |
| `sentido` | `"sale"` cuando la persona va **hacia** la puerta de salida (viene del interior del club y pasa frente al robot). Sin este campo el robot lo trata como una llegada |
| `confianza`, `metodo` | se muestran en el panel, igual que en la entrada |

Como saber que sale (propuesta, a criterio de la vision): la persona aparece desde el lado del pasillo y camina hacia
la entrada; o ya tiene una **visita abierta** en la API (llego hoy y no ha salido: `GET /bot/visitas?activas=1`).
Una sola persona a la vez, cerca (a menos de 1.6 m), igual que en la entrada.

## 2. Que dice y hace el robot, por categoria

1. Se gira hacia la persona y pone el estilo de su categoria (gesto, LED y cara, los mismos de la entrada).
2. Dice la despedida.
3. Hace la accion de salida y avisa a la API.
4. La persona sigue hacia la puerta; el robot vuelve a su puesto.

| Categoria | Dice (frase exacta) | Accion | Evento a la API |
|---|---|---|---|
| VIP | "Hasta pronto, señor/señora {apellido}. Gracias por su visita; lo/la esperamos de vuelta." | — | `SALIDA` VIP -> concierge |
| REGULAR | "Hasta pronto, {nombre}. Gracias por su visita; lo/la esperamos de vuelta." | — | `SALIDA` REGULAR -> concierge |
| INVITADO | "Hasta pronto, {nombre}. Gracias por visitarnos." y "Si le interesa ser socio, recepción con gusto le cuenta cómo." | la invitacion pasa a `SALIO`, deja la agenda y **se borra su rostro de la galeria** | `SALIDA` INVITADO -> anfitrion + concierge (al socio le llega "{nombre} salio") |
| PERSONAL | "Nos vemos pronto, {nombre}. Salida marcada a las {HH:MM}." | marca la salida (hora) | `SALIDA` PERSONAL -> concierge |
| EXTERNO | "Gracias por su trabajo, señor/señora {apellido}. Su salida quedó registrada." | avisa al supervisor que salio (orden de trabajo) | `SALIDA` EXTERNO -> concierge (+ supervisor) |
| Sin registro / contradiccion | "Gracias por su visita. Hasta pronto." | — | ninguno |

Notas:
- El trato (señor/señora + apellido) se usa con VIP y externos; al resto, por el nombre.
- No hace preguntas en la salida: es una despedida corta y la persona sigue caminando.
- El evento `SALIDA` cierra la visita en la API (`POST /bot/eventos` con `persona_id`): Marshal lo usa para pasar la
  invitacion a `SALIO` y para sus indicadores.

## 3. Lo que la vision debe hacer al recibir la salida

| Caso | Que hacer en robotB |
|---|---|
| Invitado sale | **borrar su embedding / fotos de la galeria** (dato biometrico, Ley 1581: solo para esa visita). La API ya no lo trae en la agenda |
| Socio, personal, externo | nada: siguen enrolados |
| Persona desconocida sale (nunca se confirmo) | solo despedida generica; no se registra salida |
| La misma persona pasa dos veces seguidas | no repetir la despedida (en la entrada robotB ya usa 15 s sin duplicados; igual aqui) |

## 4. Casos que faltan (para acordar)

- **Externo que sale sin pasar por recepcion**: hoy solo se avisa al supervisor; si la orden exige firmar salida,
  el robot podria pedirle que pase por recepcion.
- **Invitado que sale antes que su anfitrion** u **sale y vuelve a entrar** el mismo dia: hoy, al salir, deja la
  agenda; si vuelve, el robot no lo encuentra y pregunta quien lo invita (el anfitrion confirma en su app).
- **Encuesta de satisfaccion** al salir (dictada al robot): la API ya tiene `POST /bot/evaluaciones`; no esta en el
  flujo.
- **Socio que sale con invitados**: hoy cada uno se despide por separado (una persona a la vez).

## 5. Como probarlo

```bash
python hri/test_dialogo.py                 # incluye las despedidas de las 4 categorias
python sim/run_club.py --control           # escenario: la invitada sale al final de la demo (boton "Demo completa")
```
