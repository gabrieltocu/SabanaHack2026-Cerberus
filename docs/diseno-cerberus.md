# Cerberus — Robot de recepcion para N Club (diseno)

Fecha: 2026-10-23 · Evento: Sabana Hack 2026 · Robot: AgiBot X2 Ultra (fisico, acceso por turnos) · Equipo: 3-5 personas, ~24 h

## 1. Idea central

**"Cerberus no interroga, reconoce."** En un club de membresia casi nadie llega por sorpresa: los socios estan
en la base de socios, los invitados los anuncia un socio, el personal tiene turno y los contratistas tienen
orden de trabajo. Cerberus cruza el reconocimiento facial con esa informacion que el club ya tiene y solo
pregunta cuando duda. Si la evidencia no alcanza o se contradice, **no adivina: llama a recepcion**.

## 2. Supuestos declarados sobre N Club

El reto no define espacios ni permisos; suponemos un club de ciudad tipico: edificio de varios pisos con
restaurantes, salones de eventos, piscina, gimnasio, spa y habitaciones para huespedes; membresia por accion
(familiar, persona juridica, empresarial) con estudio de seguridad al ingresar; convenios con otros clubes.

Supuestos (se dicen asi en la presentacion):

| Supuesto | Por que |
|---|---|
| **VIP** = socios de accion empresarial/persona juridica, Junta Directiva y socios con servicio de concierge | El reto no define el nivel VIP; es la lectura razonable de "membresia VIP" |
| El club tiene: base de socios con nivel, **agenda de invitados** (el socio pre-registra al invitado con nombre y selfie consentida en la app), **turnos del personal** y **ordenes de trabajo** de contratistas | Son registros que un club con estudio de seguridad ya maneja; se simulan con datos de prueba |
| Los miembros de clubes con convenio y los huespedes del hotel entran como **invitados** | Encajan en "llegan por invitacion" |
| El robot **no reemplaza a seguridad**: orienta y escala; seguridad y recepcion siguen presentes | Coherente con la cultura de seguridad del club |

## 3. Arquitectura

Un "cerebro" independiente del robot y adaptadores intercambiables, para desarrollar sin el X2 y conectarlo
solo en los turnos de robot.

```
 camara (laptop o X2) ──► [Facial propio REAL]  ──┐
 [Facial del club SIMULADO: miembro/no] ──────────┤
 [Registros del club SIMULADOS: socios, agenda,    ├──► [Cerebro: fusion de evidencia + politica] ──► [Flujos x5 + escalamiento]
  turnos, OT] ────────────────────────────────────┤                     │                                 │
 [Interaccion: 1 pregunta en pantalla/voz,         │                     ▼                                 ▼
  QR de carne / OT] ───────────────────────────────┘          [Panel en vivo + KPIs]      [Adaptador de acciones]
                                                                                           ├─ X2 real (ROS 2)
                                                                                           ├─ Club simulado (MuJoCo)
                                                                                           └─ Consola (texto)
```

| Unidad | Que hace | Interfaz | Real/simulado |
|---|---|---|---|
| `facial_club` | Imita al sistema del club: devuelve `{miembro: bool, confianza}` | funcion | **Simulado** (lo pide el reto) |
| `facial_propio` | Reconoce a la persona con el **dataset propio** del equipo (embeddings) | `identificar(frame) -> (persona_id, confianza)` | **Real** |
| `registros` | Socios (nivel), agenda de invitados, turnos, ordenes de trabajo | JSON de prueba | Simulado (datos de prueba) |
| `cerebro` | Fusiona evidencia, decide categoria, pregunta minima o escalamiento | `decidir(evidencia) -> Decision` | **Real** (funcion pura, con pruebas) |
| `flujos` | Guion de orientacion por categoria (texto, gesto, LED, cara, accion operativa) | `flujo(categoria, persona) -> [Accion]` | Real |
| `acciones` | Ejecuta acciones en X2, sim o consola | `decir`, `gesto`, `led`, `cara`, `notificar`, `guiar` | X2: real · sim: simulado |
| `panel` | Muestra en vivo evidencia, probabilidades, decision, lo real vs simulado; KPIs | web local | Real |

## 4. Confirmacion de la categoria (20 pts)

Evidencias y peso:

| Evidencia | Fuente | Distingue |
|---|---|---|
| Miembro / no miembro | facial del club (simulado) | grupo socios vs no socios |
| Identidad + confianza | facial propio (real) | quien es |
| Nivel de membresia | base de socios | VIP vs regular |
| Esta en la agenda de hoy (invitado / OT) | agenda | invitado vs externo |
| Tiene turno ahora | turnos | personal |
| Respuesta a 1 pregunta ("Vengo invitado / Trabajo aqui / Vengo a un servicio") | interaccion | desempata no socios |
| QR del carne o de la orden de trabajo | camara | confirma personal / externo |

Politica (umbrales ajustables, mostrados en el panel):
1. **Rapida (0 preguntas)**: facial club = miembro y facial propio identifica a un socio con confianza >= 0.85 -> categoria por nivel (VIP/regular). No miembro identificado en la agenda/turno de hoy con confianza >= 0.85 -> invitado/externo/personal.
2. **Pregunta minima (1 pregunta)**: confianza 0.60-0.85, o no miembro sin coincidencia en agenda -> una pregunta con 3 opciones; se verifica la respuesta contra el registro correspondiente (y QR para personal/externo).
3. **Escalamiento a recepcion**: confianza < 0.60, la respuesta no coincide con ningun registro, o hay contradiccion (p. ej. facial del club = miembro pero la identidad es de un contratista; dice ser personal pero no tiene turno). El robot saluda, pide un momento y notifica a recepcion con la evidencia; **nunca abre acceso por defecto**.

Casos de prueba obligatorios (los 5 normales + trampas): miembro con gafas/gorra (baja confianza), invitado que
llega sin estar en agenda, "personal" sin turno, contratista con OT vencida, socio regular que pide ir al
salon VIP.

## 5. Cinco flujos de orientacion (20 pts) + escalamiento

| Categoria | Necesidad al llegar | Lo que hace Cerberus | Identidad visual | Accion operativa | Objetivo de tiempo |
|---|---|---|---|---|---|
| **VIP** | Ser reconocido, cero friccion | Saluda por nombre, reverencia, ofrece acompanar a su destino (reserva del dia) | LED dorado, cara "adoracion" | Aviso al concierge | < 10 s |
| **Regular** | Entrar rapido | Saludo por nombre, indicacion breve (piso/espacio segun su reserva o el mas usado) | LED azul, saludo con la mano | Registro de ingreso | < 8 s |
| **Invitado** | Sentirse bienvenido, saber a donde ir | Bienvenida por nombre, explica reglas basicas para invitados, lo acompana a la sala de anfitriones | LED verde, cara "feliz", gesto de bienvenida | Avisa al socio anfitrion | < 20 s + escolta |
| **Personal** | Llegar a su turno sin rodeos | Saludo corto, marca entrada, lo dirige al acceso de empleados | LED blanco, sin conversacion | Marcacion de turno | < 5 s |
| **Externo** | Llegar al sitio de trabajo con seguridad | Verifica OT, entrega reglas de seguridad, lo escolta a la entrada de servicio/zona tecnica | LED naranja, senala la ruta | Avisa al supervisor de la OT | < 20 s + escolta |
| **Escalamiento** | No quedar en un limbo | "Un momento, ya viene alguien de recepcion" | LED rojo suave, cara "pensando" | Alerta a recepcion con evidencia | inmediato |

Idioma: el TTS nativo del X2 solo soporta chino e ingles; el espanol se genera en el laptop (TTS) y se envia
como audio PCM al robot (o se reproduce en el laptop si no hay turno de robot).

## 6. Privacidad

Solo se guardan **embeddings**, no fotos; el dataset propio se arma con consentimiento firmado de cada persona;
la selfie del invitado se borra al terminar la visita; el procesamiento es local; quien no quiera facial usa
el QR. Alineado con la Ley 1581 de 2012 (habeas data). El panel muestra nombres, no imagenes.

## 7. Como sabe el club si funciona (KPIs)

Panel con: tiempo desde llegada hasta orientacion por categoria, % resuelto sin preguntas / con 1 pregunta /
escalado, aciertos de categoria en la bateria de pruebas (matriz de confusion de ~30 casos), y satisfaccion
(pulgar arriba/abajo opcional en pantalla).

## 8. Demostracion (15 pts) y frontera real/simulado

1. **Robot X2 en vivo** con 2-3 personas del dataset propio: facial real -> decision -> voz, LED, cara y gesto en el X2.
2. **N Club simulado (MuJoCo)** con las 5 categorias completas, puertas por categoria y escoltas; HUD con la decision.
3. **Casos trampa en vivo** (escalamientos) y la matriz de confusion.
4. Diapositiva con tabla "real vs simulado" (la de la seccion 3).

Plan B si no hay turno de robot al momento de la demo: el mismo cerebro mueve el club simulado y la consola;
se muestra un video corto grabado del X2 en un turno anterior.

## 9. Fuera de alcance

Navegacion autonoma real del X2 por el edificio (se simula), conexion con sistemas reales del club,
reconocimiento de voz libre (la unica pregunta es de opcion multiple en pantalla/voz con palabras clave).

## 10. Pruebas

- `cerebro`: pruebas unitarias por regla y por caso trampa (funcion pura, sin robot).
- `facial_propio`: precision en un set de validacion del dataset propio (fotos no usadas al registrar).
- Integracion: escenario del club simulado con `--check` (ya existe para los 5 flujos fijos).
- X2: checklist en cada turno (decir, LED, cara, gesto) antes de la demo.
