// Visit helpers for the socio app: who it belongs to, how to read its `recorrido`, short sentences.
// "Llegar al destino cierra el acompañamiento; salir del club cierra la visita."
import type { Acompanante, PasoVisita, Trato, Visita } from '../../../club/types';
import type { UsuarioPublico } from '../client';
import { horaDe, hoyBogota } from './dates';

export const activa = (v: Visita) => v.estado !== 'CERRADA';

/** The socio's own visit (they are the visitor), as opposed to a guest's. */
export const esPropia = (v: Visita, u: Pick<UsuarioPublico, 'persona_id'>) =>
  !!u.persona_id && v.persona_id === u.persona_id;

/** Closed visits stay in the list for the rest of the day, so the socio can still rate them. */
export const esDeHoy = (v: Visita, hoy: string) => hoyBogota(new Date(v.fin ?? v.inicio)) === hoy;

export const tipoAcompanante = (a: Acompanante) => (a.tipo === 'ROBOT' ? 'Robot' : 'Edecán');

/** One sentence: what is happening with the visitor right now. */
export function resumenVisita(v: Visita, propia = false): string {
  const quien = propia ? 'Tú' : v.nombre.split(' ')[0];
  switch (v.estado) {
    case 'EN_RECEPCION':
      return `${quien} ${propia ? 'estás' : 'está'} en recepción. En un momento te asignan quién ${propia ? 'te' : 'lo'} acompañe.`;
    case 'ACOMPANANDO':
      return `${v.acompanante?.nombre ?? 'Un acompañante'} ${propia ? 'te lleva' : 'lo lleva'} a ${v.destino}.`;
    case 'EN_RELEVO':
      return `Están cambiando de acompañante. ${propia ? 'No tienes' : 'No tiene'} que hacer nada.`;
    case 'EN_DESTINO':
      return `${propia ? 'Llegaste' : 'Llegó'} a ${v.destino}. El acompañamiento terminó.`;
    case 'CERRADA':
      return `${propia ? 'Saliste' : 'Salió'} del club${v.fin ? ` a las ${horaDe(v.fin)}` : ''}.`;
  }
}

const ARTICULO: Record<string, 'el' | 'la'> = {
  'Sala de anfitriones': 'la',
  'Lounge VIP': 'el',
  Terraza: 'la',
  Restaurante: 'el',
};
/** `Terraza` -> `a la Terraza`, `Lounge VIP` -> `al Lounge VIP`; other places go as they come. */
const aLugar = (lugar: string) => {
  const art = ARTICULO[lugar];
  return art === 'el' ? `al ${lugar}` : art ? `a la ${lugar}` : `a ${lugar}`;
};

const lo = (t?: Trato) => (t === 'senora' ? 'la' : t === 'senor' ? 'lo' : 'le');

/**
 * The visit as two short lines: "Laura Díaz llegó" / "El robot la lleva a la Terraza".
 * `trato` of the guest only decides «lo/la/le»; the socio's own visit speaks in second person.
 */
export function frasesVisita(v: Visita, propia = false, trato?: Trato) {
  const acompana = v.acompanante
    ? v.acompanante.tipo === 'ROBOT'
      ? 'El robot'
      : v.acompanante.nombre
    : 'Un acompañante';
  const a = propia ? 'te' : lo(trato);
  const en = v.destino ? ` ${aLugar(v.destino)}` : '';
  switch (v.estado) {
    case 'EN_RECEPCION':
      return {
        titulo: propia ? 'Estás en recepción' : `${v.nombre} está en recepción`,
        detalle: `Enseguida llega quien ${a} acompañe.`,
      };
    case 'ACOMPANANDO':
      return {
        titulo: propia ? 'Llegaste al club' : `${v.nombre} llegó`,
        detalle: `${acompana} ${a} lleva${en}.`,
      };
    case 'EN_RELEVO':
      return {
        titulo: propia ? 'Llegaste al club' : `${v.nombre} llegó`,
        detalle: 'Están cambiando de acompañante.',
      };
    case 'EN_DESTINO':
      return {
        titulo: propia ? `Llegaste${en}` : `${v.nombre} llegó${en}`,
        detalle: 'El acompañamiento terminó.',
      };
    case 'CERRADA':
    default: {
      const salio = v.fin ? ` a las ${horaDe(v.fin)}` : '';
      return {
        titulo: propia ? 'Tu visita terminó' : `${v.nombre} salió${salio}`,
        detalle: propia ? 'Cuéntanos cómo te fue.' : 'Cuéntanos cómo estuvo la visita.',
      };
    }
  }
}

/** 0 to 1 for the gold bar: steps done, plus half of the one in progress. */
export function progresoVisita(v: Visita): number {
  if (v.estado === 'CERRADA') return 1;
  const f = fases(v);
  const hechas = f.filter((x) => x.estado === 'hecha').length;
  const actual = f.some((x) => x.estado === 'actual') ? 0.5 : 0;
  return Math.min(1, (hechas + actual) / f.length);
}

export type ClaveFase = 'LLEGADA' | 'ACOMPANANDO' | 'RELEVO' | 'ENTREGA' | 'EN_DESTINO';

export interface Fase {
  clave: ClaveFase;
  titulo: string;
  estado: 'hecha' | 'actual' | 'pendiente';
  hora: string;
  detalle: string | null;
}

const FASE_DE: Partial<Record<PasoVisita['tipo'], ClaveFase>> = {
  LLEGADA: 'LLEGADA',
  ASIGNADO: 'ACOMPANANDO',
  RELEVO_SOLICITADO: 'RELEVO',
  RELEVO_ACEPTADO: 'RELEVO',
  ENTREGA_CONFIRMADA: 'ENTREGA',
  EN_DESTINO: 'EN_DESTINO',
};

const FASES: readonly { clave: ClaveFase; titulo: string; opcional: boolean }[] = [
  { clave: 'LLEGADA', titulo: 'Llegada al club', opcional: false },
  { clave: 'ACOMPANANDO', titulo: 'Acompañamiento', opcional: false },
  { clave: 'RELEVO', titulo: 'Cambio de acompañante', opcional: true },
  { clave: 'ENTREGA', titulo: 'Entrega confirmada', opcional: true },
  { clave: 'EN_DESTINO', titulo: 'En su destino', opcional: false },
];

/**
 * Relevo and entrega only show when they happened (or are happening): most visits skip them.
 * While the visit is EN_RELEVO the handoff is the step in progress, even if its request is logged.
 */
export function fases(v: Visita): Fase[] {
  const ultimo = (c: ClaveFase) => v.recorrido.filter((p) => FASE_DE[p.tipo] === c).at(-1);
  const enRelevo = v.estado === 'EN_RELEVO';
  const visibles = FASES.filter(
    (f) => !f.opcional || ultimo(f.clave) || (f.clave === 'RELEVO' && enRelevo),
  );
  const hecha = (c: ClaveFase) => !!ultimo(c) && !(enRelevo && c === 'RELEVO');
  const primeraPendiente = visibles.findIndex((f) => !hecha(f.clave));
  return visibles.map((f, i) => {
    const paso = ultimo(f.clave);
    // The reason for the handoff is written on its request; the acceptance carries no text.
    const detalle = paso?.detalle ?? (f.clave === 'RELEVO' ? (motivoRelevo(v) ?? null) : null);
    return {
      clave: f.clave,
      titulo: f.titulo,
      estado: hecha(f.clave)
        ? 'hecha'
        : i === primeraPendiente && activa(v)
          ? 'actual'
          : 'pendiente',
      hora: paso ? horaDe(paso.ts) : '',
      detalle,
    };
  });
}

/** Events outside the five phases (help, meeting point, incidents, exit), in time order. */
export const novedades = (v: Visita): PasoVisita[] => v.recorrido.filter((p) => !FASE_DE[p.tipo]);

export const NOVEDAD: Record<string, string> = {
  AYUDA: 'Ayuda solicitada',
  ENCUENTRO: 'Punto de encuentro compartido',
  INCIDENCIA: 'Incidencia reportada',
  SALIDA: 'Salió del club',
};

/** Why the handoff started, as the API wrote it (last RELEVO_SOLICITADO). */
export const motivoRelevo = (v: Visita) =>
  v.recorrido.filter((p) => p.tipo === 'RELEVO_SOLICITADO').at(-1)?.detalle ?? null;
