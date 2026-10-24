// Catalog of stable error codes and their on-screen text (docs/design/screens.md §0.7).
// The domain/API contract owns the identifiers; this file owns the words people read.
import { renderCopy, type CopyVars } from './orientation/copy';

export const MESSAGES = {
  NETWORK_OFFLINE:
    'No hay conexión. Tus datos siguen aquí; puedes reintentar cuando vuelva la red.',
  NETWORK_ERROR: 'No hay conexión. Tus datos siguen aquí; puedes reintentar cuando vuelva la red.',
  TIMEOUT: 'El servicio tardó demasiado en responder. Inténtalo de nuevo en unos segundos.',
  API_UNAVAILABLE: 'El servicio no responde por ahora. Inténtalo de nuevo en unos segundos.',
  SERVER_ERROR: 'No pudimos completar la acción. No se hizo ningún cambio.',
  RATE_LIMITED: 'Hubo demasiados intentos seguidos. Espera unos segundos e inténtalo de nuevo.',
  DEMO_DATA_UNAVAILABLE: 'No pudimos cargar los datos. Recarga la página.',
  RECOGNITION_UNKNOWN:
    'No pude confirmar tu identidad. Podemos usar tu QR o pedir apoyo a recepción.',
  RECOGNITION_ERROR:
    'No pude usar la cámara en este momento. Podemos continuar con tu QR o con apoyo en recepción.',
  CLASSIFICATION_MANUAL_REVIEW: 'No puedo confirmar esta visita. Recepción puede ayudarte.',
  ACCESS_DENIED_NO_EVIDENCE:
    'No encuentro una invitación, un turno o un permiso vigente para hoy. Recepción puede ayudarte.',
  MEMBERSHIP_NOT_ACTIVE: 'No encuentro una membresía vigente. Recepción puede ayudarte.',
  STAFF_SHIFT_INACTIVE:
    'Tu credencial está activa, pero no veo un turno para hoy. Recepción puede confirmarlo.',
  EXTERNAL_DAY_NOT_ALLOWED: 'Su permiso de acceso aplica los sábados y hoy es {día}.',
  EXTERNAL_OUT_OF_HOURS: 'Su visita está autorizada en otro horario. Recepción puede ayudarle.',
  QR_INVALID: 'Este código no es válido. Revisa que sea el pase que recibiste.',
  QR_NOT_FOUND: 'No encontramos este pase.',
  QR_EXPIRED: 'Este pase venció. Pide a tu anfitrión que te envíe uno nuevo.',
  QR_NOT_YET_VALID: 'Este pase aún no es válido. Será válido el {fecha}.',
  QR_ALREADY_USED: 'Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.',
  QR_REVOKED: 'Tu anfitrión canceló esta invitación.',
  INVITATION_GUEST_NAME_REQUIRED: 'Escribe el nombre de tu invitado.',
  INVITATION_DATE_INVALID: 'Elige una fecha desde hoy en adelante.',
  INVITATION_DUPLICATE: 'Ya existe una invitación para este invitado en esa fecha.',
  INVITATION_DAILY_LIMIT:
    'Ya tienes 5 invitaciones para esa fecha. Elige otro día o cancela una de las vigentes.',
  INVITATION_DATE_IN_PAST: 'Esa fecha ya pasó. Elige una fecha desde hoy en adelante.',
  INVITATION_NOT_ACTIVE: 'Esta invitación ya se usó o venció, así que no se puede cancelar.',
  INVITATION_NOT_FOUND: 'No encontramos esta invitación.',
  HOST_NOT_ELIGIBLE: 'Solo los socios con membresía vigente pueden invitar.',
  ACTOR_NOT_ALLOWED: 'No tienes permiso para hacer esto.',
  VALIDATION_ERROR: 'Alguno de los datos no es válido. Revísalos e inténtalo de nuevo.',
  ROBOT_FAILURE: 'Tengo un inconveniente. Voy a pedir ayuda para que puedas continuar.',
  ROBOT_AUTH_REQUIRED: 'Esta acción necesita la llave del robot.',
  ASSIGNEE_BUSY: 'Ya tienes una visita en curso. Llega a su destino antes de comenzar otra.',
  ESCORT_NOT_ALLOWED:
    'Ese acompañante no está disponible ahora. Prueba con otra persona del equipo o pide apoyo a recepción.',
  VERSION_CONFLICT: 'Esto cambió mientras lo mirabas. Inténtalo de nuevo en unos segundos.',
  ROBOT_BUSY: 'Los robots de acompañamiento están ocupados. Puedo ofrecerte ayuda humana ahora.',
  HOST_LOCATION_STALE:
    'El último dato de {anfitrión} no está actualizado. Voy a confirmar el encuentro.',
  HANDOFF_ALREADY_ACCEPTED: 'Otra persona del equipo ya aceptó este relevo.',
  HANDOFF_EXPIRED:
    'La solicitud de relevo venció sin aceptación. La visita sigue a cargo de quien la tenía.',
  HANDOFF_NOT_FOUND: 'No encontramos este relevo.',
  HANDOFF_NOT_ASSIGNED: 'No tienes asignada esta tarea.',
  HANDOFF_INVALID_STATE: 'Este relevo cambió mientras lo mirabas. Se actualizó la información.',
  VISIT_NOT_FOUND: 'No encontramos esta visita.',
  FEEDBACK_TEXT_TOO_LONG: 'El comentario admite hasta 500 caracteres.',
  FEEDBACK_ALREADY_SENT: 'Ya enviaste tu evaluación de esta visita.',
} as const;

export type MessageCode = keyof typeof MESSAGES;

const FALLBACK: MessageCode = 'SERVER_ERROR';

/** Text for a code. An unknown code never leaks to the screen: it falls back to SERVER_ERROR. */
export function messageFor(code: string, vars?: CopyVars): string {
  const template = code in MESSAGES ? MESSAGES[code as MessageCode] : MESSAGES[FALLBACK];
  return renderCopy(template, vars);
}
