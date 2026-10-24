# Contrato de la API de Cerberus (v1)

Guía de integración para quien consume la API: la interfaz del proyecto, el robot o el equipo de reconocimiento facial. La fuente formal es `docs/api/openapi.yaml` (OpenAPI 3.1) y, en el código, los esquemas Zod de `src/infrastructure/contracts/`. Este documento explica el comportamiento y muestra ejemplos coherentes entre sí.

Todos los datos son ficticios. Las decisiones de diseño están en `docs/adr/0002-mocks-api.md`, `docs/adr/0003-facial-classification.md` y `docs/adr/0004-qr-handoff.md`.

## 1. Convenciones

| Tema            | Regla                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base            | `/api/v1` relativo al origen donde se despliega la aplicación. Los cambios compatibles son aditivos (campos y valores nuevos); un cambio incompatible exige `/api/v2`. Los clientes deben ignorar campos desconocidos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Formato         | JSON en UTF-8, `Content-Type: application/json`. Una escritura con cuerpo y otro tipo de contenido recibe 415 `UNSUPPORTED_MEDIA_TYPE`; un cuerpo de más de 32 KiB recibe 413 `PAYLOAD_TOO_LARGE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Fechas          | ISO 8601 con desfase de Bogotá (`-05:00`). Las fechas civiles usan `AAAA-MM-DD`. Los intervalos horarios son de inicio inclusivo y fin exclusivo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Actor           | Cabecera `X-Demo-Actor` con un identificador del directorio (`V-209`, `U-02`, `R1`, `O-01`). Es declarativa y no verificable: la demostración no tiene autenticación real, pero cada operación acepta solo a los actores que le corresponden (403 `ACTOR_NOT_ALLOWED` al resto, también si falta la cabecera): el anfitrión y el operador en las invitaciones, los robots y el operador en `recognition/events` y `robots/{id}/failure`, robots, edecanes y operador en `access/verify`, y solo edecanes en `accept`, `context` y `confirm`; la evaluación (`feedback`) la registra además el propio visitante. `GET /passes/{token}` no lleva actor: el token del pase es la credencial. Obligatoria en todas las escrituras salvo `POST /demo/reset`. |
| Idempotencia    | Cabecera `Idempotency-Key` (de 8 a 128 caracteres). Obligatoria en `POST /invitations`, `POST /recognition/events`, `POST /access/verify`, `POST /handoffs` y `POST /robots/{id}/failure`; opcional en el resto. Misma clave y mismo cuerpo repiten la respuesta guardada con la cabecera `Idempotency-Replayed: true`. Misma clave con otro cuerpo: 422 `IDEMPOTENCY_KEY_REUSED`.                                                                                                                                                                                                                                                                                                                                                                      |
| Concurrencia    | Cada visita y cada relevo llevan `version`, que sube de uno en uno con cada escritura. Los cuerpos de `advance` y `close` aceptan `expectedVersion`; si no coincide, 409 `VERSION_CONFLICT`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Listas          | `{ "items": [...], "count": n }`. Sin paginación (volumen de demostración); `GET /visits` acepta `limit` (por defecto 100, máximo 200).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Identificadores | `vis-`, `inv-` y `hof-` seguidos de 8 caracteres hexadecimales; personas del directorio `V-2xx`, edecanes `U-0x`, robots `R1`, `R2`, `R3`, operador `O-01`. Son opacos para el cliente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Límite de tasa  | Ventana fija de un minuto por cliente (IP): 600 lecturas, 120 escrituras y 3 reinicios. Al superarlo: 429 `RATE_LIMITED` con `Retry-After` (segundos). Con almacenamiento Redis la ventana se comparte entre instancias. El modo demostración del navegador (`storage: browser`) no aplica límite.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Autenticación   | Token Bearer opcional de servidor. Si el servidor define `CERBERUS_ROBOT_TOKEN`, `POST /recognition/events`, `POST /access/verify` y `POST /robots/{id}/failure` exigen `Authorization: Bearer <token>`; su ausencia o invalidez da 401 `UNAUTHENTICATED` (antes de cualquier otra comprobación). Un valor definido pero vacío deniega todo. Sin la variable no se exige nada. El modo demostración del navegador corre siempre sin token: es solo una demostración y nunca debe recibirlo.                                                                                                                                                                                                                                                             |
| CORS            | La API no emite cabeceras CORS: la aplicación y la API comparten origen y el robot es un cliente de servidor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Almacenamiento  | Toda respuesta del manejador lleva la cabecera `X-Cerberus-Storage` (`memory`, `redis` o `browser`): el almacenamiento que respalda el despliegue, útil al equipo del robot para saber si el estado es volátil.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Sincronización  | No hay notificaciones push. Los clientes consultan (`GET /handoffs?state=REQUESTED`, `GET /visits?ownerId=`) cada 3 segundos con espera creciente ante errores.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Los errores tienen siempre esta forma y el estado HTTP de la tabla de la sección 2:

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "La visita no admite este evento en su estado actual.",
    "details": {
      "state": "CLOSED",
      "event": "START_ORIENTATION"
    }
  }
}
```

## 2. Catálogo de errores

Los códigos son estables y forman parte del contrato; los mensajes son informativos y pueden cambiar. `details` es opcional.

| Estado | Código                                                                                                                  | Cuándo ocurre                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 400    | `BAD_REQUEST`                                                                                                           | JSON mal formado o cuerpo no analizable.                                                                           |
| 400    | `IDEMPOTENCY_KEY_REQUIRED`                                                                                              | Falta `Idempotency-Key` en un POST que la exige.                                                                   |
| 401    | `UNAUTHENTICATED`                                                                                                       | Solo si el servidor define `CERBERUS_ROBOT_TOKEN` y falta o es inválido en un endpoint del robot.                  |
| 403    | `ACTOR_NOT_ALLOWED`                                                                                                     | El actor no puede realizar la acción (no es el anfitrión, no es acompañante elegible, no es el receptor, etc.).    |
| 403    | `HOST_NOT_ELIGIBLE`                                                                                                     | El anfitrión no es socio o su membresía no está activa.                                                            |
| 403    | `RESET_DISABLED`                                                                                                        | El reinicio de la demostración está desactivado en este despliegue.                                                |
| 404    | `ROUTE_NOT_FOUND`                                                                                                       | Ruta o método inexistente.                                                                                         |
| 404    | `PERSON_NOT_FOUND`, `INVITATION_NOT_FOUND`, `PASS_NOT_FOUND`, `VISIT_NOT_FOUND`, `HANDOFF_NOT_FOUND`, `ROBOT_NOT_FOUND` | El recurso no existe.                                                                                              |
| 409    | `INVALID_TRANSITION`                                                                                                    | El evento no es válido en el estado actual (`details.state` y `details.event`).                                    |
| 409    | `VERSION_CONFLICT`                                                                                                      | `expectedVersion` no coincide con la versión actual.                                                               |
| 409    | `INVITATION_DUPLICATE`                                                                                                  | Ya existe una invitación activa o usada para el mismo anfitrión, fecha e invitado.                                 |
| 409    | `INVITATION_DAILY_LIMIT`                                                                                                | El socio ya tiene 5 invitaciones activas o usadas para esa fecha.                                                  |
| 409    | `INVITATION_NOT_ACTIVE`                                                                                                 | La invitación está usada o vencida y no se puede cancelar.                                                         |
| 409    | `HANDOFF_ALREADY_OPEN`                                                                                                  | La visita ya tiene un relevo abierto.                                                                              |
| 409    | `HANDOFF_ALREADY_ACCEPTED`                                                                                              | Otro acompañante aceptó antes el relevo.                                                                           |
| 409    | `HANDOFF_EXPIRED`                                                                                                       | El relevo venció (se marca `EXPIRED`).                                                                             |
| 409    | `RECEIVER_BUSY`                                                                                                         | El receptor ya tiene una tarea de acompañamiento activa (una visita en marcha o un relevo aceptado sin confirmar). |
| 409    | `ASSIGNEE_BUSY`                                                                                                         | El acompañante asignado ya tiene una tarea de acompañamiento activa.                                               |
| 409    | `FEEDBACK_ALREADY_SUBMITTED`                                                                                            | La visita ya tiene evaluación.                                                                                     |
| 413    | `PAYLOAD_TOO_LARGE`                                                                                                     | El cuerpo supera los 32 KiB.                                                                                       |
| 415    | `UNSUPPORTED_MEDIA_TYPE`                                                                                                | Una escritura con cuerpo no usa `Content-Type: application/json`.                                                  |
| 422    | `VALIDATION_ERROR`                                                                                                      | El cuerpo o los parámetros no cumplen el contrato (`details.fields`).                                              |
| 422    | `INVITATION_DATE_IN_PAST`                                                                                               | La fecha es anterior a hoy, o es hoy y la ventana ya terminó.                                                      |
| 422    | `IDEMPOTENCY_KEY_REUSED`                                                                                                | La clave se reutilizó con un cuerpo distinto.                                                                      |
| 422    | `VISITOR_ACCEPTANCE_REQUIRED`                                                                                           | `ASSIGN_ESCORT` sin `visitorAccepted: true`.                                                                       |
| 422    | `ESCORT_NOT_ALLOWED`                                                                                                    | Acompañante no permitido para la categoría (el externo no va solo ni con robot).                                   |
| 422    | `REVIEW_NOT_CONFIRMABLE`                                                                                                | La revisión humana no se puede confirmar con los registros (`details.reason`).                                     |
| 429    | `RATE_LIMITED`                                                                                                          | Límite de tasa superado.                                                                                           |
| 500    | `INTERNAL_ERROR`                                                                                                        | Error no previsto.                                                                                                 |
| 500    | `STORAGE_UNAVAILABLE`                                                                                                   | El almacenamiento no responde.                                                                                     |

Una denegación de acceso por QR o por clasificación no es un error de transporte: es un resultado de negocio dentro de una respuesta 200 o 201 (`decision: DENIED` o `classification.state: DENIED`).

## 3. Directorio de demostración

| Id         | Persona       | Rol                                            |
| ---------- | ------------- | ---------------------------------------------- |
| `V-201`    | Andrés Mejía  | Socio VIP                                      |
| `V-202`    | Camila Torres | Socia regular                                  |
| `V-204`    | Mario Salcedo | Personal (Operaciones)                         |
| `V-205`    | Laura Beltrán | Trabajadora externa (sábados de 08:00 a 17:00) |
| `V-206`    | Daniela Vega  | Socia regular y personal                       |
| `V-207`    | Esteban Cruz  | Socio con membresía suspendida                 |
| `V-208`    | Iván Rojas    | Socio VIP con membresía vencida                |
| `V-209`    | Male Ospina   | Socia regular                                  |
| `V-210`    | Paula Rincón  | Personal sin turno el día de la demostración   |
| `U-01`     | Sara          | Edecán                                         |
| `U-02`     | Sofía         | Edecán                                         |
| `U-03`     | Ramiro        | Edecán                                         |
| `R1`       | R1            | Robot de recepción (no acompaña)               |
| `R2`, `R3` | R2, R3        | Robots de acompañamiento                       |
| `O-01`     | Operación     | Operador                                       |

Los invitados no están en el directorio: existen solo como parte de una invitación. El detalle de vigencias y turnos está en `docs/domain/categories-matrix.md`.

## 4. Endpoints

### GET /health

Lo llama cualquier cliente para saber si hay servicio, qué almacenamiento usa y qué hora cree la demostración que es.

Respuesta 200:

```json
{
  "status": "ok",
  "contract": "v1",
  "storage": "memory",
  "demo": true,
  "clock": {
    "now": "2026-10-24T09:00:00-05:00",
    "timezone": "America/Bogota"
  },
  "commit": "41cf5a5c0d2b8e7f6a1934d5e8c7b2a1f0e9d8c7"
}
```

`commit` es el commit desplegado en el servidor (`null` si se desconoce; ausente en el modo demo del navegador). `storage` es `memory`, `redis` o `browser` (el modo demo local, con localStorage). Con `memory` en un servidor sin estado compartido, los datos son volátiles por instancia. Errores: 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /demo/reset

Vacía visitas, invitaciones, relevos y claves de idempotencia, devuelve los robots a `OK`, fija el reloj de demostración (por defecto sábado 2026-10-24 09:00 -05:00, que avanza en tiempo real) y deja una invitación activa de ejemplo, también cuando `now` cae fuera de la vigencia de las membresías (la de ejemplo no se somete a la elegibilidad). Un `now` inválido se rechaza antes de borrar nada. Límite estricto de 3 por minuto.

Petición (el cuerpo es opcional; con `now` se reproduce, por ejemplo, el escenario del externo un martes):

```json
{
  "now": "2026-10-24T09:00:00-05:00"
}
```

Respuesta 200:

```json
{
  "status": "reset",
  "clock": {
    "now": "2026-10-24T09:00:00-05:00"
  },
  "demoInvitation": {
    "id": "inv-b82e51d0",
    "hostId": "V-209",
    "guest": {
      "fullName": "Valentina Restrepo",
      "note": "Agua aromática",
      "ref": "V-203"
    },
    "meetingPoint": "Terraza",
    "date": "2026-10-24",
    "window": {
      "from": "06:00",
      "to": "22:00"
    },
    "state": "ACTIVE",
    "qr": {
      "token": "nq_kP3vQ8mZr1XwT5bN9aLd0g",
      "validFrom": "2026-10-24T06:00:00-05:00",
      "validTo": "2026-10-24T22:00:00-05:00",
      "usedAt": null,
      "revokedAt": null
    },
    "visitId": "vis-5a0c7e19",
    "createdAt": "2026-10-24T09:00:00-05:00",
    "cancelledAt": null
  }
}
```

Se desactiva en el servidor con `CERBERUS_RESET_ENABLED=false` (cualquier valor distinto de `true` lo desactiva; el nombre anterior `CERBERUS_DEMO_RESET=off` también funciona). Por defecto está habilitado en la demostración. Errores: 403 `RESET_DISABLED`, 422 `VALIDATION_ERROR`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR` o `STORAGE_UNAVAILABLE`. El token del ejemplo es ilustrativo; la invitación de ejemplo solo sirve para datos de demostración.

### GET /people y GET /people/{id}

Lista el directorio (`?role=MEMBER|STAFF|EXTERNAL|USHER|ROBOT|OPERATOR`) sin preferencias; el detalle las incluye. Ejemplo de `GET /people?role=ROBOT`:

```json
{
  "items": [
    {
      "id": "R1",
      "displayName": "R1 · recepción",
      "roles": ["ROBOT"],
      "robot": {
        "role": "RECEPTION",
        "canEscort": false,
        "status": "OK"
      },
      "defaultDestination": null
    },
    {
      "id": "R2",
      "displayName": "R2 · acompañamiento",
      "roles": ["ROBOT"],
      "robot": {
        "role": "ESCORT",
        "canEscort": true,
        "status": "OK"
      },
      "defaultDestination": null
    },
    {
      "id": "R3",
      "displayName": "R3 · acompañamiento",
      "roles": ["ROBOT"],
      "robot": {
        "role": "ESCORT",
        "canEscort": true,
        "status": "OK"
      },
      "defaultDestination": null
    }
  ],
  "count": 3
}
```

Ejemplo de `GET /people/V-201`:

```json
{
  "id": "V-201",
  "displayName": "Andrés Mejía",
  "roles": ["MEMBER"],
  "membership": {
    "tier": "VIP",
    "status": "ACTIVE",
    "validTo": "2027-06-30"
  },
  "defaultDestination": "Salón reservado",
  "preferences": ["Café"]
}
```

Errores: 404 `PERSON_NOT_FOUND`, 422 `VALIDATION_ERROR` (rol inválido), 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### GET /activities

Actividades del día cargadas por el personal (`?date=AAAA-MM-DD`, por defecto la fecha del reloj).

Respuesta 200:

```json
{
  "items": [
    {
      "id": "act-001",
      "title": "Clase abierta de tenis",
      "location": "Cancha de tenis",
      "startsAt": "2026-10-24T09:30:00-05:00",
      "endsAt": "2026-10-24T10:30:00-05:00",
      "audience": ["VIP", "REGULAR", "GUEST"]
    },
    {
      "id": "act-002",
      "title": "Cata de cafés de origen",
      "location": "Sala de catas",
      "startsAt": "2026-10-24T11:00:00-05:00",
      "endsAt": "2026-10-24T12:00:00-05:00",
      "audience": ["VIP", "REGULAR"]
    },
    {
      "id": "act-003",
      "title": "Yoga en la terraza",
      "location": "Terraza",
      "startsAt": "2026-10-24T10:30:00-05:00",
      "endsAt": "2026-10-24T11:30:00-05:00",
      "audience": ["VIP", "REGULAR", "GUEST"]
    }
  ],
  "count": 3
}
```

Errores: 422 `VALIDATION_ERROR` (fecha inválida), 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /invitations

Lo llama el socio (actor = anfitrión). Crea la invitación con su QR temporal y la visita esperada. Cabeceras: `Idempotency-Key` y `X-Demo-Actor: V-202`.

Petición:

```json
{
  "hostId": "V-202",
  "guest": {
    "fullName": "Sebastián Lozano",
    "note": "Café sin azúcar"
  },
  "meetingPoint": "Cancha de tenis",
  "date": "2026-10-24"
}
```

Respuesta 201 (la ventana por defecto es de 06:00 a 22:00 en Bogotá):

```json
{
  "id": "inv-6e07d3f1",
  "hostId": "V-202",
  "guest": {
    "fullName": "Sebastián Lozano",
    "note": "Café sin azúcar",
    "ref": "G-3c91aa07"
  },
  "meetingPoint": "Cancha de tenis",
  "date": "2026-10-24",
  "window": {
    "from": "06:00",
    "to": "22:00"
  },
  "state": "ACTIVE",
  "qr": {
    "token": "nq_Zx9Lm2QwR7tYb4NcV1sHaA",
    "validFrom": "2026-10-24T06:00:00-05:00",
    "validTo": "2026-10-24T22:00:00-05:00",
    "usedAt": null,
    "revokedAt": null
  },
  "visitId": "vis-c41d8a02",
  "createdAt": "2026-10-24T09:01:00-05:00",
  "cancelledAt": null
}
```

Reglas completas en `docs/domain/invitations-qr.md`. Errores:

| Estado   | Código                                                                  | Ejemplo                                                        |
| -------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| 400      | `IDEMPOTENCY_KEY_REQUIRED`, `BAD_REQUEST`                               | Falta la clave de idempotencia.                                |
| 403      | `ACTOR_NOT_ALLOWED`                                                     | El actor no es el anfitrión indicado ni un operador.           |
| 403      | `HOST_NOT_ELIGIBLE`                                                     | `hostId: V-204` (personal) o `V-207` (suspendida).             |
| 404      | `PERSON_NOT_FOUND`                                                      | `hostId: V-999`.                                               |
| 409      | `INVITATION_DUPLICATE`, `INVITATION_DAILY_LIMIT`                        | Mismo invitado, fecha y anfitrión; o sexta invitación del día. |
| 422      | `VALIDATION_ERROR`, `INVITATION_DATE_IN_PAST`, `IDEMPOTENCY_KEY_REUSED` | Fecha pasada, ventana invertida, nombre ausente.               |
| 429, 500 | `RATE_LIMITED`, `INTERNAL_ERROR`, `STORAGE_UNAVAILABLE`                 |                                                                |

Ejemplo de respuesta 409:

```json
{
  "error": {
    "code": "INVITATION_DUPLICATE",
    "message": "Ya existe una invitación para este invitado, anfitrión y fecha.",
    "details": {
      "invitationId": "inv-6e07d3f1"
    }
  }
}
```

### GET /invitations?hostId= y GET /invitations/{id}

`hostId` es obligatorio; se puede filtrar por `state` y `date`. El estado devuelto es el efectivo (`EXPIRED` se deriva al leer). Respuesta 200 de `GET /invitations?hostId=V-202`:

```json
{
  "items": [
    {
      "id": "inv-6e07d3f1",
      "hostId": "V-202",
      "guest": {
        "fullName": "Sebastián Lozano",
        "note": "Café sin azúcar",
        "ref": "G-3c91aa07"
      },
      "meetingPoint": "Cancha de tenis",
      "date": "2026-10-24",
      "window": {
        "from": "06:00",
        "to": "22:00"
      },
      "state": "ACTIVE",
      "qr": {
        "token": "nq_Zx9Lm2QwR7tYb4NcV1sHaA",
        "validFrom": "2026-10-24T06:00:00-05:00",
        "validTo": "2026-10-24T22:00:00-05:00",
        "usedAt": null,
        "revokedAt": null
      },
      "visitId": "vis-c41d8a02",
      "createdAt": "2026-10-24T09:01:00-05:00",
      "cancelledAt": null
    }
  ],
  "count": 1
}
```

`GET /invitations/{id}` devuelve el objeto `Invitation` de arriba. Ambas consultas exigen `X-Demo-Actor`: la lista, que el actor sea el `hostId` (o el operador `O-01`); el detalle, que sea el anfitrión de esa invitación (o el operador). Cualquier otro actor, o sin cabecera, recibe 403 `ACTOR_NOT_ALLOWED`, porque la invitación lleva el token del QR. Errores: 403 `ACTOR_NOT_ALLOWED`, 404 `INVITATION_NOT_FOUND`, 422 `VALIDATION_ERROR` (por ejemplo, falta `hostId`), 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`. El token del QR solo aparece en la respuesta de creación, en estas dos consultas, en la cancelación (ya revocado), en la respuesta de `access/verify` al que lo presentó y en la invitación de ejemplo del reinicio; nunca en visitas, relevos, personas ni mensajes de error.

### POST /invitations/{id}/cancel

Lo llama el anfitrión o un operador. Deja la invitación en `CANCELLED`, revoca el QR y cierra la visita esperada (`INVITATION_CANCELLED`). Es idempotente: cancelar una ya cancelada devuelve 200.

Respuesta 200:

```json
{
  "id": "inv-6e07d3f1",
  "hostId": "V-202",
  "guest": {
    "fullName": "Sebastián Lozano",
    "note": "Café sin azúcar",
    "ref": "G-3c91aa07"
  },
  "meetingPoint": "Cancha de tenis",
  "date": "2026-10-24",
  "window": {
    "from": "06:00",
    "to": "22:00"
  },
  "state": "CANCELLED",
  "qr": {
    "token": "nq_Zx9Lm2QwR7tYb4NcV1sHaA",
    "validFrom": "2026-10-24T06:00:00-05:00",
    "validTo": "2026-10-24T22:00:00-05:00",
    "usedAt": null,
    "revokedAt": "2026-10-24T09:05:00-05:00"
  },
  "visitId": "vis-c41d8a02",
  "createdAt": "2026-10-24T09:01:00-05:00",
  "cancelledAt": "2026-10-24T09:05:00-05:00"
}
```

Errores: 403 `ACTOR_NOT_ALLOWED`, 404 `INVITATION_NOT_FOUND`, 409 `INVITATION_NOT_ACTIVE` (usada o vencida), 409 `VERSION_CONFLICT`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### GET /passes/{token}

El enlace de entrada del invitado (`/pase/<token>`). No lleva `X-Demo-Actor`: poseer el token es la autorización. Devuelve solo lo que el invitado necesita para mostrar su pase, nunca ids, contacto, notas ni apellidos. `state` es el efectivo según el reloj de la demostración: `ACTIVE`, `USED`, `EXPIRED`, `CANCELLED` o `NOT_YET_VALID` (activo, pero su ventana aún no abre). Respuesta 200 de `GET /passes/nq_Zx9Lm2QwR7tYb4NcV1sHaA`:

```json
{
  "guestFirstName": "Sebastián",
  "hostShortName": "Camila",
  "meetingPoint": "Cancha de tenis",
  "date": "2026-10-24",
  "window": {
    "from": "06:00",
    "to": "22:00"
  },
  "state": "ACTIVE",
  "qr": {
    "token": "nq_Zx9Lm2QwR7tYb4NcV1sHaA",
    "validFrom": "2026-10-24T06:00:00-05:00",
    "validTo": "2026-10-24T22:00:00-05:00"
  }
}
```

Un token mal formado, desconocido o que ya no corresponde a una invitación recibe siempre el mismo 404 `PASS_NOT_FOUND`, sin distinguir los casos. Aplica el límite de lecturas. Errores: 404 `PASS_NOT_FOUND`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR` o `STORAGE_UNAVAILABLE`.

### POST /access/verify

Lo llama el robot o el edecán (o el operador) al leer un QR; otros actores reciben 403 `ACTOR_NOT_ALLOWED`. Con token de robot activo exige `Authorization: Bearer` (401 `UNAUTHENTICATED`). El cuerpo no admite campos desconocidos. Si es válido lo consume (un solo uso), verifica la visita esperada y la deja en `VERIFIED` como `GUEST`. Exige `Idempotency-Key`. Opcionalmente, `visitId` vincula una visita en `MANUAL_REVIEW` sin invitación (por ejemplo, rostro desconocido) con la visita esperada; la de revisión se cierra con motivo `MERGED`.

Petición:

```json
{
  "token": "nq_kP3vQ8mZr1XwT5bN9aLd0g"
}
```

Respuesta 200, QR válido:

```json
{
  "decision": "GRANTED",
  "visit": {
    "id": "vis-5a0c7e19",
    "state": "VERIFIED",
    "category": "GUEST",
    "visitor": {
      "ref": "V-203",
      "personId": null,
      "displayName": "Valentina Restrepo"
    },
    "destination": "Terraza",
    "ownerId": "R1",
    "resumeState": null,
    "classification": {
      "state": "CONFIRMED",
      "category": "GUEST",
      "evidence": ["INVITATION_QR_VALID"],
      "suggestedDestination": "Terraza"
    },
    "recognition": null,
    "invitationId": "inv-b82e51d0",
    "hostName": "Male",
    "openHandoffId": null,
    "arrivedAt": null,
    "closedAt": null,
    "closeReason": null,
    "failureReason": null,
    "feedbackSubmitted": false,
    "createdAt": "2026-10-24T09:00:00-05:00",
    "updatedAt": "2026-10-24T09:05:40-05:00",
    "version": 2
  },
  "invitation": {
    "id": "inv-b82e51d0",
    "hostId": "V-209",
    "guest": {
      "fullName": "Valentina Restrepo",
      "note": "Agua aromática",
      "ref": "V-203"
    },
    "meetingPoint": "Terraza",
    "date": "2026-10-24",
    "window": {
      "from": "06:00",
      "to": "22:00"
    },
    "state": "USED",
    "qr": {
      "token": "nq_kP3vQ8mZr1XwT5bN9aLd0g",
      "validFrom": "2026-10-24T06:00:00-05:00",
      "validTo": "2026-10-24T22:00:00-05:00",
      "usedAt": "2026-10-24T09:05:40-05:00",
      "revokedAt": null
    },
    "visitId": "vis-5a0c7e19",
    "createdAt": "2026-10-24T09:00:00-05:00",
    "cancelledAt": null
  }
}
```

Respuesta 200, QR rechazado (motivos posibles: `QR_UNKNOWN`, `QR_REVOKED`, `QR_ALREADY_USED`, `QR_NOT_YET_VALID`, `QR_EXPIRED`, evaluados en ese orden; un token desconocido o alterado siempre da `QR_UNKNOWN`):

```json
{
  "decision": "DENIED",
  "reason": "QR_ALREADY_USED"
}
```

Errores: 400 `IDEMPOTENCY_KEY_REQUIRED` o `BAD_REQUEST`, 401 `UNAUTHENTICATED` (solo con token de robot activo), 404 `VISIT_NOT_FOUND` (`visitId` inexistente), 409 `INVALID_TRANSITION` (`visitId` no está en `MANUAL_REVIEW` o ya tiene invitación), 409 `VERSION_CONFLICT`, 422 `VALIDATION_ERROR` o `IDEMPOTENCY_KEY_REUSED`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /recognition/events

Lo llama el robot (`source.kind: ROBOT`) o la pantalla simuladora (en ambos casos con un robot del directorio como `actor` y como `source.id`: un robot no firma por otro; el operador puede indicar cualquier robot). Otros actores o un `source.id` que no sea un robot reciben 403 `ACTOR_NOT_ALLOWED`. Con token de robot activo exige `Authorization: Bearer` (401 `UNAUTHENTICATED`). El cuerpo es estricto: una imagen, un vector facial o cualquier campo desconocido es 422 `VALIDATION_ERROR` y no se guarda nada. La pantalla simuladora (`SIMULATOR`, que se guarda como `simulated: true` y la interfaz rotula). Registra la señal facial, crea la visita y devuelve la clasificación en dos etapas (`docs/adr/0003-facial-classification.md`). Exige `Idempotency-Key`. Responde 201 al crear una visita y 200 si la persona identificada ya tenía una visita abierta (`matchedOpenVisit: true`), por ejemplo al reconocerla en la salida o cuando llegan varios eventos simultáneos de la misma persona: todos devuelven la misma visita.

Petición, socio VIP:

```json
{
  "source": {
    "kind": "SIMULATOR",
    "id": "R1"
  },
  "face": {
    "status": "MATCH",
    "classHint": "MEMBER",
    "candidateId": "V-201",
    "confidence": 0.97
  },
  "observedAt": "2026-10-24T09:02:11-05:00"
}
```

Respuesta 201:

```json
{
  "visit": {
    "id": "vis-7f3a9c21",
    "state": "VERIFIED",
    "category": "VIP",
    "visitor": {
      "ref": "V-201",
      "personId": "V-201",
      "displayName": "Andrés Mejía"
    },
    "destination": "Salón reservado",
    "ownerId": "R1",
    "resumeState": null,
    "classification": {
      "state": "CONFIRMED",
      "category": "VIP",
      "evidence": ["MEMBERSHIP_ACTIVE"],
      "suggestedDestination": "Salón reservado"
    },
    "recognition": {
      "source": {
        "kind": "SIMULATOR",
        "id": "R1"
      },
      "simulated": true,
      "face": {
        "status": "MATCH",
        "classHint": "MEMBER",
        "candidateId": "V-201",
        "confidence": 0.97
      },
      "confidence": 0.97,
      "observedAt": "2026-10-24T09:02:11-05:00"
    },
    "invitationId": null,
    "hostName": null,
    "openHandoffId": null,
    "arrivedAt": null,
    "closedAt": null,
    "closeReason": null,
    "failureReason": null,
    "feedbackSubmitted": false,
    "createdAt": "2026-10-24T09:02:11-05:00",
    "updatedAt": "2026-10-24T09:02:11-05:00",
    "version": 1
  },
  "classification": {
    "state": "CONFIRMED",
    "category": "VIP",
    "evidence": ["MEMBERSHIP_ACTIVE"],
    "suggestedDestination": "Salón reservado"
  },
  "matchedOpenVisit": false
}
```

Petición, invitada con QR (`pista NON_MEMBER`, sin `candidateId`):

```json
{
  "source": {
    "kind": "ROBOT",
    "id": "R1"
  },
  "face": {
    "status": "MATCH",
    "classHint": "NON_MEMBER",
    "confidence": 0.91
  },
  "evidence": {
    "qrToken": "nq_kP3vQ8mZr1XwT5bN9aLd0g"
  },
  "observedAt": "2026-10-24T09:05:40-05:00"
}
```

La respuesta 201 es una visita en `VERIFIED` con categoría `GUEST` y evidencia `INVITATION_QR_VALID`, y la invitación pasa a `USED`.

Petición, rostro desconocido:

```json
{
  "source": {
    "kind": "ROBOT",
    "id": "R1"
  },
  "face": {
    "status": "UNKNOWN"
  },
  "observedAt": "2026-10-24T09:50:00-05:00"
}
```

Respuesta 201 (no autoriza nada; queda a la espera de una persona):

```json
{
  "visit": {
    "id": "vis-e20c91b7",
    "state": "MANUAL_REVIEW",
    "category": null,
    "visitor": {
      "ref": null,
      "personId": null,
      "displayName": "Visitante sin identificar"
    },
    "destination": null,
    "ownerId": null,
    "resumeState": null,
    "classification": {
      "state": "MANUAL_REVIEW",
      "reason": "FACE_UNKNOWN"
    },
    "recognition": {
      "source": {
        "kind": "ROBOT",
        "id": "R1"
      },
      "simulated": false,
      "face": {
        "status": "UNKNOWN"
      },
      "confidence": null,
      "observedAt": "2026-10-24T09:50:00-05:00"
    },
    "invitationId": null,
    "hostName": null,
    "openHandoffId": null,
    "arrivedAt": null,
    "closedAt": null,
    "closeReason": null,
    "failureReason": null,
    "feedbackSubmitted": false,
    "createdAt": "2026-10-24T09:50:00-05:00",
    "updatedAt": "2026-10-24T09:50:00-05:00",
    "version": 1
  },
  "classification": {
    "state": "MANUAL_REVIEW",
    "reason": "FACE_UNKNOWN"
  },
  "matchedOpenVisit": false
}
```

Resultado por situación (todas las reglas, con sus instantes y fixtures, en `docs/domain/categories-matrix.md`):

| Entrada                                                                        | `classification`                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `MATCH`, `MEMBER`, `V-201`, confianza 0,97                                     | `CONFIRMED`, `VIP`                                                                         |
| `MATCH`, `MEMBER`, `V-202`                                                     | `CONFIRMED`, `REGULAR`                                                                     |
| `MATCH`, `NON_MEMBER`, `qrToken` válido                                        | `CONFIRMED`, `GUEST`                                                                       |
| `MATCH`, `NON_MEMBER`, `V-203` (perfil demo consentido) con invitación vigente | `CONFIRMED`, `GUEST` con evidencia `INVITATION_ACTIVE`                                     |
| `MATCH`, `NON_MEMBER`, `V-204` con turno vigente                               | `CONFIRMED`, `STAFF`                                                                       |
| `MATCH`, `NON_MEMBER`, `V-205` un sábado entre 08:00 y 17:00                   | `CONFIRMED`, `EXTERNAL`                                                                    |
| `MATCH`, `NON_MEMBER`, `V-205` un martes                                       | `DENIED`, `EXTERNAL_PERMIT_OUTSIDE_WINDOW`                                                 |
| `MATCH`, `NON_MEMBER`, sin candidato ni QR                                     | `MANUAL_REVIEW`, `NO_EVIDENCE`                                                             |
| `UNKNOWN`                                                                      | `MANUAL_REVIEW`, `FACE_UNKNOWN`                                                            |
| `ERROR`                                                                        | `MANUAL_REVIEW`, `FACE_ERROR`                                                              |
| `MATCH` con confianza menor que 0,8                                            | `MANUAL_REVIEW`, `LOW_CONFIDENCE`                                                          |
| `MATCH`, `MEMBER`, `V-206` (socia y personal con turno)                        | `MANUAL_REVIEW`, `DUAL_ROLE`                                                               |
| QR vencido, usado, revocado, aún no válido o inventado                         | `DENIED`, `QR_EXPIRED`, `QR_ALREADY_USED`, `QR_REVOKED`, `QR_NOT_YET_VALID` o `QR_UNKNOWN` |

Una denegación crea la visita en `FAILED`; una revisión, en `MANUAL_REVIEW`; una confirmación, en `VERIFIED` con `ownerId` igual a `source.id`. Errores: 400 `IDEMPOTENCY_KEY_REQUIRED` o `BAD_REQUEST`, 401 `UNAUTHENTICATED` (solo con token de robot activo), 409 `VERSION_CONFLICT`, 422 `VALIDATION_ERROR` o `IDEMPOTENCY_KEY_REUSED`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR` o `STORAGE_UNAVAILABLE`.

### GET /visits y GET /visits/{id}

Filtros de la lista: `state`, `ownerId`, `limit`. Respuesta 200 de `GET /visits?state=IN_PROGRESS&ownerId=R2`:

```json
{
  "items": [
    {
      "id": "vis-7f3a9c21",
      "state": "IN_PROGRESS",
      "category": "VIP",
      "visitor": {
        "ref": "V-201",
        "personId": "V-201",
        "displayName": "Andrés Mejía"
      },
      "destination": "Salón reservado",
      "ownerId": "R2",
      "resumeState": null,
      "classification": {
        "state": "CONFIRMED",
        "category": "VIP",
        "evidence": ["MEMBERSHIP_ACTIVE"],
        "suggestedDestination": "Salón reservado"
      },
      "recognition": {
        "source": {
          "kind": "SIMULATOR",
          "id": "R1"
        },
        "simulated": true,
        "face": {
          "status": "MATCH",
          "classHint": "MEMBER",
          "candidateId": "V-201",
          "confidence": 0.97
        },
        "confidence": 0.97,
        "observedAt": "2026-10-24T09:02:11-05:00"
      },
      "invitationId": null,
      "hostName": null,
      "openHandoffId": null,
      "arrivedAt": null,
      "closedAt": null,
      "closeReason": null,
      "failureReason": null,
      "feedbackSubmitted": false,
      "createdAt": "2026-10-24T09:02:11-05:00",
      "updatedAt": "2026-10-24T09:04:00-05:00",
      "version": 3
    }
  ],
  "count": 1
}
```

`GET /visits/{id}` devuelve un objeto `Visit` como el de la respuesta anterior. `ownerId` es el responsable actual o, si la visita terminó, el último; solo cambia al asignar acompañante y al confirmar un relevo. Errores: 404 `VISIT_NOT_FOUND`, 422 `VALIDATION_ERROR`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /visits/{id}/advance

Aplica un evento a la visita. Eventos y guardas: `docs/domain/visit-handoff-states.md`. Cabecera `X-Demo-Actor` obligatoria.

`START_ORIENTATION` (robot, edecán u operador; la visita debe estar en `VERIFIED`):

```json
{
  "event": "START_ORIENTATION",
  "destination": "Salón reservado"
}
```

Respuesta 200:

```json
{
  "id": "vis-7f3a9c21",
  "state": "ORIENTING",
  "category": "VIP",
  "visitor": {
    "ref": "V-201",
    "personId": "V-201",
    "displayName": "Andrés Mejía"
  },
  "destination": "Salón reservado",
  "ownerId": "R1",
  "resumeState": null,
  "classification": {
    "state": "CONFIRMED",
    "category": "VIP",
    "evidence": ["MEMBERSHIP_ACTIVE"],
    "suggestedDestination": "Salón reservado"
  },
  "recognition": {
    "source": {
      "kind": "SIMULATOR",
      "id": "R1"
    },
    "simulated": true,
    "face": {
      "status": "MATCH",
      "classHint": "MEMBER",
      "candidateId": "V-201",
      "confidence": 0.97
    },
    "confidence": 0.97,
    "observedAt": "2026-10-24T09:02:11-05:00"
  },
  "invitationId": null,
  "hostName": null,
  "openHandoffId": null,
  "arrivedAt": null,
  "closedAt": null,
  "closeReason": null,
  "failureReason": null,
  "feedbackSubmitted": false,
  "createdAt": "2026-10-24T09:02:11-05:00",
  "updatedAt": "2026-10-24T09:03:00-05:00",
  "version": 2
}
```

`ASSIGN_ESCORT` (la visita debe estar en `ORIENTING`; `assigneeId` es un acompañante elegible y libre, `SELF` o `NONE`; el visitante debe aceptar, salvo con `NONE`). Un acompañante está ocupado mientras es responsable de una visita en marcha sin llegar o mientras tiene un relevo aceptado sin confirmar: `ASSIGNEE_BUSY`. La comprobación se repite justo antes de escribir, así que de dos asignaciones simultáneas al mismo acompañante gana una:

```json
{
  "event": "ASSIGN_ESCORT",
  "assigneeId": "R2",
  "visitorAccepted": true
}
```

Respuesta 200: la visita pasa a `IN_PROGRESS` y `ownerId` a `R2`.

`ASSIGN_ESCORT` con `NONE` es el camino sin acompañante (personal, o quien rechaza el acompañamiento): la visita pasa a `IN_PROGRESS` y el responsable conserva la visita (por ejemplo `R1`), sin tarea de escolta; luego `ARRIVE` y `close` funcionan igual. `visitorAccepted` se ignora. Un externo siempre va con un edecán humano: 422 `ESCORT_NOT_ALLOWED`.

```json
{
  "event": "ASSIGN_ESCORT",
  "assigneeId": "NONE",
  "visitorAccepted": false
}
```

```json
{
  "id": "vis-7f3a9c21",
  "state": "IN_PROGRESS",
  "category": "VIP",
  "visitor": {
    "ref": "V-201",
    "personId": "V-201",
    "displayName": "Andrés Mejía"
  },
  "destination": "Salón reservado",
  "ownerId": "R2",
  "resumeState": null,
  "classification": {
    "state": "CONFIRMED",
    "category": "VIP",
    "evidence": ["MEMBERSHIP_ACTIVE"],
    "suggestedDestination": "Salón reservado"
  },
  "recognition": {
    "source": {
      "kind": "SIMULATOR",
      "id": "R1"
    },
    "simulated": true,
    "face": {
      "status": "MATCH",
      "classHint": "MEMBER",
      "candidateId": "V-201",
      "confidence": 0.97
    },
    "confidence": 0.97,
    "observedAt": "2026-10-24T09:02:11-05:00"
  },
  "invitationId": null,
  "hostName": null,
  "openHandoffId": null,
  "arrivedAt": null,
  "closedAt": null,
  "closeReason": null,
  "failureReason": null,
  "feedbackSubmitted": false,
  "createdAt": "2026-10-24T09:02:11-05:00",
  "updatedAt": "2026-10-24T09:04:00-05:00",
  "version": 3
}
```

`ARRIVE` (marca la llegada al destino y libera al acompañante), `ABORT` (solo operador) y `RESOLVE_REVIEW`:

```json
{
  "event": "ARRIVE"
}
```

```json
{
  "event": "RESOLVE_REVIEW",
  "decision": "CONFIRM",
  "personId": "V-201"
}
```

`RESOLVE_REVIEW` con `CONFIRM` repite la clasificación con el `personId` que el humano comprobó; la categoría la calcula el sistema. Respuesta 200 para la visita en revisión de ejemplo:

```json
{
  "id": "vis-e20c91b7",
  "state": "VERIFIED",
  "category": "VIP",
  "visitor": {
    "ref": "V-201",
    "personId": "V-201",
    "displayName": "Andrés Mejía"
  },
  "destination": "Salón reservado",
  "ownerId": "R1",
  "resumeState": null,
  "classification": {
    "state": "CONFIRMED",
    "category": "VIP",
    "evidence": ["MEMBERSHIP_ACTIVE", "HUMAN_ATTESTATION"],
    "suggestedDestination": "Salón reservado"
  },
  "recognition": {
    "source": {
      "kind": "ROBOT",
      "id": "R1"
    },
    "simulated": false,
    "face": {
      "status": "UNKNOWN"
    },
    "confidence": null,
    "observedAt": "2026-10-24T09:50:00-05:00"
  },
  "invitationId": null,
  "hostName": null,
  "openHandoffId": null,
  "arrivedAt": null,
  "closedAt": null,
  "closeReason": null,
  "failureReason": null,
  "feedbackSubmitted": false,
  "createdAt": "2026-10-24T09:50:00-05:00",
  "updatedAt": "2026-10-24T09:52:00-05:00",
  "version": 2
}
```

Errores:

| Estado   | Código                                                  | Cuándo                                                                        |
| -------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 400      | `BAD_REQUEST`                                           | Cuerpo no analizable.                                                         |
| 403      | `ACTOR_NOT_ALLOWED`                                     | El actor no puede aplicar ese evento (por ejemplo, `ABORT` sin ser operador). |
| 404      | `VISIT_NOT_FOUND`                                       | La visita no existe.                                                          |
| 409      | `INVALID_TRANSITION`                                    | El evento no corresponde al estado actual.                                    |
| 409      | `VERSION_CONFLICT`                                      | `expectedVersion` desactualizada.                                             |
| 409      | `ASSIGNEE_BUSY`                                         | El acompañante ya tiene una tarea activa.                                     |
| 422      | `VALIDATION_ERROR`                                      | Evento desconocido o campos inválidos.                                        |
| 422      | `VISITOR_ACCEPTANCE_REQUIRED`                           | `ASSIGN_ESCORT` con `visitorAccepted: false`.                                 |
| 422      | `ESCORT_NOT_ALLOWED`                                    | Un externo con `SELF` o con robot.                                            |
| 422      | `REVIEW_NOT_CONFIRMABLE`                                | La revisión no se confirma con los registros; la visita no cambia.            |
| 429, 500 | `RATE_LIMITED`, `INTERNAL_ERROR`, `STORAGE_UNAVAILABLE` |                                                                               |

Ejemplo de 422:

```json
{
  "error": {
    "code": "REVIEW_NOT_CONFIRMABLE",
    "message": "Los registros no respaldan la confirmación.",
    "details": {
      "reason": "MEMBERSHIP_SUSPENDED"
    }
  }
}
```

### POST /visits/{id}/close

Confirma la salida. Desde `VERIFIED`, `ORIENTING`, `IN_PROGRESS` o `WAITING_HANDOFF`; si hay un relevo abierto, se cancela. `ownerId` no cambia. El cuerpo es opcional. Un robot solo cierra sus propias visitas, salvo R1 (recepción), que atiende la salida de cualquier visita que no tenga un relevo abierto; R2 y R3 no cierran visitas ajenas. Un edecán o el operador cierran cualquiera.

Petición:

```json
{
  "method": "FACE"
}
```

Respuesta 200:

```json
{
  "id": "vis-7f3a9c21",
  "state": "CLOSED",
  "category": "VIP",
  "visitor": {
    "ref": "V-201",
    "personId": "V-201",
    "displayName": "Andrés Mejía"
  },
  "destination": "Salón reservado",
  "ownerId": "U-02",
  "resumeState": null,
  "classification": {
    "state": "CONFIRMED",
    "category": "VIP",
    "evidence": ["MEMBERSHIP_ACTIVE"],
    "suggestedDestination": "Salón reservado"
  },
  "recognition": {
    "source": {
      "kind": "SIMULATOR",
      "id": "R1"
    },
    "simulated": true,
    "face": {
      "status": "MATCH",
      "classHint": "MEMBER",
      "candidateId": "V-201",
      "confidence": 0.97
    },
    "confidence": 0.97,
    "observedAt": "2026-10-24T09:02:11-05:00"
  },
  "invitationId": null,
  "hostName": null,
  "openHandoffId": null,
  "arrivedAt": "2026-10-24T09:30:00-05:00",
  "closedAt": "2026-10-24T11:10:00-05:00",
  "closeReason": "EXIT",
  "failureReason": null,
  "feedbackSubmitted": false,
  "createdAt": "2026-10-24T09:02:11-05:00",
  "updatedAt": "2026-10-24T11:10:00-05:00",
  "version": 9
}
```

Errores: 400 `BAD_REQUEST`, 403 `ACTOR_NOT_ALLOWED`, 404 `VISIT_NOT_FOUND`, 409 `INVALID_TRANSITION` (por ejemplo, visita ya cerrada), 409 `VERSION_CONFLICT`, 422 `VALIDATION_ERROR`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /visits/{id}/feedback

Evaluación voluntaria, una por visita, con la visita en `IN_PROGRESS` o `CLOSED`. La registra el quiosco (robot), un edecán o el operador en nombre del visitante, o el propio visitante (el actor cuyo id es el `personId` de la visita): cualquier otro actor, o sin cabecera, recibe 403 `ACTOR_NOT_ALLOWED`. Los comentarios admiten hasta 300 caracteres. Se separa lo del robot de lo del club. Debe traer al menos un campo; no se graba voz.

Petición:

```json
{
  "robotRating": 5,
  "robotComment": "Muy claro el recorrido.",
  "clubRating": 4
}
```

Respuesta 201:

```json
{
  "robotRating": 5,
  "robotComment": "Muy claro el recorrido.",
  "clubRating": 4,
  "visitId": "vis-7f3a9c21",
  "createdAt": "2026-10-24T11:12:00-05:00"
}
```

Errores: 400 `BAD_REQUEST`, 404 `VISIT_NOT_FOUND`, 409 `INVALID_TRANSITION` (visita aún no en curso), 409 `FEEDBACK_ALREADY_SUBMITTED`, 422 `VALIDATION_ERROR` (sin campos o fuera de rango), 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /handoffs

Solicita el relevo de una visita. Lo llama el responsable actual o un operador. La visita pasa a `WAITING_HANDOFF` y el responsable **no cambia** hasta confirmar. `preferredToId` es opcional; sin él, cualquier acompañante elegible puede aceptar. Exige `Idempotency-Key`.

Petición (R2 con batería baja pide continuar con Sofía):

```json
{
  "visitId": "vis-91be3d05",
  "reason": "LOW_BATTERY",
  "preferredToId": "U-02",
  "note": "R2 necesita regresar a carga."
}
```

Respuesta 201:

```json
{
  "handoff": {
    "id": "hof-a7c3158e",
    "visitId": "vis-91be3d05",
    "state": "REQUESTED",
    "reason": "LOW_BATTERY",
    "fromId": "R2",
    "toId": null,
    "preferredToId": "U-02",
    "requestedBy": "R2",
    "note": "R2 necesita regresar a carga.",
    "summary": {
      "visitorName": "Camila T.",
      "category": "REGULAR",
      "destination": "Cancha de tenis",
      "lastKnownPoint": null
    },
    "createdAt": "2026-10-24T09:40:00-05:00",
    "expiresAt": "2026-10-24T09:45:00-05:00",
    "acceptedAt": null,
    "contextTransferredAt": null,
    "confirmedAt": null,
    "cancelledAt": null,
    "cancelReason": null,
    "version": 1
  },
  "visit": {
    "id": "vis-91be3d05",
    "state": "WAITING_HANDOFF",
    "category": "REGULAR",
    "visitor": {
      "ref": "V-202",
      "personId": "V-202",
      "displayName": "Camila Torres"
    },
    "destination": "Cancha de tenis",
    "ownerId": "R2",
    "resumeState": "IN_PROGRESS",
    "classification": {
      "state": "CONFIRMED",
      "category": "REGULAR",
      "evidence": ["MEMBERSHIP_ACTIVE"],
      "suggestedDestination": "Cancha de tenis"
    },
    "recognition": {
      "source": {
        "kind": "ROBOT",
        "id": "R1"
      },
      "simulated": false,
      "face": {
        "status": "MATCH",
        "classHint": "MEMBER",
        "candidateId": "V-202",
        "confidence": 0.93
      },
      "confidence": 0.93,
      "observedAt": "2026-10-24T09:10:00-05:00"
    },
    "invitationId": null,
    "hostName": null,
    "openHandoffId": "hof-a7c3158e",
    "arrivedAt": null,
    "closedAt": null,
    "closeReason": null,
    "failureReason": null,
    "feedbackSubmitted": false,
    "createdAt": "2026-10-24T09:10:00-05:00",
    "updatedAt": "2026-10-24T09:40:00-05:00",
    "version": 4
  }
}
```

Motivos: `ROBOT_FAILURE`, `NETWORK_LOSS`, `LOW_BATTERY` (críticos: si el relevo se cancela o vence, la visita queda en `WAITING_HANDOFF` sin relevo abierto, a la espera de otra solicitud) y `VISITOR_PREFERENCE`, `OPERATIONAL` (no críticos: la visita vuelve a su estado previo). Plazos: 300 s para ser aceptado; 600 s desde la aceptación para confirmarlo.

Errores: 400 `IDEMPOTENCY_KEY_REQUIRED` o `BAD_REQUEST`, 403 `ACTOR_NOT_ALLOWED`, 404 `VISIT_NOT_FOUND` o `PERSON_NOT_FOUND` (`preferredToId`), 409 `HANDOFF_ALREADY_OPEN`, 409 `INVALID_TRANSITION`, 409 `VERSION_CONFLICT`, 422 `VALIDATION_ERROR` o `IDEMPOTENCY_KEY_REUSED`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### GET /handoffs?state=

Lo consulta el panel del edecán (`?state=REQUESTED` son las tareas por tomar). Solo trae un resumen (nombre de pila e inicial, categoría, destino, último punto conocido): el contexto completo se entrega solo al receptor que aceptó. Respuesta 200 de `GET /handoffs?state=REQUESTED`:

```json
{
  "items": [
    {
      "id": "hof-4d1b02aa",
      "visitId": "vis-7f3a9c21",
      "state": "REQUESTED",
      "reason": "ROBOT_FAILURE",
      "fromId": "R2",
      "toId": null,
      "preferredToId": null,
      "requestedBy": "O-01",
      "note": null,
      "summary": {
        "visitorName": "Andrés M.",
        "category": "VIP",
        "destination": "Salón reservado",
        "lastKnownPoint": "Corredor norte"
      },
      "createdAt": "2026-10-24T09:20:00-05:00",
      "expiresAt": "2026-10-24T09:25:00-05:00",
      "acceptedAt": null,
      "contextTransferredAt": null,
      "confirmedAt": null,
      "cancelledAt": null,
      "cancelReason": null,
      "version": 1
    }
  ],
  "count": 1
}
```

Errores: 422 `VALIDATION_ERROR`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /handoffs/{id}/accept

Un acompañante elegible (edecán o robot de acompañamiento libre, distinto de quien entrega, y el indicado en `preferredToId` si existe) acepta. No lleva cuerpo; `X-Demo-Actor` es el receptor. Con dos aceptaciones simultáneas gana exactamente una y la otra recibe 409. Repetir con el mismo actor devuelve 200.

Respuesta 200 (`toId` queda fijado; el responsable de la visita sigue siendo `R2`):

```json
{
  "handoff": {
    "id": "hof-4d1b02aa",
    "visitId": "vis-7f3a9c21",
    "state": "ACCEPTED",
    "reason": "ROBOT_FAILURE",
    "fromId": "R2",
    "toId": "U-02",
    "preferredToId": null,
    "requestedBy": "O-01",
    "note": null,
    "summary": {
      "visitorName": "Andrés M.",
      "category": "VIP",
      "destination": "Salón reservado",
      "lastKnownPoint": "Corredor norte"
    },
    "createdAt": "2026-10-24T09:20:00-05:00",
    "expiresAt": "2026-10-24T09:30:40-05:00",
    "acceptedAt": "2026-10-24T09:20:40-05:00",
    "contextTransferredAt": null,
    "confirmedAt": null,
    "cancelledAt": null,
    "cancelReason": null,
    "version": 2
  },
  "visit": {
    "id": "vis-7f3a9c21",
    "state": "WAITING_HANDOFF",
    "category": "VIP",
    "visitor": {
      "ref": "V-201",
      "personId": "V-201",
      "displayName": "Andrés Mejía"
    },
    "destination": "Salón reservado",
    "ownerId": "R2",
    "resumeState": "IN_PROGRESS",
    "classification": {
      "state": "CONFIRMED",
      "category": "VIP",
      "evidence": ["MEMBERSHIP_ACTIVE"],
      "suggestedDestination": "Salón reservado"
    },
    "recognition": {
      "source": {
        "kind": "SIMULATOR",
        "id": "R1"
      },
      "simulated": true,
      "face": {
        "status": "MATCH",
        "classHint": "MEMBER",
        "candidateId": "V-201",
        "confidence": 0.97
      },
      "confidence": 0.97,
      "observedAt": "2026-10-24T09:02:11-05:00"
    },
    "invitationId": null,
    "hostName": null,
    "openHandoffId": "hof-4d1b02aa",
    "arrivedAt": null,
    "closedAt": null,
    "closeReason": null,
    "failureReason": null,
    "feedbackSubmitted": false,
    "createdAt": "2026-10-24T09:02:11-05:00",
    "updatedAt": "2026-10-24T09:20:40-05:00",
    "version": 5
  }
}
```

Respuesta 409 para el segundo aceptante:

```json
{
  "error": {
    "code": "HANDOFF_ALREADY_ACCEPTED",
    "message": "Otro acompañante ya aceptó este relevo.",
    "details": {
      "handoffId": "hof-4d1b02aa",
      "toId": "U-02"
    }
  }
}
```

Errores: 400 `BAD_REQUEST`, 403 `ACTOR_NOT_ALLOWED` (no elegible, o no es el indicado en `preferredToId`), 404 `HANDOFF_NOT_FOUND`, 409 `HANDOFF_ALREADY_ACCEPTED`, 409 `HANDOFF_EXPIRED`, 409 `INVALID_TRANSITION`, 409 `RECEIVER_BUSY`, 409 `VERSION_CONFLICT`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /handoffs/{id}/context

Este endpoint se añade a la lista mínima para que el estado `CONTEXT_TRANSFERRED` sea alcanzable por la API. Solo el receptor que aceptó lo llama; entrega el contexto completo y es obligatorio antes de confirmar. Repetirlo devuelve el mismo contexto.

Respuesta 200:

```json
{
  "handoff": {
    "id": "hof-4d1b02aa",
    "visitId": "vis-7f3a9c21",
    "state": "CONTEXT_TRANSFERRED",
    "reason": "ROBOT_FAILURE",
    "fromId": "R2",
    "toId": "U-02",
    "preferredToId": null,
    "requestedBy": "O-01",
    "note": null,
    "summary": {
      "visitorName": "Andrés M.",
      "category": "VIP",
      "destination": "Salón reservado",
      "lastKnownPoint": "Corredor norte"
    },
    "createdAt": "2026-10-24T09:20:00-05:00",
    "expiresAt": "2026-10-24T09:30:40-05:00",
    "acceptedAt": "2026-10-24T09:20:40-05:00",
    "contextTransferredAt": "2026-10-24T09:21:05-05:00",
    "confirmedAt": null,
    "cancelledAt": null,
    "cancelReason": null,
    "version": 3
  },
  "context": {
    "visitId": "vis-7f3a9c21",
    "visitor": {
      "ref": "V-201",
      "personId": "V-201",
      "displayName": "Andrés Mejía"
    },
    "category": "VIP",
    "destination": "Salón reservado",
    "preferences": ["Café"],
    "progress": {
      "state": "IN_PROGRESS",
      "arrivedAt": null,
      "lastKnownPoint": "Corredor norte"
    },
    "evidence": ["MEMBERSHIP_ACTIVE"],
    "note": null
  }
}
```

Errores: 400 `BAD_REQUEST`, 403 `ACTOR_NOT_ALLOWED` (no es el receptor), 404 `HANDOFF_NOT_FOUND`, 409 `HANDOFF_EXPIRED`, 409 `INVALID_TRANSITION` (todavía no aceptado, o ya terminal), 409 `VERSION_CONFLICT`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /handoffs/{id}/confirm

El receptor confirma la entrega. Es el único punto en que cambia el responsable de la visita. Exige haber recibido el contexto. Idempotente para el mismo receptor.

Respuesta 200 (`ownerId` pasa de `R2` a `U-02` y la visita vuelve a `IN_PROGRESS`):

```json
{
  "handoff": {
    "id": "hof-4d1b02aa",
    "visitId": "vis-7f3a9c21",
    "state": "CONFIRMED",
    "reason": "ROBOT_FAILURE",
    "fromId": "R2",
    "toId": "U-02",
    "preferredToId": null,
    "requestedBy": "O-01",
    "note": null,
    "summary": {
      "visitorName": "Andrés M.",
      "category": "VIP",
      "destination": "Salón reservado",
      "lastKnownPoint": "Corredor norte"
    },
    "createdAt": "2026-10-24T09:20:00-05:00",
    "expiresAt": "2026-10-24T09:30:40-05:00",
    "acceptedAt": "2026-10-24T09:20:40-05:00",
    "contextTransferredAt": "2026-10-24T09:21:05-05:00",
    "confirmedAt": "2026-10-24T09:21:40-05:00",
    "cancelledAt": null,
    "cancelReason": null,
    "version": 4
  },
  "visit": {
    "id": "vis-7f3a9c21",
    "state": "IN_PROGRESS",
    "category": "VIP",
    "visitor": {
      "ref": "V-201",
      "personId": "V-201",
      "displayName": "Andrés Mejía"
    },
    "destination": "Salón reservado",
    "ownerId": "U-02",
    "resumeState": null,
    "classification": {
      "state": "CONFIRMED",
      "category": "VIP",
      "evidence": ["MEMBERSHIP_ACTIVE"],
      "suggestedDestination": "Salón reservado"
    },
    "recognition": {
      "source": {
        "kind": "SIMULATOR",
        "id": "R1"
      },
      "simulated": true,
      "face": {
        "status": "MATCH",
        "classHint": "MEMBER",
        "candidateId": "V-201",
        "confidence": 0.97
      },
      "confidence": 0.97,
      "observedAt": "2026-10-24T09:02:11-05:00"
    },
    "invitationId": null,
    "hostName": null,
    "openHandoffId": null,
    "arrivedAt": null,
    "closedAt": null,
    "closeReason": null,
    "failureReason": null,
    "feedbackSubmitted": false,
    "createdAt": "2026-10-24T09:02:11-05:00",
    "updatedAt": "2026-10-24T09:21:40-05:00",
    "version": 7
  }
}
```

Errores: 400 `BAD_REQUEST`, 403 `ACTOR_NOT_ALLOWED`, 404 `HANDOFF_NOT_FOUND`, 409 `HANDOFF_EXPIRED`, 409 `INVALID_TRANSITION` (por ejemplo, confirmar sin haber recibido el contexto), 409 `VERSION_CONFLICT`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /handoffs/{id}/cancel

Cancela un relevo no terminal. Lo llama quien entrega (el responsable actual), el edecán que ya aceptó o un operador. No cambia el responsable. Idempotente. El cuerpo es opcional.

Petición (la visitante prefiere seguir con R2):

```json
{
  "cancelReason": "VISITOR_DECLINED"
}
```

Respuesta 200 (motivo no crítico: la visita vuelve a `IN_PROGRESS` con el mismo responsable):

```json
{
  "handoff": {
    "id": "hof-a7c3158e",
    "visitId": "vis-91be3d05",
    "state": "CANCELLED",
    "reason": "LOW_BATTERY",
    "fromId": "R2",
    "toId": null,
    "preferredToId": "U-02",
    "requestedBy": "R2",
    "note": "R2 necesita regresar a carga.",
    "summary": {
      "visitorName": "Camila T.",
      "category": "REGULAR",
      "destination": "Cancha de tenis",
      "lastKnownPoint": null
    },
    "createdAt": "2026-10-24T09:40:00-05:00",
    "expiresAt": "2026-10-24T09:45:00-05:00",
    "acceptedAt": null,
    "contextTransferredAt": null,
    "confirmedAt": null,
    "cancelledAt": "2026-10-24T09:41:00-05:00",
    "cancelReason": "VISITOR_DECLINED",
    "version": 2
  },
  "visit": {
    "id": "vis-91be3d05",
    "state": "IN_PROGRESS",
    "category": "REGULAR",
    "visitor": {
      "ref": "V-202",
      "personId": "V-202",
      "displayName": "Camila Torres"
    },
    "destination": "Cancha de tenis",
    "ownerId": "R2",
    "resumeState": null,
    "classification": {
      "state": "CONFIRMED",
      "category": "REGULAR",
      "evidence": ["MEMBERSHIP_ACTIVE"],
      "suggestedDestination": "Cancha de tenis"
    },
    "recognition": {
      "source": {
        "kind": "ROBOT",
        "id": "R1"
      },
      "simulated": false,
      "face": {
        "status": "MATCH",
        "classHint": "MEMBER",
        "candidateId": "V-202",
        "confidence": 0.93
      },
      "confidence": 0.93,
      "observedAt": "2026-10-24T09:10:00-05:00"
    },
    "invitationId": null,
    "hostName": null,
    "openHandoffId": null,
    "arrivedAt": null,
    "closedAt": null,
    "closeReason": null,
    "failureReason": null,
    "feedbackSubmitted": false,
    "createdAt": "2026-10-24T09:10:00-05:00",
    "updatedAt": "2026-10-24T09:41:00-05:00",
    "version": 5
  }
}
```

Errores: 400 `BAD_REQUEST`, 403 `ACTOR_NOT_ALLOWED`, 404 `HANDOFF_NOT_FOUND`, 409 `INVALID_TRANSITION` (relevo ya confirmado o vencido), 409 `VERSION_CONFLICT`, 422 `VALIDATION_ERROR`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

### POST /robots/{id}/failure

Registra la falla de un robot (la reporta el propio robot o el operador que simula la falla; un robot no reporta la de otro). Con token de robot activo exige `Authorization: Bearer`. El cuerpo no admite campos desconocidos. Deja el robot en `FAULT` y crea un relevo por cada visita abierta suya (`VERIFIED`, `ORIENTING` o `IN_PROGRESS`). Es idempotente y reanudable. Exige `Idempotency-Key`. Correspondencia de códigos: `MOTOR_FAULT`, `NAVIGATION_BLOCKED` y `OBSTACLE` generan relevos con motivo `ROBOT_FAILURE`; `LOW_BATTERY` y `NETWORK_LOSS` conservan su nombre.

Petición (`POST /robots/R2/failure`, actor `O-01`):

```json
{
  "code": "MOTOR_FAULT",
  "lastKnownPoint": "Corredor norte"
}
```

Respuesta 200:

```json
{
  "robot": {
    "id": "R2",
    "status": "FAULT"
  },
  "handoffs": [
    {
      "id": "hof-4d1b02aa",
      "visitId": "vis-7f3a9c21",
      "state": "REQUESTED",
      "reason": "ROBOT_FAILURE",
      "fromId": "R2",
      "toId": null,
      "preferredToId": null,
      "requestedBy": "O-01",
      "note": null,
      "summary": {
        "visitorName": "Andrés M.",
        "category": "VIP",
        "destination": "Salón reservado",
        "lastKnownPoint": "Corredor norte"
      },
      "createdAt": "2026-10-24T09:20:00-05:00",
      "expiresAt": "2026-10-24T09:25:00-05:00",
      "acceptedAt": null,
      "contextTransferredAt": null,
      "confirmedAt": null,
      "cancelledAt": null,
      "cancelReason": null,
      "version": 1
    }
  ]
}
```

Un robot sin visitas abiertas devuelve `handoffs: []`. No hay endpoint de recuperación del robot en `v1`: se restablece con `POST /demo/reset`. Errores: 400 `IDEMPOTENCY_KEY_REQUIRED` o `BAD_REQUEST`, 401 `UNAUTHENTICATED` (solo con token de robot activo), 403 `ACTOR_NOT_ALLOWED`, 404 `ROBOT_NOT_FOUND`, 409 `VERSION_CONFLICT`, 422 `VALIDATION_ERROR` o `IDEMPOTENCY_KEY_REUSED`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.

## 5. Recorrido completo de una visita con falla del robot

Secuencia de las llamadas de los ejemplos anteriores para Andrés (VIP). Cada fila indica el estado de la visita después de la llamada.

| Paso | Llamada                                                | Estado de la visita                              | `ownerId` |
| ---- | ------------------------------------------------------ | ------------------------------------------------ | --------- |
| 1    | `POST /recognition/events` (rostro de V-201)           | `VERIFIED` (VIP)                                 | `R1`      |
| 2    | `POST /visits/{id}/advance` con `START_ORIENTATION`    | `ORIENTING`                                      | `R1`      |
| 3    | `POST /visits/{id}/advance` con `ASSIGN_ESCORT` a `R2` | `IN_PROGRESS`                                    | `R2`      |
| 4    | `POST /robots/R2/failure`                              | `WAITING_HANDOFF` (relevo `REQUESTED`)           | `R2`      |
| 5    | `GET /handoffs?state=REQUESTED` (panel del edecán)     | sin cambio                                       | `R2`      |
| 6    | `POST /handoffs/{id}/accept` por `U-02`                | `WAITING_HANDOFF` (relevo `ACCEPTED`)            | `R2`      |
| 7    | `POST /handoffs/{id}/context` por `U-02`               | `WAITING_HANDOFF` (relevo `CONTEXT_TRANSFERRED`) | `R2`      |
| 8    | `POST /handoffs/{id}/confirm` por `U-02`               | `IN_PROGRESS` (relevo `CONFIRMED`)               | `U-02`    |
| 9    | `POST /visits/{id}/advance` con `ARRIVE`               | `IN_PROGRESS`                                    | `U-02`    |
| 10   | `POST /visits/{id}/close`                              | `CLOSED`                                         | `U-02`    |
| 11   | `POST /visits/{id}/feedback`                           | `CLOSED`                                         | `U-02`    |

Los ejemplos de esta guía numeran las versiones de la visita así: 1 al verificarse, 2 al orientar, 3 al asignar, 4 al fallar el robot, 5 al aceptar, 6 al recibir el contexto, 7 al confirmar, 8 al llegar, 9 al cerrar y 10 al evaluar.

## 6. Cómo se integra un tercero

1. Consultar `GET /health` para confirmar la disponibilidad y el almacenamiento.
2. Enviar a `POST /recognition/events` la señal del reconocimiento facial con su origen (`source`). Si el servicio facial usa otro formato, un adaptador lo traduce a este cuerpo.
3. Si el visitante presenta un QR, llamar a `POST /access/verify`.
4. Avanzar la visita con `POST /visits/{id}/advance` y cerrarla con `POST /visits/{id}/close`.
5. Ante una falla, llamar a `POST /robots/{id}/failure` y consultar `GET /handoffs?state=REQUESTED` para saber quién asume.
6. Enviar siempre `Idempotency-Key` donde se exige y `X-Demo-Actor` con el identificador del robot; reintentar con la misma clave tras un fallo de red. Si otra petición con la misma clave sigue en curso, la respuesta es 409 `VERSION_CONFLICT`: reintentar con la misma clave. Un rechazo de negocio (`DENIED`) no se guarda para repetirse.
7. Si el servidor define `CERBERUS_ROBOT_TOKEN`, enviar `Authorization: Bearer <token>` en `recognition/events`, `access/verify` y `robots/{id}/failure`. Con el token activo, las pantallas de la interfaz que llaman esos endpoints dejan de funcionar contra ese servidor: se activa solo para el despliegue que usa el robot real.
8. No enviar imágenes ni vectores faciales: la API los rechaza. Solo se envía la señal reducida (estado, pista de clase, candidato y confianza).
9. Tratar los códigos de error como estables y los motivos de clasificación como un conjunto que puede crecer.

## 7. Limitaciones conocidas

- El enlace del pase (`/pase/<token>`) es una credencial al portador: quien lo recibe puede ver el pase mientras la invitación exista.
- Sin autenticación real de personas: el actor es declarativo, así que quien conozca el identificador de un socio puede declararse él y leer sus invitaciones y tokens. Es aceptable solo porque los datos son ficticios. El único control verificable es el token opcional del robot (`CERBERUS_ROBOT_TOKEN`), que no existe en el modo demostración del navegador.
- Detrás de un proxy distinto de Vercel, las cabeceras de IP son falsificables y el límite de tasa se puede eludir.
- La batería y la ruta de los robots no se modelan: el robot decide si ofrece acompañar.
- No hay endpoint para marcar un robot como recuperado: se usa `POST /demo/reset`.
- La respuesta guardada de una clave de idempotencia caduca a las 24 horas; el reinicio de la demostración las elimina. Solo se guardan las respuestas correctas (2xx).
- Los relevos vencen de forma perezosa: un relevo pasado de plazo figura `EXPIRED` cuando alguien lo consulta o actúa sobre él.
- Sin notificaciones push ni paginación.
- Con almacenamiento en memoria en un servidor serverless, el estado es volátil y no se comparte entre instancias; con localStorage (modo mock) solo vive en un navegador.
