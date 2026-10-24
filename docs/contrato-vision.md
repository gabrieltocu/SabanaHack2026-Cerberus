# Contrato: modelo de vision -> recepcion

Lo que el modelo de vision le entrega a la recepcion por cada persona frente al robot (un dict / JSON):

```json
{"categoria": "VIP", "persona_id": "sofia", "confianza": 0.96}
```

| Campo | Valores | Obligatorio |
|---|---|---|
| `categoria` | `VIP`, `REGULAR`, `EMPLEADO`, `VISITANTE`, `DESCONOCIDO`, `ESCALAMIENTO` (tambien se aceptan `MIEMBRO` = regular, `INVITADO`, `EXTERNO`/`CONTRATISTA`) | si |
| `persona_id` | id del enrolamiento (el mismo de los registros del club: `registros/*.json`) | si, salvo `DESCONOCIDO` |
| `confianza` | 0..1 (se muestra en el panel) | no |
| `metodo` | como confirmo: `rostro`, `rostro + cedula`, `rostro + pase QR` (se muestra en el panel) | no |
| `motivo` | por que escalo (con `ESCALAMIENTO`) | no |

Si la confianza es baja, la vision no entrega nada todavia: usa su propia escalera (reintento guiado, pase QR, tercero) o
manda `DESCONOCIDO`.

## Que hace la recepcion con eso (`hri/registros.py: desde_vision`)

La categoria la pone la vision; los registros solo aportan la ficha (nombre, trato, anfitrion, orden de trabajo) y
cruzan que no se contradigan:

| Vision dice | Busca en | Resultado |
|---|---|---|
| `VIP` / `REGULAR` | padron de socios | ese nivel con su ficha; si el padron dice otro nivel o no esta -> recepcion |
| `EMPLEADO` | turnos del personal | personal con su turno; sin turno -> recepcion |
| `VISITANTE` | agenda de invitados, luego ordenes de trabajo de hoy | invitado o externo; si no esta en ninguno -> "Bienvenido. ¿Quien lo invita?" y confirma con el anfitrion |
| `DESCONOCIDO` | — | "¿Viene invitado, trabaja aqui o viene a prestar un servicio?" |
| `ESCALAMIENTO` | — | la vision ya decidio que no alcanza (cedula o pase de otra persona, sin documento): recepcion, sin preguntar, con su motivo |
| algo que contradice el registro (p. ej. `EMPLEADO` pero es socio; orden de otro dia) | — | recepcion, sin preguntar |

Probar sin camara: `python hri/recepcion.py --persona marta --vision EMPLEADO --teclado`.

## robotB (la vision de Gabo) como fuente

`hri/vision_robotb.py` lee las decisiones finales de robotB (`GET /api/registros`, y el anfitrion de `GET /api/personas`)
y las traduce a este contrato: `PERSONAL` -> `EMPLEADO`, `ESCALAMIENTO` -> `ESCALAMIENTO`, el resto igual; `metodo` sale
del estado (`RECONOCIDO`, `CONFIRMADO_CEDULA`, `CONFIRMADO_QR`). No toca el codigo de robotB.

```bash
python sim/run_club.py --robotb http://127.0.0.1:8000   # con robotB corriendo (./run.sh en robotB)
python sim/run_club.py --check-robotb                   # sin robotB: personal, invitado y escalamiento de prueba
```

Cada persona que decide robotB entra por la puerta del club simulado y pasa por la recepcion completa: registros,
dialogo, motor de decision, panel, bitacora y eventos a la API. En el modo manual tambien se puede escribir
`vision EMPLEADO thomas 0.9` en la terminal.

**SIMULADO:** si robotB reconoce a alguien que los registros de prueba no tienen (las personas del equipo), la API
simulada lo agrega al registro del dia con esa categoria (`ApiSimulada.agregar`), como lo cargaria el club. Se quita
cuando la API real tenga a esas personas. robotB no guarda el trato (senor/senora): esas personas se saludan por su
nombre y con concordancia masculina por defecto.

