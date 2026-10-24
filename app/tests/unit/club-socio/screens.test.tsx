import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import '@testing-library/react-native/matchers';

import { createClubClient, tokenStore } from '@/features/club/client';
import { GuestsScreen } from '@/features/club/socio/GuestsScreen';
import { HomeScreen } from '@/features/club/socio/HomeScreen';
import { MyQrScreen } from '@/features/club/socio/MyQrScreen';
import { ProfileScreen } from '@/features/club/socio/ProfileScreen';
import { SocioStackShell } from '@/features/club/socio/SocioTabs';
import { router, usePathname } from './routerMock';
import { SocioGate } from '@/features/club/socio/SocioGate';
import { ListaCarga } from '@/features/club/socio/ui/States';
import {
  ANDRES,
  SOFIA,
  confirmacion,
  evento,
  fakeApi,
  inv,
  renderSocio,
  type Reply,
} from './support';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('./routerMock'));

const btn = (name: string) => screen.getByRole('button', { name });

const LISTA = [
  inv({ id: 'a', nombre: 'Laura', apellido: 'Díaz', estado: 'LLEGO', fecha: '2026-10-23' }),
  inv({
    id: 'b',
    nombre: 'Pedro',
    apellido: 'Gómez',
    fecha: '2026-10-25',
    hora_desde: '15:30',
    hora_hasta: '17:30',
  }),
  inv({ id: 'c', nombre: 'Marta', apellido: 'Ruiz', fecha: '2026-10-26' }),
  inv({ id: 'd', nombre: 'Rosa', apellido: 'León', fecha: '2026-10-27' }),
  inv({ id: 'e', nombre: 'Carlos', apellido: 'Vega', estado: 'SALIO', fecha: '2026-10-21' }),
  inv({ id: 'f', nombre: 'Ana', apellido: 'Paz', estado: 'CANCELADA', fecha: '2026-10-28' }),
];

function api(extra: Record<string, Reply> = {}) {
  return fakeApi({
    'GET /invitaciones': { body: { items: LISTA } },
    'GET /eventos': { body: { items: [evento()], ultimo_seq: 1 } },
    'GET /confirmaciones/pendientes': { body: { items: [] } },
    'GET /me/qr': {
      body: {
        qr_payload: 'NCLUB1|SOCIO|sofia|Sofia Restrepo|1|abc',
        vence_at: '2026-10-23T23:59:00-05:00',
      },
    },
    ...extra,
  });
}

const handlers = () => ({
  onInvitar: jest.fn(),
  onAbrir: jest.fn(),
  onVerAvisos: jest.fn(),
  onVerQr: jest.fn(),
  onVerVisita: jest.fn(),
});

beforeEach(() => jest.clearAllMocks());

describe('Inicio', () => {
  it('saludo, próximas sin etiquetas de estado y sin tarjetas de membresía', async () => {
    await renderSocio(<HomeScreen {...handlers()} />, api());
    expect(await screen.findByText('Hola, Sofia')).toBeTruthy();
    expect(screen.getByText('Próximas')).toBeTruthy();
    // 3 next guests, the closed ones are left out
    expect(screen.getByText('Laura Díaz')).toBeTruthy();
    expect(screen.getByText('Pedro Gómez')).toBeTruthy();
    expect(screen.getByText('Marta Ruiz')).toBeTruthy();
    expect(screen.queryByText('Rosa León')).toBeNull();
    expect(screen.queryByText('Carlos Vega')).toBeNull();
    // one line per guest: day and hour, no status words, no membership card
    expect(screen.getAllByText('Hoy · 10:00').length).toBeGreaterThan(0);
    expect(screen.queryByText('Llegó')).toBeNull();
    expect(screen.queryByText('Programada')).toBeNull();
    expect(screen.queryByLabelText(/Tarjeta de socio/)).toBeNull();
  });

  it('«Invitar», Mi pase y Avisos navegan; una fila abre el detalle', async () => {
    const h = handlers();
    await renderSocio(<HomeScreen {...h} />, api());
    await screen.findByText('Laura Díaz');
    await fireEvent.press(btn('Invitar'));
    expect(h.onInvitar).toHaveBeenCalledTimes(1);
    await fireEvent.press(btn('Mi pase'));
    await fireEvent.press(btn('Avisos'));
    expect(h.onVerQr).toHaveBeenCalled();
    expect(h.onVerAvisos).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('link', { name: /Laura Díaz, Hoy · 10:00/ }));
    expect(h.onAbrir).toHaveBeenCalledWith('a');
  });

  it('sin invitados: mensaje vacío con la invitación a invitar', async () => {
    await renderSocio(
      <HomeScreen {...handlers()} />,
      api({ 'GET /invitaciones': { body: { items: [] } } }),
    );
    expect(await screen.findByText('Aún no tienes invitados. Toca Invitar.')).toBeTruthy();
  });

  it('muestra la confirmación pendiente arriba y la campana cuenta lo pendiente', async () => {
    const a = api({
      'GET /confirmaciones/pendientes': { body: { items: [confirmacion()] } },
      'POST /confirmaciones/c1/responder': { body: confirmacion({ estado: 'APROBADA' }) },
    });
    await renderSocio(<HomeScreen {...handlers()} />, a);
    expect(await screen.findByText('¿Esperas a esta persona?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Avisos, 1 por confirmar' })).toBeTruthy();
    await fireEvent.press(btn('Sí lo espero'));
    expect(await screen.findByText('Listo: avisaste que lo esperas.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /por confirmar/ })).toBeNull();
  });

  it('sin conexión: estado de error con reintentar', async () => {
    const down = createClubClient('http://club.test', (async () => {
      throw new TypeError('red');
    }) as unknown as typeof fetch);
    await renderSocio(<HomeScreen {...handlers()} />, { calls: [], client: down });
    expect(await screen.findByText('Sin conexión')).toBeTruthy();
    expect(btn('Reintentar')).toBeTruthy();
  });

  it('muestra «cargando» mientras llega la lista', async () => {
    const lenta = createClubClient(
      'http://club.test',
      (() => new Promise(() => undefined)) as unknown as typeof fetch,
    );
    await renderSocio(<HomeScreen {...handlers()} />, { calls: [], client: lenta });
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
  });
});

describe('Invitados', () => {
  it('separa Próximas de Historial y abre el detalle', async () => {
    const onAbrir = jest.fn();
    await renderSocio(
      <GuestsScreen onInvitar={jest.fn()} onAbrir={onAbrir} onAbrirVisita={jest.fn()} />,
      api(),
    );
    expect(await screen.findByRole('tab', { name: 'Próximas' })).toBeTruthy();
    expect(screen.getByText('Rosa León')).toBeTruthy();
    expect(screen.queryByText('Carlos Vega')).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: 'Historial' }));
    expect(screen.queryByText('Rosa León')).toBeNull();
    expect(screen.getByText('Carlos Vega')).toBeTruthy();
    // a cancelled invitation says so as a plain word in its line, not as a chip
    expect(screen.getByText(/^Cancelada · /)).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: /Carlos Vega, 21 oct/ }));
    expect(onAbrir).toHaveBeenCalledWith('e');
  });

  it('vacío y «+» para invitar', async () => {
    const onInvitar = jest.fn();
    await renderSocio(
      <GuestsScreen onInvitar={onInvitar} onAbrir={jest.fn()} onAbrirVisita={jest.fn()} />,
      api({ 'GET /invitaciones': { body: [] } }),
    );
    expect(await screen.findByText('Aún no tienes invitados. Toca Invitar.')).toBeTruthy();
    await fireEvent.press(btn('Invitar'));
    expect(onInvitar).toHaveBeenCalled();
  });

  it('error de la API con reintentar y sesión vencida', async () => {
    let falla = true;
    const a = api({
      'GET /invitaciones': () =>
        falla
          ? { status: 500, body: { error: 'x', detalle: 'Falló el servidor.' } }
          : { body: { items: LISTA } },
    });
    await renderSocio(
      <GuestsScreen onInvitar={jest.fn()} onAbrir={jest.fn()} onAbrirVisita={jest.fn()} />,
      a,
    );
    expect(await screen.findByText('Falló el servidor.')).toBeTruthy();
    falla = false;
    await fireEvent.press(btn('Reintentar'));
    expect(await screen.findByText('Rosa León')).toBeTruthy();
  });

  it('con datos viejos y sin red conserva la lista y avisa; otro error lo dice', async () => {
    const sin = {
      code: 'sin_conexion',
      detalle: 'Sin conexión.',
      sesion: false,
      sinConexion: true,
    };
    const r = await render(
      <ListaCarga datos={['a']} cargando={false} error={sin} onRetry={jest.fn()} vacio={null}>
        {(d) => <Text>{`lista ${d.length}`}</Text>}
      </ListaCarga>,
    );
    expect(screen.getByText('lista 1')).toBeTruthy();
    expect(screen.getByText(/Sin conexión/)).toBeTruthy();
    await r.rerender(
      <ListaCarga
        datos={['a']}
        cargando={false}
        error={{ ...sin, sinConexion: false, detalle: 'Falló.' }}
        onRetry={jest.fn()}
        vacio={null}
      >
        {(d) => <Text>{`lista ${d.length}`}</Text>}
      </ListaCarga>,
    );
    expect(screen.getByText('Falló.')).toBeTruthy();
  });
});

describe('Mi QR', () => {
  it('QR grande, cuánto falta para que venza, qué hacer si el rostro falla y actualizar', async () => {
    const a = api();
    await renderSocio(<MyQrScreen onBack={jest.fn()} />, a);
    expect(await screen.findByRole('img', { name: /Código QR de tu pase de socio/ })).toBeTruthy();
    expect(screen.getByText('Pase de socio · Socia VIP')).toBeTruthy();
    expect(screen.getByText('Vence en 8 h 59 min (23:59)')).toBeTruthy();
    expect(screen.getByText('Muéstralo al robot o a un edecán')).toBeTruthy();
    expect(screen.queryByText(/Código: NCLUB1/)).toBeNull();
    await fireEvent.press(btn('Actualizar código'));
    await screen.findByText('Vence en 8 h 59 min (23:59)');
    expect(a.calls.filter((c) => c.path === '/me/qr')).toHaveLength(2);
  });

  it('un código vencido pide actualizar', async () => {
    await renderSocio(
      <MyQrScreen onBack={jest.fn()} />,
      api({
        'GET /me/qr': {
          body: { qr_payload: 'NCLUB1|SOCIO|s|S|1|a', vence_at: '2026-10-23T14:00:00-05:00' },
        },
      }),
      ANDRES,
    );
    expect(await screen.findByText('Este código venció. Toca Actualizar.')).toBeTruthy();
  });

  it('error con reintentar', async () => {
    let falla = true;
    const a = api({
      'GET /me/qr': () =>
        falla
          ? { status: 500, body: { error: 'x', detalle: 'No hay QR.' } }
          : { body: { qr_payload: 'NCLUB1|SOCIO|s|S|1|a', vence_at: '2026-10-23T23:59:00-05:00' } },
    });
    await renderSocio(<MyQrScreen onBack={jest.fn()} />, a);
    expect(await screen.findByText('No hay QR.')).toBeTruthy();
    falla = false;
    await fireEvent.press(btn('Reintentar'));
    expect(await screen.findByRole('img', { name: /Código QR/ })).toBeTruthy();
  });
});

describe('Perfil', () => {
  const abrir = async (usuario = SOFIA) => {
    const h = {
      onAbrir: jest.fn(),
      onSalir: jest.fn(),
      onQr: jest.fn(),
    };
    await renderSocio(
      <ProfileScreen {...h} />,
      api({
        'GET /me/perfil': {
          body: {
            usuario_id: usuario.id,
            preferencias_bebida: ['Café', 'Chai latte'],
            asistencia: ['silla_ruedas'],
            nota_asistencia: null,
            foto_estado: 'LISTA',
            foto_motivo: null,
          },
        },
      }),
      usuario,
    );
    return h;
  };

  it('nombre y una lista corta, sin etiquetas de estado', async () => {
    await abrir();
    expect(screen.getByRole('heading', { name: 'Sofia Restrepo' })).toBeTruthy();
    for (const fila of ['Mi pase', 'Mi foto', 'Preferencias', 'Asistencia', 'Membresía']) {
      expect(screen.getByRole('link', { name: fila })).toBeTruthy();
    }
    expect(screen.queryByText('Lista')).toBeNull();
    expect(screen.queryByText(/Nunca son obligatorias/)).toBeNull();
  });

  it('cada fila abre su pantalla', async () => {
    const h = await abrir();
    await fireEvent.press(screen.getByRole('link', { name: 'Mi foto' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Preferencias' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Asistencia' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Membresía' }));
    expect(h.onAbrir.mock.calls.map((c) => c[0])).toEqual([
      'foto',
      'bebidas',
      'asistencia',
      'membresia',
    ]);
    await fireEvent.press(screen.getByRole('link', { name: 'Mi pase' }));
    expect(h.onQr).toHaveBeenCalled();
  });

  it('cerrar sesión borra el token y sale', async () => {
    await tokenStore.set('T');
    const h = await abrir();
    await fireEvent.press(btn('Cerrar sesión'));
    await screen.findByRole('button', { name: 'Cerrar sesión' });
    expect(h.onSalir).toHaveBeenCalled();
    expect(await tokenStore.get()).toBeNull();
  });
});

describe('SocioGate', () => {
  const me = (body: unknown, status = 200) => ({
    calls: [],
    client: fakeApi({ 'GET /me': { status, body } }).client,
  });

  it('carga al socio y muestra el contenido', async () => {
    await render(
      <SocioGate client={me(SOFIA).client}>
        <Text>dentro</Text>
      </SocioGate>,
    );
    expect(await screen.findByText('dentro')).toBeTruthy();
  });

  it('muestra «Cargando» mientras llega el socio', async () => {
    const lenta = createClubClient(
      'http://club.test',
      (() => new Promise(() => undefined)) as unknown as typeof fetch,
    );
    await render(<SocioGate client={lenta}>{null}</SocioGate>);
    expect(screen.getByRole('progressbar', { name: 'Cargando' })).toBeTruthy();
  });

  it('sin sesión (401) manda a /entrar', async () => {
    await render(
      <SocioGate client={me({ error: 'token_vencido', detalle: 'Entra.' }, 401).client}>
        {null}
      </SocioGate>,
    );
    expect(await screen.findByText('redirect:/entrar')).toBeTruthy();
  });

  it('un concierge va a su área', async () => {
    await render(<SocioGate client={me({ ...SOFIA, rol: 'CONCIERGE' }).client}>{null}</SocioGate>);
    expect(await screen.findByText('redirect:/app/concierge')).toBeTruthy();
  });

  it('un fallo de red deja reintentar', async () => {
    await render(
      <SocioGate client={me({ error: 'x', detalle: 'Servidor caído.' }, 503).client}>
        {null}
      </SocioGate>,
    );
    expect(await screen.findByText('Servidor caído.')).toBeTruthy();
    expect(btn('Reintentar')).toBeTruthy();
  });
});

it.each(['/app/socio/nueva', '/app/socio/invitacion/i1', '/app/socio/visita/v1'])(
  'mantiene las cuatro secciones y sus rutas en %s',
  async (path) => {
    usePathname.mockReturnValue(path);
    await renderSocio(
      <SocioStackShell>
        <Text>Contenido</Text>
      </SocioStackShell>,
      api(),
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Inicio',
      'Invitados',
      'Agenda',
      'Perfil',
    ]);
    expect(screen.getByRole('tab', { name: 'Invitados' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Agenda' }));
    expect(router.navigate).toHaveBeenCalledWith('/app/socio/actividades');
  },
);

it('Avisos y Mi pase se abren desde Inicio: dejan Inicio encendido', async () => {
  for (const path of ['/app/socio/avisos', '/app/socio/mi-qr']) {
    usePathname.mockReturnValue(path);
    const r = await renderSocio(
      <SocioStackShell>
        <Text>Contenido</Text>
      </SocioStackShell>,
      api(),
    );
    expect(screen.getByRole('tab', { name: 'Inicio' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    r.unmount();
  }
});
