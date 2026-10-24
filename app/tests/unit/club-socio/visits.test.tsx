import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { ActivitiesScreen } from '@/features/club/socio/ActivitiesScreen';
import { ActivityDetailScreen } from '@/features/club/socio/ActivityDetailScreen';
import { GuestsScreen } from '@/features/club/socio/GuestsScreen';
import { HomeScreen } from '@/features/club/socio/HomeScreen';
import { VisitFollowScreen } from '@/features/club/socio/VisitFollowScreen';
import { cupoTexto, terminada } from '@/features/club/socio/actividades';
import { faltan } from '@/features/club/socio/dates';
import { fases, motivoRelevo } from '@/features/club/socio/visitas';
import {
  AHORA,
  SOFIA,
  actividad,
  evento,
  fakeApi,
  inv,
  renderSocio,
  visita,
  type Reply,
} from './support';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('./routerMock'));

const btn = (name: string) => screen.getByRole('button', { name });

const base: Record<string, Reply> = {
  'GET /invitaciones': { body: { items: [inv()] } },
  'GET /eventos': { body: { items: [evento()], ultimo_seq: 1 } },
  'GET /confirmaciones/pendientes': { body: { items: [] } },
};
const api = (extra: Record<string, Reply> = {}) => fakeApi({ ...base, ...extra });

beforeEach(() => jest.clearAllMocks());

describe('recorrido y acompañante (puro)', () => {
  it('llegada y asignación hechas, destino en curso; relevo y entrega solo si ocurrieron', () => {
    const f = fases(visita());
    expect(f.map((x) => [x.clave, x.estado])).toEqual([
      ['LLEGADA', 'hecha'],
      ['ACOMPANANDO', 'hecha'],
      ['EN_DESTINO', 'actual'],
    ]);
    expect(f[0]!.hora).toBe('14:40');
  });

  it('con relevo y entrega aparecen todas las fases en orden', () => {
    const v = visita({
      estado: 'EN_DESTINO',
      recorrido: [
        { ts: '2026-10-23T14:40:00-05:00', tipo: 'LLEGADA', actor: 'invitado', detalle: null },
        { ts: '2026-10-23T14:41:00-05:00', tipo: 'ASIGNADO', actor: 'x2-1', detalle: null },
        {
          ts: '2026-10-23T14:50:00-05:00',
          tipo: 'RELEVO_SOLICITADO',
          actor: 'x2-1',
          detalle: 'Batería baja',
        },
        {
          ts: '2026-10-23T14:52:00-05:00',
          tipo: 'RELEVO_ACEPTADO',
          actor: 'u-mateo',
          detalle: null,
        },
        {
          ts: '2026-10-23T14:53:00-05:00',
          tipo: 'ENTREGA_CONFIRMADA',
          actor: 'u-mateo',
          detalle: null,
        },
        { ts: '2026-10-23T14:58:00-05:00', tipo: 'EN_DESTINO', actor: 'u-mateo', detalle: null },
      ],
    });
    expect(fases(v).map((x) => x.estado)).toEqual(['hecha', 'hecha', 'hecha', 'hecha', 'hecha']);
    expect(motivoRelevo(v)).toBe('Batería baja');
  });

  it('en relevo sin pasos aún, el relevo es la fase en curso', () => {
    const f = fases(visita({ estado: 'EN_RELEVO' }));
    expect(f.find((x) => x.clave === 'RELEVO')!.estado).toBe('actual');
    // asked but not finished: still in progress, with the reason on the step
    const v = visita({
      estado: 'EN_RELEVO',
      recorrido: [
        ...visita().recorrido,
        {
          ts: '2026-10-23T14:50:00-05:00',
          tipo: 'RELEVO_SOLICITADO',
          actor: 'x2-1',
          detalle: 'Batería baja',
        },
      ],
    });
    const r = fases(v).find((x) => x.clave === 'RELEVO')!;
    expect([r.estado, r.detalle]).toEqual(['actual', 'Batería baja']);
  });

  it('cupos, fin de la actividad y tiempo que falta', () => {
    expect(cupoTexto(actividad())).toBe('10 cupos libres');
    expect(cupoTexto(actividad({ cupo: 3 }))).toBe('Último cupo');
    expect(cupoTexto(actividad({ cupo: 2 }))).toBe('Cupo lleno');
    expect(cupoTexto(actividad({ cupo: null }))).toBe('Sin límite de cupo');
    expect(terminada(actividad({ hora_hasta: '14:00' }), AHORA())).toBe(true);
    expect(terminada(actividad(), AHORA())).toBe(false);
    expect(faltan('2026-10-23T23:59:00-05:00', AHORA())).toBe('8 h 59 min');
    expect(faltan('2026-10-23T15:20:00-05:00', AHORA())).toBe('20 min');
    expect(faltan('2026-10-23T14:00:00-05:00', AHORA())).toBeNull();
  });
});

describe('Seguimiento de la visita', () => {
  it('muestra quién acompaña, el destino y el recorrido', async () => {
    await renderSocio(
      <VisitFollowScreen id="v1" onBack={jest.fn()} />,
      api({ 'GET /visitas/v1': { body: visita() } }),
    );
    expect(await screen.findByText('Laura Díaz llegó')).toBeTruthy();
    expect(await screen.findByText('El robot la lleva a la Sala de anfitriones.')).toBeTruthy();
    expect(screen.getByText('Lo acompaña')).toBeTruthy();
    expect(screen.getByText('Robot')).toBeTruthy();
    expect(screen.getByLabelText(/Llegada al club, listo a las 14:40/)).toBeTruthy();
    expect(screen.getByLabelText(/En su destino, en curso/)).toBeTruthy();
    expect(btn('Pedir ayuda')).toBeTruthy();
  });

  it('resalta el cambio de acompañante y avisa cuando cambia quién acompaña', async () => {
    let n = 0;
    const relevo = {
      ts: '2026-10-23T14:50:00-05:00',
      tipo: 'RELEVO_SOLICITADO',
      actor: 'x2-1',
      detalle: 'Batería baja',
    } as const;
    const a = api({
      'GET /visitas/v1': () => {
        n += 1;
        const v = visita();
        if (n === 1) return { body: v };
        if (n === 2)
          return { body: { ...v, estado: 'EN_RELEVO', recorrido: [...v.recorrido, relevo] } };
        return {
          body: {
            ...v,
            acompanante: { tipo: 'HUMANO', id: 'u-mateo', nombre: 'Mateo' },
            recorrido: [...v.recorrido, relevo],
          },
        };
      },
    });
    jest.useFakeTimers();
    try {
      await renderSocio(<VisitFollowScreen id="v1" onBack={jest.fn()} />, a);
      await screen.findByText(/El robot la lleva/);
      await jest.advanceTimersByTimeAsync(5000);
      expect(await screen.findByText('Cambio de acompañante en curso')).toBeTruthy();
      expect(screen.getByText(/Batería baja\. No tiene que hacer nada\./)).toBeTruthy();
      await jest.advanceTimersByTimeAsync(5000);
      expect(await screen.findByText('Ahora lo acompaña Mateo.')).toBeTruthy();
      expect(screen.queryByText('Cambio de acompañante en curso')).toBeNull();
      expect(screen.getByText('Edecán')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('comparte el punto de encuentro y la ubicación', async () => {
    const a = api({
      'GET /visitas/v1': { body: visita() },
      'PATCH /visitas/v1/encuentro': {
        body: visita({ punto_encuentro: 'Lobby', ubicacion_anfitrion: 'Terraza, mesa 4' }),
      },
    });
    await renderSocio(<VisitFollowScreen id="v1" onBack={jest.fn()} />, a);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Lobby' }));
    await fireEvent.changeText(
      screen.getByLabelText('Dónde estás ahora (opcional)'),
      'Terraza, mesa 4',
    );
    await fireEvent.press(btn('Compartir'));
    expect(await screen.findByText(/Compartido\./)).toBeTruthy();
    expect(a.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      punto_encuentro: 'Lobby',
      ubicacion_anfitrion: 'Terraza, mesa 4',
    });
    expect(btn('Compartir')).toBeDisabled();
  });

  it('pide ayuda con un motivo y confirma', async () => {
    const a = api({
      'GET /visitas/v1': { body: visita() },
      'POST /visitas/v1/ayuda': { body: { id: 't1' } },
    });
    await renderSocio(<VisitFollowScreen id="v1" onBack={jest.fn()} />, a);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pedir ayuda' }));
    expect(btn('Enviar aviso')).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'No lo encuentro' }));
    await fireEvent.press(btn('Enviar aviso'));
    expect(await screen.findByText('Pedimos ayuda. Un edecán va hacia ustedes.')).toBeTruthy();
    expect(a.calls.find((c) => c.path === '/visitas/v1/ayuda')!.body).toEqual({
      motivo: 'No lo encuentro',
    });
  });

  it('al salir pide la evaluación: estrellas, comentario, solo texto', async () => {
    const a = api({
      'GET /visitas/v1': {
        body: visita({
          estado: 'CERRADA',
          fin: '2026-10-23T15:30:00-05:00',
          cierre: 'SALIDA',
          acompanante: null,
        }),
      },
      'POST /visitas/v1/evaluacion': { body: { id: 'e1' } },
    });
    await renderSocio(<VisitFollowScreen id="v1" onBack={jest.fn()} />, a);
    expect(await screen.findByText('¿Cómo estuvo la visita?')).toBeTruthy();
    expect(screen.getByText('Laura Díaz salió a las 15:30')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pedir ayuda' })).toBeNull();
    expect(btn('Enviar evaluación')).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: '5 de 5 · El robot' }));
    await fireEvent.press(screen.getByRole('radio', { name: '4 de 5 · El club' }));
    await fireEvent.changeText(screen.getByLabelText('Comentario (opcional)'), 'Muy atento');
    await fireEvent.press(btn('Enviar evaluación'));
    expect(await screen.findByText('Gracias por tu opinión')).toBeTruthy();
    expect(a.calls.find((c) => c.path === '/visitas/v1/evaluacion')!.body).toEqual({
      robot: 5,
      club: 4,
      comentario: 'Muy atento',
    });
  });

  it('error al cargar: reintentar', async () => {
    let falla = true;
    await renderSocio(
      <VisitFollowScreen id="v1" onBack={jest.fn()} />,
      api({
        'GET /visitas/v1': () =>
          falla ? { status: 500, body: { error: 'x', detalle: 'Falló.' } } : { body: visita() },
      }),
    );
    expect(await screen.findByText('Falló.')).toBeTruthy();
    falla = false;
    await fireEvent.press(btn('Reintentar'));
    expect(await screen.findByText(/El robot la lleva/)).toBeTruthy();
  });
});

describe('Inicio y Visitas con visitas', () => {
  const propia = visita({
    id: 'v0',
    persona_id: 'sofia',
    nombre: 'Sofia Restrepo',
    invitacion_id: null,
    anfitrion_id: null,
    destino: 'Lounge VIP',
    actividad_id: 'act1',
  });
  const props = () => ({
    onInvitar: jest.fn(),
    onAbrir: jest.fn(),
    onVerAvisos: jest.fn(),
    onVerQr: jest.fn(),
    onVerVisita: jest.fn(),
  });

  it('arriba mi visita como una frase con su barra; los invitados dentro, en lista aparte', async () => {
    const h = props();
    await renderSocio(
      <HomeScreen {...h} />,
      api({ 'GET /visitas': { body: { items: [propia, visita()] } } }),
    );
    expect(await screen.findByText('Llegaste al club')).toBeTruthy();
    expect(screen.getByText('El robot te lleva al Lounge VIP.')).toBeTruthy();
    expect(screen.getByText('En el club')).toBeTruthy();
    expect(screen.queryByText('Mi visita de hoy')).toBeNull();
    expect(screen.queryByText('En camino')).toBeNull();
    await fireEvent.press(screen.getByRole('link', { name: /^Llegaste al club/ }));
    expect(h.onVerVisita).toHaveBeenCalledWith('v0');
    await fireEvent.press(screen.getByRole('link', { name: /^Laura Díaz\. En el club/ }));
    expect(h.onVerVisita).toHaveBeenCalledWith('v1');
  });

  it('sin visita propia, la del invitado que llegó es la tarjeta: «Laura Díaz llegó»', async () => {
    const h = props();
    await renderSocio(
      <HomeScreen {...h} />,
      api({ 'GET /visitas': { body: { items: [visita()] } } }),
    );
    expect(await screen.findByText('Laura Díaz llegó')).toBeTruthy();
    expect(await screen.findByText('El robot la lleva a la Sala de anfitriones.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: /^Laura Díaz llegó/ }));
    expect(h.onVerVisita).toHaveBeenCalledWith('v1');
    // she is the card, not also a row of Próximas
    expect(screen.queryByText('Hoy · 10:00')).toBeNull();
  });

  it('mi visita cerrada de hoy invita a evaluarla', async () => {
    const h = props();
    await renderSocio(
      <HomeScreen {...h} />,
      api({
        'GET /visitas': {
          body: {
            items: [
              { ...propia, estado: 'CERRADA', fin: '2026-10-23T14:55:00-05:00', acompanante: null },
            ],
          },
        },
      }),
    );
    expect(await screen.findByText('Tu visita terminó')).toBeTruthy();
    expect(screen.getByText('Cuéntanos cómo te fue.')).toBeTruthy();
  });

  it('Invitados: quien está en el club aparece una vez y abre el seguimiento', async () => {
    const onAbrirVisita = jest.fn();
    await renderSocio(
      <GuestsScreen onInvitar={jest.fn()} onAbrir={jest.fn()} onAbrirVisita={onAbrirVisita} />,
      api({
        'GET /invitaciones': { body: { items: [inv({ estado: 'LLEGO', fecha: '2026-10-23' })] } },
        'GET /visitas': {
          body: {
            items: [
              visita(),
              visita({
                id: 'v9',
                persona_id: 'x',
                estado: 'CERRADA',
                fin: '2026-10-22T10:00:00-05:00',
              }),
            ],
          },
        },
      }),
    );
    const fila = await screen.findByRole('link', { name: /Laura Díaz\. En el club/ });
    await fireEvent.press(fila);
    expect(onAbrirVisita).toHaveBeenCalledWith('v1');
    expect(screen.getAllByText('Laura Díaz')).toHaveLength(1);
    // the visit closed yesterday is not listed
    expect(screen.queryByText(/Evalúa la visita/)).toBeNull();
    expect(SOFIA.id).toBe('u-sofia');
  });
});

describe('Actividades', () => {
  it('lista del día con cupo, mi inscripción y abre el detalle', async () => {
    const onAbrir = jest.fn();
    const a = api({
      'GET /actividades': {
        body: {
          items: [
            actividad({
              id: 'b',
              nombre: 'Tenis',
              hora_desde: '17:00',
              inscritos: ['u-sofia'],
              cupo: 4,
            }),
            actividad(),
          ],
        },
      },
    });
    await renderSocio(<ActivitiesScreen onAbrir={onAbrir} />, a);
    expect(await screen.findByText('Cata de vinos')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Tenis.*inscrito/ })).toBeTruthy();
    expect(screen.getByText('Salón principal · 10 cupos libres')).toBeTruthy();
    // sorted by hour: tenis (17:00) before the cata (19:00)
    const filas = screen.getAllByRole('link').map((l) => l.props.accessibilityLabel as string);
    expect(filas[0]).toMatch(/^Tenis/);
    expect(a.calls.some((c) => c.path === '/actividades' && c.query === 'fecha=2026-10-23')).toBe(
      true,
    );
    await fireEvent.press(screen.getByRole('link', { name: /^Cata de vinos/ }));
    expect(onAbrir).toHaveBeenCalledWith('act1', '2026-10-23');
    await fireEvent.press(screen.getByRole('radio', { name: 'Mañana' }));
    await waitFor(() => expect(a.calls.some((c) => c.query === 'fecha=2026-10-24')).toBe(true));
  });

  it('vacío: mensaje y otro día', async () => {
    await renderSocio(
      <ActivitiesScreen onAbrir={jest.fn()} />,
      api({ 'GET /actividades': { body: { items: [] } } }),
    );
    expect(await screen.findByText(/No hay actividades este día/)).toBeTruthy();
  });

  it('detalle: inscribirme y cancelar la inscripción', async () => {
    let inscritos = ['u-x'];
    const a = api({
      'GET /actividades': () => ({ body: { items: [actividad({ inscritos })] } }),
      'POST /actividades/act1/inscripcion': () => {
        inscritos = ['u-x', 'u-sofia'];
        return { body: actividad({ inscritos }) };
      },
      'DELETE /actividades/act1/inscripcion': () => {
        inscritos = ['u-x'];
        return { body: actividad({ inscritos }) };
      },
    });
    await renderSocio(<ActivityDetailScreen id="act1" fecha="2026-10-23" onBack={jest.fn()} />, a);
    expect(await screen.findByText('1 de 12 inscritos · 11 cupos libres')).toBeTruthy();
    await fireEvent.press(btn('Inscribirme'));
    expect(await screen.findByText(/Quedaste inscrito/)).toBeTruthy();
    expect(screen.getByText('2 de 12 inscritos · 10 cupos libres')).toBeTruthy();
    await fireEvent.press(btn('Cancelar inscripción'));
    expect(await screen.findByText(/El cupo quedó libre/)).toBeTruthy();
    expect(btn('Inscribirme')).toBeTruthy();
  });

  it('detalle: con el cupo lleno el botón no deja inscribirse; terminada, tampoco', async () => {
    await renderSocio(
      <ActivityDetailScreen id="act1" fecha="2026-10-23" onBack={jest.fn()} />,
      api({ 'GET /actividades': { body: { items: [actividad({ cupo: 2 })] } } }),
    );
    expect(await screen.findByRole('button', { name: 'Cupo lleno' })).toBeDisabled();
  });

  it('detalle de una actividad que ya no existe', async () => {
    await renderSocio(
      <ActivityDetailScreen id="nope" fecha="2026-10-23" onBack={jest.fn()} />,
      api({ 'GET /actividades': { body: { items: [] } } }),
    );
    expect(await screen.findByText(/No encontramos esta actividad/)).toBeTruthy();
  });
});
