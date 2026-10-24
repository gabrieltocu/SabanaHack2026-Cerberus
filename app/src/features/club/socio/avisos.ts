// Turns robot events into the short sentences the socio reads in Avisos.
import type { IconName } from '../../../design-system';
import type { Evento, Invitacion, Trato } from '../../../club/types';
import { horaDe } from './dates';

export type Tono = 'ok' | 'info' | 'alerta' | 'urgente';

export interface Aviso {
  seq: number;
  texto: string;
  tono: Tono;
  icono: IconName;
}

/** Free text from the robot without its trailing period, so we can close the sentence once. */
const limpio = (s: string | null) => s?.replace(/[.\s]+$/, '') || null;
const pronombre = (t?: Trato) => (t === 'senora' ? 'la' : t === 'senor' ? 'lo' : 'le');

/** `trato` of the invited person (looked up by `persona_id`) only decides "lo/la/le". */
export function aAviso(e: Evento, trato?: Trato): Aviso {
  const quien = e.nombre ?? 'Tu invitado';
  const hora = horaDe(e.ts);
  const a = hora ? ` (${hora})` : '';
  switch (e.tipo) {
    case 'LLEGADA':
      return {
        seq: e.seq,
        tono: 'ok',
        icono: 'log-in-outline',
        texto: `${quien} llegó${a}. El robot ${pronombre(trato)} acompaña${e.destino ? ` a ${e.destino}` : ''}.`,
      };
    case 'SALIDA':
      return { seq: e.seq, tono: 'info', icono: 'log-out-outline', texto: `${quien} salió${a}.` };
    case 'ESCALADO_RECEPCION':
      return {
        seq: e.seq,
        tono: 'alerta',
        icono: 'notifications-outline',
        texto: `Recepción atiende a ${quien}${a}.`,
      };
    case 'IMPREVISTO':
    case 'EMERGENCIA':
      return {
        seq: e.seq,
        tono: e.tipo === 'EMERGENCIA' ? 'urgente' : 'alerta',
        icono: 'warning-outline',
        texto: `${limpio(e.motivo) ?? 'Hay un aviso importante'}${a}.`,
      };
    default:
      return {
        seq: e.seq,
        tono: 'info',
        icono: 'notifications-outline',
        texto: `${limpio(e.motivo) ?? quien}${a}.`,
      };
  }
}

/** Newest first, with "lo/la" resolved from the invitations already loaded. */
export function aAvisos(
  eventos: readonly Evento[],
  invitaciones: readonly Invitacion[] | null,
): Aviso[] {
  const tratos = new Map((invitaciones ?? []).map((i) => [i.persona_id, i.trato]));
  return [...eventos].reverse().map((e) => aAviso(e, tratos.get(e.persona_id ?? '')));
}
