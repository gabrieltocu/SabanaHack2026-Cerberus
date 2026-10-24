// Pure helpers of the web panel: days, percentages, chart axis and plain-language labels.
import type {
  ColaItem,
  EstadoEquipo,
  EstadoEvento,
  EstadoInvitacion,
  EstadoVisita,
  PanelResumen,
  PasoVisita,
  Visita,
} from '../../../club/types';
import type { StatusKind } from '../../../design-system/components/Badge';
import type { IconName } from '../../../design-system/components/Icon';
import { diaBogota } from '../eventos';

/** From this window width the panel shows the sidebar; below it, the bottom bar. */
export const ESCRITORIO_MIN = 900;
export const SONDEO_MS = 10_000;
/** The queue is the live screen: a person is waiting. */
export const SONDEO_COLA_MS = 5_000;

export type Seccion =
  | 'resumen'
  | 'visitas'
  | 'alertas'
  | 'robot'
  | 'equipo'
  | 'cola'
  | 'eventos'
  | 'registros'
  | 'evaluaciones'
  | 'historial';
export type DiaElegido = 'hoy' | 'ayer';

/** Day before `hoy` ("YYYY-MM-DD"), computed at noon so it never crosses a day boundary. */
export const ayerDe = (hoy: string) => diaBogota(Date.parse(`${hoy}T12:00:00-05:00`) - 86_400_000);

export type Categoria5 = keyof PanelResumen['por_categoria'];
export const ORDEN_CATEGORIAS: readonly Categoria5[] = [
  'VIP',
  'REGULAR',
  'INVITADO',
  'PERSONAL',
  'EXTERNO',
];

export const ETIQUETA_CATEGORIA: Record<Categoria5, string> = {
  VIP: 'VIP',
  REGULAR: 'Regular',
  INVITADO: 'Invitado',
  PERSONAL: 'Personal',
  EXTERNO: 'Externo',
};

export const totalCategorias = (c: PanelResumen['por_categoria']) =>
  ORDEN_CATEGORIAS.reduce((s, k) => s + (c[k] ?? 0), 0);

/** "33 %" of a total; "0 %" when the total is 0. */
export const porcentaje = (n: number, total: number) =>
  `${total > 0 ? Math.round((n / total) * 100) : 0} %`;

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Llegada", "Relevo confirmado": the event type as a sentence. */
export function tipoTexto(tipo: string): string {
  const t = tipo.trim().toLowerCase().replace(/[_-]+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Evento';
}

export type ChipPanel = { kind: StatusKind; label: string };

export const CHIP_EVENTO: Record<EstadoEvento, ChipPanel> = {
  NUEVO: { kind: 'warning', label: 'Nuevo' },
  ATENDIDO: { kind: 'info', label: 'Atendido' },
  RESUELTO: { kind: 'success', label: 'Resuelto' },
};

export const CHIP_INVITACION: Record<EstadoInvitacion, ChipPanel> = {
  PROGRAMADA: { kind: 'info', label: 'Programada' },
  LLEGO: { kind: 'success', label: 'En el club' },
  SALIO: { kind: 'neutral', label: 'Salió' },
  CANCELADA: { kind: 'danger', label: 'Cancelada' },
  VENCIDA: { kind: 'warning', label: 'Vencida' },
};

/** "Luciana · Administradora" role line of the signed-in user. */
export const rolTexto = (rol: string, trato?: string) =>
  rol === 'ADMIN' ? (trato === 'senora' ? 'Administradora' : 'Administrador') : 'Concierge';

/** Always the 17 hours 6..22, so a quiet day (or a short API answer) still draws its axis. */
export const completarFlujo = (flujo: PanelResumen['flujo_por_hora'] | undefined) =>
  Array.from(
    { length: 17 },
    (_, i) =>
      flujo?.find((h) => h.hora === 6 + i) ?? { hora: 6 + i, socios: 0, invitados: 0, personal: 0 },
  );

export const completarCategorias = (c: Partial<PanelResumen['por_categoria']> | undefined) =>
  Object.fromEntries(
    ORDEN_CATEGORIAS.map((k) => [k, c?.[k] ?? 0]),
  ) as PanelResumen['por_categoria'];

/** 4.6 -> "4,6"; 12.3 -> "12". One decimal only while it still tells something. */
export const minutos = (m: number) =>
  m < 10 ? (Math.round(m * 10) / 10).toString().replace('.', ',') : String(Math.round(m));

// ---- v3: team, queue, handoffs ------------------------------------------------------------

export const CHIP_EQUIPO: Record<EstadoEquipo, ChipPanel & { icono: IconName }> = {
  DISPONIBLE: { kind: 'success', label: 'Disponible', icono: 'checkmark-circle-outline' },
  ASIGNADO: { kind: 'warning', label: 'Asignado', icono: 'person-add-outline' },
  ACOMPANANDO: { kind: 'info', label: 'Acompañando', icono: 'walk-outline' },
  REGRESANDO: { kind: 'neutral', label: 'Regresando', icono: 'return-down-back-outline' },
  CARGANDO: { kind: 'neutral', label: 'Cargando', icono: 'battery-charging-outline' },
  FUERA_DE_SERVICIO: { kind: 'danger', label: 'Fuera de servicio', icono: 'close-circle-outline' },
};

export const CHIP_PRIORIDAD: Record<ColaItem['prioridad'], ChipPanel> = {
  urgente: { kind: 'danger', label: 'Urgente' },
  alta: { kind: 'warning', label: 'Alta' },
  normal: { kind: 'neutral', label: 'Normal' },
};
const PESO_PRIORIDAD = { urgente: 0, alta: 1, normal: 2 } as const;

/** Most urgent first; among equals, the one that has waited longest. */
export const ordenarCola = (items: readonly ColaItem[]) =>
  [...items].sort(
    (a, b) =>
      PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad] || b.espera_min - a.espera_min,
  );

export const esperaTexto = (min: number) => (min < 1 ? 'Recién llegó' : `${Math.round(min)} min`);

/** Whether a waiting person needs attention right now (waited 10 min or more). */
export const ESPERA_LARGA_MIN = 10;

/** "Robot R1" / "Edecán": how a team member is labelled under the name. */
export const tipoEquipo = (tipo: 'ROBOT' | 'HUMANO') => (tipo === 'ROBOT' ? 'Robot' : 'Edecán');

export const ETIQUETA_INTERES = {
  individual: 'Individual',
  familiar: 'Familiar',
  empresarial: 'Empresarial',
} as const;

export const ETIQUETA_ROL: Record<string, string> = {
  ADMIN: 'Administración',
  CONCIERGE: 'Concierge',
  EDECAN: 'Edecanes',
  PERSONAL: 'Personal del club',
  SOCIO: 'Socios',
};
export const ORDEN_ROLES = ['ADMIN', 'CONCIERGE', 'EDECAN', 'PERSONAL', 'SOCIO'] as const;

// ---- v3: history ---------------------------------------------------------------------------

export const PASO_TEXTO: Record<PasoVisita['tipo'], string> = {
  LLEGADA: 'Llegó al club',
  ASIGNADO: 'Acompañante asignado',
  RELEVO_SOLICITADO: 'Relevo solicitado',
  RELEVO_ACEPTADO: 'Relevo aceptado',
  ENTREGA_CONFIRMADA: 'Entrega confirmada',
  AYUDA: 'Pidió ayuda',
  EN_DESTINO: 'Llegó al destino',
  ENCUENTRO: 'Encuentro con el anfitrión',
  INCIDENCIA: 'Incidencia',
  SALIDA: 'Salió del club',
};

/** Last step of a kind, newest wins. */
const ultimo = (v: Visita, ...tipos: PasoVisita['tipo'][]) =>
  [...(v.recorrido ?? [])].reverse().find((p) => tipos.includes(p.tipo));

/** Actors of a closed visit, read from its trail: who attended, who handed over, who received. */
export function protagonistas(v: Visita) {
  return {
    atendio: v.acompanante?.nombre ?? ultimo(v, 'ASIGNADO')?.actor ?? null,
    entrego: ultimo(v, 'ENTREGA_CONFIRMADA', 'RELEVO_SOLICITADO')?.actor ?? null,
    recibio: ultimo(v, 'RELEVO_ACEPTADO', 'ENCUENTRO', 'EN_DESTINO')?.actor ?? null,
  };
}

/** "1 h 5 min" / "12 min" between two instants; null while the visit is open. */
export function duracionTexto(inicio: string, fin: string | null): string | null {
  const m = minutosEntre(inicio, fin);
  if (m === null) return null;
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const mediaTexto = (n: number | null) => (n === null ? '—' : n.toFixed(1).replace('.', ','));

/** Short confirmation or error shown as a toast by the screen. */
export type Avisar = (mensaje: string, tipo?: 'success' | 'error') => void;

// ---- charts: families, states and wait ---------------------------------------------------

/** Families of the hourly flow chart, bottom of the stack first. */
export const FAMILIAS = [
  ['socios', 'Socios'],
  ['invitados', 'Invitados'],
  ['personal', 'Personal'],
] as const;

/** Hours of the flow axis: 6..22, labelled every two hours. */
export const horaEtiqueta = (hora: number) => (hora % 2 === 0 ? pad2(hora) : '');

/** State of a visit, in the order it moves through the club. */
export const ORDEN_ESTADO_VISITA: readonly EstadoVisita[] = [
  'EN_RECEPCION',
  'ACOMPANANDO',
  'EN_RELEVO',
  'EN_DESTINO',
  'CERRADA',
];
export const ETIQUETA_ESTADO_VISITA: Record<EstadoVisita, string> = {
  EN_RECEPCION: 'En recepción',
  ACOMPANANDO: 'Acompañando',
  EN_RELEVO: 'En relevo',
  EN_DESTINO: 'En destino',
  CERRADA: 'Cerrada',
};

/** How many of `valores` equal each key of `orden`; keys the API never sent count 0. */
export const contar = <K extends string>(valores: readonly K[], orden: readonly K[]) =>
  orden.map((k) => valores.filter((v) => v === k).length);

/** Whole minutes between two instants, or null while the end is missing. */
export function minutosEntre(inicio: string, fin: string | null): number | null {
  const a = Date.parse(inicio);
  const b = fin ? Date.parse(fin) : NaN;
  return Number.isNaN(a) || Number.isNaN(b) || b < a ? null : Math.round((b - a) / 60_000);
}
