import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createClubClient, type UsuarioPublico } from '@/features/club/client';
import { SocioProvider } from '@/features/club/socio/SocioContext';
import type { Actividad, Confirmacion, Evento, Invitacion, Perfil, Visita } from '@/club/types';

/** 2026-10-23 15:00 in Bogotá. */
export const AHORA = () => new Date('2026-10-23T20:00:00Z');
export const HOY = '2026-10-23';

export const SOFIA: UsuarioPublico = {
  id: 'u-sofia',
  rol: 'SOCIO',
  persona_id: 'sofia',
  nombre: 'Sofia',
  apellido: 'Restrepo',
  trato: 'senora',
  email: 'sofia@nclub.demo',
  nivel: 'VIP',
  accion: 'empresarial',
  destino: 'VIP',
  activo: true,
};
export const ANDRES: UsuarioPublico = {
  ...SOFIA,
  id: 'u-andres',
  persona_id: 'andres',
  nombre: 'Andres',
  apellido: 'Mejia',
  trato: 'senor',
  nivel: 'REGULAR',
  accion: 'familiar',
};

export const inv = (extra: Partial<Invitacion> = {}): Invitacion => ({
  id: 'i1',
  persona_id: 'inv-1',
  anfitrion_id: 'u-sofia',
  nombre: 'Laura',
  apellido: 'Díaz',
  trato: 'senora',
  documento: null,
  fecha: '2026-10-24',
  hora_desde: '10:00',
  hora_hasta: '12:00',
  lugar: 'Sala de anfitriones',
  nota: null,
  estado: 'PROGRAMADA',
  foto_estado: 'NINGUNA',
  foto_motivo: null,
  consentimiento_at: null,
  creada_at: '2026-10-23T08:00:00-05:00',
  ...extra,
});

export const evento = (extra: Partial<Evento> = {}): Evento => ({
  seq: 1,
  id: 'e1',
  ts: '2026-10-24T10:02:11-05:00',
  tipo: 'LLEGADA',
  categoria: 'INVITADO',
  persona_id: 'inv-1',
  nombre: 'Laura Díaz',
  anfitrion_id: 'sofia',
  destino: 'Sala de anfitriones',
  avisar: ['anfitrion'],
  severidad: 'info',
  requiere_atencion: false,
  motivo: null,
  evidencia: null,
  estado: 'NUEVO',
  atendido_por: null,
  atendido_at: null,
  nota: null,
  ...extra,
});

export const confirmacion = (extra: Partial<Confirmacion> = {}): Confirmacion => ({
  id: 'c1',
  anfitrion_id: 'sofia',
  visitante_desc: 'Dice llamarse Pedro Gómez',
  evento_id: null,
  estado: 'PENDIENTE',
  creada_at: '2026-10-23T14:59:00-05:00',
  vence_at: '2026-10-23T15:30:00-05:00',
  respondida_at: null,
  ...extra,
});

export type Reply =
  { status?: number; body?: unknown } | (() => { status?: number; body?: unknown });
export type Call = { method: string; path: string; query: string; body: unknown };

/** Fake fetch keyed by `METHOD /path`; a function reply can change between calls. */
export function fakeApi(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const [path = '', query = ''] = url.replace('http://club.test', '').split('?');
    const method = init.method ?? 'GET';
    const raw = init.body;
    const body = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
    calls.push({ method, path, query, body });
    const r = routes[`${method} ${path}`];
    const out =
      typeof r === 'function'
        ? r()
        : (r ?? { status: 404, body: { error: 'x', detalle: 'No existe.' } });
    return new Response(out.body === undefined ? '' : JSON.stringify(out.body), {
      status: out.status ?? 200,
    });
  }) as unknown as typeof fetch;
  return { calls, client: createClubClient('http://club.test', impl) };
}

export async function renderSocio(
  ui: ReactElement,
  api: ReturnType<typeof fakeApi>,
  usuario: UsuarioPublico = SOFIA,
) {
  return render(
    <SocioProvider client={api.client} usuario={usuario} ahora={AHORA}>
      {ui}
    </SocioProvider>,
  );
}

export const visita = (extra: Partial<Visita> = {}): Visita => ({
  id: 'v1',
  persona_id: 'inv-1',
  nombre: 'Laura Díaz',
  categoria: 'INVITADO',
  invitacion_id: 'i1',
  anfitrion_id: 'u-sofia',
  actividad_id: null,
  destino: 'Sala de anfitriones',
  punto_encuentro: null,
  ubicacion_anfitrion: null,
  permisos: [],
  asistencia: [],
  preferencias_bebida: [],
  acompanante: { tipo: 'ROBOT', id: 'x2-1', nombre: 'Robot X2-1' },
  estado: 'ACOMPANANDO',
  inicio: '2026-10-23T14:40:00-05:00',
  fin: null,
  cierre: null,
  recorrido: [
    { ts: '2026-10-23T14:40:00-05:00', tipo: 'LLEGADA', actor: 'invitado', detalle: null },
    { ts: '2026-10-23T14:41:00-05:00', tipo: 'ASIGNADO', actor: 'x2-1', detalle: null },
  ],
  ...extra,
});

export const perfil = (extra: Partial<Perfil> = {}): Perfil => ({
  usuario_id: 'u-sofia',
  preferencias_bebida: ['Café'],
  asistencia: [],
  nota_asistencia: null,
  foto_estado: 'NINGUNA',
  foto_motivo: null,
  ...extra,
});

export const actividad = (extra: Partial<Actividad> = {}): Actividad => ({
  id: 'act1',
  nombre: 'Cata de vinos',
  descripcion: 'Cuatro etiquetas con el sommelier.',
  lugar: 'Salón principal',
  fecha: '2026-10-23',
  hora_desde: '19:00',
  hora_hasta: '20:30',
  cupo: 12,
  inscritos: ['u-x', 'u-y'],
  robot_puede_ofrecer: true,
  ...extra,
});
