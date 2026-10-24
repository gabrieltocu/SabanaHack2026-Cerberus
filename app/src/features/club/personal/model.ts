// Pure rules of the personal app: ordering, labels and form validation.
import type { Actividad, ItemAgenda, OrdenServicio } from '../../../club/types';
import { esFecha, esHora } from '../socio/dates';
import type { IconName } from '../../../design-system';

export const porHora = <T extends { hora_desde: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.hora_desde.localeCompare(b.hora_desde));

export const TIPO_AGENDA: Record<ItemAgenda['tipo'], { etiqueta: string; icon: IconName }> = {
  TURNO: { etiqueta: 'Turno', icon: 'time-outline' },
  REUNION: { etiqueta: 'Reunión', icon: 'people-outline' },
  SERVICIO: { etiqueta: 'Servicio', icon: 'construct-outline' },
  RECORDATORIO: { etiqueta: 'Recordatorio', icon: 'alarm-outline' },
};

export const ESTADOS_SERVICIO: readonly { clave: OrdenServicio['estado']; etiqueta: string }[] = [
  { clave: 'PROGRAMADA', etiqueta: 'Programada' },
  { clave: 'EN_CURSO', etiqueta: 'En curso' },
  { clave: 'TERMINADA', etiqueta: 'Terminada' },
  { clave: 'CANCELADA', etiqueta: 'Cancelada' },
];

export const TRATOS = [
  { clave: 'senor', etiqueta: 'Señor' },
  { clave: 'senora', etiqueta: 'Señora' },
] as const;

export type Errores<T> = Partial<Record<keyof T, string>>;

const requerido = (v: string, msg: string) => (v.trim() ? undefined : msg);

function horario(
  desde: string,
  hasta: string,
): Pick<Errores<{ desde: 1; hasta: 1 }>, 'desde' | 'hasta'> {
  const e: { desde?: string; hasta?: string } = {};
  if (!esHora(desde)) e.desde = 'Escribe la hora como 09:30.';
  if (!esHora(hasta)) e.hasta = 'Escribe la hora como 11:00.';
  else if (esHora(desde) && hasta <= desde) e.hasta = 'Debe ser después de la hora de inicio.';
  return e;
}

export interface FormServicio {
  empresa: string;
  nombre: string;
  apellido: string;
  trato: 'senor' | 'senora' | null;
  trabajo: string;
  solicitado_por: string;
  responsable: string;
  area: string;
  fecha: string;
  hora_desde: string;
  hora_hasta: string;
  punto_presentacion: string;
}

export function validarServicio(f: FormServicio): Errores<FormServicio> {
  const h = horario(f.hora_desde, f.hora_hasta);
  const e: Errores<FormServicio> = {
    empresa: requerido(f.empresa, 'Escribe la empresa.'),
    nombre: requerido(f.nombre, 'Escribe el nombre.'),
    apellido: requerido(f.apellido, 'Escribe el apellido.'),
    trato: f.trato ? undefined : 'Elige el trato.',
    trabajo: requerido(f.trabajo, 'Describe el trabajo.'),
    solicitado_por: requerido(f.solicitado_por, 'Indica quién lo solicitó.'),
    responsable: requerido(f.responsable, 'Indica el responsable.'),
    area: requerido(f.area, 'Indica el área.'),
    fecha: esFecha(f.fecha) ? undefined : 'Elige la fecha.',
    hora_desde: h.desde,
    hora_hasta: h.hasta,
    punto_presentacion: requerido(f.punto_presentacion, 'Indica dónde se presenta.'),
  };
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errores<FormServicio>;
}

export interface FormActividad {
  nombre: string;
  descripcion: string;
  lugar: string;
  fecha: string;
  hora_desde: string;
  hora_hasta: string;
  cupo: string;
  robot_puede_ofrecer: boolean;
}

export function validarActividad(f: FormActividad): Errores<FormActividad> {
  const h = horario(f.hora_desde, f.hora_hasta);
  const cupo = f.cupo.trim();
  const e: Errores<FormActividad> = {
    nombre: requerido(f.nombre, 'Escribe el nombre.'),
    lugar: requerido(f.lugar, 'Indica el lugar.'),
    fecha: esFecha(f.fecha) ? undefined : 'Elige la fecha.',
    hora_desde: h.desde,
    hora_hasta: h.hasta,
    cupo: cupo && !/^[1-9]\d{0,3}$/.test(cupo) ? 'Usa un número entero mayor que 0.' : undefined,
  };
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errores<FormActividad>;
}

export const aActividad = (f: FormActividad): Omit<Actividad, 'id' | 'inscritos'> => ({
  nombre: f.nombre.trim(),
  descripcion: f.descripcion.trim() || null,
  lugar: f.lugar.trim(),
  fecha: f.fecha,
  hora_desde: f.hora_desde,
  hora_hasta: f.hora_hasta,
  cupo: f.cupo.trim() ? Number(f.cupo) : null,
  robot_puede_ofrecer: f.robot_puede_ofrecer,
});

export const deActividad = (a: Actividad): FormActividad => ({
  nombre: a.nombre,
  descripcion: a.descripcion ?? '',
  lugar: a.lugar,
  fecha: a.fecha,
  hora_desde: a.hora_desde,
  hora_hasta: a.hora_hasta,
  cupo: a.cupo === null ? '' : String(a.cupo),
  robot_puede_ofrecer: a.robot_puede_ofrecer,
});
