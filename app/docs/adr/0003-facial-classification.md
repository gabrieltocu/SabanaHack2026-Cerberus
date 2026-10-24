# ADR 0003: Clasificación en dos etapas (señal facial y verificación con registros)

- Estado: aceptada
- Fecha: 2026-10-23
- Relacionadas: `docs/domain/categories-matrix.md` (reglas R01 en adelante), ADR 0004

## Contexto

El reconocimiento facial existente solo responde si la persona es miembro o no. El club necesita cinco categorías: VIP, regular, invitado, personal del club y trabajador externo. Un parecido facial no es una autorización, y una cámara falla, duda o confunde. La clasificación debe ser explicable, reproducible y fallar hacia la revisión humana, nunca hacia el acceso.

## Decisión

La clasificación tiene dos etapas separadas, ambas ejecutadas en el servidor.

### Etapa 1: señal facial (entrada, no decisión)

```ts
type FaceSignal =
  | {
      status: 'MATCH';
      classHint: 'MEMBER' | 'NON_MEMBER';
      candidateId?: string;
      confidence?: number;
    }
  | { status: 'UNKNOWN' }
  | { status: 'ERROR'; code: string };
```

- `classHint` es la pista del sistema facial; `candidateId` identifica a la persona candidata en el directorio del club cuando el sistema la conoce; `confidence` va de 0 a 1 y es opcional.
- La señal llega en `POST /recognition/events` junto con la evidencia opcional (`qrToken`) y el origen (`ROBOT` o `SIMULATOR`). Los eventos de simulador se guardan con `simulated: true` y la interfaz los rotula.

### Etapa 2: verificación con registros

```ts
type Classification =
  | {
      state: 'CONFIRMED';
      category: 'VIP' | 'REGULAR' | 'GUEST' | 'STAFF' | 'EXTERNAL';
      evidence: string[];
    }
  | { state: 'MANUAL_REVIEW'; reason: ManualReviewReason }
  | { state: 'DENIED'; reason: DenialReason };
```

Es una función pura del dominio, `classify(recognition, records, now, opts)` en `src/domain/policies/classify.ts`, donde `opts` lleva el umbral y el `qrToken` opcional. Orden de evaluación (la primera regla que aplica decide):

1. **Estado de la señal.** `ERROR` da `MANUAL_REVIEW(FACE_ERROR)`. `UNKNOWN` da `MANUAL_REVIEW(FACE_UNKNOWN)`. `MATCH` con `confidence` definida y menor que el umbral da `MANUAL_REVIEW(LOW_CONFIDENCE)`.
2. **Pista `MEMBER`.**
   1. Sin `candidateId` o con un id que no está en el directorio: `MANUAL_REVIEW(CANDIDATE_NOT_FOUND)`.
   2. La persona no tiene membresía: `MANUAL_REVIEW(FACE_REGISTRY_MISMATCH)`.
   3. Membresía suspendida: `DENIED(MEMBERSHIP_SUSPENDED)`.
   4. Membresía vencida: `MANUAL_REVIEW(MEMBERSHIP_EXPIRED)`.
   5. La persona además tiene un turno de personal vigente: `MANUAL_REVIEW(DUAL_ROLE)`.
   6. Si no, `CONFIRMED(VIP)` o `CONFIRMED(REGULAR)` según el nivel de la membresía.
3. **Pista `NON_MEMBER` con `candidateId`.**
   1. Id fuera del directorio: `MANUAL_REVIEW(CANDIDATE_NOT_FOUND)`.
   2. La persona tiene membresía: `MANUAL_REVIEW(FACE_REGISTRY_MISMATCH)`.
   3. Registro de personal: con turno vigente, `CONFIRMED(STAFF)`; sin turno vigente, `MANUAL_REVIEW(STAFF_OUTSIDE_SHIFT)`.
   4. Permiso de trabajador externo dentro de su ventana: `CONFIRMED(EXTERNAL)`.
   5. Invitación vigente asociada a esa persona, que solo existe para un perfil facial de demostración consentido (en la semilla, Valentina, `V-203`): `CONFIRMED(GUEST)` con la evidencia `INVITATION_ACTIVE`. La confirmación la respalda la invitación, no el rostro.
   6. Permiso de trabajador externo fuera de su ventana: `DENIED(EXTERNAL_PERMIT_OUTSIDE_WINDOW)`.
   7. Invitación asociada que no está vigente (la más cercana por fecha): `DENIED` con `QR_NOT_YET_VALID`, `QR_EXPIRED`, `QR_REVOKED` o `QR_ALREADY_USED`.
   8. Persona conocida sin ningún rol vigente: `MANUAL_REVIEW(NO_EVIDENCE)`.
4. **Pista `NON_MEMBER` sin `candidateId`, con `qrToken`.** Se verifica el QR (ADR 0004): desconocido `DENIED(QR_UNKNOWN)`; revocado `DENIED(QR_REVOKED)`; ya usado `DENIED(QR_ALREADY_USED)`; antes de su ventana `DENIED(QR_NOT_YET_VALID)`; vencido `DENIED(QR_EXPIRED)`; válido `CONFIRMED(GUEST)`.
5. **Pista `NON_MEMBER` sin `candidateId` ni `qrToken`.** `MANUAL_REVIEW(NO_EVIDENCE)`. Nunca se infiere `GUEST`.

Con pista `MEMBER` el `qrToken` se ignora: un miembro no necesita invitación.

### Umbral de confianza

`FACE_MIN_CONFIDENCE = 0.8`, inclusivo (0,8 pasa; 0,7999 no pasa). Una confianza no numérica o fuera de 0 a 1 también da revisión manual. Es la constante `DEFAULT_MIN_CONFIDENCE` de `src/domain/policies/classify.ts` y es un valor inicial no calibrado: debe ajustarse con datos del servicio facial real. Si el sistema facial no envía `confidence`, el umbral no se aplica y la decisión descansa en la verificación con registros; el hecho de que no hubo puntuación queda en la visita (`confidence: null`).

### Códigos de motivo

- Revisión manual: `FACE_UNKNOWN`, `FACE_ERROR`, `LOW_CONFIDENCE`, `NO_EVIDENCE`, `CANDIDATE_NOT_FOUND`, `FACE_REGISTRY_MISMATCH`, `MEMBERSHIP_EXPIRED`, `STAFF_OUTSIDE_SHIFT`, `DUAL_ROLE`.
- Denegación: `MEMBERSHIP_SUSPENDED`, `EXTERNAL_PERMIT_OUTSIDE_WINDOW`, `QR_EXPIRED`, `QR_NOT_YET_VALID`, `QR_ALREADY_USED`, `QR_REVOKED`, `QR_UNKNOWN`.
- Evidencias de una confirmación: `MEMBERSHIP_ACTIVE`, `STAFF_SHIFT_ACTIVE`, `EXTERNAL_PERMIT_ACTIVE`, `INVITATION_QR_VALID`, `INVITATION_ACTIVE` (invitada reconocida por un perfil facial demo consentido, con invitación vigente) y, tras revisión humana, `HUMAN_ATTESTATION`.

### Resolución de una revisión manual

Una visita en `MANUAL_REVIEW` la resuelve un operador o un edecán con el evento `RESOLVE_REVIEW`:

- **Confirmar** (`decision: CONFIRM`) con el `personId` que el humano comprobó (por ejemplo, por documento o por la aplicación). El servidor repite la etapa 2 con esa persona como candidata, sin pista facial, y la categoría la calcula el sistema, no la elige el humano. Solo si el resultado es `CONFIRMED` la visita pasa a `VERIFIED`, con la evidencia `HUMAN_ATTESTATION` añadida. Si el resultado sigue siendo revisión o denegación, la respuesta es 422 `REVIEW_NOT_CONFIRMABLE` con el motivo y la visita no cambia.
- Si la persona es a la vez miembro y personal (`DUAL_ROLE`), el humano indica el motivo de la llegada (`purpose: MEMBER` o `STAFF`) y la etapa 2 se evalúa con ese motivo.
- Un invitado solo se confirma presentando un QR válido con `POST /access/verify`; una revisión humana no crea una invitación.
- **Denegar** (`decision: DENY`) pasa la visita a `FAILED`.

## Invariantes

- **F-1.** El rostro nunca produce `CONFIRMED` por sí solo: toda confirmación incluye al menos una evidencia de registro (`MEMBERSHIP_ACTIVE`, `STAFF_SHIFT_ACTIVE`, `EXTERNAL_PERMIT_ACTIVE`, `INVITATION_QR_VALID` o `INVITATION_ACTIVE`).
- **F-2.** `UNKNOWN`, `ERROR` y confianza bajo el umbral producen siempre `MANUAL_REVIEW`; nunca `CONFIRMED` ni `DENIED`.
- **F-3.** `GUEST` solo se confirma con una invitación válida (QR vigente, no usado, no revocado). Por QR se confirma cualquier invitado; por rostro, únicamente quien tiene un perfil facial de demostración consentido asociado a una invitación vigente.
- **F-4.** `DENIED` solo se emite por evidencia negativa explícita: membresía suspendida, permiso externo fuera de ventana, invitación asociada no vigente o QR inválido. La falta de evidencia es `MANUAL_REVIEW`.
- **F-5.** Una revisión humana no otorga una categoría que los registros no respaldan ni revierte una denegación.
- **F-6.** El sistema no almacena imágenes, plantillas ni vectores faciales. Guarda únicamente `status`, `classHint`, `candidateId`, `confidence`, origen e indicador `simulated`.
- **F-7.** La clasificación es determinista: misma señal, misma evidencia, mismos registros y mismo instante dan el mismo resultado.

## Casos dudosos y su tratamiento

| Situación                                                                       | Resultado                               | Qué hace el robot o el operador                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Rostro no reconocido o cámara con error                                         | `MANUAL_REVIEW`                         | Ofrece el QR o la ayuda de recepción; no anuncia una identidad incierta.                    |
| Confianza baja con registros que coincidirían                                   | `MANUAL_REVIEW(LOW_CONFIDENCE)`         | Recepción comprueba a la persona.                                                           |
| La pista facial contradice el registro (dice no miembro y el id es de un socio) | `MANUAL_REVIEW(FACE_REGISTRY_MISMATCH)` | Recepción comprueba a la persona.                                                           |
| Socio que también es personal                                                   | `MANUAL_REVIEW(DUAL_ROLE)`              | Se pregunta el motivo de la llegada.                                                        |
| Membresía vencida                                                               | `MANUAL_REVIEW(MEMBERSHIP_EXPIRED)`     | Recepción gestiona la renovación; la clasificación no cambia hasta que el registro lo haga. |
| Persona sin invitación ni otro registro                                         | `MANUAL_REVIEW(NO_EVIDENCE)`            | Se pide el QR o se verifica la invitación con el anfitrión.                                 |
| QR vencido, usado, revocado o falso                                             | `DENIED(QR_*)`                          | Se informa con claridad y se ofrece ayuda humana.                                           |

## Consecuencias

- La categoría es explicable: cada resultado trae evidencia o motivo.
- La política es una función pura con reloj inyectado y se prueba con tablas de casos (`docs/domain/categories-matrix.md`).
- Habrá más revisiones manuales cuando el servicio facial sea ruidoso. Es el costo deliberado de fallar hacia lo seguro.
- El umbral inicial puede resultar demasiado alto o bajo con datos reales; es un parámetro de una sola línea.

## Alternativas descartadas

- **Dejar que el rostro autorice la categoría.** Una coincidencia errónea daría acceso o trato de socio a quien no lo es.
- **Un modelo facial de cinco clases.** Exige datos biométricos etiquetados que no existen y no incorpora vigencias, turnos ni permisos, que cambian cada día.
- **Umbral distinto por categoría.** Complejidad sin datos que la respalden; se pospone hasta tener mediciones.
- **Tratar la falta de evidencia como denegación.** Convierte una duda en un rechazo hostil; el club prefiere preguntar.
