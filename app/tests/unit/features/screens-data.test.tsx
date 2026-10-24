// Pantallas conectadas a la API v1 (`createApp` en memoria detrás de `clientFor`).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { copyText } from '@/features/shared/clipboard';
import { ActivitiesPage } from '@/features/pages/ActivitiesPage';
import { InvitePage } from '@/features/pages/InvitePage';
import { MemberPage } from '@/features/pages/MemberPage';
import { PassPage } from '@/features/pages/PassPage';
import { StaffPage } from '@/features/pages/StaffPage';
import { HomeScreen } from '@/features/screens/HomeScreen';

import { advanceClock, failOn, freshApi, testClient } from '../../support/demo-api';

jest.mock('@/features/data/api', () => ({
  ...jest.requireActual('@/features/data/api'),
  clientFor: (actor?: string) => jest.requireActual('../../support/demo-api').testClient(actor),
}));
jest.mock('@/features/shared/clipboard', () => ({ copyText: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockDimensions = jest.requireMock<{ default: jest.Mock }>(
  'react-native/Libraries/Utilities/useWindowDimensions',
).default;
const viewport = (width: number) =>
  mockDimensions.mockReturnValue({ width, height: 900, scale: 1, fontScale: 1 });

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const PASS_HREF = /^\/pase\/nq_[A-Za-z0-9_-]{22}$/;
const SIM = { source: { kind: 'SIMULATOR', id: 'R1' } } as const;

beforeEach(() => {
  viewport(375);
  freshApi();
  jest.mocked(copyText).mockReset().mockResolvedValue(true);
});

const invite = (hostId = 'V-202', fullName = 'Sebastián Lozano', date = '2026-10-24') =>
  testClient(hostId).createInvitation({
    hostId,
    guest: { fullName, note: 'Café sin azúcar' },
    meetingPoint: 'Cancha de tenis',
    date,
  });

describe('HomeScreen con datos reales', () => {
  it('carga los cinco perfiles del directorio, el modo y la fecha de trabajo', async () => {
    await render(<HomeScreen onNavigate={jest.fn()} />);
    for (const label of [
      'Sofía, Socio VIP',
      'Camila, Socia regular',
      'Mario, Personal del club',
      'Sofía, Edecán',
      'Robot R1, Recepción',
    ]) {
      expect(await screen.findByRole('link', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('heading', { name: '¿Quién eres hoy?' })).toBeTruthy();
    await press('Ajustes');
    expect(await screen.findByText('Fecha de trabajo: Sábado 24 oct 2026')).toBeTruthy();
    expect(screen.getByText(/Datos en este navegador · almacenamiento/)).toBeTruthy();
    expect(screen.getByText('Sin visitas en curso')).toBeTruthy();
  });

  it('organiza el selector en visitantes (las cinco categorías) y operación del club', async () => {
    const onNavigate = jest.fn();
    await render(<HomeScreen onNavigate={onNavigate} />);
    await screen.findByRole('link', { name: 'Robot R1, Recepción' });
    expect(screen.getByRole('heading', { name: 'Visitantes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Operación del club' })).toBeTruthy();
    const visitors = screen.getByLabelText('Visitantes');
    const operation = screen.getByLabelText('Operación del club');
    expect(
      within(visitors)
        .getAllByRole('link')
        .map((l) => l.props.accessibilityLabel),
    ).toEqual([
      'Sofía, Socio VIP',
      'Camila, Socia regular',
      'Invitado, pase sin cuenta',
      'Mario, Personal del club',
      'Trabajador externo, pase de servicio sin cuenta',
    ]);
    expect(
      within(operation)
        .getAllByRole('link')
        .map((l) => l.props.accessibilityLabel),
    ).toEqual([
      'Concierge, Llegadas y atención de salas',
      'Sofía, Edecán',
      'Robot R1, Recepción',
      'Administración, Administración',
    ]);
    await fireEvent.press(screen.getByRole('link', { name: 'Invitado, pase sin cuenta' }));
    await fireEvent.press(
      screen.getByRole('link', { name: 'Trabajador externo, pase de servicio sin cuenta' }),
    );
    await fireEvent.press(
      screen.getByRole('link', { name: 'Concierge, Llegadas y atención de salas' }),
    );
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual([
      '/visita?tipo=invitado',
      '/visita?tipo=externo',
      '/entrar?cuenta=concierge@nclub.demo',
    ]);
    await fireEvent.press(screen.getByRole('link', { name: 'Administración, Administración' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/entrar?cuenta=admin@nclub.demo');
    await fireEvent.press(screen.getByRole('link', { name: 'Camila, Socia regular' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/entrar?cuenta=camila@nclub.demo');
    await press('Volver a la bienvenida');
    expect(onNavigate).toHaveBeenLastCalledWith('/entrar');
  });

  it('cuenta las visitas en curso', async () => {
    await testClient('R1').createRecognitionEvent({
      ...SIM,
      face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-201', confidence: 0.97 },
    });
    await render(<HomeScreen onNavigate={jest.fn()} />);
    await press('Ajustes');
    expect(await screen.findByText(/visitas? en curso/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/^[1-9]\d* visitas? en curso$/)).toBeTruthy());
  });

  it('abre cada perfil y lleva la fecha elegida al reiniciar con martes', async () => {
    const onNavigate = jest.fn();
    await render(<HomeScreen onNavigate={onNavigate} />);
    await screen.findByRole('link', { name: 'Mario, Personal del club' });
    await press('Ajustes');
    await fireEvent.press(screen.getByRole('radio', { name: 'Martes 27 oct 2026' }));
    expect(await screen.findByText('Fecha de trabajo: Martes 27 oct 2026.')).toBeTruthy();
    expect((await testClient().getHealth()).clock.now).toBe('2026-10-27T09:00:00-05:00');
    expect(await screen.findByText('Fecha de trabajo: Martes 27 oct 2026')).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'Martes 27 oct 2026' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole('link', { name: 'Mario, Personal del club' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Sofía, Socio VIP' }));
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual([
      '/entrar?cuenta=personal@nclub.demo&fecha=2026-10-27',
      '/entrar?cuenta=sofia@nclub.demo&fecha=2026-10-27',
    ]);
  });

  it('pide confirmación, borra los datos y vuelve al sábado', async () => {
    await invite('V-201', 'Valentina');
    await render(<HomeScreen onNavigate={jest.fn()} />);
    await screen.findByRole('link', { name: 'Mario, Personal del club' });
    await press('Ajustes');
    await fireEvent.press(screen.getByRole('radio', { name: 'Martes 27 oct 2026' }));
    await screen.findByText('Fecha de trabajo: Martes 27 oct 2026.');
    await press('Reiniciar datos');
    expect(screen.getByText('¿Reiniciar los datos?')).toBeTruthy();
    await press('Cancelar');
    expect(screen.queryByText(/Datos reiniciados/)).toBeNull();
    await press('Reiniciar datos');
    await press('Reiniciar');
    expect(await screen.findByText('Datos reiniciados.')).toBeTruthy();
    expect((await testClient('V-201').listInvitations({ hostId: 'V-201' })).count).toBe(0);
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Sábado 24 oct 2026' }).props.accessibilityState,
      ).toMatchObject({ checked: true }),
    );
  });

  it('abre el pase de ejemplo de la invitación real que deja el reinicio', async () => {
    const onNavigate = jest.fn();
    await render(<HomeScreen onNavigate={onNavigate} />);
    await press('Llegan como visitas');
    expect(await screen.findByText('Valentina · pase de invitado')).toBeTruthy();
    await press('Abrir su pase');
    expect(onNavigate).toHaveBeenCalledWith(expect.stringMatching(PASS_HREF));
  });

  it('muestra el error del servicio al reiniciar sin perder los controles', async () => {
    await render(<HomeScreen onNavigate={jest.fn()} />);
    await screen.findByRole('link', { name: 'Sofía, Socio VIP' });
    failOn('POST', /demo\/reset/, 1, { status: 429, code: 'RATE_LIMITED' });
    await press('Ajustes');
    await press('Reiniciar datos');
    await press('Reiniciar');
    expect(await screen.findByText('Código: RATE_LIMITED')).toBeTruthy();
    expect(screen.queryByText(/Datos reiniciados/)).toBeNull();
  });

  it('muestra un error recuperable si el directorio no carga', async () => {
    failOn('GET', /\/people/, 1);
    await render(<HomeScreen onNavigate={jest.fn()} />);
    expect(await screen.findByText('Código: DEMO_DATA_UNAVAILABLE')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '¿Quién eres hoy?' })).toBeTruthy();
    await press('Recargar');
    expect(await screen.findByRole('link', { name: 'Sofía, Socio VIP' })).toBeTruthy();
  });
});

describe('MemberPage', () => {
  const setup = (perfil?: string) => {
    const props = {
      perfil,
      onInvite: jest.fn(),
      onViewActivities: jest.fn(),
      onOpenPass: jest.fn(),
    };
    return props;
  };

  it('saluda a la socia, con su categoría, destino habitual y actividades del día', async () => {
    const props = setup('V-202');
    await render(<MemberPage {...props} />);
    expect(await screen.findByRole('heading', { name: 'Buenos días, Camila' })).toBeTruthy();
    expect(await screen.findByText('Socio regular')).toBeTruthy();
    expect(screen.getByText('V-202')).toBeTruthy();
    expect(await screen.findByText('Tu destino habitual: Cancha de tenis')).toBeTruthy();
    expect(await screen.findByText('Aún no has invitado a nadie.')).toBeTruthy();
    expect(await screen.findByText('Clase abierta de tenis')).toBeTruthy();
    expect(screen.getByText('Cancha de tenis · 9:30 a. m.')).toBeTruthy();
    expect(screen.getByText('Yoga en la terraza')).toBeTruthy();
    await press('Invitar a alguien');
    await press('Ver actividades');
    expect(props.onInvite).toHaveBeenCalledWith('V-202');
    expect(props.onViewActivities).toHaveBeenCalledTimes(1);
  });

  it('usa a Andrés con un perfil desconocido y saluda según la hora de la demostración', async () => {
    await testClient('O-01').resetDemo({ now: '2026-10-24T14:30:00-05:00' });
    await render(<MemberPage {...setup('V-204')} />);
    expect(await screen.findByRole('heading', { name: 'Buenas tardes, Andrés' })).toBeTruthy();
    expect(await screen.findByText('Socio VIP')).toBeTruthy();
  });

  it('lista las invitaciones reales con su estado y abre el pase con el token real', async () => {
    const created = await invite();
    await invite('V-201', 'Otra persona');
    const props = setup('V-202');
    await render(<MemberPage {...props} />);
    expect(await screen.findByText('Sebastián Lozano')).toBeTruthy();
    expect(screen.getByText('Vigente')).toBeTruthy();
    expect(screen.getByText('sáb 24 oct 2026 · Cancha de tenis')).toBeTruthy();
    expect(screen.queryByText('Otra persona')).toBeNull();
    await press('Ver pase de Sebastián Lozano');
    expect(props.onOpenPass).toHaveBeenCalledWith(`/pase/${created.qr.token}`);
  });

  it('cancela una invitación vigente tras confirmar y la muestra cancelada', async () => {
    const created = await invite();
    await render(<MemberPage {...setup('V-202')} />);
    await screen.findByText('Sebastián Lozano');
    await press('Cancelar invitación de Sebastián Lozano');
    expect(screen.getByText('¿Cancelar la invitación de Sebastián Lozano?')).toBeTruthy();
    await press('Mantenerla');
    expect((await testClient('V-202').getInvitation(created.id)).state).toBe('ACTIVE');
    await press('Cancelar invitación de Sebastián Lozano');
    await press('Cancelar invitación');
    expect(await screen.findByText('Invitación de Sebastián Lozano cancelada.')).toBeTruthy();
    expect(await screen.findByText('Cancelada')).toBeTruthy();
    expect((await testClient('V-202').getInvitation(created.id)).state).toBe('CANCELLED');
    expect(screen.queryByRole('button', { name: /Cancelar invitación de/ })).toBeNull();
  });

  it('muestra el error del contrato si la invitación ya no se puede cancelar', async () => {
    const created = await invite();
    await render(<MemberPage {...setup('V-202')} />);
    await screen.findByText('Sebastián Lozano');
    await testClient('R1').verifyAccess({ token: created.qr.token });
    await press('Cancelar invitación de Sebastián Lozano');
    await press('Cancelar invitación');
    expect(
      await screen.findByText('Esta invitación ya se usó o venció, así que no se puede cancelar.'),
    ).toBeTruthy();
    expect(screen.getByText('Código: INVITATION_NOT_ACTIVE')).toBeTruthy();
    expect(await screen.findByText('Usada')).toBeTruthy();
  });

  it('muestra la visita en curso con su responsable', async () => {
    const api = testClient('R1');
    const { visit } = await api.createRecognitionEvent({
      ...SIM,
      face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-201', confidence: 0.97 },
    });
    await api.advanceVisit(visit.id, { event: 'START_ORIENTATION' });
    await render(<MemberPage {...setup()} />);
    expect(await screen.findByText('Orientando')).toBeTruthy();
    expect(screen.getByText('Te atiende R1')).toBeTruthy();
  });

  it('ofrece evaluar una visita cerrada y envía la evaluación al servicio', async () => {
    const api = testClient('R1');
    const { visit } = await api.createRecognitionEvent({
      ...SIM,
      face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-202', confidence: 0.97 },
    });
    await api.closeVisit(visit.id);
    await render(<MemberPage {...setup('V-202')} />);
    expect(await screen.findByText('¿Cómo te fue hoy?')).toBeTruthy();
    expect(screen.getByText(/No tienes una visita en curso/)).toBeTruthy();
    await press('Evaluar mi visita');
    await fireEvent.press(screen.getByRole('radio', { name: 'Servicios del club: 5 · Muy bueno' }));
    failOn('POST', /feedback/, 1);
    await press('Enviar evaluación');
    expect(await screen.findByText('Código: NETWORK_ERROR')).toBeTruthy();
    expect(screen.queryByText('Gracias. Tu evaluación quedó registrada.')).toBeNull();
    await press('Enviar evaluación');
    expect(await screen.findByText('Gracias. Tu evaluación quedó registrada.')).toBeTruthy();
    expect((await api.getVisit(visit.id)).feedbackSubmitted).toBe(true);
  });

  it('confina un fallo a su tarjeta y se recupera al reintentar', async () => {
    failOn('GET', /\/activities/, 1);
    await render(<MemberPage {...setup()} />);
    expect(await screen.findByText('Código: NETWORK_ERROR')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invitar a alguien' })).toBeTruthy();
    await press('Reintentar');
    expect(await screen.findByText('Yoga en la terraza')).toBeTruthy();
    expect(screen.queryByText('Código: NETWORK_ERROR')).toBeNull();
  });

  it('muestra un error de pantalla completa si no carga la persona', async () => {
    failOn('GET', /\/people\/V-201/, 1);
    await render(<MemberPage {...setup()} />);
    expect(await screen.findByText('Código: NETWORK_ERROR')).toBeTruthy();
    await press('Reintentar');
    expect(await screen.findByRole('heading', { name: /Andrés/ })).toBeTruthy();
  });
});

describe('InvitePage', () => {
  const setup = () => ({ perfil: 'V-202', onBack: jest.fn(), onOpenPass: jest.fn() });
  const fill = async (name: string) => {
    await fireEvent.changeText(await screen.findByLabelText('Nombre de tu invitado'), name);
    await press('Crear invitación');
  };

  it('crea la invitación real, muestra el pase con QR y abre el enlace con el token real', async () => {
    const props = setup();
    await render(<InvitePage {...props} />);
    expect((await screen.findByLabelText('Fecha de la visita')).props.value).toBe('2026-10-24');
    await fireEvent.changeText(screen.getByLabelText('Bebida preferida (opcional)'), 'Agua');
    await fill('Sebastián Lozano');
    expect(await screen.findByText('Invitación creada para Sebastián.')).toBeTruthy();
    expect(screen.getByText('Invitación de Camila')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR/ })).toBeTruthy();
    const [created] = (await testClient('V-202').listInvitations({ hostId: 'V-202' })).items;
    expect(created).toMatchObject({
      guest: { fullName: 'Sebastián Lozano', note: 'Agua' },
      meetingPoint: 'Terraza',
      date: '2026-10-24',
      state: 'ACTIVE',
    });
    await press('Ver pase');
    expect(props.onOpenPass).toHaveBeenCalledWith(`/pase/${created!.qr.token}`);
    await press('Copiar enlace del pase');
    expect(copyText).toHaveBeenCalledWith(`/pase/${created!.qr.token}`);
  });

  it('dice que ya existe la invitación y conserva lo escrito', async () => {
    await invite('V-202', 'Sebastián Lozano');
    await render(<InvitePage {...setup()} />);
    await fill('sebastian  lozano');
    expect(
      await screen.findByText('Ya existe una invitación para este invitado en esa fecha.'),
    ).toBeTruthy();
    expect(screen.getByText('Código: INVITATION_DUPLICATE')).toBeTruthy();
    expect(screen.getByLabelText('Nombre de tu invitado').props.value).toBe('sebastian  lozano');
  });

  it('dice que se alcanzó el límite diario con el contrato real', async () => {
    for (const n of ['Ana', 'Beto', 'Carla', 'Diego', 'Elena']) await invite('V-202', n);
    await render(<InvitePage {...setup()} />);
    await fill('Fabián');
    expect(await screen.findByText(/Ya tienes 5 invitaciones para esa fecha/)).toBeTruthy();
    expect(screen.getByText('Código: INVITATION_DAILY_LIMIT')).toBeTruthy();
  });

  it('corrige una fecha pasada antes de enviar, sin crear nada', async () => {
    await render(<InvitePage {...setup()} />);
    await fireEvent.changeText(await screen.findByLabelText('Fecha de la visita'), '2026-10-20');
    await fill('Sebastián');
    expect(await screen.findByText('Elige una fecha desde hoy en adelante.')).toBeTruthy();
    expect((await testClient('V-202').listInvitations({ hostId: 'V-202' })).count).toBe(0);
  });

  it.each([
    ['INVITATION_DATE_IN_PAST', 422, 'Esa fecha ya pasó. Elige una fecha desde hoy en adelante.'],
    ['VALIDATION_ERROR', 422, 'Alguno de los datos no es válido. Revísalos e inténtalo de nuevo.'],
    ['HOST_NOT_ELIGIBLE', 403, 'Solo los socios con membresía vigente pueden invitar.'],
  ])('muestra %s con su mensaje y deja reintentar', async (code, status, text) => {
    await render(<InvitePage {...setup()} />);
    await screen.findByLabelText('Nombre de tu invitado');
    failOn('POST', /\/invitations$/, 1, { status, code });
    await fill('Sebastián');
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByText(`Código: ${code}`)).toBeTruthy();
    await press('Crear invitación');
    expect(await screen.findByText('Invitación creada para Sebastián.')).toBeTruthy();
  });

  it('muestra un error recuperable si no hay reloj y luego el formulario', async () => {
    failOn('GET', /\/health/, 1);
    await render(<InvitePage {...setup()} />);
    expect(await screen.findByText('Código: NETWORK_ERROR')).toBeTruthy();
    await press('Reintentar');
    expect(await screen.findByLabelText('Nombre de tu invitado')).toBeTruthy();
  });
});

describe('PassPage', () => {
  it('muestra el pase vigente con el QR real y sin datos del invitado más allá de su nombre', async () => {
    const created = await invite();
    await render(<PassPage token={created.qr.token} />);
    expect(await screen.findByText('Hola, Sebastián')).toBeTruthy();
    expect(screen.getByText('Vigente')).toBeTruthy();
    expect(screen.getByText('Invitación de Camila')).toBeTruthy();
    expect(screen.getByText('Punto de encuentro: Cancha de tenis')).toBeTruthy();
    expect(screen.getByText('Válido el sáb 24 oct 2026')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR de tu pase/ })).toBeTruthy();
    expect(screen.queryByText(/Lozano/)).toBeNull();
    expect(screen.queryByText(/Café sin azúcar/)).toBeNull();
    await press('Copiar enlace');
    expect(await screen.findByText('Enlace copiado.')).toBeTruthy();
  });

  it.each([
    ['con el token manipulado', (t: string) => `${t.slice(0, -1)}${t.endsWith('A') ? 'B' : 'A'}`],
    ['con un token bien formado pero desconocido', () => 'nq_AAAAAAAAAAAAAAAAAAAAAA'],
    ['con un token mal formado', () => 'nq_corto'],
  ])('trata un enlace %s como «No válido»', async (_name, link) => {
    const created = await invite();
    await render(<PassPage token={link(created.qr.token)} />);
    expect(await screen.findByText('No válido')).toBeTruthy();
    expect(screen.getByText('No encontramos este pase.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/Hola,/)).toBeNull();
  });

  it('muestra cancelado, usado, vencido y aún no válido según el estado real', async () => {
    const cancelled = await invite('V-202', 'Ana');
    await testClient('V-202').cancelInvitation(cancelled.id);
    const used = await invite('V-202', 'Beto');
    await testClient('R1').verifyAccess({ token: used.qr.token });
    const future = await invite('V-202', 'Carla', '2026-10-25');
    const expiring = await invite('V-202', 'Diego');
    const cases: [typeof cancelled, string, string][] = [
      [cancelled, 'Cancelado', 'Tu anfitrión canceló esta invitación.'],
      [
        used,
        'Usado',
        'Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.',
      ],
      [future, 'Aún no válido', 'Este pase aún no es válido. Será válido el dom 25 oct 2026.'],
    ];
    for (const [inv, badge, text] of cases) {
      const view = await render(<PassPage token={inv.qr.token} />);
      expect(await screen.findByText(badge)).toBeTruthy();
      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.queryByRole('img')).toBeNull();
      await view.unmount();
    }
    advanceClock(14 * 3_600_000);
    await render(<PassPage token={expiring.qr.token} />);
    expect(await screen.findByText('Vencido')).toBeTruthy();
    expect(screen.getByText('Código: QR_EXPIRED')).toBeTruthy();
  });

  it('explica el fallo al comprobar y se recupera al reintentar', async () => {
    const created = await invite();
    failOn('GET', /\/passes\//, 1);
    await render(<PassPage token={created.qr.token} />);
    expect(await screen.findByText('No pudimos comprobar tu pase.')).toBeTruthy();
    await press('Reintentar');
    expect(await screen.findByText('Hola, Sebastián')).toBeTruthy();
  });

  it('conserva el pase visible y avisa si se pierde la conexión al refrescar', async () => {
    const created = await invite();
    await render(<PassPage token={created.qr.token} />);
    await screen.findByText('Hola, Sebastián');
    failOn('GET', /\/passes\//, 1);
    // Otra pestaña escribió: el gancho de datos vuelve a consultar.
    const other = new BroadcastChannel('cerberus');
    await act(async () => other.postMessage({ type: 'write' }));
    other.close();
    expect(
      await screen.findByText('Sin conexión: la validez se comprobará en recepción.'),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR/ })).toBeTruthy();
  });
});

describe('StaffPage', () => {
  const setup = () => ({ onViewActivities: jest.fn() });

  it('muestra el turno y la agenda de Mario y a Laura autorizada el sábado', async () => {
    const props = setup();
    await render(<StaffPage {...props} />);
    expect(await screen.findByRole('heading', { name: 'Hola, Mario' })).toBeTruthy();
    expect(await screen.findByText('Operaciones · turno de 8:00 a. m. a 8:00 p. m.')).toBeTruthy();
    expect(screen.getByText('Credencial vigente')).toBeTruthy();
    expect(screen.getByText('Laura · Mantenimientos Andinos')).toBeTruthy();
    expect(screen.getByText('Autorizada hoy')).toBeTruthy();
    expect(screen.queryByText('Resumen recibido desde recepción.')).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.getByText('8:00 a. m.')).toBeTruthy();
    expect(screen.getByText('8:00 p. m.')).toBeTruthy();
    await press('Ver actividades de hoy');
    expect(props.onViewActivities).toHaveBeenCalledTimes(1);
  });

  it('el martes no hay turno ni permiso: lo dice con los códigos estables', async () => {
    await testClient('O-01').resetDemo({ now: '2026-10-27T09:00:00-05:00' });
    await render(<StaffPage {...setup()} />);
    expect(await screen.findByText('No autorizada hoy')).toBeTruthy();
    expect(screen.getByText(/hoy es martes\. Código: EXTERNAL_DAY_NOT_ALLOWED/)).toBeTruthy();
    expect(
      screen.getByText(
        'Tu credencial está activa, pero no veo un turno para hoy. Recepción puede confirmarlo.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.getByText('No tienes eventos hoy.')).toBeTruthy();
  });

  it('muestra las visitas de externos y la propia con su estado, y el resumen en orientación', async () => {
    const api = testClient('R1');
    await api.createRecognitionEvent({
      ...SIM,
      face: { status: 'MATCH', classHint: 'NON_MEMBER', candidateId: 'V-205', confidence: 0.95 },
    });
    const { visit } = await api.createRecognitionEvent({
      ...SIM,
      face: { status: 'MATCH', classHint: 'NON_MEMBER', candidateId: 'V-204', confidence: 0.95 },
    });
    await render(<StaffPage {...setup()} />);
    expect(await screen.findByText(/En el club · Confirmada/)).toBeTruthy();
    expect(screen.queryByText('Resumen recibido desde recepción.')).toBeNull();
    await api.advanceVisit(visit.id, { event: 'START_ORIENTATION' });
    const other = new BroadcastChannel('cerberus');
    await act(async () => other.postMessage({ type: 'write' }));
    other.close();
    expect(await screen.findByText('Resumen recibido desde recepción.')).toBeTruthy();
    expect(screen.getAllByText('Orientando').length).toBeGreaterThan(0);
  });

  it.each([
    ['la persona', /\/people\/V-204/, 1],
    ['las visitas', /\/visits/, 1],
    ['los externos', /\/people\?role=EXTERNAL/, 1],
  ])('confina el fallo de %s a sus tarjetas y reintenta', async (_what, path, cards) => {
    failOn('GET', path, 1);
    await render(<StaffPage {...setup()} />);
    expect(await screen.findAllByText('Código: NETWORK_ERROR')).toHaveLength(cards);
    expect(screen.getByRole('heading', { name: /Hola, Mario/ })).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Reintentar' })[0]!);
    await waitFor(() => expect(screen.queryByText('Código: NETWORK_ERROR')).toBeNull());
  });
});

describe('ActivitiesPage', () => {
  it('lista las actividades del servicio por hora con la fecha de la demostración', async () => {
    const onBack = jest.fn();
    await render(<ActivitiesPage onBack={onBack} />);
    expect(await screen.findByText('Yoga en la terraza')).toBeTruthy();
    expect(await screen.findByText('Sábado 24 oct 2026')).toBeTruthy();
    expect(screen.getByText('Clase abierta de tenis')).toBeTruthy();
    expect(screen.getByText('Cata de cafés de origen')).toBeTruthy();
    expect(screen.getByText('Sala de catas')).toBeTruthy();
    expect(screen.getByText('9:30 a. m.')).toBeTruthy();
    await press('← Volver');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('se recupera de un error de red', async () => {
    failOn('GET', /\/activities/, 1);
    await render(<ActivitiesPage onBack={jest.fn()} />);
    expect(await screen.findByText('Código: NETWORK_ERROR')).toBeTruthy();
    await press('Reintentar');
    expect(await screen.findByText('Yoga en la terraza')).toBeTruthy();
  });
});
