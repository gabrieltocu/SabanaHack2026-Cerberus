import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { RobotScreen } from '@/features/screens/RobotScreen';
import type { Transport } from '@/infrastructure/clients/transport';
import { createUiApi, type UiApi } from '../../support/ui-api';

let mockTransport: Transport;
jest.mock('@/features/data/api', () => {
  const actual = jest.requireActual('@/features/data/api');
  const { createCerberusClient } = jest.requireActual('@/infrastructure/clients/cerberus-client');
  return {
    ...actual,
    clientFor: (actor?: string) => createCerberusClient(mockTransport, actor),
  };
});

let ui: UiApi;
beforeEach(() => {
  ui = createUiApi();
  mockTransport = ui.transport;
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const pressWhenReady = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));
const heading = (name: string | RegExp) => screen.findByRole('heading', { name });
const kiosk = () => render(<RobotScreen farewellSeconds={600} />);
const NOTIFIED = 'Aviso enviado a recepción. Una persona del equipo viene en camino.';

/** Starts the recognition screen and picks a simulated face. */
async function show(face: string) {
  await pressWhenReady('Comenzar');
  await pressWhenReady(face);
}

/** Recognise a simulated face and confirm identity. Leaves the greeting on screen. */
async function arriveAs(face: string, who: string) {
  await show(face);
  expect(await heading(`${who}, ¿eres tú?`)).toBeTruthy();
  await press('Confirmar y notificar');
}

// The demo invitation leaves an EXPECTED visit; «visits» are the ones that arrived.
const visits = async () =>
  (await ui.client().listVisits()).items.filter((v) => v.state !== 'EXPECTED');
const only = async () => {
  const all = await visits();
  expect(all).toHaveLength(1);
  return all[0]!;
};

/** VIP with R2 on the route (the presenter drawer is opened). */
async function vipOnRoute() {
  await kiosk();
  await arriveAs('Andrés · miembro', 'Andrés');
  await screen.findByText(/Andrés, bienvenido\. ¿Te apetece un café/);
  await press('Café');
  await press('Continuar');
  await press('Ir a mi reserva del salón');
  await pressWhenReady('Sí, con R2');
  await screen.findByText('Robot R2 · Acompañando');
  await press('Operación');
}

describe('RobotScreen · start', () => {
  it('rests with the welcome, the robot name, help and the closed presenter drawer', async () => {
    await kiosk();
    expect(await heading('Bienvenido a N Club')).toBeTruthy();
    expect(screen.getByLabelText('Robot R1 · Recepción')).toBeTruthy();
    expect(screen.getByLabelText('Conectado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Necesito ayuda' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reiniciar datos' })).toBeNull();
  });

  it('shows the loading state until the service answers', async () => {
    mockTransport = () => new Promise(() => {});
    await kiosk();
    expect(screen.getByText('Preparando al robot…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Comenzar' })).toBeNull();
  });

  it('without connection says so, recovers on retry and never crashes', async () => {
    ui.setOffline(true);
    await kiosk();
    expect(await screen.findByText('Código: NETWORK_OFFLINE')).toBeTruthy();
    expect(screen.getByText('Sin conexión')).toBeTruthy();
    ui.setOffline(false);
    await press('Reintentar');
    await waitFor(() => expect(screen.queryByText('Código: NETWORK_OFFLINE')).toBeNull());
    expect(screen.getByText('En línea')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Comenzar' })).toBeTruthy();
  });

  it('asking for help confirms that reception was notified', async () => {
    await kiosk();
    await pressWhenReady('Necesito ayuda');
    expect(screen.getByText(NOTIFIED)).toBeTruthy();
  });
});

describe('RobotScreen · identification', () => {
  it('a recognised member is confirmed with her records and the face is tagged as simulated', async () => {
    await kiosk();
    await show('Camila · miembro');
    expect(await heading('Camila, ¿eres tú?')).toBeTruthy();
    expect(screen.getByText('Membresía vigente')).toBeTruthy();
    expect(screen.queryByText('Socio regular')).toBeNull();
    const visit = await only();
    expect(visit).toMatchObject({ state: 'VERIFIED', category: 'REGULAR', ownerId: 'R1' });
    expect(visit.recognition).toMatchObject({ simulated: true, source: { id: 'R1' } });
  });

  it('an unknown face leads to QR or help; the visit waits for a person and grants nothing', async () => {
    await kiosk();
    await show('Rostro desconocido');
    expect(await heading('No pude confirmar tu identidad')).toBeTruthy();
    await press('Pedir ayuda');
    expect(screen.getByText(NOTIFIED)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar y notificar' })).toBeNull();
    expect(await only()).toMatchObject({ state: 'MANUAL_REVIEW', ownerId: null });
  });

  it('a camera error says so and offers the QR', async () => {
    await kiosk();
    await show('Error de cámara');
    expect(await heading('No pude usar la cámara')).toBeTruthy();
    await press('Usar mi QR');
    expect(screen.getByRole('heading', { name: 'Muestra tu código QR' })).toBeTruthy();
  });

  it('«No soy yo» opens nothing: the visit the recognition created is closed again', async () => {
    await kiosk();
    await show('Andrés · miembro');
    await heading('Andrés, ¿eres tú?');
    await press('Más opciones');
    await press('No soy yo');
    expect(await heading('No pude confirmar tu identidad')).toBeTruthy();
    await waitFor(async () => expect((await only()).state).toBe('CLOSED'));
    expect(screen.queryByRole('button', { name: 'Confirmar y notificar' })).toBeNull();
  });

  it.each([
    ['Esteban · membresía suspendida', 'No puedo confirmar tu visita', 'MEMBERSHIP_NOT_ACTIVE'],
    ['Iván · membresía vencida', 'No puedo confirmar tu visita', 'MEMBERSHIP_NOT_ACTIVE'],
    ['Paula · sin turno hoy', 'No puedo confirmar tu visita', 'STAFF_SHIFT_INACTIVE'],
  ])('%s is explained respectfully and only reception can help', async (face, title, code) => {
    await kiosk();
    await show(face);
    expect(await heading(title)).toBeTruthy();
    expect(screen.getByText(`Código: ${code}`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Avisar a recepción' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar y notificar' })).toBeNull();
  });

  it('a denial is never a dead end: reception is warned and the person can go back to the start', async () => {
    await kiosk();
    await show('Esteban · membresía suspendida');
    await heading('No puedo confirmar tu visita');
    await press('Avisar a recepción');
    expect(screen.getByText(NOTIFIED)).toBeTruthy();
    await press('Volver al inicio');
    expect(screen.getByRole('heading', { name: 'Bienvenido a N Club' })).toBeTruthy();
  });

  it('a member who is also on shift is left to a person, not guessed', async () => {
    await ui.client().resetDemo({ now: '2026-10-24T11:00:00-05:00' });
    await kiosk();
    await show('Daniela · socia y personal');
    expect(await heading('Recepción puede ayudarte')).toBeTruthy();
    expect(screen.getByText('Código: CLASSIFICATION_MANUAL_REVIEW')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar y notificar' })).toBeNull();
  });

  it('a guest face whose invitation expired is not let in by the face', async () => {
    await ui.client().resetDemo({ now: '2026-10-24T23:00:00-05:00' });
    await kiosk();
    await show('Valentina · no miembro');
    expect(
      await screen.findByText('Este pase venció. Pide a tu anfitrión que te envíe uno nuevo.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar y notificar' })).toBeNull();
  });

  it('a guest face with an active invitation is confirmed by it, naming her host', async () => {
    await kiosk();
    await show('Valentina · no miembro');
    expect(await heading('Valentina, ¿eres tú?')).toBeTruthy();
    // The visit carries the host's first name, never the invitation or its token.
    expect(screen.getByText('Invitación de Male para hoy')).toBeTruthy();
    expect(screen.queryByText('Invitado')).toBeNull();
  });

  it('the external worker is confirmed on Saturday', async () => {
    await kiosk();
    await show('Laura · no miembro');
    expect(await heading('Laura, ¿eres tú?')).toBeTruthy();
    expect(screen.getByText('Visita de servicio registrada para hoy')).toBeTruthy();
  });

  it('the external worker is denied on her non-authorised day, with the weekday', async () => {
    await kiosk();
    await pressWhenReady('Comenzar');
    await press('Martes 27 oct 2026');
    expect(await screen.findByText(/Datos reiniciados/)).toBeTruthy();
    await pressWhenReady('Comenzar');
    await pressWhenReady('Laura · no miembro');
    expect(
      await screen.findByText('Su permiso de acceso aplica los sábados y hoy es martes.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No puedo confirmar su visita hoy' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar y notificar' })).toBeNull();
    expect(await only()).toMatchObject({ state: 'FAILED' });
  });

  it('on her day but out of hours the denial says so', async () => {
    await ui.client().resetDemo({ now: '2026-10-24T18:00:00-05:00' });
    await kiosk();
    await show('Laura · no miembro');
    expect(
      await screen.findByText(
        'Su visita está autorizada en otro horario. Recepción puede ayudarle.',
      ),
    ).toBeTruthy();
  });
});

describe('RobotScreen · QR', () => {
  const field = () => screen.getByLabelText('O escribe el código de tu pase');

  it('a valid pass asks for confirmation as the guest, naming the host; the pass is spent', async () => {
    await kiosk();
    await pressWhenReady('Tengo un código QR');
    expect(screen.getByText('Esperando tu código…')).toBeTruthy();
    await press('Operación');
    await pressWhenReady('Usar el pase de Valentina');
    expect(await heading('Valentina, ¿eres tú?')).toBeTruthy();
    expect(screen.getByText('Invitación de Male para hoy')).toBeTruthy();
    await press('Confirmar y notificar');
    expect(await screen.findByText(/Hola, Valentina, bienvenida\. Male indicó/)).toBeTruthy();
    expect(await only()).toMatchObject({ state: 'VERIFIED', category: 'GUEST' });
  });

  it('a typed token works, and the same pass twice is QR_ALREADY_USED', async () => {
    const token = (await ui.client('O-01').listInvitations({ hostId: 'V-209' })).items[0]!.qr.token;
    await kiosk();
    await pressWhenReady('Tengo un código QR');
    await fireEvent.changeText(field(), token);
    await press('Comprobar');
    expect(await heading('Valentina, ¿eres tú?')).toBeTruthy();
    await press('Confirmar y notificar');
    await screen.findByText(/Hola, Valentina/);
    await press('Operación');
    await press('Reiniciar esta visita');
    await press('Tengo un código QR');
    await fireEvent.changeText(field(), token);
    await press('Comprobar');
    expect(
      await screen.findByText(
        'Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Código: QR_ALREADY_USED')).toBeTruthy();
    expect(field().props.value).toBe(token);
  });

  it('problems explain themselves, keep the field and let the person try again', async () => {
    const [invitation] = (await ui.client('O-01').listInvitations({ hostId: 'V-209' })).items;
    await ui.client('V-209').cancelInvitation(invitation!.id);
    await kiosk();
    await pressWhenReady('Tengo un código QR');
    await press('Operación');
    await pressWhenReady('Probar un pase cancelado');
    expect(await screen.findByText('Tu anfitrión canceló esta invitación.')).toBeTruthy();
    expect(field().props.value).toBe(invitation!.qr.token);
    await press('Probar un pase manipulado');
    expect(await screen.findByText('No encontramos este pase.')).toBeTruthy();
    await fireEvent.changeText(field(), 'xx');
    await fireEvent(field(), 'submitEditing');
    expect(
      screen.getByText('Este código no es válido. Revisa que sea el pase que recibiste.'),
    ).toBeTruthy();
    await press('Volver');
    expect(screen.getByRole('heading', { name: 'Bienvenido a N Club' })).toBeTruthy();
  });

  it('an unknown face then a valid pass merges into the waiting visit', async () => {
    await kiosk();
    await show('Rostro desconocido');
    await heading('No pude confirmar tu identidad');
    await press('Usar mi QR');
    await press('Operación');
    await pressWhenReady('Usar el pase de Valentina');
    expect(await heading('Valentina, ¿eres tú?')).toBeTruthy();
    const all = await visits();
    expect(all.find((v) => v.state === 'CLOSED')).toMatchObject({ closeReason: 'MERGED' });
    expect(all.find((v) => v.state === 'VERIFIED')).toMatchObject({ category: 'GUEST' });
  });

  it('a pass lost to the network is recoverable', async () => {
    await kiosk();
    await pressWhenReady('Tengo un código QR');
    await fireEvent.changeText(field(), ['nq', 'z'.repeat(22)].join('_'));
    ui.setOffline(true);
    await press('Comprobar');
    expect(await screen.findAllByText('Código: NETWORK_OFFLINE')).not.toHaveLength(0);
    ui.setOffline(false);
    await press('Reintentar');
    expect(await screen.findByText('No encontramos este pase.')).toBeTruthy();
  });
});

describe('RobotScreen · a VIP visit from greeting to goodbye', () => {
  it('walks every phase; the robot fails, Sofía takes over, and the visit closes with feedback', async () => {
    await vipOnRoute();
    expect(await only()).toMatchObject({
      state: 'IN_PROGRESS',
      ownerId: 'R2',
      destination: 'Salón reservado',
    });
    expect(screen.getByText(/Vamos hacia tu salón, Andrés/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Marcar regreso a recepción' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });

    // The robot fails: a clear human signal, help requested for real.
    await press('Reportar falla del robot');
    expect(await heading('Tengo un inconveniente')).toBeTruthy();
    expect(screen.getByLabelText('Ayuda solicitada, ahora')).toBeTruthy();
    const [handoff] = (await ui.client().listHandoffs({ state: 'REQUESTED' })).items;
    expect(handoff).toMatchObject({ fromId: 'R2', reason: 'ROBOT_FAILURE' });

    // Another tab (Sofía) moves the relief: the kiosk follows without a reload.
    const sofia = ui.client('U-02');
    await sofia.acceptHandoff(handoff!.id);
    expect(
      await screen.findByText('Soy Sofía, voy a ayudarte. ¿Estás junto al robot?'),
    ).toBeTruthy();
    await sofia.transferHandoffContext(handoff!.id);
    expect(await screen.findByText('Ya tengo tu destino. Continuaremos desde aquí.')).toBeTruthy();
    expect((await only()).ownerId).toBe('R2');
    await sofia.confirmHandoff(handoff!.id);
    expect(
      await screen.findByText('Yo sigo contigo; nuestro equipo revisará el robot.'),
    ).toBeTruthy();
    expect(screen.getByText('Sofía · Acompañando')).toBeTruthy();
    expect((await only()).ownerId).toBe('U-02');

    // Sofía confirms the arrival: the kiosk shows it.
    await sofia.advanceVisit((await only()).id, { event: 'ARRIVE' });
    expect(await screen.findByText(/Llegamos al salón de tu reserva/)).toBeTruthy();
    await press('Entendido');
    expect(screen.getByText('Visita en curso · Andrés · Salón reservado')).toBeTruthy();

    // Back at reception the exit is assisted: the kiosk waits until Sofía closes the visit.
    await press('Marcar regreso a recepción');
    expect(
      await screen.findByText(/Andrés, ya casi terminamos\. Sofía confirmará tu salida\./),
    ).toBeTruthy();
    await sofia.closeVisit((await only()).id, { method: 'MANUAL' });
    expect(await screen.findByText('Servicio de los robots')).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('radio', { name: 'Servicio de los robots: 5 · Muy bueno' }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Servicios del club: 4' }));
    await fireEvent.changeText(screen.getByLabelText('Comentario (opcional)'), ' Muy claro ');
    await press('Enviar');
    expect(await screen.findByText(/Hasta pronto, Andrés/)).toBeTruthy();
    expect(screen.queryByText('Sin problema. Tu salida no cambia.')).toBeNull();
    expect(await only()).toMatchObject({ state: 'CLOSED', feedbackSubmitted: true });
    await press('Listo');
    expect(screen.getByRole('heading', { name: 'Bienvenido a N Club' })).toBeTruthy();
    expect(screen.queryByText(/Visita en curso/)).toBeNull();
  });

  it('without a failure the robot closes the visit itself and the evaluation is optional', async () => {
    await vipOnRoute();
    await press('Marcar llegada al destino');
    expect(await screen.findByText(/Llegamos al salón de tu reserva/)).toBeTruthy();
    await press('Entendido');
    await press('Marcar regreso a recepción');
    expect(screen.getByText(/Andrés, bienvenido de nuevo a recepción/)).toBeTruthy();
    await press('Todavía no');
    expect(screen.getByText('Visita en curso · Andrés · Salón reservado')).toBeTruthy();
    await press('Marcar regreso a recepción');
    await press('Sí, terminé');
    expect(await screen.findByText('Servicio de los robots')).toBeTruthy();
    expect((await only()).state).toBe('CLOSED');
    await press('Prefiero no participar');
    expect(screen.getByText('Sin problema. Tu salida no cambia.')).toBeTruthy();
    expect(screen.getByText(/Hasta pronto, Andrés/)).toBeTruthy();
    expect((await only()).feedbackSubmitted).toBe(false);
  });

  it("the destination can come from today's activities for the visitor's category", async () => {
    await kiosk();
    await arriveAs('Andrés · miembro', 'Andrés');
    await screen.findByText(/Andrés, bienvenido/);
    await press('Café');
    await press('Continuar');
    await press('Ver actividades de hoy');
    expect(await heading('Hoy en el club')).toBeTruthy();
    expect(
      await screen.findByText('Clase abierta de tenis · Cancha de tenis · 9:30 a. m.'),
    ).toBeTruthy();
    await press('Volver');
    await press('Ver actividades de hoy');
    await pressWhenReady('Ir a Cata de cafés de origen');
    expect(await screen.findByText('Destino confirmado: Cata de cafés de origen.')).toBeTruthy();
    expect(screen.getByText('Sala de catas')).toBeTruthy();
    expect(await only()).toMatchObject({ state: 'ORIENTING', destination: 'Sala de catas' });
  });

  it('when the robot is out of service it says so and offers a person of the team', async () => {
    await ui.client('R2').reportRobotFailure('R2', { code: 'MOTOR_FAULT' });
    await kiosk();
    await arriveAs('Andrés · miembro', 'Andrés');
    await screen.findByText(/Andrés, bienvenido/);
    await press('Nada por ahora');
    await press('Continuar');
    await press('Ir a mi reserva del salón');
    await pressWhenReady('Sí, con R2');
    expect(
      await screen.findByText(
        'Ese acompañante no está disponible ahora. Prueba con otra persona del equipo o pide apoyo a recepción.',
      ),
    ).toBeTruthy();
    await press('Ir con Sara');
    expect(await screen.findByText('Sara · Acompañando')).toBeTruthy();
    expect(await only()).toMatchObject({ ownerId: 'U-01', state: 'IN_PROGRESS' });
  });

  it('a failure of the network mid-visit keeps the screen and retries the same step', async () => {
    await kiosk();
    await arriveAs('Andrés · miembro', 'Andrés');
    await screen.findByText(/Andrés, bienvenido/);
    await press('Café');
    await press('Continuar');
    ui.setOffline(true);
    await press('Ir a mi reserva del salón');
    expect(await screen.findAllByText('Código: NETWORK_OFFLINE')).not.toHaveLength(0);
    expect(screen.getByText('Sin conexión')).toBeTruthy();
    ui.setOffline(false);
    await press('Reintentar');
    expect(await screen.findByText(/R2 puede acompañarte al salón/)).toBeTruthy();
    expect((await only()).state).toBe('ORIENTING');
  });

  it('keeps the evaluation when the service refuses it twice', async () => {
    await vipOnRoute();
    await press('Marcar llegada al destino');
    await press('Entendido');
    await press('Marcar regreso a recepción');
    await press('Sí, terminé');
    await ui.client('R1').submitFeedback((await only()).id, { robotRating: 5 });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Servicios del club: 3' }));
    await press('Enviar');
    expect(await screen.findByText('Ya enviaste tu evaluación de esta visita.')).toBeTruthy();
  });

  it('a presenter can restart the visit at any point', async () => {
    await kiosk();
    await arriveAs('Andrés · miembro', 'Andrés');
    await press('Operación');
    await press('Reiniciar esta visita');
    expect(screen.getByRole('heading', { name: 'Bienvenido a N Club' })).toBeTruthy();
  });

  it('resumes the visit of a person who was already open when recognised', async () => {
    await kiosk();
    await arriveAs('Andrés · miembro', 'Andrés');
    await press('Operación');
    await press('Reiniciar esta visita');
    await show('Andrés · miembro');
    expect(await heading('Andrés, ¿eres tú?')).toBeTruthy();
    await press('Más opciones');
    await press('No soy yo');
    // The visit already existed: «No soy yo» must not close it.
    expect(await heading('No pude confirmar tu identidad')).toBeTruthy();
    expect((await only()).state).toBe('VERIFIED');
  });

  it('comes back to rest by itself after the farewell countdown', async () => {
    await render(<RobotScreen farewellSeconds={1} />);
    await arriveAs('Andrés · miembro', 'Andrés');
    await screen.findByText(/Andrés, bienvenido/);
    await press('Nada por ahora');
    await press('Continuar');
    await press('Ir a mi reserva del salón');
    await pressWhenReady('Sí, con R2');
    await press('Operación');
    await pressWhenReady('Marcar llegada al destino');
    await pressWhenReady('Entendido');
    await press('Marcar regreso a recepción');
    await press('Sí, terminé');
    await pressWhenReady('Prefiero no participar');
    expect(screen.getByText(/Hasta pronto, Andrés/)).toBeTruthy();
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Bienvenido a N Club' })).toBeTruthy(),
      { timeout: 4000 },
    );
  });
});

describe('RobotScreen · the other categories', () => {
  it('Camila goes with Sara, a person: there is no robot failure to simulate', async () => {
    await kiosk();
    await arriveAs('Camila · miembro', 'Camila');
    await screen.findByText(/Camila, bienvenida/);
    await press('Té');
    expect(screen.getByText('Anotado. Te indicaremos dónde recibirlo.')).toBeTruthy();
    await press('Continuar');
    await press('Voy a mi reserva de tenis');
    await pressWhenReady('Ir con Sara');
    expect(await screen.findByText('Sara · Acompañando')).toBeTruthy();
    await press('Operación');
    expect(
      screen.getByRole('button', { name: 'Reportar falla del robot' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(await only()).toMatchObject({ ownerId: 'U-01', destination: 'Cancha de tenis' });
  });

  it('declining the escort gives directions only: the visit goes on with the reception robot', async () => {
    await kiosk();
    await arriveAs('Camila · miembro', 'Camila');
    await screen.findByText(/Camila, bienvenida/);
    await press('Nada por ahora');
    await press('Continuar');
    await press('Voy a mi reserva de tenis');
    await pressWhenReady('Recibir indicaciones');
    expect(await screen.findByLabelText('Robot R1 · Recepción')).toBeTruthy();
    expect(await only()).toMatchObject({ ownerId: 'R1', state: 'IN_PROGRESS' });
  });

  it('the guest hears her host in the script and can contact them on arrival', async () => {
    await kiosk();
    await arriveAs('Valentina · no miembro', 'Valentina');
    expect(await screen.findByText(/Male indicó que te gusta el agua aromática/)).toBeTruthy();
    await press('Agua aromática');
    await press('Continuar');
    expect(screen.getByText(/Male indicó que te espera en la terraza/)).toBeTruthy();
    await press('Sí, acompáñame');
    await pressWhenReady('Sí, con R2');
    await press('Operación');
    await pressWhenReady('Marcar llegada al destino');
    expect(await screen.findByRole('button', { name: 'Contactar a Male' })).toBeTruthy();
  });

  it('a guest who prefers a person of the team goes with Sara', async () => {
    await kiosk();
    await arriveAs('Valentina · no miembro', 'Valentina');
    await screen.findByText(/Male indicó/);
    await press('Nada por ahora');
    await press('Continuar');
    await press('Sí, acompáñame');
    await pressWhenReady('Prefiero ir con una persona del equipo');
    expect(await screen.findByText('Sara · Acompañando')).toBeTruthy();
  });

  it('staff go on their own with no escort and no robot failure to simulate', async () => {
    await kiosk();
    await arriveAs('Mario · no miembro', 'Mario');
    await press('Verlo en mi teléfono');
    expect(screen.getByText(/Te envié el resumen a tu teléfono/)).toBeTruthy();
    expect(screen.queryByText(/reunión/)).toBeNull();
    await press('Sigo por mi cuenta');
    await pressWhenReady('Continuar');
    expect(await screen.findByText(/Operaciones queda por el corredor de servicio/)).toBeTruthy();
    expect(screen.getByLabelText('Robot R1 · Recepción')).toBeTruthy();
    expect(await only()).toMatchObject({ category: 'STAFF', state: 'IN_PROGRESS', ownerId: 'R1' });
    await press('Operación');
    expect(
      screen.getByRole('button', { name: 'Reportar falla del robot' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('the external worker is addressed as usted and goes with Sara', async () => {
    await kiosk();
    await arriveAs('Laura · no miembro', 'Laura');
    expect(
      await screen.findByText(/Su visita de mantenimiento está registrada para hoy/),
    ).toBeTruthy();
    await press('Continuar');
    await press('Sí, vamos');
    expect(await screen.findByText(/Sara la acompañará al punto autorizado/)).toBeTruthy();
    await press('Entendido');
    expect(await screen.findByText(/Espere la confirmación del responsable/)).toBeTruthy();
    expect(screen.getByText('Sara · Acompañando')).toBeTruthy();
    expect(await only()).toMatchObject({ category: 'EXTERNAL', ownerId: 'U-01' });
  });
});

describe('RobotScreen · presenter', () => {
  it('«Reiniciar datos» asks first and leaves the initial state', async () => {
    await kiosk();
    await arriveAs('Andrés · miembro', 'Andrés');
    await press('Operación');
    await press('Reiniciar datos');
    expect(screen.getByText('¿Reiniciar los datos?')).toBeTruthy();
    await press('Cancelar');
    expect((await visits()).length).toBe(1);
    await press('Reiniciar datos');
    await press('Reiniciar');
    expect(await screen.findByText(/Datos reiniciados/)).toBeTruthy();
    expect(await visits()).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Bienvenido a N Club' })).toBeTruthy();
    expect(screen.getByText('Hoy: Sábado 24 oct 2026')).toBeTruthy();
  });

  it('a reset that fails stays recoverable', async () => {
    await kiosk();
    await pressWhenReady('Operación');
    ui.setOffline(true);
    await press('Reiniciar datos');
    await press('Reiniciar');
    expect(await screen.findAllByText('Código: NETWORK_OFFLINE')).not.toHaveLength(0);
  });
});

describe('RobotScreen · navegación inferior', () => {
  it('conserva el reconocimiento al recorrer visitas, mapa, concierge y ajustes', async () => {
    await kiosk();
    await show('Andrés · miembro');
    await heading('Andrés, ¿eres tú?');
    for (const name of ['Inicio', 'Visitas', 'Mapa', 'Concierge', 'Ajustes']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('tab', { name: 'Visitas' }));
    expect(await screen.findByText('Llegadas y visitas')).toBeTruthy();
    expect(await screen.findByText('Andrés Mejía')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Mapa' }));
    expect(await screen.findByText('Destino del visitante')).toBeTruthy();
    expect(await screen.findByText('Salón reservado')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Concierge' }));
    expect(await screen.findByRole('button', { name: 'Pedir ayuda' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Ajustes' }));
    expect(await screen.findByRole('button', { name: 'Reiniciar datos' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Inicio' }));
    expect(await heading('Andrés, ¿eres tú?')).toBeTruthy();
  });
});
