// Pure rules of the edecán app: which tasks are mine, how they sort, and the words shown.
import type { EstadoEquipo, Incidencia, PasoVisita, Tarea, Visita } from '../../../club/types';
import type { IconName } from '../../../design-system';

const PESO: Record<Tarea['prioridad'], number> = { urgente: 0, alta: 1, normal: 2 };

/** Urgent first, then high, then normal; inside each, the one waiting longest first. */
export function ordenarTareas(tareas: readonly Tarea[]): Tarea[] {
  return [...tareas].sort(
    (a, b) => PESO[a.prioridad] - PESO[b.prioridad] || a.creada_at.localeCompare(b.creada_at),
  );
}

/** Open tasks addressed to me (or to anyone) that I have not already turned down. */
export const tareasAbiertas = (tareas: readonly Tarea[], yo: string) =>
  ordenarTareas(
    tareas.filter(
      (t) =>
        t.estado === 'ABIERTA' &&
        (t.asignada_a === null || t.asignada_a === yo) &&
        !t.rechazos.includes(yo),
    ),
  );

/** Tasks I accepted and have not finished: they feed the "En curso" tab. */
export const tareasAceptadas = (tareas: readonly Tarea[], yo: string) =>
  tareas.filter((t) => t.estado === 'ACEPTADA' && t.asignada_a === yo);

/** Visits that no longer need an escort (arrived or gone). */
export const visitaTerminada = (v: Pick<Visita, 'estado'>) =>
  v.estado === 'EN_DESTINO' || v.estado === 'CERRADA';

/** How far along an escort is, by phase (not by distance): reception, on the way, arrived. */
export const progresoVisita = (estado: Visita['estado']): number =>
  estado === 'EN_RECEPCION' ? 0.2 : estado === 'EN_DESTINO' || estado === 'CERRADA' ? 1 : 0.6;

export function minutosDesde(ts: string, ahora = Date.now()): number {
  const t = Date.parse(ts);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((ahora - t) / 60_000));
}

/** `0` -> "Ahora", `7` -> "Hace 7 min", `70` -> "Hace 1 h 10 min". */
export function textoEspera(min: number): string {
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const m = min % 60;
  return `Hace ${Math.floor(min / 60)} h${m ? ` ${m} min` : ''}`;
}

export const TIPO_TAREA: Record<Tarea['tipo'], string> = {
  ACOMPANAR: 'Acompañar',
  RELEVO: 'Relevo',
  AYUDA: 'Ayuda',
};

export const PRIORIDAD: Record<Tarea['prioridad'], string> = {
  urgente: 'Urgente',
  alta: 'Prioridad alta',
  normal: 'Normal',
};

const ASISTENCIA: Record<string, string> = {
  silla_ruedas: 'Silla de ruedas',
  movilidad_reducida: 'Movilidad reducida',
  visual: 'Apoyo visual',
  auditiva: 'Apoyo auditivo',
  acompanante: 'Va con acompañante',
};

export const etiquetaAsistencia = (clave: string) =>
  ASISTENCIA[clave] ?? clave.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const PASO: Record<PasoVisita['tipo'], string> = {
  LLEGADA: 'Llegó al club',
  ASIGNADO: 'Acompañante asignado',
  RELEVO_SOLICITADO: 'Relevo solicitado',
  RELEVO_ACEPTADO: 'Relevo aceptado',
  ENTREGA_CONFIRMADA: 'Entrega confirmada',
  AYUDA: 'Ayuda solicitada',
  EN_DESTINO: 'Llegó al destino',
  ENCUENTRO: 'Encuentro con el anfitrión',
  INCIDENCIA: 'Incidencia reportada',
  SALIDA: 'Salió del club',
};

/** States an edecán can set for themselves, in the order of the picker. */
export const ESTADOS: readonly { clave: EstadoEquipo; etiqueta: string; detalle: string }[] = [
  { clave: 'DISPONIBLE', etiqueta: 'Disponible', detalle: 'Puedes recibir tareas nuevas' },
  { clave: 'ASIGNADO', etiqueta: 'Asignado', detalle: 'Tienes una visita por atender' },
  { clave: 'ACOMPANANDO', etiqueta: 'Acompañando', detalle: 'Vas con un visitante' },
  { clave: 'REGRESANDO', etiqueta: 'Regresando', detalle: 'Vuelves a recepción' },
  { clave: 'FUERA_DE_SERVICIO', etiqueta: 'Fuera de servicio', detalle: 'No recibes tareas' },
];

export const TIPOS_INCIDENCIA: readonly { clave: Incidencia['tipo']; etiqueta: string }[] = [
  { clave: 'FALLA_ROBOT', etiqueta: 'Falla del robot' },
  { clave: 'CONEXION', etiqueta: 'Conexión' },
  { clave: 'RUTA_BLOQUEADA', etiqueta: 'Ruta bloqueada' },
  { clave: 'ASISTENCIA', etiqueta: 'Asistencia' },
  { clave: 'OTRA', etiqueta: 'Otra' },
];

/**
 * What the report screens offer: four plain choices named like the API types; a connection
 * problem is reported under «Robot».
 */
export const TIPOS_REPORTE: readonly {
  clave: Incidencia['tipo'];
  etiqueta: string;
  icon: IconName;
}[] = [
  { clave: 'FALLA_ROBOT', etiqueta: 'Robot', icon: 'hardware-chip-outline' },
  { clave: 'RUTA_BLOQUEADA', etiqueta: 'Ruta bloqueada', icon: 'construct-outline' },
  { clave: 'ASISTENCIA', etiqueta: 'Invitado', icon: 'person-outline' },
  { clave: 'OTRA', etiqueta: 'Otro', icon: 'ellipsis-horizontal-outline' },
];

export const etiquetaIncidencia = (tipo: Incidencia['tipo']) =>
  TIPOS_INCIDENCIA.find((t) => t.clave === tipo)?.etiqueta ?? 'Otra';

/** Why a scanned pass was refused, in words for the edecán. */
export function motivoQr(motivo: string | null): string {
  switch (motivo) {
    case 'firma_invalida':
      return 'El código no es auténtico. Pídele a la persona que abra su pase de nuevo.';
    case 'vencido':
      return 'El pase venció. Revisa con recepción si hay una invitación vigente.';
    default:
      return 'No pudimos validar este código. Revisa que esté completo.';
  }
}
