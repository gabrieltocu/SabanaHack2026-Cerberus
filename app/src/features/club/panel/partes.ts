// Parts (label, count, colour) of the 100 % bars of the panel, built from API lists.
import type {
  EstadoEquipo,
  EstadoEvento,
  EstadoInvitacion,
  MiembroEquipo,
  Visita,
} from '../../../club/types';
import { colors } from '../../../design-system';
import { SERIE, type Parte } from './Charts';
import {
  CHIP_EQUIPO,
  CHIP_EVENTO,
  CHIP_INVITACION,
  ETIQUETA_ESTADO_VISITA,
  ORDEN_ESTADO_VISITA,
  contar,
} from './format';

/** Pairs each key with its count and colour; `color(i)` is the i-th key's fill. */
function armar<K extends string>(
  valores: readonly K[],
  orden: readonly K[],
  texto: (k: K) => string,
  color: (k: K) => string,
): Parte[] {
  return contar(valores, orden).map((valor, i) => ({
    id: orden[i]!,
    texto: texto(orden[i]!),
    valor,
    color: color(orden[i]!),
  }));
}

/** Visits by state, in the order they move through the club; gold = waiting for a handoff. */
export const partesVisitas = (visitas: readonly Visita[]) =>
  armar(
    visitas.map((v) => v.estado),
    ORDEN_ESTADO_VISITA,
    (k) => ETIQUETA_ESTADO_VISITA[k],
    (k) =>
      ({
        EN_RECEPCION: SERIE.claro,
        ACOMPANANDO: SERIE.tinta,
        EN_RELEVO: SERIE.oro,
        EN_DESTINO: SERIE.gris,
        CERRADA: SERIE.hueso,
      })[k],
  );

export const ORDEN_EQUIPO: readonly EstadoEquipo[] = [
  'ACOMPANANDO',
  'ASIGNADO',
  'REGRESANDO',
  'DISPONIBLE',
  'CARGANDO',
  'FUERA_DE_SERVICIO',
];
/** Free members are the gold ones (who can I assign?); a member out of service is the only red. */
export const COLOR_EQUIPO: Record<EstadoEquipo, string> = {
  ACOMPANANDO: SERIE.tinta,
  ASIGNADO: SERIE.gris,
  REGRESANDO: SERIE.claro,
  DISPONIBLE: SERIE.oro,
  CARGANDO: SERIE.hueso,
  FUERA_DE_SERVICIO: colors.danger,
};
/** Only the states that have someone in them. */
export const partesEquipo = (equipo: readonly MiembroEquipo[]) =>
  armar(
    equipo.map((m) => m.estado),
    ORDEN_EQUIPO,
    (k) => CHIP_EQUIPO[k].label,
    (k) => COLOR_EQUIPO[k],
  ).filter((p) => p.valor > 0);

const ORDEN_EVENTO: readonly EstadoEvento[] = ['NUEVO', 'ATENDIDO', 'RESUELTO'];
/** Events by state: open ones gold, answered ones ink. */
export const partesEventos = (estados: readonly EstadoEvento[]) =>
  armar(
    estados,
    ORDEN_EVENTO,
    (k) => CHIP_EVENTO[k].label,
    (k) => ({ NUEVO: SERIE.oro, ATENDIDO: SERIE.tinta, RESUELTO: SERIE.claro })[k],
  );

const ORDEN_INVITACION: readonly EstadoInvitacion[] = [
  'PROGRAMADA',
  'LLEGO',
  'SALIO',
  'VENCIDA',
  'CANCELADA',
];
const COLOR_INVITACION: Record<EstadoInvitacion, string> = {
  PROGRAMADA: SERIE.claro,
  LLEGO: SERIE.tinta,
  SALIO: SERIE.gris,
  VENCIDA: SERIE.hueso,
  CANCELADA: SERIE.oro,
};
/** Invitations by state from counts (the API sums them, or `cuentaInvitaciones` of a list). */
export const partesInvitaciones = (cuentas: Partial<Record<EstadoInvitacion, number>>): Parte[] =>
  ORDEN_INVITACION.map((k) => ({
    id: k,
    texto: CHIP_INVITACION[k].label,
    valor: cuentas[k] ?? 0,
    color: COLOR_INVITACION[k],
  }));
export const cuentaInvitaciones = (estados: readonly EstadoInvitacion[]) =>
  Object.fromEntries(
    ORDEN_INVITACION.map((k, i) => [k, contar(estados, ORDEN_INVITACION)[i]]),
  ) as Record<EstadoInvitacion, number>;
