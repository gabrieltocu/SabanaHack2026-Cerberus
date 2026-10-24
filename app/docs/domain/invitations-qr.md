# Invitaciones y QR

Este documento describe el contrato anterior de `/api/v1`. La aplicación del club y la integración con Cerberus usan el contrato actual de [CLUB.md](../api/CLUB.md) y [SABANAHACK.md](../api/SABANAHACK.md), cuyo QR firmado contiene ID y nombre.

Especifica la invitación que un socio emite para un invitado sin cuenta y el QR temporal que la acompaña. Complementa `docs/adr/0004-qr-handoff.md` y la clasificación de `categories-matrix.md`. Todos los datos son ficticios.

## 1. Conceptos

- **Invitación.** Autorización de un socio para que una persona concreta visite el club en una fecha concreta. El invitado no tiene cuenta ni se registra.
- **QR.** Representación visual de un token opaco asociado a la invitación. No contiene datos personales ni de la visita.
- **Visita esperada.** Al crear la invitación se crea una visita en estado `EXPECTED`; la invitación vive dentro de ese registro (ver sección 5).

## 2. Campos de la invitación

| Campo                      | Tipo                                               | Obligatorio | Notas                                                                                                                                                 |
| -------------------------- | -------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | cadena                                             | sí          | `inv-` seguido de 8 caracteres hexadecimales, generado por el servidor.                                                                               |
| `hostId`                   | cadena                                             | sí          | Identificador del socio anfitrión (por ejemplo, `V-209`).                                                                                             |
| `guest.fullName`           | cadena de 2 a 80 caracteres                        | sí          | Nombre del invitado.                                                                                                                                  |
| `guest.contact`            | cadena de hasta 120 caracteres                     | no          | Correo o teléfono ficticio; no se codifica en el QR.                                                                                                  |
| `guest.note`               | cadena de hasta 140 caracteres                     | no          | Preferencias que indica el anfitrión (por ejemplo, "Agua aromática"). El robot las confirma con el invitado; no las da por vigentes.                  |
| `guest.ref`                | cadena                                             | generado    | Referencia del invitado asignada por el servidor (`G-` y 8 hexadecimales). En la semilla, Valentina usa `V-203` por coherencia con el guion del club. |
| `meetingPoint`             | cadena de hasta 60 caracteres                      | no          | Punto de encuentro con el anfitrión (por ejemplo, "Terraza"). Es el destino sugerido de la visita.                                                    |
| `date`                     | fecha `AAAA-MM-DD`                                 | sí          | Fecha civil en Bogotá.                                                                                                                                |
| `window`                   | `{ from, to }` en `HH:MM`                          | no          | Por defecto `{ from: "06:00", to: "22:00" }`.                                                                                                         |
| `state`                    | `ACTIVE`, `CANCELLED`, `USED`, `EXPIRED`           | generado    | Ver sección 4.                                                                                                                                        |
| `qr`                       | `{ token, validFrom, validTo, usedAt, revokedAt }` | generado    | `validFrom` y `validTo` son instantes con desfase `-05:00`.                                                                                           |
| `visitId`                  | cadena                                             | generado    | Visita esperada asociada.                                                                                                                             |
| `createdAt`, `cancelledAt` | instante                                           | generado    | `cancelledAt` solo si se canceló.                                                                                                                     |

No hay foto del invitado en el contrato: no se almacena nada biométrico. La interfaz puede mostrar un avatar generado en el dispositivo.

## 3. Reglas

Se evalúan en este orden: validación del cuerpo, anfitrión, fecha, duplicado, límite.

| Id    | Regla                                                                                                                                                                                                                                                                               | Resultado si se incumple                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| IR-01 | El anfitrión existe y es socio con membresía `ACTIVE` y vigente hasta la fecha de la invitación.                                                                                                                                                                                    | 404 `PERSON_NOT_FOUND` si no existe; 403 `HOST_NOT_ELIGIBLE` si no es socio o su membresía no está activa. |
| IR-02 | La fecha no es pasada (fecha civil en Bogotá). Si es hoy, el fin de la ventana debe ser posterior al instante actual.                                                                                                                                                               | 422 `INVITATION_DATE_IN_PAST`.                                                                             |
| IR-03 | La ventana por defecto es `[06:00, 22:00)` del día de la invitación en Bogotá. Una ventana propia exige `from` menor que `to`, formato `HH:MM` y mismo día.                                                                                                                         | 422 `VALIDATION_ERROR`.                                                                                    |
| IR-04 | El invitado no necesita cuenta: solo `guest.fullName` es obligatorio.                                                                                                                                                                                                               | 422 `VALIDATION_ERROR` si falta.                                                                           |
| IR-05 | No puede haber dos invitaciones `ACTIVE` o `USED` con el mismo anfitrión, la misma fecha y el mismo invitado. Invitado igual significa nombre igual tras normalizar (minúsculas, sin tildes, espacios colapsados). Una invitación `CANCELLED` no cuenta: se puede volver a invitar. | 409 `INVITATION_DUPLICATE`.                                                                                |
| IR-06 | Un socio tiene como máximo 5 invitaciones `ACTIVE` o `USED` por fecha de invitación. Las canceladas y las vencidas no cuentan.                                                                                                                                                      | 409 `INVITATION_DAILY_LIMIT`.                                                                              |
| IR-07 | El token del QR son 16 bytes (128 bits) de un generador criptográfico en base64url (22 caracteres), único en el almacén.                                                                                                                                                            | No aplica: lo garantiza el sistema.                                                                        |
| IR-08 | Solo se cancela una invitación `ACTIVE`, y solo la cancela su anfitrión o un operador. Cancelar una ya cancelada devuelve 200 con el mismo estado (idempotente).                                                                                                                    | 403 `ACTOR_NOT_ALLOWED`; 409 `INVITATION_NOT_ACTIVE` si está `USED` o `EXPIRED`.                           |
| IR-09 | `EXPIRED` no se guarda: se deriva cuando el instante actual es mayor o igual que `validTo` y la invitación no se usó ni se canceló. La primera lectura o escritura posterior cierra la visita esperada con motivo `NO_SHOW`.                                                        | No aplica.                                                                                                 |
| IR-10 | `USED` ocurre una sola vez, cuando la visita se verifica con ese QR. No es reversible.                                                                                                                                                                                              | Un segundo uso se rechaza con `QR_ALREADY_USED`.                                                           |
| IR-11 | Consultar invitaciones exige `hostId`. Se puede filtrar por `state` y `date`.                                                                                                                                                                                                       | 422 `VALIDATION_ERROR` si falta `hostId`.                                                                  |

Cuando un token se rechaza, los motivos son los de `docs/adr/0003-facial-classification.md`: `QR_UNKNOWN`, `QR_REVOKED`, `QR_ALREADY_USED`, `QR_NOT_YET_VALID` y `QR_EXPIRED`, evaluados en ese orden.

## 4. Estados de la invitación

| Origen                         | Evento           | Destino     | Condición                                                                                                        |
| ------------------------------ | ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| (nueva)                        | creación         | `ACTIVE`    | Pasa IR-01 a IR-06.                                                                                              |
| `ACTIVE`                       | cancelación      | `CANCELLED` | IR-08. La visita esperada pasa a `CLOSED` con motivo `INVITATION_CANCELLED`. El QR queda revocado (`revokedAt`). |
| `ACTIVE`                       | QR verificado    | `USED`      | Dentro de la ventana, en la misma escritura que verifica la visita. Se fija `usedAt`.                            |
| `ACTIVE`                       | vence la ventana | `EXPIRED`   | IR-09.                                                                                                           |
| `CANCELLED`, `USED`, `EXPIRED` | cualquiera       | sin cambio  | Estados terminales.                                                                                              |

## 5. Fuente de verdad

- La verdad de la invitación y de la validez del QR es el registro del servidor (`visit:<id>` con la invitación embebida; índices `qr:<token>` y `hostday:<hostId>:<fecha>`). Ver ADR 0002.
- La imagen del QR es solo una representación del token; no es una fuente de verdad. Ningún cliente decide validez, vigencia ni uso.
- El índice `hostday` hace atómicos el límite diario y la detección de duplicados: ambos se comprueban y se actualizan con `compareAndSet` sobre esa clave.
- En modo `mock` la fuente de verdad es el almacén local del navegador; no hay otra copia.

## 6. Casos negativos

| Caso                                         | Entrada                                                                         | Resultado esperado                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Fecha pasada                                 | `date` de ayer                                                                  | 422 `INVITATION_DATE_IN_PAST`                                                           |
| Hoy, ventana ya terminada                    | `date` de hoy a las 22:30                                                       | 422 `INVITATION_DATE_IN_PAST`                                                           |
| Fecha inexistente                            | `date: 2026-02-30`                                                              | 422 `VALIDATION_ERROR`                                                                  |
| Ventana invertida                            | `window: { from: "22:00", to: "06:00" }`                                        | 422 `VALIDATION_ERROR`                                                                  |
| Falta nombre del invitado                    | `guest: {}`                                                                     | 422 `VALIDATION_ERROR`                                                                  |
| Anfitrión que no es socio                    | `hostId: V-204` (personal)                                                      | 403 `HOST_NOT_ELIGIBLE`                                                                 |
| Anfitrión inexistente                        | `hostId: V-999`                                                                 | 404 `PERSON_NOT_FOUND`                                                                  |
| Membresía suspendida                         | `hostId: V-207`                                                                 | 403 `HOST_NOT_ELIGIBLE`                                                                 |
| Duplicado                                    | Misma fecha, anfitrión e invitado ("Valentina Restrepo" y "valentina restrepo") | 409 `INVITATION_DUPLICATE`                                                              |
| Sexta invitación del día                     | Anfitrión con 5 `ACTIVE` o `USED` para la fecha                                 | 409 `INVITATION_DAILY_LIMIT`                                                            |
| Invitación cancelada y vuelta a crear        | Mismo invitado, fecha y anfitrión                                               | 201 (la cancelada no cuenta)                                                            |
| Cancelar usada                               | `POST /invitations/{id}/cancel` sobre `USED`                                    | 409 `INVITATION_NOT_ACTIVE`                                                             |
| Cancelar ajena                               | Actor distinto del anfitrión y que no es operador                               | 403 `ACTOR_NOT_ALLOWED`                                                                 |
| Cancelar dos veces                           | Segunda cancelación                                                             | 200, mismo estado                                                                       |
| Invitación inexistente                       | `GET /invitations/inv-00000000`                                                 | 404 `INVITATION_NOT_FOUND`                                                              |
| Listar sin anfitrión                         | `GET /invitations`                                                              | 422 `VALIDATION_ERROR`                                                                  |
| QR fuera de ventana                          | Ver reglas R10, R20 y R23 de la matriz                                          | `DENIED` con `QR_EXPIRED` o `QR_NOT_YET_VALID`                                          |
| QR reutilizado                               | Segundo uso del mismo token                                                     | `DENIED` con `QR_ALREADY_USED`                                                          |
| QR de invitación cancelada                   | Token de una `CANCELLED`                                                        | `DENIED` con `QR_REVOKED`                                                               |
| Token inventado o alterado                   | Cadena no emitida                                                               | `DENIED` con `QR_UNKNOWN`                                                               |
| Repetir la creación con la misma clave       | Misma `Idempotency-Key` y mismo cuerpo                                          | 201 con la respuesta original y `Idempotency-Replayed: true`, sin crear otra invitación |
| Misma clave, otro cuerpo                     | Misma `Idempotency-Key`, distinto invitado                                      | 422 `IDEMPOTENCY_KEY_REUSED`                                                            |
| Creaciones simultáneas hasta pasar el límite | Seis peticiones concurrentes del mismo anfitrión y fecha                        | Exactamente cinco con 201 y una con 409 `INVITATION_DAILY_LIMIT`                        |

## 7. Cobertura buscada y dónde se prueba

Los identificadores TI-xx describen la cobertura buscada. Se prueban en `tests/unit/api/invitations.test.ts`, `tests/unit/api/passes.test.ts`, `tests/unit/domain/qr-token.test.ts` y `tests/unit/domain/bogota-time.test.ts` (unitarias y de casos de uso), `tests/integration/api/journeys.test.ts` (recorridos), `tests/unit/security/qr.test.ts` (token alterado), `tests/contract/` (contrato) y `tests/e2e/member-pass.spec.ts` (E2E).

| Id    | Nivel       | Qué comprueba                                                                                            |
| ----- | ----------- | -------------------------------------------------------------------------------------------------------- |
| TI-01 | Unitaria    | Ventana por defecto `[06:00, 22:00)` en Bogotá y sus fronteras (05:59:59, 06:00:00, 21:59:59, 22:00:00). |
| TI-02 | Unitaria    | Fecha pasada y "hoy con ventana terminada"; reloj inyectado.                                             |
| TI-03 | Unitaria    | Normalización del nombre y detección de duplicado.                                                       |
| TI-04 | Unitaria    | Límite de 5: la sexta falla; cancelar una libera cupo.                                                   |
| TI-05 | Unitaria    | Token de 22 caracteres base64url, único y sin datos personales.                                          |
| TI-06 | Integración | Crear, consultar, cancelar y volver a crear con almacén en memoria.                                      |
| TI-07 | Integración | Seis creaciones simultáneas: cinco aciertos y un rechazo.                                                |
| TI-08 | Integración | Verificar el QR consume la invitación y verifica la visita en una escritura; el segundo uso se rechaza.  |
| TI-09 | Integración | Vencimiento perezoso: la visita esperada pasa a `CLOSED` con `NO_SHOW`.                                  |
| TI-10 | Contrato    | Cada error de la tabla de casos negativos usa su código y su estado HTTP.                                |
| TI-11 | Seguridad   | Un token alterado, truncado o con espacios da `QR_UNKNOWN` sin distinguir los casos.                     |
| TI-12 | E2E         | Socio crea invitación, el invitado presenta el QR en el robot y entra; un segundo intento falla.         |
