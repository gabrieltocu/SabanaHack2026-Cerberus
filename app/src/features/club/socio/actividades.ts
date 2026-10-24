// Activity helpers: seats left, my enrolment and whether it already ended.
import type { Actividad } from '../../../club/types';
import { horaBogota, hoyBogota } from './dates';

export const inscrito = (a: Actividad, usuarioId: string) => a.inscritos.includes(usuarioId);

export const cuposLibres = (a: Actividad) =>
  a.cupo === null ? null : Math.max(0, a.cupo - a.inscritos.length);

/** `Sin límite de cupo`, `5 cupos libres`, `Último cupo`, `Cupo lleno`. */
export function cupoTexto(a: Actividad): string {
  const libres = cuposLibres(a);
  if (libres === null) return 'Sin límite de cupo';
  if (libres === 0) return 'Cupo lleno';
  return libres === 1 ? 'Último cupo' : `${libres} cupos libres`;
}

export const terminada = (a: Actividad, ahora: Date) =>
  a.fecha < hoyBogota(ahora) || (a.fecha === hoyBogota(ahora) && a.hora_hasta <= horaBogota(ahora));

export const horario = (a: Pick<Actividad, 'hora_desde' | 'hora_hasta'>) =>
  `${a.hora_desde}–${a.hora_hasta}`;

export const porHora = (a: Actividad, b: Actividad) => a.hora_desde.localeCompare(b.hora_desde);
