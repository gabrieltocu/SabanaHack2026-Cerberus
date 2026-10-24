# Matriz de categorías y reglas de clasificación

Especifica las cinco categorías de visitante, cómo se confirma cada una y las reglas de clasificación como casos de prueba. Fundamenta la política `classify` descrita en `docs/adr/0003-facial-classification.md`. Todos los datos de este documento son ficticios.

## 1. Alcance

- Cubre la clasificación de una llegada: señal facial más evidencia, resultado `CONFIRMED`, `MANUAL_REVIEW` o `DENIED`.
- La invitación y el QR se detallan en `invitations-qr.md`; los estados de la visita y del relevo, en `visit-handoff-states.md`.
- Las cinco categorías y sus recorridos de referencia provienen de los guiones del club para cinco perfiles: Andrés (V-201), Camila (V-202), Valentina (V-203), Mario (V-204) y Laura (V-205).

## 2. Convenciones

- Zona horaria: `America/Bogota` (UTC-5, sin horario de verano). Un "día" es la fecha civil en Bogotá, no en UTC.
- Los intervalos horarios y de turno son de inicio inclusivo y fin exclusivo: `[08:00, 17:00)` acepta 08:00:00 y rechaza 17:00:00.
- Las vigencias de membresía y de permiso son fechas civiles inclusivas.
- `FACE_MIN_CONFIDENCE = 0,8`, inclusivo.
- Los instantes se escriben con su desfase (`-05:00`) o en UTC (`Z`). Instante base de demostración: `T_DEMO = 2026-10-24T09:00:00-05:00` (sábado).

## 3. Tabla A: cómo se clasifica cada categoría

| Categoría          | Perfil de referencia | Señal facial esperada                          | Evidencia que confirma                                                                          | Ventana o permiso                                                                          | Si falta evidencia                                                                                                                     |
| ------------------ | -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| VIP                | Andrés, V-201        | `MATCH`, pista `MEMBER`, con `candidateId`     | Membresía de nivel VIP, activa y vigente (`MEMBERSHIP_ACTIVE`)                                  | Vigencia de la membresía; sin restricción horaria                                          | Membresía vencida o rostro dudoso: `MANUAL_REVIEW`. Suspendida: `DENIED`.                                                              |
| Regular            | Camila, V-202        | `MATCH`, pista `MEMBER`, con `candidateId`     | Membresía de nivel regular, activa y vigente (`MEMBERSHIP_ACTIVE`)                              | Vigencia de la membresía; sin restricción horaria                                          | Igual que VIP.                                                                                                                         |
| Invitado           | Valentina, V-203     | `MATCH`, pista `NON_MEMBER`, sin `candidateId` | Invitación del anfitrión (Male, V-209) comprobada mediante un QR válido (`INVITATION_QR_VALID`) | Fecha de la invitación y ventana por defecto `[06:00, 22:00)` en Bogotá, un solo uso       | Sin invitación: `MANUAL_REVIEW(NO_EVIDENCE)`, nunca se infiere invitado. QR vencido, usado, revocado, aún no válido o falso: `DENIED`. |
| Personal del club  | Mario, V-204         | `MATCH`, pista `NON_MEMBER`, con `candidateId` | Registro en el directorio de personal con turno vigente (`STAFF_SHIFT_ACTIVE`)                  | Turno del día, `[inicio, fin)`                                                             | Sin turno vigente: `MANUAL_REVIEW(STAFF_OUTSIDE_SHIFT)`. Si además es socio: `MANUAL_REVIEW(DUAL_ROLE)` y se pregunta el motivo.       |
| Trabajador externo | Laura, V-205         | `MATCH`, pista `NON_MEMBER`, con `candidateId` | Permiso vigente con orden de trabajo, día, horario y responsable (`EXTERNAL_PERMIT_ACTIVE`)     | Rango de fechas del permiso, día de la semana y horario. Ejemplo: sábados `[08:00, 17:00)` | Fuera de día u horario: `DENIED(EXTERNAL_PERMIT_OUTSIDE_WINDOW)`. Sin registro: `MANUAL_REVIEW(CANDIDATE_NOT_FOUND)`.                  |

Para cualquier categoría, `UNKNOWN`, `ERROR` o una confianza menor que 0,8 (o no numérica, o fuera de 0 a 1) dan `MANUAL_REVIEW` y no autorizan nada.

**Invitado reconocido por rostro (solo demostración).** La vía general de un invitado es el QR, como indica la tabla. Además, la semilla incluye un perfil facial de demostración consentido para Valentina (`V-203`): su señal llega con `candidateId` y, si tiene una invitación vigente, se confirma como `GUEST` con la evidencia `INVITATION_ACTIVE` (regla R31). Sin invitación vigente no se infiere nada (`MANUAL_REVIEW(NO_EVIDENCE)`).

## 4. Tabla B: experiencia de cada categoría

| Categoría          | Destino de ejemplo                     | Acompañamiento                                                                                                                                                                       | Orientación                                                                                                                                                                                                                                                                                                           |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VIP                | Salón reservado (reserva confirmada)   | Robot con prioridad (R2) si está libre, la ruta es permitida y tiene batería para ir y volver; si no, edecán humano (Sara) o espera informada. Siempre con aceptación del visitante. | Saludo con nombre y ofrecimiento de la bebida registrada (café). Ofrece conocer las actividades del día o ir a su reserva. No se retira un robot que atiende a otra visita.                                                                                                                                           |
| Regular            | Cancha de tenis (reserva)              | Edecán humano (Sara) o un robot cuando haya capacidad; el visitante elige ir acompañado o recibir indicaciones.                                                                      | Saludo con nombre y ofrecimiento de la bebida registrada (té). Se pregunta el destino y se confirma la reserva; no se obliga a un recorrido.                                                                                                                                                                          |
| Invitado           | Terraza, donde lo espera su anfitriona | Robot (R2) ofrecido; el invitado acepta o prefiere otra opción.                                                                                                                      | Saludo con nombre. Se confirma con el invitado la preferencia indicada por la anfitriona (agua aromática) y el punto de encuentro, sin darlos por vigentes. Si la anfitriona no responde, espera asistida en un punto atendido. Al salir, se ofrece la membresía solo si la persona lo desea; la categoría no cambia. |
| Personal del club  | Operaciones                            | Sin acompañamiento por defecto; continúa por su cuenta salvo que lo pida.                                                                                                            | Saludo con nombre y ofrecimiento de un resumen de agenda en privado, sin anunciar reuniones delante de otras personas. El cierre de la orientación no sustituye el control de asistencia laboral.                                                                                                                     |
| Trabajador externo | Recepción de proveedores               | Edecán humano (Sara); el externo no usa acompañante robot (supuesto S-1).                                                                                                            | Trato formal. Se informa quién solicitó el servicio y dónde espera el responsable; se pide esperar su confirmación antes de entrar al área de trabajo. La entrega no autoriza otras áreas ni aprueba el trabajo técnico.                                                                                              |

## 5. Orden de evaluación

La política evalúa en este orden y la primera regla que aplica decide (detalle y justificación en el ADR 0003):

1. Estado de la señal facial (`ERROR`, `UNKNOWN`, confianza baja).
2. Pista `MEMBER`: candidato, membresía, suspensión, vencimiento, doble rol, nivel.
3. Pista `NON_MEMBER` con `candidateId`: personal, externo vigente, invitación vigente del perfil consentido, externo fuera de ventana, invitación no vigente.
4. Pista `NON_MEMBER` sin `candidateId`, con `qrToken`: verificación del QR.
5. Pista `NON_MEMBER` sin nada más: `NO_EVIDENCE`.

## 6. Fixtures

Personas del directorio (semilla común de pruebas y demostración):

| Id    | Nombre        | Registro                 | Detalle                                                                                                                              |
| ----- | ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| V-201 | Andrés Mejía  | Socio VIP                | `ACTIVE`, vigente hasta 2027-06-30. Reserva: Salón reservado. Preferencia: café.                                                     |
| V-202 | Camila Torres | Socia regular            | `ACTIVE`, vigente hasta 2027-03-31. Reserva: Cancha de tenis. Preferencia: té.                                                       |
| V-204 | Mario Salcedo | Personal                 | Turno 2026-10-24 de 08:00 a 20:00. Destino: Operaciones.                                                                             |
| V-205 | Laura Beltrán | Externa                  | Orden OT-0412, sábados de 08:00 a 17:00, vigente del 2026-10-01 al 2026-12-31, responsable V-204. Destino: Recepción de proveedores. |
| V-206 | Daniela Vega  | Socia regular y personal | Membresía `ACTIVE` y turno 2026-10-24 de 10:00 a 18:00.                                                                              |
| V-207 | Esteban Cruz  | Socio regular            | Membresía `SUSPENDED`.                                                                                                               |
| V-208 | Iván Rojas    | Socio VIP                | Membresía vencida el 2026-09-30.                                                                                                     |
| V-209 | Male Ospina   | Socia regular            | `ACTIVE`, vigente hasta 2027-01-31. Anfitriona de Valentina.                                                                         |
| V-210 | Paula Rincón  | Personal                 | Solo tiene turno el 2026-10-23.                                                                                                      |

Invitaciones y QR (los tokens simbólicos se sustituyen en las pruebas por valores generados de 22 caracteres):

| Nombre del fixture | Invitado                   | Anfitrión | Fecha y estado                                 | Resultado esperado de verificar |
| ------------------ | -------------------------- | --------- | ---------------------------------------------- | ------------------------------- |
| `QR_VALENTINA`     | Valentina Restrepo (V-203) | V-209     | 2026-10-24, `ACTIVE`, ventana `[06:00, 22:00)` | Válido en `T_DEMO`              |
| `QR_EXPIRED`       | Tomás Parra                | V-202     | 2026-10-23, `ACTIVE`                           | `QR_EXPIRED` en `T_DEMO`        |
| `QR_USED`          | Lucía Naranjo              | V-202     | 2026-10-24, `USED`                             | `QR_ALREADY_USED`               |
| `QR_REVOKED`       | Sergio Quintero            | V-202     | 2026-10-24, `CANCELLED`                        | `QR_REVOKED`                    |
| `QR_FUTURE`        | Marta Ibáñez               | V-202     | 2026-10-25, `ACTIVE`                           | `QR_NOT_YET_VALID` en `T_DEMO`  |
| `QR_FORGED`        | no existe                  | no existe | cadena de 22 caracteres que nadie emitió       | `QR_UNKNOWN`                    |

Instantes de referencia:

| Nombre       | Instante                  | Observación                |
| ------------ | ------------------------- | -------------------------- |
| `T_DEMO`     | 2026-10-24T09:00:00-05:00 | Sábado                     |
| `T_SAT_1030` | 2026-10-24T10:30:00-05:00 | Sábado                     |
| `T_TUE`      | 2026-10-27T10:00:00-05:00 | Martes (externo un martes) |

## 7. Reglas de clasificación

Cada regla es un caso de prueba de la política `classify` salvo indicación. "Esperado" es el resultado exacto.

### R01 Socio VIP vigente

- Dado: V-201, membresía VIP `ACTIVE` y vigente.
- Cuando: llega `MATCH`, pista `MEMBER`, `candidateId: V-201`, confianza 0,97, en `T_DEMO`.
- Entonces: se confirma la categoría con la evidencia de la membresía.
- Esperado: `CONFIRMED/VIP`, evidencia `[MEMBERSHIP_ACTIVE]`.

### R02 Socio regular

- Dado: V-202, membresía regular `ACTIVE` y vigente.
- Cuando: `MATCH`, pista `MEMBER`, `candidateId: V-202`, confianza 0,93, en `T_DEMO`.
- Esperado: `CONFIRMED/REGULAR`.

### R03 No miembro con invitación válida

- Dado: `QR_VALENTINA` vigente; no hay `candidateId`.
- Cuando: `MATCH`, pista `NON_MEMBER`, `qrToken: QR_VALENTINA`, en `T_DEMO`.
- Esperado: `CONFIRMED/GUEST`, evidencia `[INVITATION_QR_VALID]`.

### R04 No miembro sin invitación: no se infiere invitado

- Dado: ninguna invitación presentada.
- Cuando: `MATCH`, pista `NON_MEMBER`, sin `candidateId` ni `qrToken`.
- Esperado: `MANUAL_REVIEW/NO_EVIDENCE`. Nunca `GUEST`.

### R05 No miembro que es personal con turno

- Dado: V-204 con turno 2026-10-24 `[08:00, 20:00)`.
- Cuando: `MATCH`, pista `NON_MEMBER`, `candidateId: V-204`, en `T_DEMO`.
- Esperado: `CONFIRMED/STAFF`, evidencia `[STAFF_SHIFT_ACTIVE]`.

### R06 Externo con permiso, sábado en horario

- Dado: V-205 con permiso sábados `[08:00, 17:00)`.
- Cuando: `MATCH`, pista `NON_MEMBER`, `candidateId: V-205`, en `T_SAT_1030`.
- Esperado: `CONFIRMED/EXTERNAL`, evidencia `[EXTERNAL_PERMIT_ACTIVE]`.

### R07 Externo un martes

- Dado: el permiso de V-205 solo vale los sábados.
- Cuando: `MATCH`, pista `NON_MEMBER`, `candidateId: V-205`, en `T_TUE`.
- Esperado: `DENIED/EXTERNAL_PERMIT_OUTSIDE_WINDOW`.

### R08 Externo: fronteras del horario del sábado

- Dado: el permiso de V-205, sábado 2026-10-24.
- Cuando y esperado (mismo evento que en R06, solo cambia el instante):
  - 07:59:59 hora de Bogotá: `DENIED/EXTERNAL_PERMIT_OUTSIDE_WINDOW`.
  - 08:00:00: `CONFIRMED/EXTERNAL`.
  - 16:59:59: `CONFIRMED/EXTERNAL`.
  - 17:00:00: `DENIED/EXTERNAL_PERMIT_OUTSIDE_WINDOW`.

### R09 Fronteras de medianoche en Bogotá (el día se mide en hora local, no en UTC)

- Dado: el permiso de V-205 (solo sábados, `[08:00, 17:00)`).
- Cuando y esperado:
  - `2026-10-24T04:59:59Z` (viernes 23:59:59 en Bogotá): `DENIED/EXTERNAL_PERMIT_OUTSIDE_WINDOW`.
  - `2026-10-24T05:00:00Z` (sábado 00:00:00 en Bogotá): `DENIED/EXTERNAL_PERMIT_OUTSIDE_WINDOW` (es sábado pero fuera de horario).
  - `2026-10-24T08:00:00Z` (sábado 03:00 en Bogotá): `DENIED/EXTERNAL_PERMIT_OUTSIDE_WINDOW`. Una implementación que leyera la hora en UTC vería las 08:00 y lo aceptaría por error.
  - `2026-10-24T13:00:00Z` (sábado 08:00 en Bogotá): `CONFIRMED/EXTERNAL`.
  - `2026-10-25T13:00:00Z` (domingo 08:00 en Bogotá): `DENIED/EXTERNAL_PERMIT_OUTSIDE_WINDOW`.

### R10 Ventana de la invitación: fronteras

- Dado: `QR_VALENTINA`, fecha 2026-10-24, ventana `[06:00, 22:00)`.
- Cuando y esperado (evento de R03 con distinto instante):
  - `2026-10-24T10:59:59Z` (05:59:59 en Bogotá): `DENIED/QR_NOT_YET_VALID`.
  - `2026-10-24T11:00:00Z` (06:00:00): `CONFIRMED/GUEST`.
  - `2026-10-25T02:59:59Z` (21:59:59): `CONFIRMED/GUEST`.
  - `2026-10-25T03:00:00Z` (22:00:00): `DENIED/QR_EXPIRED`.
  - `2026-10-25T04:59:59Z` (23:59:59): `DENIED/QR_EXPIRED`.

### R11 Rostro desconocido

- Dado: cualquier registro, incluso con candidato.
- Cuando: `UNKNOWN` (con o sin `candidateId` o `qrToken`) en `T_DEMO`.
- Esperado: `MANUAL_REVIEW/FACE_UNKNOWN`. No autoriza.

### R12 Error de cámara o del servicio facial

- Cuando: `ERROR` con `code: CAMERA_UNAVAILABLE` en `T_DEMO`.
- Esperado: `MANUAL_REVIEW/FACE_ERROR`.

### R13 Umbral de confianza

- Dado: V-201 con membresía vigente.
- Cuando: `MATCH`, pista `MEMBER`, `candidateId: V-201` con confianza:
  - 0,79: `MANUAL_REVIEW/LOW_CONFIDENCE`.
  - 0,8: `CONFIRMED/VIP`.
  - 0,62: `MANUAL_REVIEW/LOW_CONFIDENCE`.
  - ausente (sin puntuación): `CONFIRMED/VIP`; la visita registra `confidence: null`.
- Esperado: según la lista.

### R14 Socio que también es personal

- Dado: V-206 con membresía `ACTIVE` y turno 2026-10-24 `[10:00, 18:00)`.
- Cuando: `MATCH`, pista `MEMBER`, `candidateId: V-206`, en `T_SAT_1030`.
- Esperado: `MANUAL_REVIEW/DUAL_ROLE` (se pregunta el motivo de la llegada). Al resolver la revisión: motivo `MEMBER` da `CONFIRMED/REGULAR`; motivo `STAFF` da `CONFIRMED/STAFF`. Fuera del turno (por ejemplo, 09:00) la misma llegada da `CONFIRMED/REGULAR` sin preguntar.

### R15 Membresía vencida

- Dado: V-208, vencida el 2026-09-30.
- Cuando: `MATCH`, pista `MEMBER`, `candidateId: V-208`, en `T_DEMO`.
- Esperado: `MANUAL_REVIEW/MEMBERSHIP_EXPIRED`.

### R16 Membresía suspendida

- Dado: V-207 con membresía `SUSPENDED`.
- Cuando: `MATCH`, pista `MEMBER`, `candidateId: V-207`, en `T_DEMO`.
- Esperado: `DENIED/MEMBERSHIP_SUSPENDED`.

### R17 Candidato ausente o desconocido

- Cuando: `MATCH`, pista `MEMBER`, sin `candidateId`; y otra vez con `candidateId: V-999`.
- Esperado, en ambos casos: `MANUAL_REVIEW/CANDIDATE_NOT_FOUND`.

### R18 La pista facial contradice al registro

- Cuando: `MATCH`, pista `NON_MEMBER`, `candidateId: V-201` (es socio).
- Esperado: `MANUAL_REVIEW/FACE_REGISTRY_MISMATCH`.
- Cuando: `MATCH`, pista `MEMBER`, `candidateId: V-204` (solo personal).
- Esperado: `MANUAL_REVIEW/FACE_REGISTRY_MISMATCH`.

### R19 Personal sin turno vigente

- Dado: V-210, sin turno el 2026-10-24.
- Cuando: `MATCH`, pista `NON_MEMBER`, `candidateId: V-210`, en `T_DEMO`.
- Esperado: `MANUAL_REVIEW/STAFF_OUTSIDE_SHIFT`.

### R20 QR vencido

- Cuando: `MATCH`, pista `NON_MEMBER`, `qrToken: QR_EXPIRED` en `T_DEMO`.
- Esperado: `DENIED/QR_EXPIRED`.

### R21 QR ya usado

- Cuando: `qrToken: QR_USED` en `T_DEMO`.
- Esperado: `DENIED/QR_ALREADY_USED`.

### R22 QR revocado

- Cuando: `qrToken: QR_REVOKED` en `T_DEMO`.
- Esperado: `DENIED/QR_REVOKED`.

### R23 QR aún no válido

- Cuando: `qrToken: QR_FUTURE` en `T_DEMO`.
- Esperado: `DENIED/QR_NOT_YET_VALID`.

### R24 QR manipulado o inventado

- Cuando: `qrToken: QR_FORGED`, y otra vez con el token de R03 alterado en un carácter.
- Esperado, en ambos casos: `DENIED/QR_UNKNOWN`. La respuesta no revela si un token parecido existe.

### R25 Orden de verificación del QR

- Dado: un QR revocado y usado a la vez; un QR usado y vencido a la vez.
- Esperado: `DENIED/QR_REVOKED` para el primero; `DENIED/QR_ALREADY_USED` para el segundo.

### R26 Con pista `MEMBER` el QR se ignora

- Cuando: `MATCH`, pista `MEMBER`, `candidateId: V-201`, `qrToken: QR_EXPIRED`.
- Esperado: `CONFIRMED/VIP`.

### R27 El candidato tiene prioridad sobre el QR

- Cuando: `MATCH`, pista `NON_MEMBER`, `candidateId: V-205` y `qrToken: QR_VALENTINA` en `T_TUE`.
- Esperado: `DENIED/EXTERNAL_PERMIT_OUTSIDE_WINDOW` (se aplica el permiso de V-205; el QR no lo rescata).

### R28 Rostro desconocido con QR válido: se pide revisión y el QR no se consume

- Cuando: `UNKNOWN` con `qrToken: QR_VALENTINA` en `T_DEMO`.
- Esperado: `MANUAL_REVIEW/FACE_UNKNOWN`; la invitación sigue `ACTIVE`. Después, `POST /access/verify` con `QR_VALENTINA` da `GRANTED` y la invitación pasa a `USED` (prueba de integración).

### R29 El primer uso consume el QR

- Cuando: el evento de R03 se envía dos veces con claves de idempotencia distintas.
- Esperado: la primera da `CONFIRMED/GUEST` y la segunda `DENIED/QR_ALREADY_USED` (prueba de integración). Con la misma clave de idempotencia, la segunda repite la respuesta de la primera.

### R30 Revisión humana: solo confirma lo que el registro respalda

- Dado: una visita en `MANUAL_REVIEW/FACE_UNKNOWN`.
- Cuando: un operador resuelve con `CONFIRM` y `personId: V-201` en `T_DEMO`; y otra vez con `personId: V-207`.
- Esperado: la primera pasa a `VERIFIED/VIP` con evidencia `[MEMBERSHIP_ACTIVE, HUMAN_ATTESTATION]`; la segunda da 422 `REVIEW_NOT_CONFIRMABLE` con motivo `MEMBERSHIP_SUSPENDED` y la visita sigue en `MANUAL_REVIEW` (prueba de integración).

### R31 Invitada con perfil facial de demostración consentido

- Dado: Valentina (`V-203`), sin membresía, turno ni permiso, con la invitación de ejemplo de Male (V-209) vigente.
- Cuando: `MATCH`, pista `NON_MEMBER`, `candidateId: V-203`, confianza 0,97, en `T_DEMO`.
- Esperado: `CONFIRMED/GUEST`, evidencia `[INVITATION_ACTIVE]`, destino sugerido el punto de encuentro de la invitación; la invitación pasa a `USED`.
- Variantes: sin invitación a su nombre, `MANUAL_REVIEW/NO_EVIDENCE`; con la invitación vencida, usada, cancelada o aún no válida, `DENIED` con `QR_EXPIRED`, `QR_ALREADY_USED`, `QR_REVOKED` o `QR_NOT_YET_VALID`; una invitación de otra persona no autoriza.

## 8. Incertidumbres y supuestos

| Id  | Supuesto o duda                                                                                                                                             | Efecto si es incorrecto                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| S-1 | El trabajador externo siempre va con edecán humano y no continúa solo, por la supervisión que exige el club. Los guiones no lo prohíben para el robot.      | Se relaja la regla de elegibilidad del acompañante para `EXTERNAL`.                             |
| S-2 | Una confianza ausente no bloquea la clasificación.                                                                                                          | Si el servicio facial no envía puntuación, endurecer a revisión manual obligatoria.             |
| S-3 | `0,8` es un valor inicial sin calibrar.                                                                                                                     | Ajustar la constante con mediciones reales.                                                     |
| S-4 | Los invitados no tienen `candidateId`: no hay inscripción biométrica de invitados. La excepción es el perfil de demostración consentido de Valentina (R31). | Si el sistema facial reconociera invitados, habría que definir un registro y su consentimiento. |
| S-5 | La membresía suspendida deniega; la vencida pregunta.                                                                                                       | El club podría preferir tratar ambas igual.                                                     |
| S-6 | Personal sin turno vigente pregunta en lugar de denegar (puede venir por otro motivo).                                                                      | Cambiar a `DENIED` si el club lo decide.                                                        |
| S-7 | Un permiso externo fuera de ventana se deniega (no se pregunta).                                                                                            | Cambiar a revisión si recepción quiere decidir caso a caso.                                     |
| S-8 | Los turnos del personal y los permisos son datos de semilla con fechas explícitas.                                                                          | En producción vendrían de un sistema de turnos que no existe en el MVP.                         |

## 9. Pruebas

| Reglas                                  | Nivel                                                       | Archivos                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R01 a R28 y R31, F-1                    | Unitaria (política pura con reloj fijo)                     | `tests/unit/domain/classify.test.ts`; fronteras horarias y de día en `tests/unit/domain/bogota-time.test.ts` y `tests/unit/domain/permissions.test.ts` |
| R28 a R30 (revisión, uso único, humano) | Casos de uso con almacén en memoria                         | `tests/unit/api/visits.test.ts` y `tests/integration/api/journeys.test.ts`                                                                             |
| Todas                                   | Contrato (ejemplos y rutas frente a esquemas Zod y OpenAPI) | `tests/contract/`                                                                                                                                      |
| Cinco categorías, QR, externa           | E2E (recorridos de la demostración)                         | `tests/e2e/robot-handoff.spec.ts` y `tests/e2e/member-pass.spec.ts`                                                                                    |
