import { act, fireEvent, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { NoticesScreen } from '@/features/club/socio/NoticesScreen';
import { SocioTabs } from '@/features/club/socio/SocioTabs';
import { confirmacion, evento, fakeApi, inv, renderSocio, type Reply } from './support';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('./routerMock'));
const mockTabs = jest.fn((_props: unknown) => null);
jest.mock('@/design-system/AppTabsLayout', () => ({
  AppTabsLayout: (p: unknown) => mockTabs(p),
}));

const btn = (name: string) => screen.getByRole('button', { name });
const tick = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

function api(extra: Record<string, Reply> = {}) {
  return fakeApi({
    'GET /eventos': { body: { items: [], ultimo_seq: 0 } },
    'GET /confirmaciones/pendientes': { body: { items: [] } },
    'GET /invitaciones': { body: { items: [inv({ persona_id: 'inv-1', trato: 'senora' })] } },
    ...extra,
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('Avisos: feed incremental', () => {
  it('muestra la frase de llegada y pide solo lo nuevo cada 3 s', async () => {
    let n = 0;
    const a = api({
      'GET /eventos': () => {
        n += 1;
        if (n === 1) return { body: { items: [evento({ seq: 1 })], ultimo_seq: 1 } };
        if (n === 2) {
          return {
            body: {
              items: [evento({ seq: 2, tipo: 'SALIDA', ts: '2026-10-24T11:30:00-05:00' })],
              ultimo_seq: 2,
            },
          };
        }
        return { body: { items: [], ultimo_seq: 2 } };
      },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    expect(
      screen.getByText('Laura Díaz llegó (10:02). El robot la acompaña a Sala de anfitriones.'),
    ).toBeTruthy();
    await tick(3000);
    expect(screen.getByText('Laura Díaz salió (11:30).')).toBeTruthy();
    expect(screen.getAllByText(/Laura Díaz/)).toHaveLength(2); // nothing duplicated
    await tick(3000);
    const queries = a.calls.filter((c) => c.path === '/eventos').map((c) => c.query);
    expect(queries).toEqual(['despues_de=0', 'despues_de=1', 'despues_de=2']);
  });

  it('deja de consultar al salir de la pantalla', async () => {
    const a = api();
    const { unmount } = await renderSocio(<NoticesScreen />, a);
    await tick(0);
    await tick(3000);
    const antes = a.calls.filter((c) => c.path === '/eventos').length;
    expect(antes).toBe(2);
    await unmount();
    await tick(9000);
    expect(a.calls.filter((c) => c.path === '/eventos')).toHaveLength(antes);
  });

  it('sin avisos dice que te avisarán', async () => {
    await renderSocio(<NoticesScreen />, api());
    await tick(0);
    expect(screen.getByText(/Sin avisos por ahora/)).toBeTruthy();
  });

  it('error con reintentar; con datos viejos avisa sin conexión', async () => {
    let cae = true;
    const a = api({
      'GET /eventos': () =>
        cae
          ? { status: 500, body: { error: 'x', detalle: 'Falló el servidor.' } }
          : { body: { items: [evento()], ultimo_seq: 1 } },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    expect(screen.getByText('Falló el servidor.')).toBeTruthy();
    cae = false;
    await fireEvent.press(btn('Reintentar'));
    await tick(0);
    expect(screen.getByText(/Laura Díaz llegó/)).toBeTruthy();
  });

  it('pagina si el servidor devuelve 100 eventos de una vez', async () => {
    const cien = Array.from({ length: 100 }, (_, i) => evento({ seq: i + 1, id: `e${i}` }));
    let n = 0;
    const a = api({
      'GET /eventos': () => {
        n += 1;
        return n === 1
          ? { body: { items: cien, ultimo_seq: 100 } }
          : {
              body: {
                items: [evento({ seq: 101, id: 'ultimo', nombre: 'Último' })],
                ultimo_seq: 101,
              },
            };
      },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    expect(screen.getByText(/Último llegó/)).toBeTruthy();
    expect(a.calls.filter((c) => c.path === '/eventos').map((c) => c.query)).toEqual([
      'despues_de=0',
      'despues_de=100',
    ]);
  });
});

describe('Avisos: confirmaciones', () => {
  const conPendiente = (extra: Record<string, Reply> = {}) =>
    api({ 'GET /confirmaciones/pendientes': { body: { items: [confirmacion()] } }, ...extra });

  it('«Sí lo espero» responde aprueba=true y deshabilita la tarjeta', async () => {
    const a = conPendiente({
      'POST /confirmaciones/c1/responder': { body: confirmacion({ estado: 'APROBADA' }) },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    expect(screen.getByText('Dice llamarse Pedro Gómez')).toBeTruthy();
    expect(screen.getByText('Responde antes de las 15:30.')).toBeTruthy();
    await fireEvent.press(btn('Sí lo espero'));
    await tick(0);
    expect(a.calls.find((c) => c.path.endsWith('/responder'))!.body).toEqual({ aprueba: true });
    expect(screen.getByText('Listo: avisaste que lo esperas.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sí lo espero' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'No lo conozco' })).toBeNull();
  });

  it('«No lo conozco» responde aprueba=false', async () => {
    const a = conPendiente({
      'POST /confirmaciones/c1/responder': { body: confirmacion({ estado: 'RECHAZADA' }) },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    await fireEvent.press(btn('No lo conozco'));
    await tick(0);
    expect(a.calls.find((c) => c.path.endsWith('/responder'))!.body).toEqual({ aprueba: false });
    expect(screen.getByText(/avisaste que no lo conoces/)).toBeTruthy();
  });

  it('409 (ya venció o ya respondida): lo dice y no deja responder', async () => {
    const a = conPendiente({
      'POST /confirmaciones/c1/responder': {
        status: 409,
        body: { error: 'confirmacion_vencida', detalle: 'La solicitud venció.' },
      },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    await fireEvent.press(btn('Sí lo espero'));
    await tick(0);
    expect(screen.getByText('Esta solicitud ya venció.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sí lo espero' })).toBeNull();
  });

  it('si la API devuelve VENCIDA también se cierra la tarjeta', async () => {
    const a = conPendiente({
      'POST /confirmaciones/c1/responder': { body: confirmacion({ estado: 'VENCIDA' }) },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    await fireEvent.press(btn('Sí lo espero'));
    await tick(0);
    expect(screen.getByText('Esta solicitud ya venció.')).toBeTruthy();
  });

  it('un fallo de red deja reintentar', async () => {
    let falla = true;
    const a = conPendiente({
      'POST /confirmaciones/c1/responder': () =>
        falla
          ? { status: 500, body: { error: 'x', detalle: 'No se pudo enviar.' } }
          : { body: confirmacion({ estado: 'APROBADA' }) },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    await fireEvent.press(btn('Sí lo espero'));
    await tick(0);
    expect(screen.getByText('No se pudo enviar.')).toBeTruthy();
    falla = false;
    await fireEvent.press(btn('Sí lo espero'));
    await tick(0);
    expect(screen.getByText('Listo: avisaste que lo esperas.')).toBeTruthy();
  });

  it('una confirmación ya vencida no se muestra', async () => {
    const a = api({
      'GET /confirmaciones/pendientes': {
        body: { items: [confirmacion({ vence_at: '2026-10-23T14:59:00-05:00' })] },
      },
    });
    await renderSocio(<NoticesScreen />, a);
    await tick(0);
    expect(screen.queryByText('Dice llamarse Pedro Gómez')).toBeNull();
  });

  it('Avisos ya no es una pestaña: se abre desde la campana de Inicio', async () => {
    await renderSocio(<SocioTabs />, conPendiente());
    await tick(0);
    const tabs = (mockTabs.mock.calls.at(-1)![0] as { tabs: { key: string; badge?: number }[] })
      .tabs;
    expect(tabs.map((t) => t.key)).toEqual(['index', 'invitados', 'actividades', 'perfil']);
  });
});
