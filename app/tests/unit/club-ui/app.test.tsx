/* eslint-disable @typescript-eslint/no-require-imports -- route modules are loaded lazily for renderRouter */
// Login and concierge app, rendered through the real routes with a fake club API.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text, Vibration } from 'react-native';

import { tokenStore } from '@/features/club/client';
import { AHORA, crearFake, evento, invitacion, PASS } from './fake-club';

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
  '(club)/entrar': require('../../../app/(club)/entrar').default,
  '(club)/app/concierge/_layout': require('../../../app/(club)/app/concierge/_layout').default,
  '(club)/app/concierge/index': require('../../../app/(club)/app/concierge/index').default,
  '(club)/app/concierge/llegadas': require('../../../app/(club)/app/concierge/llegadas').default,
  '(club)/app/concierge/esperados': require('../../../app/(club)/app/concierge/esperados').default,
  '(club)/app/concierge/robot': require('../../../app/(club)/app/concierge/robot').default,
  '(club)/app/socio/index': () => <Text>INICIO SOCIO</Text>,
});

let fake: ReturnType<typeof crearFake>;
let vibrar: jest.SpyInstance;

beforeEach(async () => {
  jest.useFakeTimers({ now: AHORA });
  fake = crearFake();
  mockFetch = fake.fetchFake;
  vibrar = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  await tokenStore.set(null);
});
afterEach(() => {
  jest.useRealTimers();
  vibrar.mockRestore();
});

const tick = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
const entrarComo = async (email: string) => {
  await renderRouter(rutas(), { initialUrl: '/entrar' });
  await fireEvent.changeText(screen.getByLabelText('Correo'), email);
  await fireEvent.changeText(screen.getByLabelText('Clave'), PASS);
  await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
};
const abrirConcierge = async () => {
  await tokenStore.set('T-u-natalia');
  const r = await renderRouter(rutas(), { initialUrl: '/app/concierge' });
  await waitFor(() => expect(screen.queryByLabelText('Cargando avisos')).toBeNull());
  await screen.findByText('Recepción');
  return r;
};

describe('login', () => {
  it('entra desde el selector con la cuenta demo solicitada', async () => {
    await renderRouter(rutas(), { initialUrl: '/entrar?cuenta=sofia@nclub.demo' });
    expect(await screen.findByText('INICIO SOCIO')).toBeOnTheScreen();
    expect(await tokenStore.get()).toBe('T-u-sofia');
  });

  it('cambia de cuenta después de cerrar la sesión anterior', async () => {
    await tokenStore.set('T-u-natalia');
    await renderRouter(rutas(), { initialUrl: '/entrar?cuenta=sofia@nclub.demo' });
    expect(await screen.findByText('INICIO SOCIO')).toBeOnTheScreen();
    expect(await tokenStore.get()).toBe('T-u-sofia');
  });

  it('no inicia sesión automáticamente para un correo ajeno a la demostración', async () => {
    await renderRouter(rutas(), { initialUrl: '/entrar?cuenta=otro@example.com' });
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    expect(await tokenStore.get()).toBeNull();
  });

  it('muestra el formulario y el error si falla el acceso automático', async () => {
    mockFetch = jest.fn().mockRejectedValue(new Error('offline'));
    await renderRouter(rutas(), { initialUrl: '/entrar?cuenta=admin@nclub.demo' });
    expect(await screen.findByLabelText('Correo')).toHaveProp('value', 'admin@nclub.demo');
    expect(screen.getByText(/Sin conexión/)).toBeOnTheScreen();
    mockFetch = fake.fetchFake;
    await fireEvent.press(screen.getByRole('button', { name: 'Acceso rápido' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Usar sofia@nclub.demo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('INICIO SOCIO')).toBeOnTheScreen();
  });

  it('una sola pantalla: sello, correo y clave, sin texto de marketing ni segundo paso', async () => {
    await renderRouter(rutas(), { initialUrl: '/entrar' });
    expect(screen.getByLabelText('N Club')).toBeOnTheScreen();
    expect(screen.queryByText(/Un anfitrión/)).toBeNull();
    expect(screen.queryByText('Solo miembros autorizados')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
    const correo = screen.getByLabelText('Correo');
    expect(correo.props.keyboardType).toBe('email-address');
    expect(correo.props.autoCapitalize).toBe('none');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
  });

  it('conserva un encabezado de nivel 1 para lectores de pantalla', async () => {
    await renderRouter(rutas(), { initialUrl: '/entrar' });
    const h1 = screen.getByRole('heading', { name: 'Entrar a N Club' });
    expect(h1.props['aria-level']).toBe(1);
  });

  it('el acceso rápido está plegado y, abierto, lista las cuentas y la clave', async () => {
    await renderRouter(rutas(), { initialUrl: '/entrar' });
    expect(screen.queryByText('Clave de todas: nclub-demo-2026')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Acceso rápido' }));
    expect(screen.getByText('Clave de todas: nclub-demo-2026')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Elegir perfil' })).toBeOnTheScreen();
  });

  it('las cuentas del acceso rápido rellenan los campos', async () => {
    await renderRouter(rutas(), { initialUrl: '/entrar' });
    await fireEvent.press(screen.getByRole('button', { name: 'Acceso rápido' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Usar sofia@nclub.demo' }));
    expect(screen.getByLabelText('Correo').props.value).toBe('sofia@nclub.demo');
    expect(screen.getByLabelText('Clave').props.value).toBe(PASS);
  });

  it('muestra y oculta la clave', async () => {
    await renderRouter(rutas(), { initialUrl: '/entrar' });
    expect(screen.getByLabelText('Clave').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar clave' }));
    expect(screen.getByLabelText('Clave').props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar clave' }));
    expect(screen.getByLabelText('Clave').props.secureTextEntry).toBe(true);
  });

  it('pide los dos campos antes de llamar a la API', async () => {
    await renderRouter(rutas(), { initialUrl: '/entrar' });
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Escribe tu correo.')).toBeOnTheScreen();
    expect(screen.getByText('Escribe tu clave.')).toBeOnTheScreen();
    expect(fake.s.llamadas).toHaveLength(0);
  });

  it('clave incorrecta: error claro y sigue en /entrar', async () => {
    const r = await renderRouter(rutas(), { initialUrl: '/entrar' });
    await fireEvent.changeText(screen.getByLabelText('Correo'), 'concierge@nclub.demo');
    await fireEvent.changeText(screen.getByLabelText('Clave'), 'mala');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/Correo o clave incorrectos/)).toBeOnTheScreen();
    expect(r.getPathname()).toBe('/entrar');
  });

  it.each([
    ['demasiados_intentos', 429, /Demasiados intentos/],
    ['otro_error', 500, /No pudimos iniciar sesión/],
  ])('error %s en lenguaje claro', async (error, status, texto) => {
    fake.s.loginError = { status, error };
    await entrarComo('concierge@nclub.demo');
    expect(await screen.findByText(texto)).toBeOnTheScreen();
  });

  it('sin conexión: lo dice y permite reintentar', async () => {
    fake.s.caido = true;
    await entrarComo('concierge@nclub.demo');
    expect(await screen.findByText(/Sin conexión\. Revisa tu red/)).toBeOnTheScreen();
    fake.s.caido = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.queryByText(/Sin conexión\. Revisa tu red/)).toBeNull());
  });

  it('el concierge entra a /app/concierge', async () => {
    await entrarComo('concierge@nclub.demo');
    await waitFor(() => expect(screen.getByText('Recepción')).toBeOnTheScreen());
  });

  it('el socio entra a /app/socio', async () => {
    await entrarComo('sofia@nclub.demo');
    expect(await screen.findByText('INICIO SOCIO')).toBeOnTheScreen();
  });

  it('con un token guardado válido va directo a su pantalla', async () => {
    await tokenStore.set('T-u-sofia');
    await renderRouter(rutas(), { initialUrl: '/entrar' });
    expect(await screen.findByText('INICIO SOCIO')).toBeOnTheScreen();
  });
});

describe('sesión y guardia', () => {
  it('sin sesión, /app/concierge manda a /entrar', async () => {
    const r = await renderRouter(rutas(), { initialUrl: '/app/concierge' });
    await waitFor(() => expect(r.getPathname()).toBe('/entrar'));
  });

  it('un socio no ve la app del concierge', async () => {
    await tokenStore.set('T-u-sofia');
    const r = await renderRouter(rutas(), { initialUrl: '/app/concierge' });
    await waitFor(() => expect(r.getPathname()).toBe('/app/socio'));
  });

  it('token vencido (401 en /me): vuelve a /entrar', async () => {
    await tokenStore.set('T-viejo');
    const r = await renderRouter(rutas(), { initialUrl: '/app/concierge' });
    await waitFor(() => expect(r.getPathname()).toBe('/entrar'));
  });

  it('sin red al abrir: ofrece reintentar y entra cuando vuelve', async () => {
    fake.s.caido = true;
    await tokenStore.set('T-u-natalia');
    await renderRouter(rutas(), { initialUrl: '/app/concierge' });
    expect(
      await screen.findByText('No pudimos abrir tu sesión. Revisa tu red e intenta de nuevo.'),
    ).toBeOnTheScreen();
    fake.s.caido = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Recepción')).toBeOnTheScreen();
  });

  it('cerrar sesión borra el token y vuelve a /entrar', async () => {
    const r = await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Robot' }));
    await tick(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(r.getPathname()).toBe('/entrar'));
    expect(await tokenStore.get()).toBeNull();
  });
});

describe('avisos', () => {
  it('ordena urgentes arriba: el más urgente destacado y el resto en lista con su hora', async () => {
    fake.s.eventos = [
      evento({ seq: 1, nombre: 'Info Uno', severidad: 'info', categoria: 'INVITADO' }),
      evento({
        seq: 2,
        nombre: 'Urgente Dos',
        severidad: 'urgente',
        categoria: 'VIP',
        destino: 'Lounge VIP',
        motivo: 'No está en la agenda de hoy',
        avisar: ['anfitrion', 'concierge'],
        ts: '2026-10-24T14:07:00-05:00',
      }),
      evento({
        seq: 3,
        nombre: 'Atencion Tres',
        severidad: 'atencion',
        categoria: 'EXTERNO',
        ts: '2026-10-24T14:30:00-05:00',
      }),
      evento({ seq: 4, tipo: 'LLEGADA', requiere_atencion: false, nombre: 'Solo Llegada' }),
    ];
    await abrirConcierge();
    const botones = screen
      .getAllByRole('button', { name: /^Atender a / })
      .map((b) => b.props.accessibilityLabel);
    expect(botones).toEqual([
      'Atender a Urgente Dos',
      'Atender a Atencion Tres',
      'Atender a Info Uno',
    ]);
    expect(screen.queryByText('Solo Llegada')).toBeNull();
    expect(screen.getByText('Urgente Dos necesita atención')).toBeOnTheScreen();
    expect(screen.getByText('No está en la agenda de hoy')).toBeOnTheScreen();
    expect(screen.getByText('14:30')).toBeOnTheScreen();
    // Poca información: sin chips de categoría, contadores ni «Para».
    expect(screen.queryByLabelText('VIP')).toBeNull();
    expect(screen.queryByText('Socio VIP')).toBeNull();
    expect(screen.queryByLabelText(/por atender/)).toBeNull();
    expect(screen.queryByText(/Para:/)).toBeNull();
  });

  it('sin alertas: estado vacío', async () => {
    await abrirConcierge();
    expect(screen.getByText('Sin alertas por ahora')).toBeOnTheScreen();
  });

  it('Atender pasa a ATENDIDO mostrando quién y cuándo', async () => {
    fake.s.eventos = [evento({ seq: 1, nombre: 'Laura Diaz', categoria: 'EXTERNO' })];
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('button', { name: 'Atender a Laura Diaz' }));
    expect(await screen.findByText('Atendida por ti · 15:00')).toBeOnTheScreen();
    expect(
      fake.s.llamadas.some((l) => l.method === 'POST' && l.path === '/eventos/e1/atender'),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Atender a Laura Diaz' })).toBeNull();
  });

  it('si Atender falla, lo avisa y deja el botón', async () => {
    fake.s.eventos = [evento({ seq: 1, nombre: 'Laura Diaz' })];
    await abrirConcierge();
    fake.s.eventos = [];
    await fireEvent.press(screen.getByRole('button', { name: 'Atender a Laura Diaz' }));
    expect(await screen.findByText('No existe.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Atender a Laura Diaz' })).toBeOnTheScreen();
  });

  it('el detalle explica motivo y evidencia en lenguaje simple', async () => {
    fake.s.eventos = [
      evento({
        seq: 1,
        nombre: 'Laura Diaz',
        categoria: 'EXTERNO',
        motivo: 'Visita fuera de horario',
        destino: 'Sala de anfitriones',
        avisar: ['anfitrion'],
        evidencia: { metodo: 'rostro', veredicto: 'no_coincide', reintentos: 2, pase: 'vencido' },
      }),
    ];
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver detalle de Laura Diaz' }));
    expect(await screen.findByText('Visita fuera de horario')).toBeOnTheScreen();
    expect(screen.getByText('rostro no coincide · 2 reintentos · pase vencido')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Robot' })).toBeOnTheScreen();
    expect(screen.getByText('Laura Diaz')).toBeOnTheScreen();
    expect(screen.getByText('Rostro')).toBeOnTheScreen();
    expect(screen.getByText('Sala de anfitriones')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByText('Evidencia')).toBeNull());
  });

  it('atender y resolver desde el detalle exige una nota y cierra la alerta', async () => {
    fake.s.eventos = [evento({ seq: 1, nombre: 'Laura Diaz', motivo: 'Algo pasó' })];
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver detalle de Laura Diaz' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Atender' }));
    const resolver = await screen.findByRole('button', { name: 'Resolver' });
    expect(resolver.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(
      screen.getByLabelText('Nota para cerrar'),
      '  Lo acompañé a la sala  ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Resolver' }));
    await waitFor(() =>
      expect(fake.s.llamadas.find((l) => l.path === '/eventos/e1/resolver')?.body).toEqual({
        nota: 'Lo acompañé a la sala',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Nota para cerrar')).toBeNull());
    expect(screen.getByText('Sin alertas por ahora')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver historial' }));
    expect(screen.getByText('Resuelta por ti · 15:00')).toBeOnTheScreen();
  });

  it('historial vacío', async () => {
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver historial' }));
    expect(screen.getByText('Historial vacío')).toBeOnTheScreen();
  });
});

describe('sondeo incremental', () => {
  it('pide con despues_de, acumula y no recarga todo', async () => {
    fake.s.eventos = [evento({ seq: 5, nombre: 'Primero' })];
    await abrirConcierge();
    expect(fake.s.llamadas.filter((l) => l.path.startsWith('/eventos?despues_de=0'))).toHaveLength(
      1,
    );

    fake.s.eventos.push(evento({ seq: 6, nombre: 'Segundo', severidad: 'info' }));
    await tick(3000);
    expect(fake.s.llamadas.some((l) => l.path.startsWith('/eventos?despues_de=5'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Atender a Primero' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Atender a Segundo' })).toBeOnTheScreen();

    await tick(3000);
    expect(fake.s.llamadas.some((l) => l.path.startsWith('/eventos?despues_de=6'))).toBe(true);
    expect(
      fake.s.llamadas.filter((l) => l.path.startsWith('/eventos?')).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('un evento nuevo con atención vibra y avisa; la carga inicial no', async () => {
    fake.s.eventos = [evento({ seq: 1, nombre: 'Ya estaba' })];
    await abrirConcierge();
    expect(vibrar).not.toHaveBeenCalled();

    fake.s.eventos.push(evento({ seq: 2, nombre: 'Recién llegado', severidad: 'urgente' }));
    await tick(3000);
    expect(vibrar).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Alerta: Recién llegado')).toBeOnTheScreen();

    fake.s.eventos.push(evento({ seq: 3, tipo: 'LLEGADA', requiere_atencion: false }));
    await tick(3000);
    expect(vibrar).toHaveBeenCalledTimes(1);

    fake.s.eventos.push(evento({ seq: 4, nombre: 'A' }), evento({ seq: 5, nombre: 'B' }));
    await tick(3000);
    expect(vibrar).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('2 alertas nuevas')).toBeOnTheScreen();
  });

  it('sin conexión después de cargar: banner y conserva lo que había; al volver se recupera', async () => {
    fake.s.eventos = [evento({ seq: 1, nombre: 'Laura Diaz' })];
    await abrirConcierge();
    fake.s.caido = true;
    await tick(3000);
    expect(screen.getByText(/Sin conexión\. Mostramos lo último/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Atender a Laura Diaz' })).toBeOnTheScreen();
    fake.s.caido = false;
    await tick(3000);
    expect(screen.queryByText(/Sin conexión\. Mostramos lo último/)).toBeNull();
  });

  it('sin conexión en la primera carga: error con reintentar', async () => {
    const original = fake.fetchFake;
    mockFetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('/eventos')) throw new TypeError('network');
      return original(url, init);
    }) as unknown as typeof fetch;
    await abrirConcierge();
    expect(screen.getByText('Sin conexión')).toBeOnTheScreen();
    mockFetch = original;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin alertas por ahora')).toBeOnTheScreen();
  });

  it('error del servidor en la primera carga: ErrorState con reintentar', async () => {
    const original = fake.fetchFake;
    mockFetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('/eventos')) {
        return new Response(JSON.stringify({ error: 'boom', detalle: 'Falló el servidor.' }), {
          status: 500,
        });
      }
      return original(url, init);
    }) as unknown as typeof fetch;
    await abrirConcierge();
    expect(screen.getByText('No pudimos cargar los avisos')).toBeOnTheScreen();
    expect(screen.getByText('Falló el servidor.')).toBeOnTheScreen();
    mockFetch = original;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    await tick(0);
    expect(await screen.findByText('Sin alertas por ahora')).toBeOnTheScreen();
  });

  it('un 401 durante el sondeo devuelve a /entrar', async () => {
    const r = await abrirConcierge();
    const original = fake.fetchFake;
    mockFetch = (async (url: string, init?: RequestInit) =>
      String(url).includes('/eventos')
        ? new Response(JSON.stringify({ error: 'token_vencido', detalle: 'Inicia sesión.' }), {
            status: 401,
          })
        : original(url, init)) as unknown as typeof fetch;
    await tick(3000);
    await waitFor(() => expect(r.getPathname()).toBe('/entrar'));
  });

  it('con la app en segundo plano no sondea', async () => {
    const { AppState } = require('react-native');
    const original = AppState.addEventListener;
    let cambiar: (s: string) => void = () => {};
    AppState.addEventListener = (_: string, fn: (s: string) => void) => {
      cambiar = fn;
      return { remove: () => {} };
    };
    try {
      await abrirConcierge();
      const antes = fake.s.llamadas.length;
      await act(async () => cambiar('background'));
      await tick(9000);
      expect(fake.s.llamadas.length).toBe(antes);
      await act(async () => cambiar('active'));
      await tick(0);
      expect(fake.s.llamadas.length).toBeGreaterThan(antes);
    } finally {
      AppState.addEventListener = original;
    }
  });
});

describe('pestañas', () => {
  it('llegadas: solo las de hoy, con hora, categoría y método', async () => {
    fake.s.eventos = [
      evento({
        seq: 1,
        tipo: 'LLEGADA',
        requiere_atencion: false,
        nombre: 'Sofia R',
        categoria: 'VIP',
        destino: 'Lounge VIP',
        ts: '2026-10-24T13:10:00-05:00',
        evidencia: { metodo: 'rostro' },
      }),
      evento({
        seq: 2,
        tipo: 'LLEGADA',
        requiere_atencion: false,
        nombre: 'De ayer',
        ts: '2026-10-23T13:10:00-05:00',
      }),
      evento({ seq: 3, nombre: 'Una alerta' }),
    ];
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Llegadas' }));
    expect(await screen.findByText('Llegadas de hoy')).toBeOnTheScreen();
    expect(screen.queryByText('1 llegada')).toBeNull();
    expect(screen.getByLabelText('13:10, Sofia R, Rostro · Lounge VIP')).toBeOnTheScreen();
    expect(screen.queryByText('De ayer')).toBeNull();
  });

  it('llegadas vacías y llegada nueva en vivo', async () => {
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Llegadas' }));
    expect(await screen.findByText('Aún no llega nadie')).toBeOnTheScreen();
    fake.s.eventos.push(
      evento({
        seq: 1,
        tipo: 'LLEGADA',
        requiere_atencion: false,
        nombre: 'Marta Ruiz',
        categoria: 'PERSONAL',
      }),
    );
    await tick(3000);
    expect(screen.getByText('Marta Ruiz')).toBeOnTheScreen();
    expect(screen.queryByText('Personal')).toBeNull();
  });

  it('llegadas: sin datos por un error muestra el aviso, y una llegada sin nombre ni método se lee bien', async () => {
    const original = fake.fetchFake;
    mockFetch = (async (url: string, init?: RequestInit) =>
      String(url).includes('/eventos')
        ? new Response(JSON.stringify({ error: 'boom', detalle: 'Falló.' }), { status: 500 })
        : original(url, init)) as unknown as typeof fetch;
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Llegadas' }));
    expect(await screen.findByText('No pudimos cargar las llegadas')).toBeOnTheScreen();
    mockFetch = original;
    fake.s.eventos = [evento({ seq: 1, tipo: 'LLEGADA', requiere_atencion: false })];
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Persona sin identificar')).toBeOnTheScreen();
    expect(screen.queryByText('Sin categoría')).toBeNull();
  });

  it('esperados: agrupados por socio con los VIP primero', async () => {
    fake.s.invitaciones = [
      invitacion({ id: '1', anfitrion_id: 'u-andres', nombre: 'Julian', apellido: 'Pardo' }),
      invitacion({
        id: '2',
        anfitrion_id: 'u-sofia',
        nombre: 'Valentina',
        apellido: 'Ortiz',
        estado: 'LLEGO',
      }),
      invitacion({
        id: '3',
        anfitrion_id: 'u-sofia',
        nombre: 'Ricardo',
        apellido: 'Lemus',
        hora_desde: '09:00',
      }),
      invitacion({
        id: '4',
        anfitrion_id: 'u-andres',
        nombre: 'Cancelado',
        apellido: 'X',
        estado: 'CANCELADA',
      }),
    ];
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Esperados' }));
    expect(await screen.findByText('Esperados hoy')).toBeOnTheScreen();
    expect(screen.queryByText('3 invitados')).toBeNull();
    const cabeceras = withHeadings();
    expect(cabeceras).toEqual(['SOCIO · SOFÍA RESTREPO', 'SOCIO · ANDRÉS MEJÍA']);
    expect(screen.getByText('Ya llegó')).toBeOnTheScreen();
    expect(screen.queryByText('Cancelado X')).toBeNull();
    expect(fake.s.llamadas.some((l) => l.path === '/invitaciones?fecha=2026-10-24')).toBe(true);
  });

  it('esperados vacío y con error', async () => {
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Esperados' }));
    expect(await screen.findByText('Nadie esperado hoy')).toBeOnTheScreen();
  });

  it('esperados: error del servidor con reintentar', async () => {
    const original = fake.fetchFake;
    mockFetch = (async (url: string, init?: RequestInit) =>
      String(url).includes('/invitaciones')
        ? new Response(JSON.stringify({ error: 'boom', detalle: 'Falló.' }), { status: 500 })
        : original(url, init)) as unknown as typeof fetch;
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Esperados' }));
    expect(await screen.findByText('No pudimos cargar los invitados')).toBeOnTheScreen();
    mockFetch = original;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Nadie esperado hoy')).toBeOnTheScreen();
  });

  it('robot en línea con el último latido', async () => {
    fake.s.robot = { ...fake.s.robot, estado: 'acompanando', detalle: 'Camino al salón' } as never;
    await abrirConcierge();
    expect(
      await screen.findByText('Entrada sin robot: Camino al salón. Cubre la entrada.'),
    ).toBeOnTheScreen();
    fake.s.robot = {
      ...fake.s.robot,
      estado: 'sin_servicio',
      detalle: 'cambio de batería',
    } as never;
    await tick(15000);
    expect(screen.getByText('Robot sin servicio: cambio de batería')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Robot' }));
    expect(await screen.findByText('Sin servicio')).toBeOnTheScreen();
    expect(screen.getByText(/Latido del cerebro: 14:59 · hace/)).toBeOnTheScreen();
  });

  it('robot sin conexión y se actualiza cada 15 s', async () => {
    fake.s.robot = { en_linea: false, ultimo_latido: '2026-10-24T14:40:00-05:00' };
    await abrirConcierge();
    expect(await screen.findByText('Robot sin conexión')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Robot' }));
    expect(await screen.findByText('Sin conexión')).toBeOnTheScreen();
    expect(screen.getByText(/Latido del cerebro: 14:40 · hace 20 min/)).toBeOnTheScreen();
    const antes = fake.s.llamadas.filter((l) => l.path === '/robot/estado').length;
    fake.s.robot = {
      en_linea: true,
      ultimo_latido: '2026-10-24T15:00:00-05:00',
      detalle: 'Recepción lista',
    } as never;
    await tick(14999);
    expect(fake.s.llamadas.filter((l) => l.path === '/robot/estado').length).toBe(antes);
    await tick(1);
    expect(fake.s.llamadas.filter((l) => l.path === '/robot/estado').length).toBeGreaterThan(antes);
    expect(screen.getByText('En línea')).toBeOnTheScreen();
    expect(screen.getByText('Recepción lista')).toBeOnTheScreen();
  });

  it('robot que nunca dio latidos y servidor caído', async () => {
    fake.s.robot = { en_linea: false, ultimo_latido: null };
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Robot' }));
    expect(await screen.findByText('Aún no ha enviado latidos')).toBeOnTheScreen();
  });

  it('robot: error sin datos ofrece reintentar y con datos avisa sin conexión', async () => {
    const original = fake.fetchFake;
    mockFetch = (async (url: string, init?: RequestInit) =>
      String(url).includes('/robot')
        ? new Response(JSON.stringify({ error: 'boom', detalle: 'No responde.' }), { status: 500 })
        : original(url, init)) as unknown as typeof fetch;
    await abrirConcierge();
    await fireEvent.press(screen.getByRole('tab', { name: 'Robot' }));
    expect(await screen.findByText('No pudimos consultar al robot')).toBeOnTheScreen();
    mockFetch = original;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('En línea')).toBeOnTheScreen();
    mockFetch = (async (url: string, init?: RequestInit) =>
      String(url).includes('/robot')
        ? Promise.reject(new TypeError('net'))
        : original(url, init)) as unknown as typeof fetch;
    await tick(15000);
    expect(screen.getAllByText(/Sin conexión\. Mostramos lo último/).length).toBeGreaterThan(0);
  });
});

function withHeadings(): string[] {
  return screen
    .getAllByRole('heading')
    .map((h) => String(h.props.children))
    .filter((t) => t.startsWith('SOCIO'));
}

describe('cerrar sesión del socio', () => {
  it('vuelve a la pantalla de entrar y no reabre la app sin token', async () => {
    await tokenStore.set('T-u-sofia');
    await renderRouter(
      {
        ...rutas(),
        '(club)/app/socio/_layout': require('../../../app/(club)/app/socio/_layout').default,
        '(club)/app/socio/perfil': require('../../../app/(club)/app/socio/(tabs)/perfil').default,
      },
      { initialUrl: '/app/socio/perfil' },
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    expect(await tokenStore.get()).toBeNull();
    expect(screen.queryByText('INICIO SOCIO')).toBeNull();
  });
});
