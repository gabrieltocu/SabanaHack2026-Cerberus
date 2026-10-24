import { fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { PASSES } from '@/features/demo/fixtures';
import { ProfileSelector } from '@/features/demo/ProfileSelector';
import { ActivitiesScreen } from '@/features/screens/ActivitiesScreen';
import { InviteScreen } from '@/features/screens/InviteScreen';
import { MemberScreen } from '@/features/screens/MemberScreen';
import type { Activity, MemberView } from '@/features/types';
import { PassScreen } from '@/features/screens/PassScreen';
import { StaffScreen } from '@/features/screens/StaffScreen';
import { withRole } from './withRole';

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

beforeEach(() => viewport(375));

const ACTIVITIES: readonly Activity[] = [
  {
    id: 'a1',
    name: 'Clase de tenis',
    place: 'Cancha de tenis',
    time: '4:00 p. m.',
    dateTime: '16:00',
    capacity: '6 cupos',
  },
  { id: 'a2', name: 'Té de la tarde', place: 'Terraza', time: '5:00 p. m.', dateTime: '17:00' },
  {
    id: 'a3',
    name: 'Lectura en el salón',
    place: 'Salón reservado',
    time: '6:00 p. m.',
    dateTime: '18:00',
  },
];
const MEETING_POINTS = ['Terraza', 'Salón reservado', 'Cancha de tenis'];
const STAFF_AGENDA = [
  { id: 'ag-1', time: '7:00 p. m.', dateTime: '19:00', title: 'Reunión', place: 'Operaciones' },
];
const AUTHORIZED_PROVIDERS = [
  { id: 'V-205', name: 'Laura', service: 'Mantenimiento', permittedDay: 'sábado' },
];
const MEMBERS: Record<string, MemberView> = {
  'V-201': {
    profile: { id: 'V-201', name: 'Andrés', roleLabel: 'Socio VIP', category: 'VIP', href: '' },
    badgeLabel: 'Socio VIP',
    today: 'Salón reservado · reserva confirmada',
    visit: {
      id: 'vis-201',
      reference: 'V-201',
      destination: 'Salón reservado',
      statusLabel: 'Orientando',
      statusKind: 'info',
      responsible: 'R2 te acompaña',
    },
    invitations: [
      {
        id: 'inv-1',
        guestName: 'Valentina',
        dateLabel: 'sáb 24 oct 2026',
        meetingPoint: 'Terraza',
        status: 'ACTIVE',
        token: 'nq_valentina',
      },
    ],
  },
  'V-202': {
    profile: {
      id: 'V-202',
      name: 'Camila',
      roleLabel: 'Socia regular',
      category: 'REGULAR',
      href: '',
    },
    badgeLabel: 'Socia regular',
    today: 'Cancha de tenis · reserva confirmada',
    visit: {
      id: 'vis-202',
      reference: 'V-202',
      destination: 'Cancha de tenis',
      statusLabel: 'Cerrada',
      statusKind: 'neutral',
      closed: true,
      feedbackSent: false,
    },
    invitations: [],
  },
};

describe('ProfileSelector', () => {
  it('announces how many visits are in progress', async () => {
    const base = {
      profiles: [],
      onSelect: jest.fn(),
      arriving: [],
      dates: [{ value: 'a', label: 'A' }],
      date: 'a',
      onDateChange: jest.fn(),
      onReset: jest.fn(),
    };
    const { rerender } = await render(<ProfileSelector {...base} activeVisits={1} />);
    expect(screen.queryByText('1 visita en curso')).toBeNull();
    await press('Ajustes');
    expect(screen.getByText('1 visita en curso')).toBeTruthy();
    await rerender(<ProfileSelector {...base} activeVisits={3} />);
    expect(screen.getByText('3 visitas en curso')).toBeTruthy();
  });
});

describe('MemberScreen', () => {
  const andres = MEMBERS['V-201']!;
  const camila = MEMBERS['V-202']!;
  const base = {
    activities: ACTIVITIES,
    hour: 10,
    onInvite: jest.fn(),
    onViewActivities: jest.fn(),
  };

  it('greets by the Bogotá hour and shows category and reference', async () => {
    const { rerender } = await render(<MemberScreen {...base} member={andres} />);
    expect(screen.getByRole('heading', { name: 'Buenos días, Andrés' })).toBeTruthy();
    expect(screen.getByText('Socio VIP')).toBeTruthy();
    expect(screen.getByText('V-201')).toBeTruthy();
    await rerender(<MemberScreen {...base} member={andres} hour={13} />);
    expect(screen.getByRole('heading', { name: 'Buenas tardes, Andrés' })).toBeTruthy();
    await rerender(<MemberScreen {...base} member={andres} hour={20} />);
    expect(screen.getByRole('heading', { name: 'Buenas noches, Andrés' })).toBeTruthy();
  });

  it('shows the day: visit with responsible, invitations and three activities', async () => {
    const onInvite = jest.fn();
    const onViewActivities = jest.fn();
    await render(
      <MemberScreen
        {...base}
        member={andres}
        onInvite={onInvite}
        onViewActivities={onViewActivities}
      />,
    );
    expect(screen.getByText('Salón reservado · reserva confirmada')).toBeTruthy();
    expect(screen.getByText('Orientando')).toBeTruthy();
    expect(screen.getByText('R2 te acompaña')).toBeTruthy();
    expect(screen.getByText('Valentina')).toBeTruthy();
    expect(screen.getByText('sáb 24 oct 2026 · Terraza')).toBeTruthy();
    expect(screen.getByText('Clase de tenis')).toBeTruthy();
    expect(screen.getByText('Cancha de tenis · 4:00 p. m.')).toBeTruthy();
    await press('Invitar a alguien');
    await press('Ver actividades');
    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(onViewActivities).toHaveBeenCalledTimes(1);
  });

  it('shows the empty states with what to do next', async () => {
    await render(
      <MemberScreen {...base} member={{ ...camila, visit: undefined }} activities={[]} />,
    );
    expect(
      screen.getByText(
        'No tienes una visita en curso. Cuando llegues al club, el robot de recepción te reconocerá.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Aún no has invitado a nadie.')).toBeTruthy();
    expect(screen.getByText('Hoy no hay actividades registradas.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invitar a alguien' })).toBeTruthy();
  });

  it('shows the status of a visit that comes from a presenter action without any tag', async () => {
    const visit = { ...andres.visit!, simulated: true, statusLabel: 'Esperando relevo' };
    await render(<MemberScreen {...base} member={{ ...andres, visit }} />);
    expect(screen.getByText('Esperando relevo')).toBeTruthy();
  });

  it('shows the success line after creating an invitation', async () => {
    await render(
      <MemberScreen {...base} member={andres} invitationNotice="Invitación creada para Tomás." />,
    );
    expect(screen.getByText('Invitación creada para Tomás.')).toBeTruthy();
  });

  it('shows skeletons while loading, without the card contents', async () => {
    await render(<MemberScreen {...base} member={andres} status="loading" />);
    expect(screen.queryByText('R2 te acompaña')).toBeNull();
    expect(screen.queryByText('Clase de tenis')).toBeNull();
    expect(screen.getAllByLabelText('Cargando')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Buenos días, Andrés' })).toBeTruthy();
  });

  it('confines a failure to its card so the rest stays useful', async () => {
    const onRetry = jest.fn();
    await render(
      <MemberScreen
        {...base}
        member={andres}
        errors={{
          visit: 'NETWORK_OFFLINE',
          invitations: 'API_UNAVAILABLE',
          activities: 'SERVER_ERROR',
        }}
        onRetry={onRetry}
      />,
    );
    expect(
      screen.getByText(
        'No hay conexión. Tus datos siguen aquí; puedes reintentar cuando vuelva la red.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('El servicio no responde por ahora. Inténtalo de nuevo en unos segundos.'),
    ).toBeTruthy();
    expect(
      screen.getByText('No pudimos completar la acción. No se hizo ningún cambio.'),
    ).toBeTruthy();
    const retries = screen.getAllByRole('button', { name: 'Reintentar' });
    expect(retries).toHaveLength(3);
    for (const retry of retries) await fireEvent.press(retry);
    expect(onRetry.mock.calls.map((c) => c[0])).toEqual(['visit', 'invitations', 'activities']);
    expect(screen.getByRole('button', { name: 'Invitar a alguien' })).toBeTruthy();
  });

  it('offers to rate a closed visit, sends the rating and thanks', async () => {
    const onSubmitFeedback = jest.fn();
    await render(<MemberScreen {...base} member={camila} onSubmitFeedback={onSubmitFeedback} />);
    expect(screen.getByText('¿Cómo te fue hoy?')).toBeTruthy();
    await press('Evaluar mi visita');
    await fireEvent.press(screen.getByRole('radio', { name: 'Servicios del club: 5 · Muy bueno' }));
    await press('Enviar evaluación');
    expect(onSubmitFeedback).toHaveBeenCalledWith({ club: 5 });
    expect(screen.getByText('Gracias. Tu evaluación quedó registrada.')).toBeTruthy();
  });

  it('lets the member decline rating without changing anything', async () => {
    await render(<MemberScreen {...base} member={camila} />);
    await press('Evaluar mi visita');
    await press('Prefiero no evaluar');
    expect(screen.getByRole('button', { name: 'Evaluar mi visita' })).toBeTruthy();
  });

  it('does not ask again once the rating was sent', async () => {
    await render(
      <MemberScreen
        {...base}
        member={{ ...camila, visit: { ...camila.visit!, feedbackSent: true } }}
      />,
    );
    expect(screen.queryByText('¿Cómo te fue hoy?')).toBeNull();
  });
});

describe('InviteScreen', () => {
  const setup = (extra: Partial<Parameters<typeof InviteScreen>[0]> = {}) => {
    const pass = { ...PASSES['demo-valentina']!, token: 'demo-nuevo' };
    const props = {
      today: '2026-10-24',
      meetingPoints: MEETING_POINTS,
      onCreate: jest.fn().mockResolvedValue({ pass }),
      onCopyLink: jest.fn().mockResolvedValue(true),
      onBack: jest.fn(),
      onOpenPass: jest.fn(),
      ...extra,
    };
    return props;
  };

  it('shows the form with its heading, explanation and back link', async () => {
    const props = setup();
    await render(<InviteScreen {...props} />);
    expect(screen.getByRole('heading', { name: 'Invitar a alguien' })).toBeTruthy();
    expect(
      screen.getByText('Tu invitado recibirá un pase con código QR. No necesita crear una cuenta.'),
    ).toBeTruthy();
    await press('← Mi inicio');
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('creates the invitation and shows the pass with its seal, link and next steps', async () => {
    const props = setup();
    await render(<InviteScreen {...props} />);
    await fireEvent.changeText(screen.getByLabelText('Nombre de tu invitado'), 'Valentina');
    await press('Crear invitación');
    expect(await screen.findByText('Invitación creada para Valentina.')).toBeTruthy();
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ guestName: 'Valentina', date: '2026-10-24' }),
    );
    expect(screen.getByRole('img', { name: /Código QR/ })).toBeTruthy();
    expect(screen.getByText('Código QR del pase')).toBeTruthy();
    await press('Ver pase');
    expect(props.onOpenPass).toHaveBeenCalledWith('demo-nuevo');
    await press('Copiar enlace del pase');
    expect(await screen.findByText('Enlace copiado.')).toBeTruthy();
    expect(props.onCopyLink).toHaveBeenCalledWith('demo-nuevo');
    await press('Invitar a otra persona');
    expect(screen.getByLabelText('Nombre de tu invitado').props.value).toBe('');
  });

  it('keeps what was typed when the server refuses', async () => {
    const props = setup({
      onCreate: jest.fn().mockResolvedValue({ errorCode: 'INVITATION_DUPLICATE' }),
    });
    await render(<InviteScreen {...props} />);
    await fireEvent.changeText(screen.getByLabelText('Nombre de tu invitado'), 'Valentina');
    await press('Crear invitación');
    expect(
      await screen.findByText('Ya existe una invitación para este invitado en esa fecha.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Nombre de tu invitado').props.value).toBe('Valentina');
    expect(screen.getByRole('button', { name: 'Crear invitación' })).toBeTruthy();
  });

  it('says the link could not be copied by simply not claiming it was', async () => {
    const props = setup({ onCopyLink: jest.fn().mockResolvedValue(false) });
    await render(<InviteScreen {...props} />);
    await fireEvent.changeText(screen.getByLabelText('Nombre de tu invitado'), 'Ana');
    await press('Crear invitación');
    await press('Copiar enlace del pase');
    expect(screen.queryByText('Enlace copiado.')).toBeNull();
  });

  it('shows a form skeleton while the meeting points load', async () => {
    const props = setup({ loading: true });
    await render(<InviteScreen {...props} />);
    expect(screen.getByLabelText('Cargando formulario')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Crear invitación' })).toBeNull();
  });

  it('uses a wide column on desktop', async () => {
    viewport(1440);
    const props = setup();
    await render(<InviteScreen {...props} />);
    expect(screen.getByRole('heading', { name: 'Invitar a alguien' })).toBeTruthy();
  });
});

describe('PassScreen', () => {
  it('shows the pass of the guest with no account, and opens the QR full screen', async () => {
    await render(<PassScreen pass={PASSES['demo-tomas']!} />);
    expect(screen.getByRole('heading', { name: 'Tu pase de visita' })).toBeTruthy();
    expect(screen.getByText('N Club')).toBeTruthy();
    expect(screen.getByText('Hola, Tomás')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /Código QR de tu pase/ })).toHaveLength(1);
    await press('Mostrar a pantalla completa');
    expect(screen.getAllByRole('img', { name: /Código QR de tu pase/ })).toHaveLength(2);
    expect(withRole('dialog', 'Código QR a pantalla completa')).toHaveLength(1);
    await press('Cerrar');
    expect(screen.getAllByRole('img', { name: /Código QR de tu pase/ })).toHaveLength(1);
  });

  it('copies the link and confirms only if it worked', async () => {
    const onCopyLink = jest.fn().mockResolvedValue(true);
    await render(<PassScreen pass={PASSES['demo-tomas']!} onCopyLink={onCopyLink} />);
    await press('Copiar enlace');
    expect(await screen.findByText('Enlace copiado.')).toBeTruthy();
  });

  it('checks the pass before showing anything', async () => {
    await render(<PassScreen pass={null} status="loading" />);
    expect(screen.getByText('Comprobando tu pase…')).toBeTruthy();
    expect(screen.queryByText('No válido')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('explains a failed check and lets the guest retry', async () => {
    const onRetry = jest.fn();
    await render(<PassScreen pass={null} status="error" onRetry={onRetry} />);
    expect(screen.getByText('No pudimos comprobar tu pase.')).toBeTruthy();
    expect(screen.getByText('Código: API_UNAVAILABLE')).toBeTruthy();
    await press('Reintentar');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('treats a link with no pass as «No válido»', async () => {
    await render(<PassScreen pass={null} />);
    expect(screen.getByText('No válido')).toBeTruthy();
    expect(screen.getByText('No encontramos este pase.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostrar a pantalla completa' })).toBeNull();
  });

  it('keeps a visible pass and warns when the connection drops', async () => {
    await render(<PassScreen pass={PASSES['demo-tomas']!} offline />);
    expect(screen.getByText('Sin conexión: la validez se comprobará en recepción.')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR/ })).toBeTruthy();
  });

  it('has no QR and no full-screen action for an expired pass', async () => {
    await render(<PassScreen pass={PASSES['demo-vencido']!} onCopyLink={jest.fn()} />);
    expect(screen.getByText('Vencido')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).toBeNull();
  });

  it('adapts the card width on tablet and desktop', async () => {
    viewport(768);
    await render(<PassScreen pass={PASSES['demo-tomas']!} />);
    expect(screen.getByText('Hola, Tomás')).toBeTruthy();
  });
});

describe('StaffScreen', () => {
  const base = {
    name: 'Mario',
    reference: 'V-204',
    day: 'sábado',
    agenda: STAFF_AGENDA,
    shiftLabel: 'Operaciones · turno vigente',
    providers: AUTHORIZED_PROVIDERS,
    onViewActivities: jest.fn(),
  };

  it('shows private agenda, shift, entry and authorised providers for Saturday', async () => {
    const onViewActivities = jest.fn();
    await render(<StaffScreen {...base} onViewActivities={onViewActivities} />);
    expect(screen.getByRole('heading', { name: 'Hola, Mario' })).toBeTruthy();
    expect(screen.getByText('Personal del club · Operaciones')).toBeTruthy();
    expect(screen.getByText('Operaciones · turno vigente')).toBeTruthy();
    expect(screen.getByText('Credencial vigente')).toBeTruthy();
    expect(
      screen.getByText(/Cuando llegues, el robot de recepción confirmará tu credencial/),
    ).toBeTruthy();
    expect(screen.getByText('Laura · Mantenimiento')).toBeTruthy();
    expect(screen.getByText('Autorizada hoy')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.getByText('Solo tú ves esto')).toBeTruthy();
    expect(withRole('time')).toHaveLength(1);
    expect(screen.getByText('7:00 p. m.')).toBeTruthy();
    expect(
      screen.getByText('El resumen de agenda del robot no registra tu asistencia laboral.'),
    ).toBeTruthy();
    await press('Ver actividades de hoy');
    expect(onViewActivities).toHaveBeenCalledTimes(1);
  });

  it('marks the provider as not authorised on Tuesday, with the stable code', async () => {
    await render(<StaffScreen {...base} day="martes" />);
    expect(screen.getByText('No autorizada hoy')).toBeTruthy();
    expect(
      screen.getByText(
        /Su permiso de acceso aplica los sábados y hoy es martes\. Código: EXTERNAL_DAY_NOT_ALLOWED/,
      ),
    ).toBeTruthy();
  });

  it('never shows the meeting detail unless the robot sent the summary', async () => {
    const { rerender } = await render(<StaffScreen {...base} />);
    expect(screen.queryByText(/Tienes una reunión hoy a las 7 p\. m\./)).toBeNull();
    expect(screen.queryByText('Resumen recibido desde recepción.')).toBeNull();
    await rerender(<StaffScreen {...base} summaryReceived />);
    expect(screen.getByText('Resumen recibido desde recepción.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.getByText(/Tienes una reunión hoy a las 7 p\. m\. en operaciones/)).toBeTruthy();
    await press('Ver mensajes');
    expect(screen.getByText('Resumen recibido desde recepción.')).toBeTruthy();
  });

  it('shows the visit state once the entry is open', async () => {
    await render(<StaffScreen {...base} visitStatus="En curso" />);
    expect(screen.getByText('En curso')).toBeTruthy();
    expect(screen.getAllByText('Operaciones').length).toBeGreaterThan(0);
  });

  it('shows the empty states', async () => {
    await render(<StaffScreen {...base} agenda={[]} providers={[]} />);
    expect(screen.getByText('No hay proveedores autorizados para hoy.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.getByText('No tienes eventos hoy.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Mensajes' }));
    expect(screen.getByText('Sin mensajes nuevos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));
    expect(screen.getByText('V-204')).toBeTruthy();
    await press(/^Información laboral/);
    expect(screen.getByRole('tab', { name: 'Inicio' }).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('puts an inactive shift error on the shift card only', async () => {
    const onRetry = jest.fn();
    await render(
      <StaffScreen {...base} errors={{ shift: 'STAFF_SHIFT_INACTIVE' }} onRetry={onRetry} />,
    );
    expect(
      screen.getByText(
        'Tu credencial está activa, pero no veo un turno para hoy. Recepción puede confirmarlo.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Credencial vigente')).toBeNull();
    await press('Reintentar');
    expect(onRetry).toHaveBeenCalledWith('shift');
    await fireEvent.press(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.getByText('Solo tú ves esto')).toBeTruthy();
  });

  it('shows skeletons while loading and retry without a handler offers no button', async () => {
    const { rerender } = await render(<StaffScreen {...base} status="loading" />);
    expect(screen.getAllByLabelText('Cargando')).toHaveLength(3);
    await rerender(<StaffScreen {...base} errors={{ agenda: 'NETWORK_OFFLINE' }} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.getByText('Código: NETWORK_OFFLINE')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });
});

describe('ActivitiesScreen', () => {
  const base = { activities: ACTIVITIES, dateLabel: 'Sábado 24 oct 2026', onBack: jest.fn() };

  it('lists the day with place, time and the footer about who loads them', async () => {
    const onBack = jest.fn();
    await render(<ActivitiesScreen {...base} onBack={onBack} />);
    expect(screen.getByRole('heading', { name: 'Hoy en el club' })).toBeTruthy();
    expect(screen.getByText('Sábado 24 oct 2026')).toBeTruthy();
    expect(screen.getByText('Té de la tarde')).toBeTruthy();
    expect(screen.getByText('Terraza')).toBeTruthy();
    expect(screen.getByText('5:00 p. m.')).toBeTruthy();
    expect(withRole('time')).toHaveLength(3);
    expect(
      screen.getByText('Las actividades las carga el personal autorizado del club.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ir a/ })).toBeNull();
    await press('← Volver');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('in kiosk mode offers «Ir ahí» with the activity in its name', async () => {
    const onGo = jest.fn();
    await render(
      <ActivitiesScreen
        {...base}
        mode="kiosk"
        onGo={onGo}
        notice="Destino confirmado: Clase de tenis."
      />,
    );
    await press('Ir a Lectura en el salón');
    expect(onGo).toHaveBeenCalledWith(ACTIVITIES[2]);
    expect(screen.getAllByText('Ir ahí')).toHaveLength(3);
    expect(screen.getByText('Destino confirmado: Clase de tenis.')).toBeTruthy();
  });

  it('says there is nothing today, with «Volver» in the kiosk', async () => {
    const onBack = jest.fn();
    const { rerender } = await render(
      <ActivitiesScreen {...base} activities={[]} onBack={onBack} />,
    );
    expect(screen.getByText('Hoy no hay actividades registradas.')).toBeTruthy();
    await rerender(<ActivitiesScreen {...base} activities={[]} mode="kiosk" onBack={onBack} />);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Volver' })[0]!);
    expect(onBack).toHaveBeenCalled();
  });

  it('shows skeletons while loading and a recoverable error', async () => {
    const onRetry = jest.fn();
    const { rerender } = await render(<ActivitiesScreen {...base} status="loading" />);
    expect(screen.queryByText('Té de la tarde')).toBeNull();
    await rerender(<ActivitiesScreen {...base} errorCode="API_UNAVAILABLE" onRetry={onRetry} />);
    expect(
      screen.getByText('El servicio no responde por ahora. Inténtalo de nuevo en unos segundos.'),
    ).toBeTruthy();
    await press('Reintentar');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
