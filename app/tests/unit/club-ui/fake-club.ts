// Fake club API for the UI tests: a mutable state behind a fetch-shaped function.
import type { Evento, Invitacion } from '../../../src/club/types';

export const HOY = '2026-10-24';
export const AHORA = new Date('2026-10-24T15:00:00-05:00');

export const PASS = 'nclub-demo-2026';
export const USUARIOS = {
  'concierge@nclub.demo': {
    id: 'u-natalia',
    rol: 'CONCIERGE',
    nombre: 'Natalia',
    apellido: 'Rios',
    email: 'concierge@nclub.demo',
  },
  'sofia@nclub.demo': {
    id: 'u-sofia',
    rol: 'SOCIO',
    nombre: 'Sofia',
    apellido: 'Restrepo',
    email: 'sofia@nclub.demo',
  },
} as const;

export function evento(o: Partial<Evento> & { seq: number }): Evento {
  return {
    id: `e${o.seq}`,
    ts: `${HOY}T14:00:00-05:00`,
    tipo: 'ALERTA',
    categoria: null,
    persona_id: null,
    nombre: null,
    anfitrion_id: null,
    destino: null,
    avisar: [],
    severidad: 'atencion',
    requiere_atencion: true,
    motivo: null,
    evidencia: null,
    estado: 'NUEVO',
    atendido_por: null,
    atendido_at: null,
    nota: null,
    ...o,
  };
}

export function invitacion(o: Partial<Invitacion> & { id: string }): Invitacion {
  return {
    persona_id: `inv-${o.id}`,
    anfitrion_id: 'u-andres',
    nombre: 'Julian',
    apellido: 'Pardo',
    trato: 'senor',
    documento: null,
    fecha: HOY,
    hora_desde: '12:00',
    hora_hasta: '16:00',
    lugar: 'Restaurante',
    nota: null,
    estado: 'PROGRAMADA',
    foto_estado: 'NINGUNA',
    foto_motivo: null,
    consentimiento_at: null,
    creada_at: `${HOY}T08:00:00-05:00`,
    ...o,
  };
}

export interface Llamada {
  method: string;
  path: string;
  body: unknown;
}

export function crearFake() {
  const s = {
    eventos: [] as Evento[],
    invitaciones: [] as Invitacion[],
    robot: { en_linea: true, ultimo_latido: `${HOY}T14:59:50-05:00` } as {
      en_linea: boolean;
      ultimo_latido: string | null;
    },
    loginError: null as { status: number; error: string } | null,
    caido: false,
    llamadas: [] as Llamada[],
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  const fetchFake = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api/, '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    s.llamadas.push({ method, path: path + u.search, body });
    if (s.caido) throw new TypeError('network');
    const token = (init.headers as Record<string, string> | undefined)?.authorization;
    if (method === 'POST' && path === '/auth/login') {
      if (s.loginError)
        return json(s.loginError.status, { error: s.loginError.error, detalle: 'x' });
      const usuario = USUARIOS[body.email as keyof typeof USUARIOS];
      if (!usuario || body.clave !== PASS) {
        return json(401, {
          error: 'credenciales_invalidas',
          detalle: 'Correo o clave incorrectos.',
        });
      }
      return json(200, { token: `T-${usuario.id}`, usuario });
    }
    if (!token) return json(401, { error: 'no_autenticado', detalle: 'Inicia sesión.' });
    const quien = Object.values(USUARIOS).find((x) => `Bearer T-${x.id}` === token);
    if (path === '/me') return quien ? json(200, quien) : json(401, { error: 'token_invalido' });
    if (path === '/eventos') {
      const desde = Number(u.searchParams.get('despues_de') ?? 0);
      const items = s.eventos.filter((e) => e.seq > desde);
      return json(200, {
        items,
        ultimo_seq: s.eventos.reduce((m, e) => Math.max(m, e.seq), desde),
      });
    }
    const m = path.match(/^\/eventos\/([^/]+)\/(atender|resolver)$/);
    if (m && method === 'POST') {
      const e = s.eventos.find((x) => x.id === m[1]);
      if (!e) return json(404, { error: 'no_encontrado', detalle: 'No existe.' });
      Object.assign(e, {
        estado: m[2] === 'atender' ? 'ATENDIDO' : 'RESUELTO',
        atendido_por: quien?.id ?? null,
        atendido_at: `${HOY}T15:00:00-05:00`,
        nota: body?.nota ?? null,
      });
      return json(200, e);
    }
    if (path === '/invitaciones') return json(200, { items: s.invitaciones });
    if (path === '/robot/estado') return json(200, s.robot);
    return json(404, { error: 'no_encontrado', detalle: path });
  }) as unknown as typeof fetch;

  return { s, fetchFake };
}
