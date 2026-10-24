/* eslint-disable @typescript-eslint/no-require-imports -- route modules are loaded lazily for renderRouter */
// v3 sections of the web panel (team, queue, assignment, events, records, ratings, history)
// rendered through the real routes with a fake club API.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { tokenStore } from '@/features/club/client';
import type {
  ColaItem,
  Evaluacion,
  Incidencia,
  MiembroEquipo,
  PanelResumen,
  RegistrosAdmin,
  ReservaRobot,
  Visita,
} from '../../../src/club/types';

const HOY = '2026-10-24';
let mockFetch: typeof fetch;
jest.mock('@/features/club/client', () => {
  const actual = jest.requireActual('@/features/club/client');
  return {
    ...actual,
    club: actual.createClubClient('http://t/api', (...a: Parameters<typeof fetch>) =>
      mockFetch(...a),
    ),
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockDimensions = jest.requireMock<{ default: jest.Mock }>(
  'react-native/Libraries/Utilities/useWindowDimensions',
).default;
const ancho = (width: number) =>
  mockDimensions.mockReturnValue({ width, height: 900, scale: 1, fontScale: 1 });

const rutas = () => ({
  '(club)/_layout': require('../../../app/(club)/_layout').default,
  '(club)/entrar': () => <Text>ENTRAR</Text>,
  '(club)/app/panel/_layout': require('../../../app/(club)/app/panel/_layout').default,
  '(club)/app/panel/index': require('../../../app/(club)/app/panel/index').default,
  '(club)/app/socio/index': () => <Text>INICIO SOCIO</Text>,
});

const miembro = (o: Partial<MiembroEquipo> & { id: string }): MiembroEquipo => ({
  tipo: 'HUMANO',
  nombre: o.id,
  estado: 'DISPONIBLE',
  visita_id: null,
  detalle: null,
  actualizado_at: `${HOY}T14:59:00-05:00`,
  ...o,
});
const visita = (o: Partial<Visita> & { id: string }): Visita => ({
  persona_id: null,
  nombre: 'Andrés Ramírez',
  categoria: 'VIP',
  invitacion_id: null,
  anfitrion_id: null,
  actividad_id: null,
  destino: 'Sala Ejecutiva',
  punto_encuentro: null,
  ubicacion_anfitrion: null,
  permisos: [],
  asistencia: [],
  preferencias_bebida: [],
  acompanante: null,
  estado: 'ACOMPANANDO',
  inicio: `${HOY}T14:00:00-05:00`,
  fin: null,
  cierre: null,
  recorrido: [],
  ...o,
});

const resumenVacio = (): PanelResumen => ({
  fecha: HOY,
  kpis: {
    visitas_hoy: 0,
    visitantes_vip: 0,
    invitaciones_activas: 0,
    alertas_abiertas: 0,
    atencion_promedio_min: null,
  },
  flujo_por_hora: [],
  por_categoria: { VIP: 0, REGULAR: 0, INVITADO: 0, PERSONAL: 0, EXTERNO: 0 },
  robot: { en_linea: true, ultimo_latido: null, robot: 'R1', estado: 'ok', detalle: null },
  actividad: [],
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
let rol: string;
let cola: ColaItem[];
let equipo: MiembroEquipo[];
let visitas: Visita[];
let reservas: ReservaRobot[];
let incidencias: Incidencia[];
let llamadas: { method: string; path: string; body: unknown }[];
let sembrado: boolean;

const registros: RegistrosAdmin = {
  usuarios: [
    {
      id: 'u-luciana',
      rol: 'ADMIN',
      persona_id: null,
      nombre: 'Luciana',
      apellido: 'Vargas',
      trato: 'senora',
      email: 'admin@nclub.demo',
      nivel: null,
      accion: null,
      destino: null,
      activo: true,
    },
    {
      id: 'u-sofia',
      rol: 'SOCIO',
      persona_id: 'sofia',
      nombre: 'Sofía',
      apellido: 'Restrepo',
      trato: 'senora',
      email: 'sofia@nclub.demo',
      nivel: 'VIP',
      accion: 'familiar',
      destino: 'Salón Principal',
      activo: true,
    },
  ],
  invitaciones_por_estado: { PROGRAMADA: 4, LLEGO: 2, SALIO: 1, CANCELADA: 0, VENCIDA: 0 },
  servicios: [],
  destinos: ['Salón Principal', 'Terraza'],
};
const evaluaciones: Evaluacion[] = [
  {
    id: 'ev1',
    visita_id: 'vis-9',
    autor: 'invitado',
    robot: 5,
    club: 4,
    comentario: 'El robot fue muy amable',
    transcripcion: null,
    creada_at: `${HOY}T13:00:00-05:00`,
  },
  {
    id: 'ev2',
    visita_id: null,
    autor: 'invitado',
    robot: 4,
    club: 4,
    comentario: null,
    transcripcion: 'Todo muy rápido',
    creada_at: `${HOY}T12:00:00-05:00`,
  },
];

beforeEach(async () => {
  jest.useFakeTimers({ now: new Date(`${HOY}T15:00:00-05:00`) });
  ancho(390);
  rol = 'ADMIN';
  sembrado = false;
  llamadas = [];
  cola = [
    {
      visita_id: 'vis-2',
      tarea_id: 't1',
      nombre: 'Camila Torres',
      categoria: 'INVITADO',
      prioridad: 'alta',
      motivo: 'Necesita acompañante',
      punto_encuentro: 'Lobby',
      espera_min: 7,
    },
  ];
  equipo = [
    miembro({
      id: 'x2-1',
      tipo: 'ROBOT',
      nombre: 'Robot X2-1',
      estado: 'ACOMPANANDO',
      visita_id: 'vis-1',
    }),
    miembro({ id: 'u-mateo', nombre: 'Mateo Gil' }),
    miembro({ id: 'x2-2', tipo: 'ROBOT', nombre: 'Robot X2-2', estado: 'CARGANDO' }),
  ];
  visitas = [visita({ id: 'vis-1' })];
  reservas = [];
  incidencias = [];
  mockFetch = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api/, '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    llamadas.push({ method, path: path + u.search, body });
    if (path === '/me') {
      return json(200, { id: 'u1', rol, nombre: 'Luciana', apellido: 'Vega', trato: 'senora' });
    }
    if (path === '/panel/resumen') return json(200, resumenVacio());
    if (path === '/cola') return json(200, { items: cola });
    if (path === '/equipo') return json(200, { items: equipo });
    if (path === '/visitas' && method === 'GET') {
      const estado = u.searchParams.get('estado');
      return json(200, { items: visitas.filter((v) => !estado || v.estado === estado) });
    }
    if (path === '/visitas/vis-2/asignar') return json(200, visita({ id: 'vis-2' }));
    if (path === '/reservas-robot' && method === 'GET') return json(200, { items: reservas });
    if (path === '/reservas-robot' && method === 'POST') {
      const r = { id: 'r-new', creada_por: 'u1', ...body } as ReservaRobot;
      reservas.push(r);
      return json(200, r);
    }
    if (path === '/admin/registros') return json(200, registros);
    if (path === '/membresia/solicitudes') {
      return json(200, {
        items: [
          {
            id: 's1',
            nombre: 'Julián Pardo',
            email: 'julian@example.com',
            telefono: null,
            interes: 'familiar',
            mensaje: null,
            estado: 'NUEVA',
            creada_at: `${HOY}T09:00:00-05:00`,
          },
        ],
      });
    }
    if (path === '/evaluaciones') {
      return json(200, {
        items: evaluaciones,
        promedio_robot: 4.5,
        promedio_club: 4,
        puntos_clave: ['amable', 'rápido'],
      });
    }
    if (path === '/incidencias') return json(200, { items: incidencias });
    if (path === '/demo/sembrar') {
      const ya = sembrado;
      sembrado = true;
      return json(200, ya ? { ya_sembrado: true } : { ok: true });
    }
    return json(200, { items: [], ultimo_seq: 0 });
  }) as unknown as typeof fetch;
  global.fetch = ((...a: Parameters<typeof fetch>) => mockFetch(...a)) as typeof fetch;
  await tokenStore.set('T');
});
afterEach(() => jest.useRealTimers());

const abrir = () => renderRouter(rutas(), { initialUrl: '/app/panel' });
const irA = async (nombre: string) => {
  await screen.findByText('Resumen general');
  await fireEvent.press(screen.getByRole('tab', { name: 'Más' }));
  await fireEvent.press(await screen.findByRole('button', { name: nombre }));
};

describe('panel web v3', () => {
  it('en el móvil la barra inferior tiene 5 pestañas y «Más» abre el resto', async () => {
    await abrir();
    await screen.findByText('Resumen general');
    expect(screen.getAllByRole('tab', { name: /^(Resumen|Cola|Equipo|Alertas|Más)/ })).toHaveLength(
      5,
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Más' }));
    for (const s of ['Visitas', 'Eventos del robot', 'Robot R1', 'Historial', 'Evaluaciones']) {
      expect(await screen.findByRole('button', { name: s })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'Registros y permisos' })).toBeOnTheScreen();
  });

  it('en escritorio la barra lateral agrupa Operación y Registros', async () => {
    ancho(1200);
    await abrir();
    await screen.findByText('Resumen general');
    expect(screen.getByText('OPERACIÓN')).toBeOnTheScreen();
    expect(screen.getByText('REGISTROS')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Equipo' }));
    expect(await screen.findByText('Andrés Ramírez · Sala Ejecutiva')).toBeOnTheScreen();
  });

  it('Equipo: robots y personas con su estado y la visita que atienden', async () => {
    await abrir();
    await screen.findByText('Resumen general');
    await fireEvent.press(screen.getByRole('tab', { name: 'Equipo' }));
    expect(await screen.findByText('Equipo · 1 de 3 disponibles')).toBeOnTheScreen();
    expect(screen.getByText('Acompañando')).toBeOnTheScreen();
    expect(screen.getByText('Disponible')).toBeOnTheScreen();
    expect(screen.getByText('Cargando')).toBeOnTheScreen();
    expect(screen.getByText(/Robot · Andrés Ramírez · Sala Ejecutiva/)).toBeOnTheScreen();
  });

  it('Cola: ordena, muestra la espera y se actualiza cada 5 s; la insignia cuenta los que esperan', async () => {
    await abrir();
    await screen.findByText('Resumen general');
    expect(await screen.findByLabelText('1 pendientes')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: /^Cola/ }));
    expect(await screen.findByText('1 en espera')).toBeOnTheScreen();
    expect(screen.getByText('Camila Torres')).toBeOnTheScreen();
    expect(screen.getByText('Alta')).toBeOnTheScreen();
    expect(screen.getByLabelText('Espera: 7 min')).toBeOnTheScreen();
    cola = [{ ...cola[0]!, espera_min: 9 }];
    await act(async () => void (await jest.advanceTimersByTimeAsync(5_000)));
    expect(await screen.findByLabelText('Espera: 9 min')).toBeOnTheScreen();
  });

  it('Asignación: elegir a un edecán disponible llama a asignar y lo confirma', async () => {
    await abrir();
    await screen.findByText('Resumen general');
    await fireEvent.press(screen.getByRole('tab', { name: /^Cola/ }));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Asignar acompañante a Camila Torres' }),
    );
    // Only free members are offered: the robots that are escorting or charging are not.
    expect(await screen.findByText('Elige quién acompaña a Camila Torres')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Elegir a Robot X2-1' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Elegir a Mateo Gil' }));
    expect(await screen.findByText('Mateo Gil acompañará a Camila Torres.')).toBeOnTheScreen();
    expect(llamadas).toContainEqual({
      method: 'POST',
      path: '/visitas/vis-2/asignar',
      body: { acompanante_id: 'u-mateo' },
    });
  });

  it('Eventos: la reserva sin cobertura de recepción lleva advertencia', async () => {
    reservas = [
      {
        id: 'r1',
        evento: 'Cata de vinos',
        fecha: HOY,
        hora_desde: '19:00',
        hora_hasta: '21:00',
        robot: 'Robot X2-1',
        lugar: 'Salón Principal',
        cobertura_recepcion: false,
        creada_por: 'u1',
      },
    ];
    await abrir();
    await irA('Eventos del robot');
    expect(await screen.findByText('Cata de vinos')).toBeOnTheScreen();
    expect(screen.getByText('Recepción sin cobertura')).toBeOnTheScreen();
    expect(screen.getByText('Sin cobertura')).toBeOnTheScreen();
    // Cancelling asks once, inline.
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar reserva Cata de vinos' }));
    expect(screen.getByRole('button', { name: 'Sí, cancelar Cata de vinos' })).toBeOnTheScreen();
  });

  it('Eventos: crear una reserva valida los campos y la envía', async () => {
    await abrir();
    await irA('Eventos del robot');
    await fireEvent.press(await screen.findByRole('button', { name: 'Nueva reserva' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reservar' }));
    expect(await screen.findByText('Dale un nombre al evento.')).toBeOnTheScreen();
    expect(screen.getByText('La recepción quedará sin cobertura')).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText('Evento o invitado especial'),
      'Visita de prensa',
    );
    await fireEvent.changeText(screen.getByLabelText('Lugar'), 'Terraza');
    await fireEvent.changeText(screen.getByLabelText('Desde'), '10:00');
    await fireEvent.changeText(screen.getByLabelText('Hasta'), '11:30');
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: 'Reservar' }));
    expect(
      await screen.findByText('Reservamos a Robot X2-1 para «Visita de prensa».'),
    ).toBeOnTheScreen();
    expect(llamadas.find((l) => l.method === 'POST' && l.path === '/reservas-robot')?.body).toEqual(
      {
        evento: 'Visita de prensa',
        fecha: HOY,
        hora_desde: '10:00',
        hora_hasta: '11:30',
        robot: 'Robot X2-1',
        lugar: 'Terraza',
        cobertura_recepcion: true,
      },
    );
  });

  it('Registros: usuarios por rol, invitaciones por estado, destinos y solicitudes', async () => {
    await abrir();
    await irA('Registros y permisos');
    expect(await screen.findByText('Administración 1 · Socios 1')).toBeOnTheScreen();
    expect(screen.getByText('Luciana Vargas')).toBeOnTheScreen();
    expect(screen.getByLabelText('Programada: 4')).toBeOnTheScreen();
    expect(screen.getByText('Terraza')).toBeOnTheScreen();
    expect(await screen.findByText('Julián Pardo')).toBeOnTheScreen();
    expect(screen.getByText('Sin órdenes para hoy')).toBeOnTheScreen();
  });

  it('Evaluaciones: promedios, puntos clave y comentarios con transcripciones', async () => {
    await abrir();
    await irA('Evaluaciones');
    expect(await screen.findByLabelText('Promedio del robot: 4,5. de 5')).toBeOnTheScreen();
    expect(screen.getByLabelText('Promedio del club: 4,0. de 5')).toBeOnTheScreen();
    expect(screen.getByText('amable')).toBeOnTheScreen();
    expect(screen.getByText('El robot fue muy amable')).toBeOnTheScreen();
    expect(screen.getByText('Todo muy rápido')).toBeOnTheScreen();
    expect(screen.getByText('Transcripción de voz')).toBeOnTheScreen();
  });

  it('Historial: quién atendió, entregó y recibió, con línea de tiempo e incidencias', async () => {
    visitas = [
      visita({
        id: 'vis-7',
        nombre: 'Camila Torres',
        categoria: 'INVITADO',
        estado: 'CERRADA',
        cierre: 'SALIDA',
        fin: `${HOY}T14:40:00-05:00`,
        acompanante: { tipo: 'ROBOT', id: 'x2-1', nombre: 'Robot X2-1' },
        recorrido: [
          { ts: `${HOY}T14:00:00-05:00`, tipo: 'LLEGADA', actor: 'invitado', detalle: null },
          { ts: `${HOY}T14:05:00-05:00`, tipo: 'ENTREGA_CONFIRMADA', actor: 'x2-1', detalle: null },
          { ts: `${HOY}T14:06:00-05:00`, tipo: 'RELEVO_ACEPTADO', actor: 'u-mateo', detalle: null },
          { ts: `${HOY}T14:40:00-05:00`, tipo: 'SALIDA', actor: 'u-natalia', detalle: null },
        ],
      }),
    ];
    incidencias = [
      {
        id: 'i1',
        tipo: 'RUTA_BLOQUEADA',
        descripcion: 'Carrito en el pasillo',
        lugar: 'Pasillo 2',
        visita_id: 'vis-7',
        reportada_por: 'x2-1',
        estado: 'RESUELTA',
        creada_at: `${HOY}T14:10:00-05:00`,
        resuelta_at: `${HOY}T14:12:00-05:00`,
      },
    ];
    await abrir();
    await irA('Historial');
    expect(await screen.findByText('Visitas cerradas · 1')).toBeOnTheScreen();
    expect(screen.getByText(/Atendió: Robot X2-1 · Salió, con incidencia/)).toBeOnTheScreen();
    expect(screen.getByText('Incidencias · 1')).toBeOnTheScreen();
    expect(screen.getByText('Ruta bloqueada')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Visita de Camila Torres, ver detalle' }),
    );
    expect(await screen.findByText('Línea de tiempo de Camila Torres')).toBeOnTheScreen();
    expect(screen.getByText('Entrega confirmada')).toBeOnTheScreen();
    expect(screen.getByText('Mateo Gil')).toBeOnTheScreen();
  });

  it('un día vacío ofrece «Cargar datos iniciales» solo a ADMIN; ya sembrado lo avisa', async () => {
    await abrir();
    await fireEvent.press(await screen.findByRole('button', { name: 'Cargar datos iniciales' }));
    expect(
      await screen.findByText('Listo: cargamos visitas, equipo y alertas del día.'),
    ).toBeOnTheScreen();
    expect(llamadas.some((l) => l.method === 'POST' && l.path === '/demo/sembrar')).toBe(true);
    await fireEvent.press(await screen.findByRole('button', { name: 'Cargar datos iniciales' }));
    await waitFor(() =>
      expect(screen.getByText('Los datos iniciales ya estaban cargados.')).toBeOnTheScreen(),
    );
  });

  it('el concierge no ve «Cargar datos iniciales»', async () => {
    rol = 'CONCIERGE';
    await abrir();
    await screen.findByText('Sin actividad todavía');
    expect(screen.queryByRole('button', { name: 'Cargar datos iniciales' })).toBeNull();
  });
});
