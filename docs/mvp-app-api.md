# App + API del club (MVP) — especificacion para desarrollo

Para: Marshal · De: equipo Cerberus · Fecha: 2026-10-23 · Estado: **MVP, recortar antes que agrandar**

## 1. Que es

Una **app web movil (PWA)** y una **API** que conectan a las personas del club con el robot de recepcion:

- El **socio** (VIP o regular) **registra invitados**, con foto o sin foto, y se entera cuando llegan.
- El **robot** consulta esa agenda para reconocer al invitado y le **avisa a la app** de lo que pasa en la entrada.
- El **concierge / recepcion** recibe las alertas del robot en su app y las atiende.

Hoy esos datos viven en archivos de prueba (`registros/*.json`). **La API los reemplaza**: el robot deja de leer
JSON y lee de la API (y si la API cae, sigue con su copia local: la demo no se cae).

```
  App socio (PWA) ─┐                          ┌─ GET  /bot/registros   (agenda, socios, turnos, ordenes)
                   ├──►  API (HTTPS)  ◄───────┤─ GET  /bot/fotos/pendientes  → el robot saca el embedding
  App concierge ───┘      + base de datos     ├─ POST /bot/eventos     (llego alguien, escalo, imprevisto)
        ▲   push / polling 3 s                └─ POST /bot/confirmaciones  (el robot le pregunta al anfitrion)
        └───────────── alertas ◄── el robot (laptop / X2): solo llamadas SALIENTES hacia la API
```

**Regla de oro**: el robot corre en un laptop en la red del evento, **no es alcanzable desde internet**. Todo lo
hace por llamadas salientes (polling). La API nunca llama al robot: no hay webhooks hacia el robot.

## 2. Alcance

| Dentro del MVP | Fuera (no hacerlo ahora) |
|---|---|
| Login por rol (socio, concierge) | Registro publico de usuarios (los socios vienen del padron: se cargan por seed) |
| Socio: crear/editar/cancelar invitados, con foto opcional | Pagos, reservas, menus, chat |
| Socio: QR de invitacion para compartir (sin foto) | Gestion de personal y ordenes de trabajo por pantalla (seed/JSON) |
| Concierge: alertas en vivo + llegadas de hoy + esperados | Imagenes del visitante en las alertas |
| Notificaciones push + polling | Reportes, KPIs, multi-club, multi-idioma |
| API del robot (lo que se lista abajo) | Panel de administracion |

Prioridades: **P0** = sin esto no hay demo · **P1** = si da el tiempo · **P2** = despues.

## 3. Roles

| Rol | Que puede | Que ve |
|---|---|---|
| `SOCIO` (nivel `VIP` o `REGULAR`) | Crear/editar/cancelar **sus** invitados, responder confirmaciones | Sus invitaciones y los avisos de sus invitados |
| `CONCIERGE` | Atender/resolver alertas | Todas las alertas, todas las llegadas y todos los esperados de hoy (solo lectura) |
| `BOT` (maquina) | Solo endpoints `/bot/*` | — |

Auth app: `POST /auth/login` → JWT corto (1 h, refresh). Auth robot: header `X-Bot-Key: <llave larga>` (rotable, en variable de entorno).
Usuarios precreados por seed (email + clave inicial). Sin "olvide mi clave" en el MVP.

## 4. Flujos clave

1. **Invitado con foto** (P0): el socio crea la invitacion + sube foto + marca el consentimiento → estado de foto `PENDIENTE`
   → el robot descarga la foto, calcula el embedding y reporta `ok` o el motivo (poca luz, de perfil…) → `LISTA` o `RECHAZADA`
   (el socio ve el motivo y sube otra) → la API **borra la foto de inmediato**. El robot lo reconoce al llegar.
2. **Invitado sin foto** (P0): la invitacion genera un **QR firmado** (mismo formato que ya lee el robot, §7.3).
   El socio lo comparte (Web Share → WhatsApp). El invitado lo muestra al robot.
3. **Llegada** (P0): el robot verifica a la persona → `POST /bot/eventos` tipo `LLEGADA` → la invitacion pasa a `LLEGO`,
   el socio recibe push ("Laura Diaz llego. El robot la acompana a la sala de anfitriones") y el feed del concierge se actualiza.
4. **Escalamiento** (P0): el robot no logra confirmar o ve una contradiccion → `ESCALADO_RECEPCION` (urgente) → push al
   concierge con el **motivo** y la evidencia → el concierge pulsa **Atender**.
5. **Anfitrion confirma** (P1): visitante desconocido dice "me invita Andres" → el robot crea una confirmacion → push al
   socio con **Si lo espero / No lo conozco** → el robot consulta la respuesta (2 s) y sigue o escala. Sustituye las teclas
   `s` / `x` que hoy simulan esa respuesta.
6. **Cancelar o terminar** (P0): al cancelar, vencer (fin del dia) o salir el invitado, deja de estar en la agenda y el
   robot borra su embedding. No hay endpoint extra: el robot compara su galeria con la agenda (§7.1).

## 5. Modelo de datos

Ids: `persona_id` es el mismo que usa el reconocimiento facial del robot (carpeta en su galeria). Para socios es un
nombre corto (`sofia`, `andres`); para invitados lo genera la API: `inv-` + 8 hex (solo `[a-z0-9-]`).

| Tabla | Campos |
|---|---|
| `usuario` | id, rol, `persona_id` (socios), nombre, apellido, `trato` (`senor`/`senora`), email, clave_hash, `nivel` (`VIP`/`REGULAR`), `accion` (familiar/empresarial), `destino` (opcional), activo |
| `invitacion` | id, `persona_id` (`inv-…`), anfitrion_id → usuario, nombre, apellido, trato, documento (opcional), fecha, hora_desde, hora_hasta, `lugar` (destino, por defecto `INVITADO`), nota, `estado`, `foto_estado`, foto_motivo, consentimiento_at, creada_at |
| `foto_temporal` | invitacion_id, bytes (cifrados), subida_at — se borra al recibir el resultado del robot o a las 24 h |
| `evento` | seq (autoincremental), id (uuid que pone el robot), ts, tipo, categoria, persona_id, nombre, anfitrion_id, destino, avisar[], severidad, requiere_atencion, motivo, evidencia (JSON), `estado`, atendido_por, atendido_at, nota |
| `confirmacion` | id (uuid del robot), anfitrion_id, visitante_desc, evento_id, `estado`, creada_at, vence_at, respondida_at |
| `push_token` | usuario_id, token/suscripcion, plataforma |
| `turno`, `orden_trabajo` | solo seed (mismos campos que `registros/turnos.json` y `ordenes.json`) |

Estados: `invitacion.estado` = `PROGRAMADA → LLEGO → SALIO` · `CANCELADA` · `VENCIDA` ·
`foto_estado` = `NINGUNA` · `PENDIENTE` · `LISTA` · `RECHAZADA` ·
`evento.estado` = `NUEVO → ATENDIDO → RESUELTO` · `confirmacion.estado` = `PENDIENTE` · `APROBADA` · `RECHAZADA` · `VENCIDA`.

## 6. API de la app (JWT)

JSON, fechas ISO con zona `America/Bogota`. Errores: `{"error": "codigo", "detalle": "texto para mostrar"}`.

| Metodo y ruta | Rol | Hace | P |
|---|---|---|---|
| `POST /auth/login` `{email, clave}` | — | → `{token, usuario}` | 0 |
| `GET /me` | todos | perfil y rol | 0 |
| `POST /me/push-token` | todos | registra la suscripcion push | 0 |
| `POST /invitaciones` | SOCIO | crea invitacion (cuerpo abajo) → incluye `qr_payload` | 0 |
| `GET /invitaciones?fecha=&estado=` | SOCIO | las suyas; CONCIERGE: las de todos | 0 |
| `GET /invitaciones/{id}` | SOCIO (dueno), CONCIERGE | detalle y estado de la foto | 0 |
| `PATCH /invitaciones/{id}` | SOCIO | edita fecha/hora/lugar/nota mientras este `PROGRAMADA` | 0 |
| `DELETE /invitaciones/{id}` | SOCIO | cancela (`CANCELADA`) | 0 |
| `PUT /invitaciones/{id}/foto` (multipart, JPEG) + `consentimiento=true` | SOCIO | sube foto → `PENDIENTE`. Sin consentimiento: 400 | 0 |
| `DELETE /invitaciones/{id}/foto` | SOCIO | quita la foto / pide borrar el embedding | 0 |
| `GET /invitaciones/{id}/qr.png` | SOCIO | imagen del QR para compartir | 0 |
| `GET /eventos?despues_de=<seq>&solo_atencion=` | CONCIERGE; SOCIO (solo los suyos) | feed incremental (la app hace polling cada 3 s con la pantalla abierta) | 0 |
| `POST /eventos/{id}/atender` | CONCIERGE | `NUEVO → ATENDIDO` (guarda quien y cuando) | 0 |
| `POST /eventos/{id}/resolver` `{nota}` | CONCIERGE | `→ RESUELTO` | 1 |
| `GET /confirmaciones/pendientes` | SOCIO | las que esperan su respuesta | 1 |
| `POST /confirmaciones/{id}/responder` `{aprueba: bool}` | SOCIO | `APROBADA` / `RECHAZADA` | 1 |
| `GET /me/qr` | SOCIO | QR propio de vencimiento corto (5 min) como respaldo | 1 |
| `GET /robot/estado` | CONCIERGE | `en_linea` + ultimo latido | 1 |

Crear invitacion:

```json
POST /invitaciones
{"nombre": "Laura", "apellido": "Diaz", "trato": "senora", "documento": null,
 "fecha": "2026-10-24", "hora_desde": "10:00", "hora_hasta": "14:00",
 "lugar": "INVITADO", "nota": "Viene a almorzar"}

201 → {"id": "…", "persona_id": "inv-3f9a1c2b", "estado": "PROGRAMADA", "foto_estado": "NINGUNA",
       "qr_payload": "NCLUB1|invitado|inv-3f9a1c2b|Laura Diaz|1793000000|a1b2c3d4e5f60718293a"}
```

Reglas: limite de invitaciones activas por socio **configurable** (supuesto: VIP 10, REGULAR 3); `hora_hasta > hora_desde`;
no editar ni subir foto si la invitacion ya `LLEGO`/`SALIO`/`CANCELADA`/`VENCIDA`; un socio no ve las de otro (403).

## 7. API del robot (`X-Bot-Key`)

### 7.1 `GET /bot/registros?fecha=2026-10-24` (P0)

Devuelve **exactamente la forma de los archivos actuales** (`registros/*.json`), para que `hri/registros.py` solo cambie de
donde carga. Incluye `version` (entero que sube con cada cambio) para que el robot cachee.

```json
{"version": 42, "fecha": "2026-10-24",
 "socios":  {"sofia": {"nombre": "Sofia", "apellido": "Restrepo", "trato": "senora", "nivel": "VIP",
                       "accion": "empresarial", "destino": "VIP"}},
 "agenda":  {"inv-3f9a1c2b": {"nombre": "Laura", "apellido": "Diaz", "trato": "senora", "anfitrion": "andres",
                              "lugar": "INVITADO", "hora": "10:00"}},
 "turnos":  {"marta": {"nombre": "Marta", "apellido": "Ruiz", "trato": "senora", "area": "cocina",
                       "inicio": "09:00", "fin": "17:00"}},
 "ordenes": {"OT-1042": {"persona": "luis", "nombre": "Luis", "apellido": "Pena", "trato": "senor",
                         "empresa": "Climatec", "motivo": "mantenimiento", "supervisor": "Jorge",
                         "area": "mantenimiento", "fecha": "2026-10-24", "lugar": "EXTERNO"}}}
```

`agenda` = invitaciones de esa fecha en estado `PROGRAMADA` o `LLEGO` (con o sin foto). `anfitrion` = `persona_id` del socio.

**Verificaciones que hace la API** (el robot no calcula fechas ni horarios, solo lee el resultado):
- `agenda`: solo la fecha pedida; una invitacion de otro dia no aparece (el robot le pregunta quien lo invita).
- `turnos`: cada turno trae `"en_turno": true|false` con la hora actual del club (America/Bogota), aceptando la entrada
  hasta 30 min antes del inicio. `false` → el robot lo trata como contradiccion y escala a recepcion.
  Ejemplo: `"pablo": {..., "inicio": "06:00", "fin": "09:00", "en_turno": false}`.
- El robot vuelve a pedir `/bot/registros` antes de atender a cada persona (o cuando cambia `version`).
Cuando una invitacion sale de la agenda (cancelada, vencida, `SALIO`) el robot borra de su galeria a ese `inv-…`.

### 7.2 Fotos de invitados (P0)

- `GET /bot/fotos/pendientes` → `[{"invitacion_id", "persona_id", "url": "<firmada, 60 s>"}]` (el robot consulta cada 5 s)
- `POST /bot/fotos/{invitacion_id}/resultado` `{"ok": true}` o `{"ok": false, "motivo": "poca luz, mire de frente"}`
  → la API actualiza `foto_estado` (el `motivo` se le muestra tal cual al socio) y **borra la foto**.

### 7.3 QR firmado (P0) — debe coincidir byte a byte con `vision/qr_pass.py`

```python
SECRET = os.environ['CERBERUS_QR_SECRET'].encode()            # mismo valor en API y robot
body = '|'.join(['NCLUB1', 'invitado', persona_id, nombre, str(exp_unix)])   # sin '|' en id ni nombre
sig  = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()[:20]
qr_payload = f'{body}|{sig}'
```

`exp_unix` = `fecha + hora_hasta` (America/Bogota). Tipos validos: `socio`, `invitado`, `personal`, `externo`. Prueba de que
quedo bien: el QR que genere la API debe pasar `qr_pass.validate()` del repo.

### 7.4 `POST /bot/eventos` (P0)

El robot ya decide a quien avisar; la API **no decide**, solo guarda y reparte. Idempotente por `id` (si llega repetido: `200 {"duplicado": true}`).
El robot guarda en cola local los eventos que no pudo enviar y los reintenta.

```json
{"id": "7f0c…uuid", "ts": "2026-10-24T10:02:11-05:00", "tipo": "LLEGADA", "categoria": "INVITADO",
 "persona_id": "inv-3f9a1c2b", "nombre": "Laura Diaz", "anfitrion_id": "andres",
 "destino": "Sala de anfitriones", "avisar": ["anfitrion", "concierge"],
 "severidad": "info", "requiere_atencion": false,
 "motivo": "en la agenda de hoy, invitado por Andres",
 "evidencia": {"metodo": "rostro", "confianza": 0.89, "reintentos": 0}}
```

| `tipo` | Cuando | `avisar` | Severidad | Atencion |
|---|---|---|---|---|
| `LLEGADA` + `VIP` | llego un socio VIP | concierge | atencion | si |
| `LLEGADA` + `INVITADO` | llego un invitado | anfitrion, concierge | info | no |
| `LLEGADA` + `REGULAR` / `PERSONAL` | ingreso / marca de entrada | concierge (solo feed) | info | no |
| `LLEGADA` + `EXTERNO` | contratista con orden vigente | concierge (supervisor) | atencion | si |
| `ESCALADO_RECEPCION` | no pudo confirmar o hay contradiccion | concierge | **urgente** | si |
| `IMPREVISTO` | paso bloqueado, puerta atascada, bateria baja (pide cambio) | concierge (mantenimiento) | atencion | si |
| ~~`EMERGENCIA`~~ | alarmas / evacuacion: **fuera de alcance** | — | — | — |
| `SALIDA` | se despide | anfitrion (si invitado), concierge | info | no |

`avisar` admite `concierge`, `anfitrion`, `supervisor`, `mantenimiento`, `seguridad`. En el MVP solo hay apps para
SOCIO y CONCIERGE: **todo lo que no sea `anfitrion` cae en la cola del concierge** y la tarjeta muestra "para: mantenimiento".
`anfitrion` se resuelve con `anfitrion_id`. Un `LLEGADA` de un `inv-…` pasa su invitacion a `LLEGO`; un `SALIDA`, a `SALIO`.
`motivo` y `evidencia` (cos, veredicto, reintentos, pase) se muestran en el detalle de la alerta: es el "por que" del robot.
**Nunca imagenes** en eventos.

**`GET /bot/eventos/{id}`** (P0) → `{"estado": "NUEVO" | "ATENDIDO" | "RESUELTO", "atendido_por": "…"}`. El robot lo
consulta cada 2 s cuando el evento `requiere_atencion`: en un `ESCALADO_RECEPCION` se queda con la persona hasta que el
concierge pulsa **Atender** (y le dice "Ya lo atienden en recepcion"); en el cambio de bateria espera agachado hasta que
mantenimiento lo atiende.

### 7.5 Confirmacion del anfitrion (P1)

```json
POST /bot/confirmaciones
{"id": "uuid", "anfitrion_id": "andres", "visitante_desc": "Dice llamarse Pedro Gomez", "evento_id": null, "vence_en_s": 45}
GET  /bot/confirmaciones/{id}  →  {"estado": "APROBADA", "respondida_at": "…"}   # el robot consulta cada 2 s
```
Pasados `vence_en_s` sin respuesta → `VENCIDA` (el robot lo trata como "no", y escala a recepcion).

### 7.6 Latido (P1)

`POST /bot/heartbeat` `{"robot": "x2-1", "estado": "ok", "detalle": ""}` cada 15 s (y al cambiar de estado). Sin latido en
45 s → el concierge ve "Robot sin conexion".

`estado`: `ok` (en la entrada) · `acompanando` (acompana a alguien: **la entrada queda sin robot**, el concierge debe
cubrirla) · `sin_servicio` (cambio de bateria). La app del concierge muestra el estado y el `detalle`
("entrada sin robot: acompana a Laura").

## 8. Pantallas

**Socio**
1. **Inicio**: "Invitar" (boton grande), proximos invitados con chip de estado, avisos recientes, confirmaciones pendientes (P1).
2. **Nueva invitacion**: nombre, apellido, trato, fecha, desde/hasta, lugar (lista: Sala de anfitriones, Lounge VIP…), nota.
   Foto **opcional** (camara frontal o galeria) + casilla obligatoria si hay foto: *"El invitado me autorizo a usar su foto
   para que el robot lo reconozca; se borra al terminar la visita"*. Sin foto: aviso "El robot le pedira un QR".
3. **Detalle de invitacion**: estado (Programada · Llego · Salio), estado de la foto (Sin foto · Procesando · Lista · Rechazada con motivo
   y boton "Subir otra"), **Compartir QR**, Editar, Cancelar.
4. **Avisos**: "Laura Diaz llego (10:02). El robot la acompana a la sala." + tarjeta de confirmacion con **Si lo espero / No lo conozco** (P1).
5. **Mi QR** (P1).

**Concierge**
1. **Alertas** (pantalla principal): lista de eventos con atencion, urgentes arriba, sonido/vibracion al entrar uno nuevo.
   Tarjeta: categoria, nombre, hora, destino, "para: …", boton **Atender**. Detalle: motivo y evidencia en lenguaje simple
   ("rostro no coincide · 2 reintentos · pase vencido").
2. **Llegadas de hoy**: feed en vivo (hora, nombre, categoria, metodo, destino).
3. **Esperados hoy**: invitaciones del dia agrupadas por socio; los VIP primero.
4. **Robot**: en linea / sin conexion, ultimo latido (P1).

Color por categoria (igual que el LED del robot): VIP dorado · Regular azul · Invitado verde · Personal blanco · Externo naranja ·
Escalamiento rojo suave. Textos cortos, boton principal siempre visible con el pulgar. Debe funcionar bien en 360 px de ancho.

## 9. Privacidad y seguridad (no negociable)

- La foto es dato biometrico = **dato sensible** (Ley 1581 de 2012): consentimiento **expreso y previo** (casilla + `consentimiento_at`),
  uso solo para reconocer al invitado en esa visita. Validar el texto final con el club.
- La foto vive solo hasta que el robot confirma el resultado (maximo 24 h). Se guarda cifrada y sin URL publica
  (URL firmada de 60 s solo para el robot). El robot conserva **embeddings**, no fotos, y los borra al salir/cancelar/vencer.
- Las alertas **no llevan imagenes**: nombre, categoria, motivo.
- HTTPS obligatorio, JWT corto, `X-Bot-Key` rotable, limite de intentos de login, log de quien atendio cada alerta.
- Quien no quiera foto usa el QR: **la foto nunca es obligatoria**.

## 10. Criterios de aceptacion (la demo)

1. Sofia (VIP) crea una invitacion para Laura **con foto** → en menos de 10 s la app muestra foto `LISTA`.
2. Andres crea otra **sin foto** → comparte el QR → `qr_pass.validate()` del repo lo acepta.
3. Laura llega y el robot la reconoce → el socio recibe push y el feed del concierge la muestra en **< 3 s**.
4. Llega Sofia (VIP) → alerta en el concierge con push; **Atender** la marca atendida con quien y hora.
5. Llega un desconocido → `ESCALADO_RECEPCION` urgente con el motivo → el concierge lo atiende.
6. (P1) Visitante dice "me invita Andres" → Andres recibe la confirmacion, pulsa **Si** y el robot continua.
7. Cancelar una invitacion → desaparece de `/bot/registros` y el robot la rechaza.
8. Con la API apagada el robot sigue funcionando con su copia local (lo prueba el equipo del bot).

## 11. Decisiones tomadas (cambiables)

| Decision | Por que |
|---|---|
| PWA + Web Push (si prefieren nativa: FCM) | un solo codigo, sin tiendas; en iPhone el push exige instalarla en la pantalla de inicio (iOS ≥ 16.4) |
| Polling cada 3 s en vez de websockets | mas simple y el robot ya funciona asi; cambiar a SSE si hay tiempo |
| La API no decide a quien avisar | esa logica ya esta en el robot (`hri/decision.py`) y se prueba alla |
| El socio sube la foto (no el invitado) | es lo pedido; **P2**: enlace para que el invitado suba su propia selfie y dé su consentimiento |
| Stack, base de datos y hosting: a criterio de Marshal | solo exigimos URL HTTPS publica y la zona horaria `America/Bogota` |

## 12. Lado del robot (lo hace el equipo del bot, no Marshal)

Cliente delgado en `hri/` que: carga `/bot/registros` (con copia local si falla), sondea fotos pendientes y calcula embeddings
con `vision/enroll.py`, envia eventos desde `dialogo.py`/`decision.py` (con cola local), y pregunta confirmaciones.
Marshal necesita de nosotros: el valor de `CERBERUS_QR_SECRET`, la `X-Bot-Key` y el JSON de ejemplo de `registros/`.
