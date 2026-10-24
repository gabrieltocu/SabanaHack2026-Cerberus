import {
  diaBogota,
  ejemplo,
  estadoPase,
  fechaCorta,
  horaCorta,
  limpiar,
  parsePase,
  type EstadoPase,
  type Pase,
  type VisitaParams,
} from './pase';

export type VisitaDatos = {
  lugar?: string;
  anfitrion?: string;
  orden?: string;
  empresa?: string;
  area?: string;
  supervisor?: string;
  motivo?: string;
  genero?: 'f' | 'm';
};

export type Visita =
  | { clase: 'invalido' }
  | {
      clase: 'pase';
      tipo: 'invitado' | 'externo';
      /** Sin `p` en el enlace: datos ficticios de demostración. */
      ejemplo: boolean;
      pase: Pase;
      /** Texto exacto del QR. */
      payload: string;
      vigencia: EstadoPase;
      datos: VisitaDatos;
    };

/**
 * Decide qué se muestra: con `p`, solo el pase firmado (su tipo manda sobre `?tipo=`); sin `p`,
 * el ejemplo ficticio de `?tipo=` (invitado por omisión). Un `p` roto o de socio/personal es «inválido».
 */
export function resolverVisita(params: VisitaParams, now: number): Visita {
  const esEjemplo = !params.p;
  const datos = esEjemplo
    ? ejemplo(params.tipo === 'externo' ? 'externo' : 'invitado', now)
    : params;
  const pase = parsePase(datos.p);
  if (!pase || (pase.tipo !== 'invitado' && pase.tipo !== 'externo')) return { clase: 'invalido' };
  return {
    clase: 'pase',
    tipo: pase.tipo,
    ejemplo: esEjemplo,
    pase,
    payload: datos.p!,
    vigencia: estadoPase(pase, now, datos),
    datos: {
      lugar: limpiar(datos.lugar),
      anfitrion: limpiar(datos.anfitrion, 40),
      orden: limpiar(datos.orden, 24),
      empresa: limpiar(datos.empresa),
      area: limpiar(datos.area),
      supervisor: limpiar(datos.supervisor, 40),
      motivo: limpiar(datos.motivo, 120),
      genero: datos.genero === 'f' || datos.genero === 'm' ? datos.genero : undefined,
    },
  };
}

/** `Válido hasta 6:00 p. m.` (hoy) o `Válido el sáb 24 oct 2026 hasta 6:00 p. m.` */
export function validezTexto(v: EstadoPase, now: number): string {
  const hoy = diaBogota(v.finMs) === diaBogota(now);
  return `Válido ${hoy ? '' : `el ${fechaCorta(v.finMs)} `}hasta ${horaCorta(v.finMs)}`;
}

/** `sáb 24 oct 2026 · 3:00 p. m. – 8:00 p. m.`, o `· hasta 8:00 p. m.` si no hay hora de inicio. */
export function horarioTexto(v: EstadoPase): string {
  const horas =
    v.inicioMs === undefined
      ? `hasta ${horaCorta(v.finMs)}`
      : `${horaCorta(v.inicioMs)} – ${horaCorta(v.finMs)}`;
  return `${fechaCorta(v.finMs)} · ${horas}`;
}

/** `Hoy · 3:00 p. m. · Terraza`; sin hora de inicio, `Hoy · hasta 6:00 p. m. · Terraza`. */
export function lineaVisita(v: EstadoPase, now: number, lugar?: string): string {
  const dia = diaBogota(v.finMs) === diaBogota(now) ? 'Hoy' : fechaCorta(v.finMs);
  const hora = v.inicioMs === undefined ? `hasta ${horaCorta(v.finMs)}` : horaCorta(v.inicioMs);
  return [dia, hora, lugar].filter(Boolean).join(' · ');
}
