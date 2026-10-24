/* eslint-disable @typescript-eslint/no-require-imports -- route modules are loaded lazily for renderRouter */
// Edecán app through the real routes with a fake v3 club API.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text, Vibration } from 'react-native';

import { tokenStore } from '@/features/club/client';
import { AHORA, crearApi, haceMin, tarea, visita } from './fake';

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
  '(club)/entrar': () => <Text>PANTALLA ENTRAR</Text>,
  '(club)/app/socio/index': () => <Text>INICIO SOCIO</Text>,
  '(club)/app/edecan/_layout': require('../../../app/(club)/app/edecan/_layout').default,
  '(club)/app/edecan/index': require('../../../app/(club)/app/edecan/index').default,
  '(club)/app/edecan/en-curso': require('../../../app/(club)/app/edecan/en-curso').default,
  '(club)/app/edecan/escanear': require('../../../app/(club)/app/edecan/escanear').default,
  '(club)/app/edecan/incidencias': require('../../../app/(club)/app/edecan/incidencias').default,
  '(club)/app/edecan/perfil': require('../../../app/(club)/app/edecan/perfil').default,
});

let api: ReturnType<typeof crearApi>;
let vibrar: jest.SpyInstance;

beforeEach(async () => {
  jest.useFakeTimers({ now: AHORA });
  api = crearApi();
  mockFetch = api.fetchFake;
  vibrar = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  await tokenStore.set('T-u-mateo');
});
afterEach(() => {
  jest.useRealTimers();
  vibrar.mockRestore();
});

const tick = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
const abrir = async (url = '/app/edecan') => {
  await renderRouter(rutas(), { initialUrl: url });
};
const boton = (name: string) => screen.findByRole('button', { name });
const llamadas = (method: string, path: string) =>
  api.s.llamadas.filter((l) => l.method === method && l.path === path);

describe('guardia', () => {
  it('manda a otro rol a su propia app y al anónimo al login', async () => {
    await tokenStore.set('T-u-sofia');
    await abrir();
    expect(await screen.findByText('INICIO SOCIO')).toBeOnTheScreen();
  });

  it('sin sesión va a /entrar', async () => {
    await tokenStore.set(null);
    await abrir();
    expect(await screen.findByText('PANTALLA ENTRAR')).toBeOnTheScreen();
  });
});

describe('mis tareas', () => {
  beforeEach(() => {
    api.s.tareas = [
      tarea({ id: 'n', nombre_visitante: 'Julián Pardo', punto_encuentro: 'Recepción' }),
      tarea({
        id: 'u',
        prioridad: 'urgente',
        nombre_visitante: 'Camila Torres',
        punto_encuentro: 'Entrada principal',
        motivo: 'Llega en silla de ruedas',
        creada_at: haceMin(4),
      }),
      tarea({ id: 'otra', nombre_visitante: 'De otra', asignada_a: 'u-otra' }),
    ];
    api.s.visitas['vis-u'] = visita({ id: 'vis-u' });
  });

  it('destaca la urgente, deja la otra en la cola y no muestra etiquetas ni contadores', async () => {
    await abrir();
    expect(await screen.findByText('Acompañar a Camila Torres')).toBeOnTheScreen();
    expect(screen.getByText('TAREA URGENTE')).toBeOnTheScreen();
    expect(screen.getByText('Entrada principal')).toBeOnTheScreen();
    expect(screen.getByText('Llega en silla de ruedas')).toBeOnTheScreen();
    expect(screen.getByText('Julián Pardo')).toBeOnTheScreen();
    expect(screen.getByText('Recepción')).toBeOnTheScreen();
    expect(screen.queryByText('De otra')).toBeNull();
    expect(screen.queryByText('Hace 4 min')).toBeNull();
    expect(screen.queryByText('Urgente')).toBeNull();
    expect(screen.queryByText(/abiertas/)).toBeNull();
    expect(screen.getByText('Hola, Mateo')).toBeOnTheScreen();
  });

  it('aceptar abre la visita en curso con su contexto', async () => {
    await abrir();
    await fireEvent.press(await boton('Aceptar tarea de Camila Torres'));
    expect(await screen.findByText('Hacia Sala Ejecutiva')).toBeOnTheScreen();
    expect(screen.getByText('Silla de ruedas')).toBeOnTheScreen();
    expect(screen.getByText('Prefiere té verde')).toBeOnTheScreen();
    expect(screen.getByText('Entrada principal')).toBeOnTheScreen();
    expect(screen.getByText('Acompañante asignado')).toBeOnTheScreen();
    expect(llamadas('POST', '/tareas/u/aceptar')).toHaveLength(1);
    expect(llamadas('GET', '/visitas/vis-u').length).toBeGreaterThan(0);
  });

  it('rechazar pide el motivo y lo envía; la siguiente pasa a destacada', async () => {
    await abrir();
    await fireEvent.press(await boton('Rechazar tarea de Camila Torres'));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar rechazo' }));
    expect(screen.getByText('Cuéntanos el motivo para rechazarla.')).toBeOnTheScreen();
    expect(llamadas('POST', '/tareas/u/rechazar')).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText('Motivo del rechazo'), 'Estoy en otra visita');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar rechazo' }));
    await waitFor(() => expect(llamadas('POST', '/tareas/u/rechazar')).toHaveLength(1));
    expect(llamadas('POST', '/tareas/u/rechazar')[0]!.body).toEqual({
      motivo: 'Estoy en otra visita',
    });
    await waitFor(() => expect(screen.queryByText('Acompañar a Camila Torres')).toBeNull());
    expect(await screen.findByText('Acompañar a Julián Pardo')).toBeOnTheScreen();
  });

  it('una tarea en la cola se acepta desde su fila', async () => {
    api.s.visitas['vis-n'] = visita({ id: 'vis-n', nombre: 'Julián Pardo' });
    await abrir();
    await fireEvent.press(await boton('Aceptar tarea de Julián Pardo'));
    await waitFor(() => expect(llamadas('POST', '/tareas/n/aceptar')).toHaveLength(1));
  });

  it('la visita en curso se ve con su avance y se cierra con «Llegamos»', async () => {
    api.s.tareas = [
      tarea({
        id: 'a',
        visita_id: 'vis-a',
        estado: 'ACEPTADA',
        asignada_a: 'u-mateo',
        nombre_visitante: 'Laura Díaz',
      }),
    ];
    api.s.visitas['vis-a'] = visita({ id: 'vis-a', nombre: 'Laura Díaz', destino: 'Terraza' });
    await abrir();
    expect(await screen.findByText('Laura Díaz → Terraza')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Avance hacia Terraza' })).toBeOnTheScreen();
    expect(screen.queryByText(/No tienes tareas por ahora/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Llegamos a Terraza' }));
    await waitFor(() => expect(llamadas('POST', '/visitas/vis-a/llegada')).toHaveLength(1));
  });

  it('sondea cada 5 s y vibra con una tarea urgente nueva (no con las del inicio)', async () => {
    await abrir();
    await screen.findByText('Acompañar a Camila Torres');
    expect(vibrar).not.toHaveBeenCalled();
    api.s.tareas.push(tarea({ id: 'u2', prioridad: 'urgente', nombre_visitante: 'Rosa León' }));
    await tick(5200);
    expect(await screen.findByText('Rosa León')).toBeOnTheScreen();
    expect(vibrar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Tarea urgente: Rosa León')).toBeOnTheScreen();
    await tick(5200);
    expect(vibrar).toHaveBeenCalledTimes(1);
  });

  it('sin tareas guía al usuario', async () => {
    api.s.tareas = [];
    await abrir();
    expect(await screen.findByText(/No tienes tareas por ahora/)).toBeOnTheScreen();
  });

  it('sin conexión ofrece reintentar', async () => {
    api.s.caido = true;
    await abrir();
    await tick(100);
    expect(await screen.findByText('Sin conexión')).toBeOnTheScreen();
  });
});

describe('visita en curso', () => {
  const aceptada = (extra = {}) =>
    tarea({
      id: 'a',
      visita_id: 'vis-a',
      estado: 'ACEPTADA',
      asignada_a: 'u-mateo',
      nombre_visitante: 'Camila Torres',
      ...extra,
    });

  it('sin visitas explica qué hacer', async () => {
    await abrir('/app/edecan/en-curso');
    expect(await screen.findByText(/No acompañas a nadie ahora/)).toBeOnTheScreen();
  });

  it('"Llegamos" cierra el acompañamiento y muestra el cierre', async () => {
    api.s.tareas = [aceptada()];
    api.s.visitas['vis-a'] = visita({ id: 'vis-a' });
    await abrir('/app/edecan/en-curso');
    await fireEvent.press(await boton('Llegamos a Sala Ejecutiva'));
    expect(await screen.findByText('Llegaron a Sala Ejecutiva')).toBeOnTheScreen();
    expect(screen.getByText(/Cerraste el acompañamiento de Camila Torres/)).toBeOnTheScreen();
    expect(llamadas('POST', '/visitas/vis-a/llegada')).toHaveLength(1);
  });

  it('pide relevo con motivo y ayuda desde la visita', async () => {
    api.s.tareas = [aceptada()];
    api.s.visitas['vis-a'] = visita({ id: 'vis-a' });
    await abrir('/app/edecan/en-curso');
    await fireEvent.press(await boton('Pedir relevo'));
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir relevo' }));
    expect(screen.getByText('Cuéntanos el motivo.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Motivo del relevo'), 'Termina mi turno');
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir relevo' }));
    await waitFor(() => expect(llamadas('POST', '/visitas/vis-a/relevo')).toHaveLength(1));
    expect(llamadas('POST', '/visitas/vis-a/relevo')[0]!.body).toEqual({
      motivo: 'Termina mi turno',
    });
    expect(await screen.findByText(/Esperando a quien reciba a Camila Torres/)).toBeOnTheScreen();
  });

  it('pide ayuda', async () => {
    api.s.tareas = [aceptada()];
    api.s.visitas['vis-a'] = visita({ id: 'vis-a' });
    await abrir('/app/edecan/en-curso');
    await fireEvent.press(await boton('Pedir ayuda'));
    await fireEvent.changeText(
      screen.getByLabelText('¿En qué necesitas ayuda?'),
      'La ruta está bloqueada',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir ayuda' }));
    await waitFor(() => expect(llamadas('POST', '/visitas/vis-a/ayuda')).toHaveLength(1));
  });

  it('tras aceptar un relevo, confirma que recibió a la persona', async () => {
    api.s.tareas = [aceptada({ tipo: 'RELEVO' })];
    api.s.visitas['vis-a'] = visita({ id: 'vis-a', estado: 'EN_RELEVO' });
    await abrir('/app/edecan/en-curso');
    await fireEvent.press(await boton('Confirmar que recibí a Camila Torres'));
    await waitFor(() => expect(llamadas('POST', '/visitas/vis-a/recibir')).toHaveLength(1));
    expect(await boton('Llegamos a Sala Ejecutiva')).toBeOnTheScreen();
  });

  it('con dos visitas a cargo cambia de una a otra', async () => {
    api.s.tareas = [
      aceptada(),
      tarea({
        id: 'b',
        visita_id: 'vis-b',
        estado: 'ACEPTADA',
        asignada_a: 'u-mateo',
        nombre_visitante: 'Rosa León',
      }),
    ];
    api.s.visitas['vis-a'] = visita({ id: 'vis-a' });
    api.s.visitas['vis-b'] = visita({ id: 'vis-b', nombre: 'Rosa León', destino: 'Terraza' });
    await abrir('/app/edecan/en-curso');
    expect(await screen.findByText('Hacia Sala Ejecutiva')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Rosa León' }));
    expect(await screen.findByText('Hacia Terraza')).toBeOnTheScreen();
  });

  it('una visita que ya llegó no sigue en curso', async () => {
    api.s.tareas = [aceptada()];
    api.s.visitas['vis-a'] = visita({ id: 'vis-a', estado: 'EN_DESTINO' });
    await abrir('/app/edecan/en-curso');
    expect(await screen.findByText(/No acompañas a nadie ahora/)).toBeOnTheScreen();
  });
});

describe('escanear', () => {
  const valido = (v: ReturnType<typeof visita> | null) => ({
    valido: true,
    motivo: null,
    tipo: 'INVITACION',
    persona_id: 'inv-1',
    nombre: 'Camila Torres',
    invitacion: {
      id: 'i1',
      persona_id: 'inv-1',
      anfitrion_id: 'u-sofia',
      nombre: 'Camila',
      apellido: 'Torres',
      trato: 'senora',
      documento: null,
      fecha: '2026-10-24',
      hora_desde: '10:00',
      hora_hasta: '12:00',
      lugar: 'Sala Ejecutiva',
      nota: 'Trae a su hija',
      estado: 'PROGRAMADA',
      foto_estado: 'NINGUNA',
      foto_motivo: null,
      consentimiento_at: null,
      creada_at: haceMin(600),
      asistencia: ['visual'],
      preferencias_bebida: ['agua'],
    },
    visita: v,
  });

  it('pide el código antes de llamar a la API', async () => {
    await abrir('/app/edecan/escanear');
    await fireEvent.press(await boton('Verificar'));
    expect(screen.getByText('Pega o escribe el código del pase.')).toBeOnTheScreen();
    expect(llamadas('POST', '/qr/verificar')).toHaveLength(0);
  });

  it('un pase inválido dice por qué', async () => {
    await abrir('/app/edecan/escanear');
    await fireEvent.changeText(await screen.findByLabelText('Código del pase'), 'NCLUB1|X');
    await fireEvent.press(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText('Pase no válido')).toBeOnTheScreen();
    expect(screen.getByText(/El código no es auténtico/)).toBeOnTheScreen();
    expect(llamadas('POST', '/qr/verificar')[0]!.body).toEqual({ payload: 'NCLUB1|X' });
  });

  it('muestra el contexto completo e inicia la visita asignándosela', async () => {
    api.s.qr = valido(null) as never;
    await abrir('/app/edecan/escanear');
    await fireEvent.changeText(await screen.findByLabelText('Código del pase'), ' NCLUB1|OK ');
    await fireEvent.press(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText('Lo que ya sabemos')).toBeOnTheScreen();
    expect(screen.getByText('Apoyo visual')).toBeOnTheScreen();
    expect(screen.getByText('Prefiere agua')).toBeOnTheScreen();
    expect(screen.getByText('Trae a su hija')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar visita' }));
    await waitFor(() => expect(llamadas('POST', '/visitas/vis-nueva/asignar')).toHaveLength(1));
    expect(llamadas('POST', '/visitas')[0]!.body).toEqual({ invitacion_id: 'i1' });
    expect(llamadas('POST', '/visitas/vis-nueva/asignar')[0]!.body).toEqual({
      acompanante_id: 'u-mateo',
    });
    expect(await screen.findByText('Hacia Sala Ejecutiva')).toBeOnTheScreen();
  });

  it('una visita en relevo se recibe desde el escaneo', async () => {
    const v = visita({ id: 'vis-r', estado: 'EN_RELEVO' });
    api.s.visitas['vis-r'] = v;
    api.s.qr = valido(v) as never;
    await abrir('/app/edecan/escanear');
    await fireEvent.changeText(await screen.findByLabelText('Código del pase'), 'NCLUB1|OK');
    await fireEvent.press(screen.getByRole('button', { name: 'Verificar' }));
    await fireEvent.press(await boton('Recibir a Camila Torres'));
    await waitFor(() => expect(llamadas('POST', '/visitas/vis-r/recibir')).toHaveLength(1));
  });
});

describe('reportar', () => {
  it('exige tipo y descripción, reporta (ligado a la visita en mano) y lista las abiertas', async () => {
    api.s.tareas = [
      tarea({
        id: 'a',
        visita_id: 'vis-a',
        estado: 'ACEPTADA',
        asignada_a: 'u-mateo',
        nombre_visitante: 'Camila Torres',
      }),
    ];
    await abrir('/app/edecan/incidencias');
    await fireEvent.press(await boton('Enviar'));
    expect(screen.getByText('Elige qué pasó.')).toBeOnTheScreen();
    expect(screen.getByText('Cuéntanos qué pasó.')).toBeOnTheScreen();
    expect(llamadas('POST', '/incidencias')).toHaveLength(0);

    // Cuatro opciones simples con el nombre del tipo de la API.
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual([
      'Robot',
      'Ruta bloqueada',
      'Invitado',
      'Otro',
    ]);
    await fireEvent.press(screen.getByRole('radio', { name: 'Ruta bloqueada' }));
    await fireEvent.changeText(screen.getByLabelText('¿Qué pasó?'), 'Pasillo 2 cerrado');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(llamadas('POST', '/incidencias')).toHaveLength(1));
    expect(llamadas('POST', '/incidencias')[0]!.body).toEqual({
      tipo: 'RUTA_BLOQUEADA',
      descripcion: 'Pasillo 2 cerrado',
      visita_id: 'vis-a',
    });
    expect(await screen.findByText('Pasillo 2 cerrado', { exact: false })).toBeOnTheScreen();
  });
});

describe('perfil', () => {
  it('muestra el estado actual y lo cambia', async () => {
    await abrir('/app/edecan/perfil');
    expect(await screen.findByText('Mateo Gil')).toBeOnTheScreen();
    expect(screen.getByText('Edecán · acompañamiento')).toBeOnTheScreen();
    const disponible = await screen.findByRole('radio', { name: /^Disponible/ });
    await waitFor(() => expect(disponible).toBeChecked());
    await fireEvent.press(screen.getByRole('radio', { name: /^Fuera de servicio/ }));
    await waitFor(() => expect(llamadas('PATCH', '/me/estado')).toHaveLength(1));
    expect(llamadas('PATCH', '/me/estado')[0]!.body).toEqual({ estado: 'FUERA_DE_SERVICIO' });
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /^Fuera de servicio/ })).toBeChecked(),
    );
  });

  it('cerrar sesión vuelve al login', async () => {
    await abrir('/app/edecan/perfil');
    await fireEvent.press(await boton('Cerrar sesión'));
    expect(await screen.findByText('PANTALLA ENTRAR')).toBeOnTheScreen();
  });
});
