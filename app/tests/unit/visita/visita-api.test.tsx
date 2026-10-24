import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import type { PaseVista } from '@/club/types';
import { ClubApiError, type ClubClient } from '@/features/club/client';
import { Membresia } from '@/features/visita/Membresia';
import { PaseProvider, SONDEO_MS } from '@/features/visita/PaseContext';
import { VisitaApi, type ApiSection } from '@/features/visita/VisitaApi';
import { VisitaScreen } from '@/features/visita/VisitaScreen';
import { resolverVisita } from '@/features/visita/visita';
import { pase, visita } from './fixtures';

const QR = 'NCLUB1|invitado|inv-1|Laura Díaz|1793000000|a1b2c3d4e5f6a7b8c9d0';

type Fake = {
  pase: jest.Mock;
  pedirAyudaConPase: jest.Mock;
  evaluarConPase: jest.Mock;
  membresiaInfo: jest.Mock;
  solicitarMembresia: jest.Mock;
};
const fake = (datos?: PaseVista): Fake => ({
  pase: jest.fn().mockResolvedValue(datos ?? pase()),
  pedirAyudaConPase: jest.fn().mockResolvedValue({ id: 't1' }),
  evaluarConPase: jest.fn().mockResolvedValue({ id: 'e1' }),
  membresiaInfo: jest.fn().mockResolvedValue({
    niveles: [
      {
        nivel: 'VIP',
        beneficios: ['Salas privadas', 'Invitados prioritarios'],
        invitados_activos: 6,
      },
      { nivel: 'REGULAR', beneficios: ['Acceso al club'], invitados_activos: 3 },
    ],
  }),
  solicitarMembresia: jest.fn().mockResolvedValue({ id: 'm1' }),
});

const ir = jest.fn();
async function ver(c: Fake, section: ApiSection = 'inicio') {
  await render(
    <PaseProvider qr={QR} client={c as unknown as ClubClient}>
      <VisitaApi section={section} ir={ir} />
    </PaseProvider>,
  );
  await act(async () => {});
}

const recorrido = [
  { ts: '2026-10-24T15:05:00-05:00', tipo: 'LLEGADA', actor: 'x2-1', detalle: null },
  { ts: '2026-10-24T15:06:00-05:00', tipo: 'ASIGNADO', actor: 'x2-1', detalle: 'interno' },
] as const;

beforeEach(() => ir.mockClear());

const estrellas = (grupo: string, n: number) =>
  fireEvent.press(
    within(screen.getByLabelText(grupo)).getByRole('radio', {
      name: `${n} de 5`,
    }),
  );

describe('Mi visita y mi pase', () => {
  it('antes de llegar: saludo, QR del enlace para el robot y una línea con cuándo y dónde', async () => {
    const c = fake();
    await ver(c);
    expect(c.pase).toHaveBeenCalledWith(QR);
    expect(screen.getByRole('heading', { name: /^Bienvenida,\s+Laura$/ })).toBeTruthy();
    expect(screen.getByText(/^(Hoy|sáb 24 oct 2026) · 3:00.* · Terraza$/)).toBeTruthy();
    expect(screen.getByText('Muéstralo al robot en la entrada')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR de tu pase/ })).toBeTruthy();
    // Poca información: sin etiquetas de estado ni tarjetas de datos repetidas.
    expect(screen.queryByLabelText('Programada')).toBeNull();
    expect(screen.queryByText('Sofía Restrepo')).toBeNull();
  });

  it('el saludo respeta el trato de la invitación cuando el pase lo trae', async () => {
    const base = pase();
    const c = fake({ ...base, invitacion: { ...base.invitacion, trato: 'senora' } } as PaseVista);
    await ver(c);
    expect(screen.getByRole('heading', { name: /^Bienvenida,\s+Laura$/ })).toBeTruthy();
  });

  it('en el club: muestra quién acompaña y lleva al acompañamiento', async () => {
    await ver(fake(pase({ visita: visita({ recorrido: [...recorrido] }) })));
    expect(screen.queryByLabelText('En el club')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Te acompaña Robot R1/ }));
    expect(ir).toHaveBeenCalledWith('acompanamiento');
    await fireEvent.press(screen.getByRole('button', { name: 'Ver mi pase' }));
    expect(ir).toHaveBeenCalledWith('pase');
  });

  it('invitación cancelada: sin QR y con qué hacer', async () => {
    await ver(fake(pase({ invitacion: { ...pase().invitacion, estado: 'CANCELADA' } })));
    expect(screen.queryByRole('img', { name: /Código QR/ })).toBeNull();
    expect(screen.getByText('Invitación cancelada')).toBeTruthy();
  });

  it('Mi pase: el QR en grande y qué hacer con él', async () => {
    await ver(fake(), 'pase');
    expect(screen.getByRole('heading', { name: 'Mi pase' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR de tu pase/ })).toBeTruthy();
    expect(screen.getByText('Muéstralo al robot en la entrada')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(ir).toHaveBeenCalledWith('inicio');
  });
});

describe('errores del pase', () => {
  it.each([
    ['qr_invalido', 'Este enlace no es válido'],
    ['qr_vencido', 'Tu pase venció'],
  ])('%s: pantalla clara y sin reintentar', async (code, titulo) => {
    const c = fake();
    c.pase.mockRejectedValue(new ClubApiError(401, code, 'x'));
    await ver(c);
    expect(screen.getByText(titulo)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('sin conexión: reintenta con el botón', async () => {
    const c = fake();
    c.pase.mockRejectedValueOnce(new ClubApiError(0, 'sin_conexion', 'Sin conexión'));
    await ver(c);
    expect(screen.getByText('Sin conexión')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByRole('heading', { name: /^Bienvenida,\s+Laura$/ })).toBeTruthy();
  });

  it('si falla un sondeo con datos a la vista, los conserva con un aviso', async () => {
    jest.useFakeTimers();
    try {
      const c = fake(pase({ visita: visita({ recorrido: [...recorrido] }) }));
      await ver(c);
      c.pase.mockRejectedValue(new ClubApiError(0, 'sin_conexion', 'Sin conexión'));
      await act(async () => {
        jest.advanceTimersByTime(SONDEO_MS);
      });
      expect(screen.getByText(/Mostramos lo último que supimos/)).toBeTruthy();
      expect(screen.getByRole('heading', { name: /^Hola,\s+Laura$/ })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('sondeo', () => {
  it('cada 5 s con la visita abierta y se detiene al cerrarse', async () => {
    jest.useFakeTimers();
    try {
      const c = fake(pase({ visita: visita({ recorrido: [...recorrido] }) }));
      await ver(c);
      expect(c.pase).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(SONDEO_MS);
      });
      expect(c.pase).toHaveBeenCalledTimes(2);
      c.pase.mockResolvedValue(
        pase({ visita: visita({ estado: 'CERRADA', fin: '2026-10-24T17:00:00-05:00' }) }),
      );
      await act(async () => {
        jest.advanceTimersByTime(SONDEO_MS);
      });
      expect(c.pase).toHaveBeenCalledTimes(3);
      await act(async () => {
        jest.advanceTimersByTime(SONDEO_MS * 4);
      });
      expect(c.pase).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Mi acompañamiento', () => {
  it('sin visita: aún no estás en el club', async () => {
    await ver(fake(), 'acompanamiento');
    expect(screen.getByText('Aún no estás en el club')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pedir ayuda' })).toBeNull();
  });

  it('muestra acompañante, destino y recorrido; sin el detalle interno', async () => {
    await ver(fake(pase({ visita: visita({ recorrido: [...recorrido] }) })), 'acompanamiento');
    expect(screen.getByText('Te acompaña el robot')).toBeTruthy();
    expect(screen.getByText('Robot R1')).toBeTruthy();
    expect(screen.getByText('Destino: Terraza')).toBeTruthy();
    expect(screen.getByText('Llegaste al club')).toBeTruthy();
    expect(screen.getByText('Te asignamos un acompañante')).toBeTruthy();
    expect(screen.queryByText('interno')).toBeNull();
  });

  it('Pedir ayuda envía el motivo con el QR y confirma', async () => {
    const c = fake(pase({ visita: visita({ recorrido: [...recorrido] }) }));
    await ver(c, 'acompanamiento');
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir ayuda' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Me perdí' }));
    await fireEvent.changeText(screen.getByLabelText('Cuéntanos más (opcional)'), 'junto al lobby');
    await fireEvent.press(screen.getByRole('button', { name: 'Avisar al equipo' }));
    expect(c.pedirAyudaConPase).toHaveBeenCalledWith(QR, 'Me perdí: junto al lobby');
    expect(screen.getByText('Avisamos al equipo')).toBeTruthy();
    expect(c.pase.mock.calls.length).toBeGreaterThan(1); // recarga el recorrido
  });

  it('si falla, deja el formulario y explica', async () => {
    const c = fake(pase({ visita: visita() }));
    c.pedirAyudaConPase.mockRejectedValue(new ClubApiError(500, 'error', 'Intenta en un momento.'));
    await ver(c, 'acompanamiento');
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir ayuda' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Avisar al equipo' }));
    expect(screen.getByText('Intenta en un momento.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Avisar al equipo' })).toBeTruthy();
  });

  it('cambio de acompañante: aviso claro con el nombre', async () => {
    const v = visita({
      acompanante: { tipo: 'HUMANO', id: 'u-mateo', nombre: 'Mateo' },
      recorrido: [
        ...recorrido,
        {
          ts: '2026-10-24T15:20:00-05:00',
          tipo: 'ENTREGA_CONFIRMADA',
          actor: 'u-mateo',
          detalle: null,
        },
      ],
    });
    await ver(fake(pase({ visita: v })), 'acompanamiento');
    expect(screen.getByText('Ahora te acompaña Mateo')).toBeTruthy();
    expect(screen.getByText('Te acompaña un edecán')).toBeTruthy();
  });

  it('relevo en curso: pide quedarse donde está', async () => {
    const v = visita({
      estado: 'EN_RELEVO',
      recorrido: [
        ...recorrido,
        {
          ts: '2026-10-24T15:20:00-05:00',
          tipo: 'RELEVO_SOLICITADO',
          actor: 'x2-1',
          detalle: null,
        },
      ],
    });
    await ver(fake(pase({ visita: v })), 'acompanamiento');
    expect(screen.getByText('Cambio de acompañante')).toBeTruthy();
    expect(screen.getByText(/Quédate donde estás/)).toBeTruthy();
  });

  it('en destino: el acompañamiento terminó', async () => {
    await ver(fake(pase({ visita: visita({ estado: 'EN_DESTINO' }) })), 'acompanamiento');
    expect(screen.getByText('Llegaste a Terraza')).toBeTruthy();
    expect(screen.queryByText('Te acompaña el robot')).toBeNull();
  });
});

describe('Actividades y mapa', () => {
  it('lista las actividades del pase sin inscripción propia', async () => {
    const a = {
      id: 'a1',
      nombre: 'Cata de vinos',
      descripcion: 'Con sommelier',
      lugar: 'Salón principal',
      fecha: '2026-10-24',
      hora_desde: '19:00',
      hora_hasta: '20:00',
      cupo: 10,
      inscritos: ['vis-1'],
      robot_puede_ofrecer: true,
    };
    await ver(fake(pase({ visita: visita(), actividades: [a] })), 'actividades');
    expect(screen.getByText('Cata de vinos')).toBeTruthy();
    expect(screen.getByText('Inscrito')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Inscribirme/ })).toBeNull();
  });

  it('sin actividades: dice qué hacer', async () => {
    await ver(fake(), 'actividades');
    expect(screen.getByText('Hoy no hay actividades abiertas')).toBeTruthy();
  });

  it('encuentro: punto acordado y ubicación compartida por el anfitrión', async () => {
    const v = visita({
      punto_encuentro: 'Terraza, mesa 4',
      ubicacion_anfitrion: 'Barra del segundo piso',
    });
    await ver(fake(pase({ visita: v })), 'mapa');
    expect(screen.getByRole('heading', { name: 'Encuentro con Sofía' })).toBeTruthy();
    expect(screen.getByText('Terraza, mesa 4')).toBeTruthy();
    expect(screen.getByText('Barra del segundo piso')).toBeTruthy();
    expect(screen.getByText('Tu destino · Piso 1')).toBeTruthy();
  });

  it('encuentro: si el anfitrión no comparte su ubicación, lo dice', async () => {
    await ver(fake(pase({ visita: visita() })), 'mapa');
    expect(screen.getByText('Lo acuerdas con tu anfitrión')).toBeTruthy();
    expect(screen.queryByText(/está en$/)).toBeNull();
  });
});

describe('Evaluación al salir', () => {
  const cerrada = pase({
    visita: visita({ estado: 'CERRADA', fin: '2026-10-24T17:00:00-05:00', cierre: 'SALIDA' }),
  });

  it('exige las dos calificaciones y envía con el QR', async () => {
    const c = fake(cerrada);
    await ver(c);
    expect(screen.getByRole('heading', { name: '¿Cómo estuvo su visita?' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(screen.getByText(/Elige de 1 a 5 estrellas/)).toBeTruthy();
    expect(c.evaluarConPase).not.toHaveBeenCalled();

    const robot = screen.getByLabelText('El robot que te acompañó');
    await fireEvent.press(within(robot).getByRole('radio', { name: '5 de 5' }));
    const club = screen.getByLabelText('El club');
    await fireEvent.press(within(club).getByRole('radio', { name: '4 de 5' }));
    await fireEvent.changeText(screen.getByLabelText('Comentario (opcional)'), 'Todo muy amable');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(c.evaluarConPase).toHaveBeenCalledWith(QR, {
      robot: 5,
      club: 4,
      comentario: 'Todo muy amable',
    });
    expect(screen.getByText(/^Gracias,\s+Laura$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Conocer la membresía' }));
    expect(ir).toHaveBeenCalledWith('membresia');
  });

  it('si ya evaluó (409) también cierra con gracias', async () => {
    const c = fake(cerrada);
    c.evaluarConPase.mockRejectedValue(new ClubApiError(409, 'ya_evaluada', 'Ya evaluaste'));
    await ver(c);
    await estrellas('El robot que te acompañó', 3);
    await estrellas('El club', 3);
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(screen.getByText(/^Gracias,\s+Laura$/)).toBeTruthy();
  });
});

describe('Membresía', () => {
  it('muestra niveles, valida y envía la solicitud', async () => {
    const c = fake();
    const volver = jest.fn();
    await render(
      <Membresia client={c as unknown as ClubClient} nombreInicial="Laura Díaz" onBack={volver} />,
    );
    await screen.findByText('Socio VIP');
    expect(screen.getByText('Salas privadas')).toBeTruthy();
    expect(screen.getByText('Socio Regular')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(/Correo/), 'sin-arroba');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(screen.getByText('Escribe un correo válido.')).toBeTruthy();
    expect(c.solicitarMembresia).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText(/Correo/), 'laura@correo.co');
    await fireEvent.press(screen.getByRole('tab', { name: 'Familiar' }));
    await fireEvent.changeText(screen.getByLabelText('Teléfono (opcional)'), '3001234567');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(c.solicitarMembresia).toHaveBeenCalledWith({
      nombre: 'Laura Díaz',
      email: 'laura@correo.co',
      telefono: '3001234567',
      interes: 'familiar',
      mensaje: null,
    });
    expect(screen.getByText('Recibimos tu solicitud')).toBeTruthy();
  });

  it('si no cargan los niveles, ofrece reintentar', async () => {
    const c = fake();
    c.membresiaInfo.mockRejectedValueOnce(new Error('x'));
    await render(<Membresia client={c as unknown as ClubClient} onBack={jest.fn()} />);
    await screen.findByText('No pudimos cargar los niveles');
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('Socio VIP')).toBeTruthy();
  });
});

describe('modo de demostración', () => {
  it('el perfil del invitado de ejemplo también lleva a la membresía', async () => {
    const abrir = jest.fn();
    await render(
      <VisitaScreen
        visita={resolverVisita({ tipo: 'invitado' }, Date.now())}
        now={Date.now()}
        section="perfil"
        onMembership={abrir}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: /Membresía/ }));
    expect(abrir).toHaveBeenCalled();
  });
});
