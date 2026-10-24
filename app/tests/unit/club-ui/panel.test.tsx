/* eslint-disable @typescript-eslint/no-require-imports -- route modules are loaded lazily for renderRouter */
// Web panel rendered through the real routes with a fake club API.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { tokenStore } from '@/features/club/client';
import type { PanelResumen } from '../../../src/club/types';

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

const rutas = () => ({
  '(club)/_layout': require('../../../app/(club)/_layout').default,
  '(club)/entrar': () => <Text>ENTRAR</Text>,
  '(club)/app/panel/_layout': require('../../../app/(club)/app/panel/_layout').default,
  '(club)/app/panel/index': require('../../../app/(club)/app/panel/index').default,
  '(club)/app/socio/index': () => <Text>INICIO SOCIO</Text>,
});

const resumen = (vacio = false): PanelResumen => ({
  fecha: HOY,
  kpis: {
    visitas_hoy: vacio ? 0 : 48,
    visitantes_vip: vacio ? 0 : 12,
    invitaciones_activas: vacio ? 0 : 9,
    alertas_abiertas: vacio ? 0 : 3,
    atencion_promedio_min: vacio ? null : 4.6,
  },
  flujo_por_hora: vacio ? [] : [{ hora: 9, socios: 3, invitados: 1, personal: 0 }],
  por_categoria: { VIP: vacio ? 0 : 12, REGULAR: 0, INVITADO: 0, PERSONAL: 0, EXTERNO: 0 },
  robot: { en_linea: true, ultimo_latido: null, robot: 'R1', estado: 'ok', detalle: null },
  actividad: vacio
    ? []
    : [
        {
          id: 'a',
          ts: `${HOY}T14:03:00-05:00`,
          tipo: 'LLEGADA',
          categoria: 'VIP',
          nombre: 'Andrés Ramírez',
          destino: 'Sala Ejecutiva',
          estado: 'NUEVO',
        },
      ],
});

let rol = 'ADMIN';
let respuesta: () => Response;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(async () => {
  jest.useFakeTimers({ now: new Date(`${HOY}T15:00:00-05:00`) });
  rol = 'ADMIN';
  respuesta = () => json(200, resumen());
  mockFetch = (async (url: string) => {
    const path = new URL(url).pathname.replace(/^\/api/, '');
    if (path === '/me') {
      return json(200, { id: 'u1', rol, nombre: 'Luciana', apellido: 'Vega', trato: 'senora' });
    }
    if (path === '/panel/resumen') return respuesta();
    if (path === '/robot/estado') {
      return json(200, {
        en_linea: true,
        ultimo_latido: null,
        robot: 'R1',
        estado: 'ok',
        detalle: 'Todo bien',
      });
    }
    if (path === '/visitas') {
      return json(200, {
        items: [
          { id: 'v1', estado: 'ACOMPANANDO' },
          { id: 'v2', estado: 'CERRADA' },
        ],
      });
    }
    if (path === '/equipo') {
      return json(200, {
        items: [
          { id: 'x2-1', tipo: 'ROBOT', nombre: 'Robot X2-1', estado: 'ACOMPANANDO' },
          { id: 'u-mateo', tipo: 'HUMANO', nombre: 'Mateo Gil', estado: 'DISPONIBLE' },
        ],
      });
    }
    if (path === '/cola') {
      return json(200, {
        items: [
          {
            visita_id: 'v1',
            tarea_id: 't1',
            nombre: 'Camila Torres',
            categoria: 'INVITADO',
            prioridad: 'alta',
            motivo: null,
            punto_encuentro: null,
            espera_min: 7,
          },
        ],
      });
    }
    if (path === '/evaluaciones') {
      return json(200, {
        items: [
          { id: 'e1', robot: 5, club: 4, creada_at: `${HOY}T13:00:00-05:00` },
          { id: 'e2', robot: 3, club: 4, creada_at: `${HOY}T13:30:00-05:00` },
        ],
        promedio_robot: 4,
        promedio_club: 4,
        puntos_clave: [],
      });
    }
    return json(200, { items: [], ultimo_seq: 0 });
  }) as unknown as typeof fetch;
  await tokenStore.set('T');
});
afterEach(() => jest.useRealTimers());

const abrir = () => renderRouter(rutas(), { initialUrl: '/app/panel' });

describe('panel web', () => {
  it('muestra KPIs, gráficos y actividad reciente', async () => {
    await abrir();
    expect(await screen.findByText('Resumen general')).toBeOnTheScreen();
    expect(
      await screen.findByLabelText('Visitas hoy: 48. 12 VIP, 25 % del total'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Alertas abiertas: 3. Requieren atención')).toBeOnTheScreen();
    expect(screen.getByText('Atención promedio: 4,6 min')).toBeOnTheScreen();
    expect(screen.getByText('Llegadas por hora')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Flujo de visitas por hora: 4 visitas en el día'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Visitas por categoría, 12 en total')).toBeOnTheScreen();
    // Visits, ratings, queue and team come from their own endpoints.
    expect(await screen.findByLabelText('Estado de las visitas: 2 en total')).toBeOnTheScreen();
    expect(screen.getByLabelText('En el club: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Evaluaciones del 1 al 5: 2 respuestas')).toBeOnTheScreen();
    expect(screen.getByLabelText('Espera en la cola: 1 persona')).toBeOnTheScreen();
    expect(screen.getByLabelText('Equipo en turno: 2 personas y robots')).toBeOnTheScreen();
    expect(screen.getByText('1 de 2 disponibles')).toBeOnTheScreen();
    expect(screen.getByText('Andrés Ramírez')).toBeOnTheScreen();
    expect(screen.getByText('Nuevo')).toBeOnTheScreen();
  });

  it('un día sin datos muestra ceros y «Sin actividad todavía»', async () => {
    respuesta = () => json(200, resumen(true));
    await abrir();
    expect(await screen.findByLabelText('Visitas hoy: 0. 0 VIP, 0 % del total')).toBeOnTheScreen();
    expect(screen.getByText('Atención promedio: sin datos')).toBeOnTheScreen();
    expect(screen.getByText('Sin llegadas entre las 06 y las 22 h')).toBeOnTheScreen();
    expect(screen.getByText('Sin actividad todavía')).toBeOnTheScreen();
  });

  it('un error de la API ofrece reintentar', async () => {
    respuesta = () => json(500, { error: 'x', detalle: 'Falla del servidor.' });
    await abrir();
    expect(await screen.findByText('No pudimos cargar el resumen')).toBeOnTheScreen();
    respuesta = () => json(200, resumen());
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByLabelText('Visitas hoy: 48. 12 VIP, 25 % del total'),
    ).toBeOnTheScreen();
  });

  it('cambia entre Resumen, Visitas, Alertas y Robot R1 y vuelve a consultar cada 10 s', async () => {
    let llamadas = 0;
    respuesta = () => (llamadas++, json(200, resumen()));
    await abrir();
    await screen.findByText('Resumen general');
    // Visitas and Robot R1 live under «Más» on phones.
    await fireEvent.press(screen.getByRole('tab', { name: 'Más' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Visitas' }));
    expect(await screen.findByText('Sin visitas programadas')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: /^Alertas/ }));
    expect(await screen.findByText('Sin alertas')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Más' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Robot R1' }));
    expect(await screen.findByText('Operativo')).toBeOnTheScreen();
    expect(screen.getByText('Todo bien')).toBeOnTheScreen();
    const antes = llamadas;
    await act(async () => void (await jest.advanceTimersByTimeAsync(10_000)));
    await waitFor(() => expect(llamadas).toBeGreaterThan(antes));
  });

  it('elegir «Ayer» pide el resumen del día anterior', async () => {
    const pedidos: (string | null)[] = [];
    mockFetch = (async (url: string) => {
      const u = new URL(url);
      const path = u.pathname.replace(/^\/api/, '');
      if (path === '/me') return json(200, { id: 'u1', rol, nombre: 'Luciana', apellido: 'Vega' });
      if (path !== '/panel/resumen') return json(200, { items: [] });
      pedidos.push(u.searchParams.get('fecha'));
      return json(200, { ...resumen(), fecha: u.searchParams.get('fecha') });
    }) as unknown as typeof fetch;
    await abrir();
    await screen.findByText('Resumen general');
    await fireEvent.press(screen.getByRole('tab', { name: 'Ayer' }));
    expect(
      await screen.findByLabelText('Visitas ayer: 48. 12 VIP, 25 % del total'),
    ).toBeOnTheScreen();
    expect(pedidos).toContain('2026-10-23');
  });

  it('un socio no entra: va a su inicio', async () => {
    rol = 'SOCIO';
    await abrir();
    expect(await screen.findByText('INICIO SOCIO')).toBeOnTheScreen();
  });

  it('sin sesión va a /entrar', async () => {
    await tokenStore.set(null);
    await abrir();
    expect(await screen.findByText('ENTRAR')).toBeOnTheScreen();
  });
});
