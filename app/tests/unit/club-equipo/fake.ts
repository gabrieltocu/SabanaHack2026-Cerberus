// Fake v3 club API for the team apps: one mutable state behind a fetch-shaped function.
import type {
  Actividad,
  Incidencia,
  ItemAgenda,
  MiembroEquipo,
  OrdenServicio,
  QrVerificado,
  Tarea,
  Visita,
} from '../../../src/club/types';

export const PASS = 'nclub-demo-2026';
export const HOY = '2026-10-24';
export const AHORA = new Date('2026-10-24T15:00:00-05:00');
export const haceMin = (m: number) => new Date(AHORA.getTime() - m * 60_000).toISOString();

const base = {
  persona_id: null,
  trato: 'senor',
  nivel: null,
  accion: null,
  destino: null,
  activo: true,
};
export const USUARIOS = {
  'edecan@nclub.demo': {
    ...base,
    id: 'u-mateo',
    rol: 'EDECAN',
    nombre: 'Mateo',
    apellido: 'Gil',
    email: 'edecan@nclub.demo',
  },
  'personal@nclub.demo': {
    ...base,
    id: 'u-marta',
    rol: 'PERSONAL',
    nombre: 'Marta',
    apellido: 'Ruiz',
    email: 'personal@nclub.demo',
    persona_id: 'marta',
    trato: 'senora',
  },
  'sofia@nclub.demo': {
    ...base,
    id: 'u-sofia',
    rol: 'SOCIO',
    nombre: 'Sofia',
    apellido: 'Restrepo',
    email: 'sofia@nclub.demo',
    persona_id: 'sofia',
    trato: 'senora',
  },
} as const;

export const tarea = (o: Partial<Tarea> & { id: string }): Tarea => ({
  tipo: 'ACOMPANAR',
  visita_id: `vis-${o.id}`,
  nombre_visitante: 'Julián Pardo',
  prioridad: 'normal',
  punto_encuentro: 'Recepción',
  motivo: null,
  asignada_a: null,
  estado: 'ABIERTA',
  creada_at: haceMin(2),
  aceptada_at: null,
  rechazos: [],
  ...o,
});

export const visita = (o: Partial<Visita> & { id: string }): Visita => ({
  persona_id: 'inv-1',
  nombre: 'Camila Torres',
  categoria: 'INVITADO',
  invitacion_id: 'i1',
  anfitrion_id: 'u-sofia',
  actividad_id: null,
  destino: 'Sala Ejecutiva',
  punto_encuentro: 'Entrada principal',
  ubicacion_anfitrion: null,
  permisos: ['Sala Ejecutiva'],
  asistencia: ['silla_ruedas'],
  preferencias_bebida: ['té verde'],
  acompanante: { tipo: 'HUMANO', id: 'u-mateo', nombre: 'Mateo Gil' },
  estado: 'ACOMPANANDO',
  inicio: haceMin(6),
  fin: null,
  cierre: null,
  recorrido: [
    { ts: haceMin(6), tipo: 'LLEGADA', actor: 'x2-1', detalle: null },
    { ts: haceMin(5), tipo: 'ASIGNADO', actor: 'u-mateo', detalle: 'Mateo Gil' },
  ],
  ...o,
});

export interface Llamada {
  method: string;
  path: string;
  query: string;
  body: Record<string, unknown> | undefined;
}

export function crearApi() {
  const s = {
    tareas: [] as Tarea[],
    visitas: {} as Record<string, Visita>,
    incidencias: [] as Incidencia[],
    equipo: [
      {
        id: 'u-mateo',
        tipo: 'HUMANO',
        nombre: 'Mateo Gil',
        estado: 'DISPONIBLE',
        visita_id: null,
        detalle: null,
        actualizado_at: null,
      },
    ] as MiembroEquipo[],
    agenda: [] as ItemAgenda[],
    servicios: [] as OrdenServicio[],
    actividades: [] as Actividad[],
    qr: null as QrVerificado | null,
    caido: false,
    llamadas: [] as Llamada[],
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const nuevo = () => `n${s.llamadas.length}`;

  const fetchFake = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api/, '');
    const method = init.method ?? 'GET';
    const body = init.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : undefined;
    s.llamadas.push({ method, path, query: u.search, body });
    if (s.caido) throw new TypeError('network');
    if (method === 'POST' && path === '/auth/login') {
      const usuario = USUARIOS[body?.email as keyof typeof USUARIOS];
      if (!usuario || body?.clave !== PASS)
        return json(401, {
          error: 'credenciales_invalidas',
          detalle: 'Correo o clave incorrectos.',
        });
      return json(200, { token: `T-${usuario.id}`, usuario });
    }
    const token = (init.headers as Record<string, string> | undefined)?.authorization;
    const quien = Object.values(USUARIOS).find((x) => `Bearer T-${x.id}` === token);
    if (!quien) return json(401, { error: 'no_autenticado', detalle: 'Inicia sesión.' });
    const k = `${method} ${path}`;
    let m: RegExpMatchArray | null;

    if (k === 'GET /me') return json(200, quien);
    if (k === 'GET /tareas') return json(200, { items: s.tareas });
    if ((m = path.match(/^\/tareas\/([^/]+)\/(aceptar|rechazar)$/)) && method === 'POST') {
      const t = s.tareas.find((x) => x.id === m![1]);
      if (!t) return json(404, { error: 'no_encontrado', detalle: 'No existe.' });
      if (m[2] === 'aceptar') Object.assign(t, { estado: 'ACEPTADA', asignada_a: quien.id });
      else Object.assign(t, { rechazos: [...t.rechazos, quien.id] });
      return json(200, t);
    }
    if ((m = path.match(/^\/visitas\/([^/]+)$/)) && method === 'GET') {
      const v = s.visitas[m[1]!];
      return v ? json(200, v) : json(404, { error: 'no_encontrado', detalle: 'No existe.' });
    }
    if (
      (m = path.match(/^\/visitas\/([^/]+)\/(llegada|recibir|relevo|ayuda|asignar)$/)) &&
      method === 'POST'
    ) {
      const v = s.visitas[m[1]!];
      if (!v) return json(404, { error: 'no_encontrado', detalle: 'No existe.' });
      if (m[2] === 'llegada') v.estado = 'EN_DESTINO';
      if (m[2] === 'recibir') v.estado = 'ACOMPANANDO';
      if (m[2] === 'relevo') v.estado = 'EN_RELEVO';
      return json(
        200,
        m[2] === 'relevo' || m[2] === 'ayuda' ? tarea({ id: nuevo(), visita_id: v.id }) : v,
      );
    }
    if (k === 'POST /visitas') {
      const v = visita({ id: 'vis-nueva', acompanante: null, estado: 'EN_RECEPCION' });
      s.visitas[v.id] = v;
      return json(200, v);
    }
    if (k === 'POST /qr/verificar')
      return json(
        200,
        s.qr ?? {
          valido: false,
          motivo: 'firma_invalida',
          tipo: null,
          persona_id: null,
          nombre: null,
          invitacion: null,
          visita: null,
        },
      );
    if (k === 'GET /equipo') return json(200, { items: s.equipo });
    if (k === 'PATCH /me/estado') return json(200, { ...s.equipo[0], estado: body?.estado });
    if (k === 'GET /incidencias') return json(200, { items: s.incidencias });
    if (k === 'POST /incidencias') {
      const i = {
        id: nuevo(),
        estado: 'ABIERTA',
        lugar: null,
        visita_id: null,
        reportada_por: quien.id,
        creada_at: AHORA.toISOString(),
        resuelta_at: null,
        ...body,
      } as Incidencia;
      s.incidencias.push(i);
      return json(200, i);
    }
    if (k === 'GET /me/agenda')
      return json(200, { items: s.agenda.filter((a) => a.fecha === u.searchParams.get('fecha')) });
    if (k === 'POST /me/agenda') {
      const a = {
        id: nuevo(),
        tipo: 'RECORDATORIO',
        lugar: null,
        hora_hasta: null,
        nota: null,
        ...body,
      } as ItemAgenda;
      s.agenda.push(a);
      return json(200, a);
    }
    if ((m = path.match(/^\/me\/agenda\/([^/]+)$/)) && method === 'DELETE') {
      s.agenda = s.agenda.filter((a) => a.id !== m![1]);
      return json(200, { ok: true });
    }
    if (k === 'GET /servicios') return json(200, { items: s.servicios });
    if (k === 'POST /servicios') {
      const o = { id: 'OT-0001', persona: 'ext-1', estado: 'PROGRAMADA', ...body } as OrdenServicio;
      s.servicios.push(o);
      return json(200, o);
    }
    if ((m = path.match(/^\/servicios\/([^/]+)$/)) && method === 'PATCH') {
      const o = s.servicios.find((x) => x.id === m![1])!;
      Object.assign(o, body);
      return json(200, o);
    }
    if (k === 'GET /actividades')
      return json(200, {
        items: s.actividades.filter((a) => a.fecha === u.searchParams.get('fecha')),
      });
    if (k === 'POST /actividades') {
      const a = { id: nuevo(), inscritos: [], ...body } as unknown as Actividad;
      s.actividades.push(a);
      return json(200, a);
    }
    if ((m = path.match(/^\/actividades\/([^/]+)$/)) && method === 'PATCH') {
      const a = s.actividades.find((x) => x.id === m![1])!;
      Object.assign(a, body);
      return json(200, a);
    }
    if ((m = path.match(/^\/actividades\/([^/]+)$/)) && method === 'DELETE') {
      s.actividades = s.actividades.filter((a) => a.id !== m![1]);
      return json(200, { ok: true });
    }
    if (path.endsWith('/foto'))
      return json(404, { error: 'foto_no_disponible', detalle: 'Sin foto.' });
    return json(404, { error: 'no_encontrado', detalle: path });
  }) as unknown as typeof fetch;

  return { s, fetchFake };
}
