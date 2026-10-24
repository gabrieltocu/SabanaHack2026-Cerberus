# API del club N Club

Guía de consumo para la app del socio, la app del concierge, el panel web de administración y el robot de recepción. El código está en `src/club/` y la entrada de Vercel en `api/club.ts`.

## Convenciones

| Tema    | Regla                                                                                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base    | `https://n-club-five.vercel.app/api`; en el servidor propio con Docker, `http://<IP>:8080/api` (ver `docs/deploy/DOCKER.md`); en local, `http://localhost:<puerto>/api`.                            |
| Formato | JSON en UTF-8. Fechas ISO con zona `America/Bogota`.                                                                                                                                                |
| Errores | `{"error": "codigo", "detalle": "texto para mostrar"}`.                                                                                                                                             |
| App     | `POST /auth/login` entrega un JWT de 1 h; se envía como `Authorization: Bearer <token>`. `POST /auth/refresh` lo renueva. Cinco intentos fallidos en cinco minutos bloquean el login temporalmente. |
| Robot   | Cabecera `X-Bot-Key: <llave>`. La llave y `CERBERUS_QR_SECRET` se entregan por un canal privado, nunca en el repositorio.                                                                           |
| Salud   | `GET /club-health` responde sin autenticación.                                                                                                                                                      |

Cuentas iniciales (clave `nclub-demo-2026`): `sofia@nclub.demo` (socia VIP), `andres@nclub.demo` y `camila@nclub.demo` (socios regulares), `concierge@nclub.demo` (concierge), `admin@nclub.demo` (administración, solo lectura), `edecan@nclub.demo` (edecán) y `personal@nclub.demo` (personal del club).

## App (JWT)

| Método y ruta                                                                                            | Rol                                          |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /auth/login` `{email, clave}` → `{token, usuario}`                                                 | —                                            |
| `GET /me` · `POST /me/push-token` `{token, plataforma}`                                                  | todos (SOCIO, CONCIERGE, ADMIN)              |
| `POST /invitaciones` → incluye `qr_payload`                                                              | SOCIO                                        |
| `GET /invitaciones?fecha=&estado=`                                                                       | SOCIO (las suyas), CONCIERGE y ADMIN (todas) |
| `GET/PATCH/DELETE /invitaciones/{id}`                                                                    | SOCIO dueño; CONCIERGE y ADMIN solo lectura  |
| `PUT /invitaciones/{id}/foto` (multipart: `foto` JPEG ≤ 600 KB, `consentimiento=true`) · `DELETE …/foto` | SOCIO                                        |
| `GET /invitaciones/{id}/qr.png`                                                                          | SOCIO                                        |
| `GET /eventos?despues_de=<seq>&solo_atencion=`                                                           | CONCIERGE y ADMIN; SOCIO (solo los suyos)    |
| `POST /eventos/{id}/atender` · `POST /eventos/{id}/resolver` `{nota}`                                    | CONCIERGE                                    |
| `GET /confirmaciones/pendientes` · `POST /confirmaciones/{id}/responder` `{aprueba}`                     | SOCIO                                        |
| `GET /me/qr` (vence en 5 min)                                                                            | SOCIO                                        |
| `GET /robot/estado` → `{en_linea, ultimo_latido, robot, estado, detalle}`                                | CONCIERGE, ADMIN                             |
| `GET /panel/resumen?fecha=AAAA-MM-DD` (por defecto hoy en Bogotá)                                        | CONCIERGE, ADMIN                             |

El rol ADMIN lee lo mismo que CONCIERGE, pero no atiende ni resuelve eventos ni escribe invitaciones (`403 rol_no_permitido`).

### Resumen del panel

`GET /panel/resumen` devuelve las métricas de un día (hora de Bogotá):

| Campo            | Contenido                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kpis`           | `visitas_hoy` (eventos `LLEGADA` del día), `visitantes_vip` (`LLEGADA` con categoría `VIP`), `invitaciones_activas` (del día en `PROGRAMADA` o `LLEGO`), `alertas_abiertas` (eventos del día con `requiere_atencion` y estado `NUEVO`), `atencion_promedio_min` (media de minutos entre `ts` y `atendido_at`; `null` si ninguno fue atendido). |
| `flujo_por_hora` | Una fila por hora de 6 a 22: `{hora, socios, invitados, personal}`. Socios = `VIP` + `REGULAR`; invitados = `INVITADO`; personal = `PERSONAL` + `EXTERNO`.                                                                                                                                                                                     |
| `por_categoria`  | Llegadas del día por categoría: `VIP`, `REGULAR`, `INVITADO`, `PERSONAL`, `EXTERNO`.                                                                                                                                                                                                                                                           |
| `robot`          | Igual que `GET /robot/estado`.                                                                                                                                                                                                                                                                                                                 |
| `actividad`      | Los 10 últimos eventos del día, el más nuevo primero: `{id, ts, tipo, categoria, nombre, destino, estado}`.                                                                                                                                                                                                                                    |

Una fecha mal formada responde `400 fecha_invalida`.

## Robot (`X-Bot-Key`)

| Método y ruta                                               | Uso                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /bot/registros?fecha=AAAA-MM-DD`                       | `{version, fecha, socios, agenda, turnos, ordenes}` con la misma forma de `registros/*.json`. `agenda` trae solo la fecha pedida y cada turno añade `en_turno` (`true` desde 30 min antes de `inicio` hasta `fin`, hora de Bogotá). |
| `GET /bot/fotos/pendientes`                                 | `{items: [{tipo, id, persona_id, url, ...}]}`: `tipo` es `invitado` (con `invitacion_id`) o `socio` (con `usuario_id` e `invitacion_id: null`). La URL está firmada y vence en 60 s.                                                |
| `GET /bot/fotos/{id}`                                       | JPEG de una invitación o de un usuario (`id` de invitación o de usuario), con `X-Bot-Key`; `404 foto_no_encontrada` si no existe o venció.                                                                                          |
| `POST /bot/fotos/{id}/resultado` `{ok, motivo?}`            | Pasa la foto a `LISTA` (se conserva cifrada) o `RECHAZADA` (se borra). `id` es el de la invitación o el del usuario socio.                                                                                                          |
| `POST /bot/eventos`                                         | Idempotente por `id`; un duplicado responde `200 {"duplicado": true}`.                                                                                                                                                              |
| `POST /bot/confirmaciones` · `GET /bot/confirmaciones/{id}` | Pregunta al anfitrión y consulta la respuesta.                                                                                                                                                                                      |
| `GET /bot/eventos/{id}`                                     | `{estado, atendido_por, atendido_at}` (`NUEVO`, `ATENDIDO` o `RESUELTO`); `404 evento_no_encontrado` si no existe. Se puede consultar cada 2 s.                                                                                     |
| `POST /bot/heartbeat` `{robot, estado, detalle?}`           | Cada 15 s. `estado`: `ok`, `acompanando` o `sin_servicio` (otro valor: `422 latido_invalido`); `detalle` opcional de hasta 200 caracteres. Sin latido en 45 s el robot figura sin conexión (`en_linea: false`).                     |

Los tipos de evento `IMPREVISTO` (por ejemplo, batería baja) y `EMERGENCIA` se aceptan en `POST /bot/eventos`; `EMERGENCIA` no tiene tratamiento propio todavía.

El QR firmado tiene la forma `NCLUB1|tipo|persona_id|Nombre Apellido|exp_unix|firma`, donde la firma son los primeros 20 caracteres hexadecimales de HMAC-SHA256 con `CERBERUS_QR_SECRET` sobre el cuerpo; coincide con `vision/qr_pass.py`.

## Fotos, cédula y perfil

Las imágenes son datos sensibles: se suben con consentimiento, se guardan cifradas (AES-256-GCM) y solo se descargan con sesión (JWT) o con la llave del robot. Todas son JPEG de hasta 600 KB (`413 foto_muy_grande`; otro formato: `415 foto_no_jpeg`) y se envían como `multipart/form-data` con `consentimiento=true` (`400 consentimiento_requerido`). Las descargas responden `image/jpeg` con `Cache-Control: no-store`.

| Método y ruta                                                                                                           | Rol                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `PUT /invitaciones/{id}/foto` · `DELETE …/foto`                                                                         | SOCIO dueño (solo mientras la invitación está `PROGRAMADA`)           |
| `GET /invitaciones/{id}/foto`                                                                                           | SOCIO dueño, CONCIERGE, ADMIN, EDECAN (`404 foto_no_encontrada`)      |
| `PUT /invitaciones/{id}/documento` (multipart: `foto`, `consentimiento=true`, `numero` opcional) · `DELETE …/documento` | SOCIO dueño (solo mientras `PROGRAMADA`)                              |
| `GET /invitaciones/{id}/documento`                                                                                      | SOCIO dueño, CONCIERGE, ADMIN, EDECAN (`404 documento_no_encontrado`) |
| `GET /me/perfil` · `PATCH /me/perfil` `{preferencias_bebida?, asistencia?, nota_asistencia?}`                           | todos los roles con usuario                                           |
| `PUT /me/foto` · `GET /me/foto` · `DELETE /me/foto`                                                                     | todos los roles con usuario                                           |

- `numero` de la cédula: 5 a 15 dígitos (`400 documento_invalido`); si viene, reemplaza `documento` de la invitación. La invitación pasa a `documento_foto: "GUARDADA"` y vuelve a `"NINGUNA"` al borrarla, al cancelar la invitación o al caducar.
- Retención: la foto del invitado y la cédula se conservan hasta que la visita termina (invitación `CANCELADA`, `SALIO` o `VENCIDA`) o pasan 24 h desde la subida, lo que ocurra primero. Después se borran y las descargas responden 404. La foto `RECHAZADA` se borra de inmediato. La foto del socio (`/me/foto`) no vence: es su perfil hasta que la borre.
- `PUT /me/foto` deja `foto_estado: "PENDIENTE"` para que el robot la procese; el estado se lee en `GET /me/perfil`.
- Listas del perfil y de la invitación (`preferencias_bebida`, `asistencia`): hasta 10 textos de hasta 40 caracteres. `nota_asistencia`: hasta 280. `punto_encuentro` de la invitación: hasta 80 caracteres; por defecto es el `lugar`.

````bash
# Invitado: subir su foto y la foto del frente de su cédula (con el número)
curl -s -X PUT $API/invitaciones/$ID/foto -H "Authorization: Bearer $TOKEN" \
  -F "foto=@laura.jpg;type=image/jpeg" -F consentimiento=true
curl -s -X PUT $API/invitaciones/$ID/documento -H "Authorization: Bearer $TOKEN" \
  -F "foto=@cedula.jpg;type=image/jpeg" -F numero=1020304050 -F consentimiento=true

# Descargarlas (concierge, administración, edecán o el socio dueño)
curl -s $API/invitaciones/$ID/foto -H "Authorization: Bearer $TOKEN" -o laura.jpg
curl -s $API/invitaciones/$ID/documento -H "Authorization: Bearer $TOKEN" -o cedula.jpg

# Perfil y foto propia del socio
curl -s -X PATCH $API/me/perfil -H "Authorization: Bearer $TOKEN" --json \
  '{"preferencias_bebida":["cafe sin azucar"],"asistencia":["movilidad_reducida"],"nota_asistencia":"Prefiere el ascensor"}'
curl -s -X PUT $API/me/foto -H "Authorization: Bearer $TOKEN" \
  -F "foto=@yo.jpg;type=image/jpeg" -F consentimiento=true
curl -s $API/me/foto -H "Authorization: Bearer $TOKEN" -o yo.jpg

# Robot: descargar una foto (de invitación o de usuario) y reportar el resultado
curl -s $API/bot/fotos/$ID -H "X-Bot-Key: $CERBERUS_BOT_KEY" -o foto.jpg
curl -s $API/bot/fotos/$ID/resultado -H "X-Bot-Key: $CERBERUS_BOT_KEY" --json '{"ok":true}'
## Actividades y servicios

| Método y ruta                                                   | Rol                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /actividades?fecha=AAAA-MM-DD` (por defecto hoy en Bogotá) | todos los roles con sesión                             |
| `POST /actividades` · `PATCH/DELETE /actividades/{id}`          | PERSONAL, ADMIN                                        |
| `POST/DELETE /actividades/{id}/inscripcion`                     | SOCIO                                                  |
| `GET /bot/actividades?fecha=`                                   | robot: solo las que tienen `robot_puede_ofrecer: true` |
| `GET /servicios?fecha=`                                         | PERSONAL, ADMIN, CONCIERGE, EDECAN                     |
| `POST /servicios` · `PATCH /servicios/{id}`                     | PERSONAL, ADMIN                                        |

Actividades: `id` `act-` + 8 hexadecimales; `hora_hasta` debe ser posterior a `hora_desde` (`400 horario_invalido`) y `cupo` un entero de 1 o más, o `null` (`400 cupo_invalido`). Un día sin ninguna recibe cuatro de ejemplo (cata de vinos, clase de yoga, torneo de squash y brunch familiar). Con el cupo lleno, `POST …/inscripcion` responde `409 cupo_lleno`; repetirla es inocua.

Órdenes de servicio: `id` `OT-` + 4 dígitos y `persona` `ext-` + 6 hexadecimales, generados por el servidor. Estados: `PROGRAMADA`, `EN_CURSO`, `TERMINADA`, `CANCELADA`. Al crear o editar una orden sube la `version` de `GET /bot/registros`, que mezcla en `ordenes` las del día no canceladas con la forma `{persona, nombre, apellido, trato, empresa, motivo, supervisor, area, fecha, lugar: "EXTERNO"}` (`motivo` = `trabajo`, `supervisor` = `responsable`).

```bash
PERSONAL=$(curl -s $API/auth/login --json '{"email":"personal@nclub.demo","clave":"nclub-demo-2026"}' | jq -r .token)
curl -s "$API/actividades?fecha=2026-10-24" -H "Authorization: Bearer $PERSONAL"
curl -s $API/actividades -H "Authorization: Bearer $PERSONAL" --json \
  '{"nombre":"Noche de jazz","descripcion":null,"lugar":"Terraza","fecha":"2026-10-24","hora_desde":"19:00","hora_hasta":"21:00","cupo":20,"robot_puede_ofrecer":true}'
curl -s -X POST $API/actividades/$ACT/inscripcion -H "Authorization: Bearer $TOKEN"   # socio
curl -s "$API/bot/actividades?fecha=2026-10-24" -H "$BOT"
curl -s $API/servicios -H "Authorization: Bearer $PERSONAL" --json \
  '{"nombre":"Hernando","apellido":"Salas","trato":"senor","empresa":"Climatec","trabajo":"Mantenimiento del aire","solicitado_por":"Natalia Rios","responsable":"Mateo Gil","area":"mantenimiento","fecha":"2026-10-24","hora_desde":"09:00","hora_hasta":"12:00","punto_presentacion":"Recepción"}'
````

## Agenda

| Método y ruta                                                                 | Rol                         |
| ----------------------------------------------------------------------------- | --------------------------- |
| `GET /me/agenda?fecha=`                                                       | PERSONAL, EDECAN, CONCIERGE |
| `POST /me/agenda` `{titulo, fecha, hora_desde, nota?}` (crea un recordatorio) | PERSONAL, EDECAN, CONCIERGE |
| `DELETE /me/agenda/{id}` (solo recordatorios propios; si no, `404`)           | PERSONAL, EDECAN, CONCIERGE |

La respuesta junta, ordenada por hora, el turno del día (si la persona tiene uno), las reuniones de su rol, los servicios en los que figura como `responsable` (por nombre) y sus recordatorios.

```bash
curl -s "$API/me/agenda?fecha=2026-10-24" -H "Authorization: Bearer $PERSONAL"
curl -s $API/me/agenda -H "Authorization: Bearer $PERSONAL" --json \
  '{"titulo":"Llamar al proveedor","fecha":"2026-10-24","hora_desde":"10:15","nota":"Pedir hielo"}'
curl -s -X DELETE $API/me/agenda/$REC -H "Authorization: Bearer $PERSONAL"
```

## Reservas del robot

| Método y ruta                                                                         | Rol              |
| ------------------------------------------------------------------------------------- | ---------------- |
| `GET /reservas-robot?fecha=` · `POST /reservas-robot` · `DELETE /reservas-robot/{id}` | ADMIN, CONCIERGE |

Un mismo robot no puede tener dos reservas que se solapen el mismo día (`409 robot_ocupado`). Si `cobertura_recepcion` es `false` y ningún otro robot queda libre en esa franja, la reserva se crea igualmente y la respuesta añade `advertencia`.

```bash
CONCIERGE=$(curl -s $API/auth/login --json '{"email":"concierge@nclub.demo","clave":"nclub-demo-2026"}' | jq -r .token)
curl -s $API/reservas-robot -H "Authorization: Bearer $CONCIERGE" --json \
  '{"evento":"Cata de vinos","fecha":"2026-10-24","hora_desde":"18:00","hora_hasta":"19:30","robot":"x2-1","lugar":"Salón principal","cobertura_recepcion":true}'
```

## Membresía

| Método y ruta                                                                 | Rol     |
| ----------------------------------------------------------------------------- | ------- |
| `GET /membresia/info` → `{niveles: [{nivel, beneficios, invitados_activos}]}` | público |
| `POST /membresia/solicitudes` `{nombre, email, telefono?, interes, mensaje?}` | público |
| `GET /membresia/solicitudes`                                                  | ADMIN   |
| `PATCH /membresia/solicitudes/{id}` `{estado}` (`NUEVA` o `CONTACTADA`)       | ADMIN   |

`interes`: `individual`, `familiar` o `empresarial`. Cada IP puede enviar hasta 5 solicitudes por hora (`429 demasiadas_solicitudes`); el correo se valida (`400 email_invalido`).

```bash
curl -s $API/membresia/info
curl -s $API/membresia/solicitudes --json \
  '{"nombre":"Valentina Cruz","email":"valentina@example.com","interes":"familiar"}'
curl -s $API/membresia/solicitudes -H "Authorization: Bearer $ADMIN"
curl -s -X PATCH $API/membresia/solicitudes/$SOL -H "Authorization: Bearer $ADMIN" --json '{"estado":"CONTACTADA"}'
```

## Administración y datos iniciales

| Método y ruta          | Rol   |
| ---------------------- | ----- |
| `GET /admin/registros` | ADMIN |
| `POST /demo/sembrar`   | ADMIN |

`GET /admin/registros` devuelve `{usuarios, invitaciones_por_estado, servicios, destinos}`: el padrón sin claves, las invitaciones contadas por estado, las órdenes de servicio de hoy y los destinos válidos.

`POST /demo/sembrar` carga los datos iniciales del día: actividades, 3 órdenes de servicio, 2 reservas del robot, 2 solicitudes de membresía, 6 invitaciones con preferencias y punto de encuentro, 10 eventos del robot entre las 08:00 y la hora actual y un latido. Es idempotente por día: la primera vez responde `201`, las siguientes `200 {"ya_sembrado": true}`.

````bash
curl -s "$API/admin/registros" -H "Authorization: Bearer $ADMIN"
curl -s -X POST $API/demo/sembrar -H "Authorization: Bearer $ADMIN"
## Visitas, acompañamiento y relevos

Cada persona que entra al club tiene una **visita** (`vis-xxxxxxxx`) con su contexto (nombre, categoría, anfitrión, destino, punto de encuentro, asistencia, preferencias) y un `recorrido` con cada paso (`ts`, `tipo`, `actor`, `detalle`). Robots y personas continúan la atención sobre la misma visita, sin repetir preguntas. **Llegar al destino cierra el acompañamiento; salir del club cierra la visita.**

Estados: `EN_RECEPCION` → `ACOMPANANDO` → `EN_RELEVO` (pide relevo, sigue con su acompañante hasta la entrega) → `EN_DESTINO` (acompañante `null`) → `CERRADA` (`cierre: "SALIDA"`, `fin`). Una transición inválida responde `409` (`transicion_invalida`, `visita_cerrada`, `entrega_ya_confirmada`, `tarea_ya_aceptada`, `tarea_cerrada`, `tarea_asignada_a_otro`, `tarea_no_rechazable`, `visita_activa`); un cuerpo mal formado, `422` con su código (`visita_invalida`, `motivo_invalido`, `encuentro_invalido`, `evaluacion_invalida`, `incidencia_invalida`, `estado_invalido`).

| Método y ruta                                                                                       | Rol                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /visitas?estado=&fecha=` · `GET /visitas/{id}`                                                 | SOCIO (las de sus invitados y la propia), EDECAN (activas y las que atendió), CONCIERGE y ADMIN (todas); otra: `403` |
| `POST /visitas` `{invitacion_id}` o `{nombre, categoria?, destino, persona_id?}`                    | CONCIERGE, EDECAN, ADMIN                                                                                             |
| `POST /visitas/{id}/asignar` `{acompanante_id}` (usuario EDECAN o id de robot)                      | CONCIERGE, ADMIN                                                                                                     |
| `POST /visitas/{id}/ayuda` `{motivo}` → tarea `AYUDA` urgente                                       | SOCIO anfitrión, EDECAN, CONCIERGE                                                                                   |
| `POST /visitas/{id}/relevo` `{motivo, a?}` → tarea `RELEVO`                                         | EDECAN que acompaña, CONCIERGE                                                                                       |
| `POST /visitas/{id}/recibir` (confirma la entrega en persona)                                       | EDECAN que aceptó la tarea                                                                                           |
| `POST /visitas/{id}/llegada` · `POST /visitas/{id}/salida`                                          | EDECAN acompañante y CONCIERGE · EDECAN, CONCIERGE y ADMIN                                                           |
| `PATCH /visitas/{id}/encuentro` `{punto_encuentro?, ubicacion_anfitrion?}`                          | SOCIO anfitrión                                                                                                      |
| `POST /visitas/{id}/evaluacion` `{robot 1..5, club 1..5, comentario?, transcripcion?}`              | SOCIO anfitrión, EDECAN, CONCIERGE                                                                                   |
| `GET /tareas?estado=` · `POST /tareas/{id}/aceptar` · `POST /tareas/{id}/rechazar`                  | EDECAN (abiertas sin asignar, asignadas a él y las suyas), CONCIERGE y ADMIN leen todas                              |
| `GET /equipo` · `PATCH /me/estado` `{estado, detalle?}`                                             | CONCIERGE, ADMIN, EDECAN · EDECAN                                                                                    |
| `GET /cola`                                                                                         | CONCIERGE, ADMIN                                                                                                     |
| `POST /incidencias` · `GET /incidencias?estado=` · `POST /incidencias/{id}/resolver`                | EDECAN, CONCIERGE, PERSONAL, ADMIN, SOCIO · CONCIERGE, ADMIN, EDECAN · CONCIERGE, ADMIN                              |
| `GET /evaluaciones?fecha=`                                                                          | ADMIN, CONCIERGE                                                                                                     |
| `POST /qr/verificar` `{payload}` → `{valido, motivo, tipo, persona_id, nombre, invitacion, visita}` | EDECAN, CONCIERGE, ADMIN                                                                                             |
| `GET /pase?qr=` · `POST /pase/evaluacion?qr=` · `POST /pase/ayuda?qr=`                              | Público: la credencial es el QR firmado del invitado                                                                 |

Reglas de las acciones:

- **Asignar**: a una persona crea una tarea `ACOMPANAR` asignada (la visita pasa a `ACOMPANANDO` cuando el edecán la acepta); a un robot la visita pasa a `ACOMPANANDO` de inmediato.
- **Relevo**: la visita queda en `EN_RELEVO` con su acompañante actual hasta que otra persona acepta la tarea y confirma con `recibir` (paso `ENTREGA_CONFIRMADA`: quién entregó y quién recibió). Rechazar una tarea asignada la devuelve a `ABIERTA` sin asignar.
- **Cola** (`/cola`): una fila por tarea abierta y por visita `EN_RECEPCION`/`EN_RELEVO` sin acompañante ni tarea; orden por prioridad (`urgente` > `alta` > `normal`) y luego por espera (`espera_min`).
- **Equipo** (`/equipo`): el robot sale del último latido (`ok` → `DISPONIBLE`, `acompanando` → `ACOMPANANDO`, `sin_servicio` → `CARGANDO`, sin conexión → `FUERA_DE_SERVICIO`); cada EDECAN muestra el estado que guardó, `ACOMPANANDO` si acompaña o tiene una tarea aceptada, y `DISPONIBLE` por defecto.
- **Evaluaciones** (`/evaluaciones`): promedios con un decimal y `puntos_clave` (hasta 8 palabras de 5 letras o más, sin conectores en español, las más repetidas en comentarios y transcripciones del día).
- **Pase**: `GET /pase` responde `{invitacion, anfitrion, visita, actividades}`. `invitacion` trae `id`, `persona_id`, `nombre`, `apellido`, `trato` (`senor` o `senora`, para saludar «Bienvenido» o «Bienvenida»), `fecha`, `hora_desde`, `hora_hasta`, `lugar`, `estado` y `punto_encuentro` (`null` si no se fijó). Con el QR del invitado vencido responde `401 qr_vencido`; con uno mal firmado o de otro tipo, `401 qr_invalido`. Evaluar funciona también después de la salida; pedir ayuda exige una visita en curso (`409 sin_visita_activa`).

Rutas del robot (`X-Bot-Key`):

| Método y ruta                                                                                 | Uso                                                                                                 |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /bot/eventos` (`LLEGADA` / `SALIDA` con `persona_id`)                                   | `LLEGADA` abre la visita con el robot como acompañante (o reutiliza la activa); `SALIDA` la cierra. |
| `GET /bot/visitas?activas=1`                                                                  | `{items}` con el contexto de las visitas abiertas (o las de hoy sin el filtro).                     |
| `POST /bot/visitas/{id}/estado` `{estado: "ACOMPANANDO" \| "EN_DESTINO", destino?, detalle?}` | Actualiza el acompañamiento; si acompaña una persona responde `409 acompanante_distinto`.           |
| `POST /bot/visitas/{id}/relevo` `{motivo}`                                                    | Crea la tarea `RELEVO` para las personas del equipo.                                                |
| `POST /bot/evaluaciones` `{visita_id?, robot, club, comentario?, transcripcion?}`             | Evaluación dictada al robot.                                                                        |
| `POST /bot/incidencias` `{tipo, descripcion, lugar?, visita_id?}`                             | `tipo`: `FALLA_ROBOT`, `CONEXION`, `RUTA_BLOQUEADA`, `ASISTENCIA` u `OTRA`.                         |

Flujo del robot a una persona (ejemplo):

```bash
BOT="X-Bot-Key: $CERBERUS_BOT_KEY"
EDECAN=$(curl -s $API/auth/login --json '{"email":"edecan@nclub.demo","clave":"nclub-demo-2026"}' | jq -r .token)

# 1. El robot reconoce a la invitada: se abre la visita con el robot como acompañante.
curl -s $API/bot/eventos -H "$BOT" --json \
  '{"id":"7f0c2a1e-0000-4000-8000-000000000002","ts":"2026-10-24T10:02:11-05:00","tipo":"LLEGADA","categoria":"INVITADO","persona_id":"inv-3f9a1c2b","nombre":"Laura Diaz","anfitrion_id":"andres","destino":"Terraza","avisar":["concierge"],"severidad":"info","requiere_atencion":false}'
VISITA=$(curl -s "$API/bot/visitas?activas=1" -H "$BOT" | jq -r '.items[0].id')

# 2. Hay escaleras: el robot pide relevo humano (la visita pasa a EN_RELEVO).
curl -s $API/bot/visitas/$VISITA/relevo -H "$BOT" --json '{"motivo":"Escaleras: necesita ayuda de una persona"}'

# 3. El edecán ve la tarea, la acepta y confirma la entrega en persona.
TAREA=$(curl -s "$API/tareas?estado=ABIERTA" -H "Authorization: Bearer $EDECAN" | jq -r '.items[0].id')
curl -s -X POST $API/tareas/$TAREA/aceptar -H "Authorization: Bearer $EDECAN"
curl -s -X POST $API/visitas/$VISITA/recibir -H "Authorization: Bearer $EDECAN"
# recorrido: ..., RELEVO_SOLICITADO (x2-1), RELEVO_ACEPTADO, ENTREGA_CONFIRMADA "Entregó Robot x2-1; recibió Mateo Gil"

# 4. Al llegar a la Terraza se cierra el acompañamiento; al salir, la visita.
curl -s -X POST $API/visitas/$VISITA/llegada -H "Authorization: Bearer $EDECAN"
curl -s -X POST $API/visitas/$VISITA/salida -H "Authorization: Bearer $EDECAN"

# Pase del invitado (sin cuenta): el QR firmado de la invitación es la credencial.
curl -s "$API/pase?qr=$(jq -rn --arg q "$QR" '$q|@uri')"
curl -s "$API/pase/ayuda?qr=$(jq -rn --arg q "$QR" '$q|@uri')" --json '{"motivo":"No encuentro a mi anfitrión"}'
````

## Ejemplos

```bash
API=https://n-club-five.vercel.app/api
TOKEN=$(curl -s $API/auth/login --json '{"email":"andres@nclub.demo","clave":"nclub-demo-2026"}' | jq -r .token)

curl -s $API/invitaciones -H "Authorization: Bearer $TOKEN" --json \
  '{"nombre":"Laura","apellido":"Diaz","trato":"senora","fecha":"2026-10-24","hora_desde":"10:00","hora_hasta":"14:00","lugar":"INVITADO","nota":"Viene a almorzar"}'

curl -s -X PUT $API/invitaciones/$ID/foto -H "Authorization: Bearer $TOKEN" \
  -F "foto=@laura.jpg;type=image/jpeg" -F consentimiento=true

BOT="X-Bot-Key: $CERBERUS_BOT_KEY"
curl -s "$API/bot/registros?fecha=2026-10-24" -H "$BOT"
curl -s $API/bot/eventos -H "$BOT" --json \
  '{"id":"7f0c2a1e-0000-4000-8000-000000000001","ts":"2026-10-24T10:02:11-05:00","tipo":"LLEGADA","categoria":"INVITADO","persona_id":"inv-3f9a1c2b","nombre":"Laura Diaz","anfitrion_id":"andres","destino":"Sala de anfitriones","avisar":["anfitrion","concierge"],"severidad":"info","requiere_atencion":false,"motivo":"en la agenda de hoy","evidencia":{"metodo":"rostro","confianza":0.89,"reintentos":0}}'
curl -s $API/bot/eventos/7f0c2a1e-0000-4000-8000-000000000001 -H "$BOT"
# {"estado":"ATENDIDO","atendido_por":"u-natalia","atendido_at":"2026-10-24T10:03:40.000-05:00"}
curl -s $API/bot/heartbeat -H "$BOT" --json '{"robot":"x2-1","estado":"acompanando","detalle":"Guiando a una visita"}'

ADMIN=$(curl -s $API/auth/login --json '{"email":"admin@nclub.demo","clave":"nclub-demo-2026"}' | jq -r .token)
curl -s "$API/panel/resumen?fecha=2026-10-24" -H "Authorization: Bearer $ADMIN"
curl -s $API/robot/estado -H "Authorization: Bearer $ADMIN"
```

Las notificaciones se entregan por sondeo cada 3 s con la app abierta; el envío push del sistema operativo aún no está implementado.

## Prueba de humo

`bash scripts/smoke-club.sh` recorre el flujo completo contra producción (o contra `API=http://localhost:4173/api`): agenda, foto, llegada, evento duplicado, atención del concierge, confirmación del anfitrión, latido y salida. La llave del robot se lee de `~/.config/nclub/bot-key` y no se imprime.
