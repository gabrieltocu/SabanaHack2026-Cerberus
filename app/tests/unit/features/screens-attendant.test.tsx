import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { AttendantScreen } from '@/features/screens/AttendantScreen';
import type { Transport } from '@/infrastructure/clients/transport';
import { createUiApi, escortedVip, type UiApi } from '../../support/ui-api';

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
const findButton = (name: string | RegExp) => screen.findByRole('button', { name });
const pressWhenReady = async (name: string | RegExp) => fireEvent.press(await findButton(name));

/** The failure of R2 with Andrés, as the kiosk reports it. */
async function failR2() {
  await escortedVip(ui);
  const r = await ui
    .client('R2')
    .reportRobotFailure('R2', { code: 'MOTOR_FAULT', lastKnownPoint: 'Pasillo' });
  return r.handoffs[0]!;
}

describe('AttendantScreen · live data', () => {
  it('shows skeletons while it loads', async () => {
    mockTransport = () => new Promise(() => {});
    await render(<AttendantScreen />);
    expect(screen.getByLabelText('Cargando tareas')).toBeTruthy();
    expect(screen.queryByText('No hay tareas pendientes.')).toBeNull();
  });

  it('shows the team and the empty states once loaded', async () => {
    await render(<AttendantScreen />);
    expect(await screen.findByText('No hay tareas pendientes.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hola, Sofía' })).toBeTruthy();
    expect(screen.getByText('0 tareas pendientes')).toBeTruthy();
    expect(screen.getByText('No tienes una visita en curso.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Validar QR' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Visitas' }));
    expect(screen.getByText('No tienes una visita en curso.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Mensajes' }));
    expect(screen.getByText('Sin mensajes nuevos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));
    for (const member of [
      'R1, Recepción',
      'R2, Disponible',
      'Sara, Disponible',
      'Sofía, Disponible',
    ])
      expect(screen.getByLabelText(member)).toBeTruthy();
    await press(/^Mis visitas/);
    expect(screen.getByRole('tab', { name: 'Visitas' }).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('lists the relief the robot asked for, tagged as a simulation, and the team shows R2 stopped', async () => {
    await failR2();
    await render(<AttendantScreen />);
    expect(await screen.findByText('Relevo solicitado')).toBeTruthy();
    expect(screen.getByText('1 tarea pendiente')).toBeTruthy();
    expect(screen.getByText('Andrés · Socio VIP')).toBeTruthy();
    await press('Ver detalle de Andrés');
    expect(screen.getByText('De: R2 → A: Equipo')).toBeTruthy();
    expect(screen.getByText('Destino: Salón reservado')).toBeTruthy();
    expect(screen.getByText('Último punto confirmado: Pasillo')).toBeTruthy();
    expect(screen.getByText('Motivo: Falla de R2')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));
    expect(screen.getByLabelText('R2, Detenido')).toBeTruthy();
  });

  it('walks the relief and only then shows the visit in charge, owned by Sofía', async () => {
    const handoff = await failR2();
    await render(<AttendantScreen />);
    await pressWhenReady('Aceptar relevo');
    expect(
      await screen.findByText(
        'Aceptaste el relevo. R2 sigue siendo el responsable hasta que lo confirmes.',
      ),
    ).toBeTruthy();
    expect((await ui.client().getVisit(handoff.visitId)).ownerId).toBe('R2');
    expect(screen.getByText('No tienes una visita en curso.')).toBeTruthy();

    await pressWhenReady('Recibí el contexto');
    expect(await screen.findByText('Contexto recibido.')).toBeTruthy();
    expect(screen.getByText('Contexto de la visita')).toBeTruthy();
    expect(screen.getByText('Andrés Mejía · V-201')).toBeTruthy();
    expect(screen.getByText('Café')).toBeTruthy();
    expect(screen.getByText('Membresía vigente')).toBeTruthy();
    expect(screen.getByText('Acompañando, pasillo')).toBeTruthy();
    expect((await ui.client().getVisit(handoff.visitId)).ownerId).toBe('R2');

    await pressWhenReady('Confirmar relevo');
    expect(screen.getByText('¿Ya estás con Andrés?')).toBeTruthy();
    await press('Sí, asumo la visita');
    expect(await screen.findByText('Eres la responsable de la visita de Andrés.')).toBeTruthy();
    expect(await screen.findByText('Andrés Mejía')).toBeTruthy();
    expect(screen.getByText('Eres la responsable de esta visita. R2 queda liberado.')).toBeTruthy();
    expect(screen.getByText('0 tareas pendientes')).toBeTruthy();
    expect((await ui.client().getVisit(handoff.visitId)).ownerId).toBe('U-02');

    // Arrival and closing: both ask first, both are real events of the visit.
    await press('Confirmar llegada a Salón reservado');
    expect(screen.getByText('¿Llegaron a Salón reservado?')).toBeTruthy();
    await press('Sí, llegamos');
    expect(await screen.findByText('Llegada a Salón reservado registrada.')).toBeTruthy();
    expect((await ui.client().getVisit(handoff.visitId)).arrivedAt).not.toBeNull();
    await press('Cerrar visita');
    expect(screen.getByText('¿Cerrar la visita de Andrés?')).toBeTruthy();
    // The dialog's button shares the name of the card's: the dialog is the last one.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Cerrar visita' }).at(-1)!);
    expect(await screen.findByText('Visita cerrada.')).toBeTruthy();
    expect((await ui.client().getVisit(handoff.visitId)).state).toBe('CLOSED');
  });

  it('a reloaded panel in «contexto recibido» asks for the context again instead of losing it', async () => {
    const handoff = await failR2();
    const sofia = ui.client('U-02');
    await sofia.acceptHandoff(handoff.id);
    await sofia.transferHandoffContext(handoff.id);
    await render(<AttendantScreen />);
    expect(await screen.findByText('Contexto de la visita')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar relevo' })).toBeTruthy();
  });

  it('says another person won when someone accepts first, and refreshing drops the task', async () => {
    const handoff = await failR2();
    await render(<AttendantScreen />);
    const accept = await findButton('Aceptar relevo');
    // Straight to the handler, so this panel is not told and still shows the task.
    await ui.app({
      method: 'POST',
      path: `/handoffs/${handoff.id}/accept`,
      query: {},
      headers: { 'x-demo-actor': 'U-01' },
      body: undefined,
      ip: 'x',
    });
    await fireEvent.press(accept);
    expect(await screen.findByText('Otra persona del equipo ya aceptó este relevo.')).toBeTruthy();
    expect(screen.getByText('Código: HANDOFF_ALREADY_ACCEPTED')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceptar relevo' })).toBeNull();
    await press('Actualizar lista');
    expect(await screen.findByText('No hay tareas pendientes.')).toBeTruthy();
  });

  it('an expired request says so and the visit keeps its owner', async () => {
    const handoff = await failR2();
    await render(<AttendantScreen />);
    const accept = await findButton('Aceptar relevo');
    ui.advance(11 * 60_000);
    await fireEvent.press(accept);
    expect(
      await screen.findByText(
        'La solicitud de relevo venció sin aceptación. La visita sigue a cargo de quien la tenía.',
      ),
    ).toBeTruthy();
    expect((await ui.client().getVisit(handoff.visitId)).ownerId).toBe('R2');
    await press('Actualizar lista');
    expect(await screen.findByText('No hay tareas pendientes.')).toBeTruthy();
  });

  it('a busy attendant gets the reason, not a generic failure', async () => {
    const handoff = await failR2();
    // Sofía is already walking another visitor: the service refuses a second escort task.
    const r1 = ui.client('R1');
    const { visit } = await r1.createRecognitionEvent({
      source: { kind: 'SIMULATOR', id: 'R1' },
      face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-202', confidence: 0.97 },
    });
    await r1.advanceVisit(visit.id, { event: 'START_ORIENTATION' });
    await r1.advanceVisit(visit.id, {
      event: 'ASSIGN_ESCORT',
      assigneeId: 'U-02',
      visitorAccepted: true,
    });
    await render(<AttendantScreen />);
    await pressWhenReady('Aceptar relevo');
    expect(
      await screen.findByText(
        'Ya tienes una tarea de acompañamiento activa. Termínala para aceptar otra.',
      ),
    ).toBeTruthy();
    expect(handoff.state).toBe('REQUESTED');
  });

  it('«Rechazar» hides the task in this panel only', async () => {
    await failR2();
    await render(<AttendantScreen />);
    await pressWhenReady('Ver detalle de Andrés');
    await pressWhenReady('Rechazar');
    expect(screen.getByText('No hay tareas pendientes.')).toBeTruthy();
    expect((await ui.client().listHandoffs({ state: 'REQUESTED' })).count).toBe(1);
  });

  it('toggles availability', async () => {
    await render(<AttendantScreen />);
    await screen.findByText('No hay tareas pendientes.');
    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Estado: Disponible. Cambiar' }));
    expect(screen.getByRole('button', { name: 'Estado: Con una visita. Cambiar' })).toBeTruthy();
  });
});

describe('AttendantScreen · network', () => {
  it('a failed first load is a recoverable error, not a blank screen', async () => {
    ui.setOffline(true);
    await render(<AttendantScreen />);
    expect(
      await screen.findByText(
        'No hay conexión. Tus datos siguen aquí; puedes reintentar cuando vuelva la red.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Código: NETWORK_OFFLINE')).toBeTruthy();
    ui.setOffline(false);
    await press('Reintentar');
    expect(await screen.findByText('No hay tareas pendientes.')).toBeTruthy();
  });

  it('losing the connection later keeps the panel, says so and locks the writes', async () => {
    await failR2();
    await render(<AttendantScreen />);
    const accept = await findButton('Aceptar relevo');
    ui.setOffline(true);
    await fireEvent.press(accept);
    expect(await screen.findAllByText('Código: NETWORK_OFFLINE')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    ui.setOffline(false);
    await press('Reintentar');
    await waitFor(() => expect(screen.queryByText('Código: NETWORK_OFFLINE')).toBeNull());
  });
});

describe('AttendantScreen · validate a QR', () => {
  const seededToken = async () =>
    (await ui.client('O-01').listInvitations({ hostId: 'V-209' })).items[0]!.qr.token;
  const code = () => screen.getByLabelText('Código del pase');

  it('a pass the club does not know explains itself and keeps the field', async () => {
    await render(<AttendantScreen />);
    await screen.findByText('No hay tareas pendientes.');
    await fireEvent.changeText(code(), 'xx');
    await press('Validar QR');
    expect(
      screen.getByText('Este código no es válido. Revisa que sea el pase que recibiste.'),
    ).toBeTruthy();
    await fireEvent.changeText(code(), ['nq', 'y'.repeat(22)].join('_'));
    await press('Validar QR');
    expect(await screen.findByText('No encontramos este pase.')).toBeTruthy();
    expect(code().props.value).toBe(['nq', 'y'.repeat(22)].join('_'));
  });

  it('a valid pass opens a confirmed visit in her name that she can walk and close', async () => {
    await render(<AttendantScreen />);
    await screen.findByText('No hay tareas pendientes.');
    await fireEvent.changeText(code(), await seededToken());
    await press('Validar QR');
    expect(await screen.findByText('Pase válido: Valentina Restrepo · Invitado.')).toBeTruthy();
    expect(await screen.findByText('Confirmada')).toBeTruthy();
    await press('Comenzar acompañamiento');
    expect(await screen.findByText('Acompañas a Valentina Restrepo.')).toBeTruthy();
    await pressWhenReady('Confirmar llegada a Terraza');
    await press('Sí, llegamos');
    expect(await screen.findByText('Llegada a Terraza registrada.')).toBeTruthy();
    expect(screen.getByText('En el destino')).toBeTruthy();

    await fireEvent.changeText(code(), await seededToken());
    await press('Validar QR');
    expect(
      await screen.findByText(
        'Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.',
      ),
    ).toBeTruthy();
  });

  it('a person waiting for verification is listed and the pass is merged into that visit', async () => {
    const { visit } = await ui.client('R1').createRecognitionEvent({
      source: { kind: 'SIMULATOR', id: 'R1' },
      face: { status: 'UNKNOWN' },
    });
    await render(<AttendantScreen />);
    expect(await screen.findByText('Verificación')).toBeTruthy();
    expect(screen.getByText('Motivo: Rostro no reconocido')).toBeTruthy();
    await press('Validar el QR de Visitante sin identificar');
    expect(
      screen.getByText('El pase se vinculará con la visita de Visitante sin identificar.'),
    ).toBeTruthy();
    await fireEvent.changeText(code(), await seededToken());
    await press('Validar QR');
    expect(await screen.findByText('Pase válido: Valentina Restrepo · Invitado.')).toBeTruthy();
    const merged = await ui.client().getVisit(visit.id);
    expect(merged).toMatchObject({ state: 'CLOSED', closeReason: 'MERGED' });
    await waitFor(() => expect(screen.queryByText('Verificación')).toBeNull());
  });

  it('the link can be removed', async () => {
    await ui.client('R1').createRecognitionEvent({
      source: { kind: 'SIMULATOR', id: 'R1' },
      face: { status: 'ERROR', code: 'CAMERA_UNAVAILABLE' },
    });
    await render(<AttendantScreen />);
    expect(await screen.findByText('Motivo: Error de cámara')).toBeTruthy();
    await press('Validar el QR de Visitante sin identificar');
    await press('Quitar vínculo');
    expect(screen.queryByText(/El pase se vinculará/)).toBeNull();
  });

  it('a pass that fails with a network error says so', async () => {
    await render(<AttendantScreen />);
    await screen.findByText('No hay tareas pendientes.');
    ui.setOffline(true);
    await fireEvent.changeText(code(), await seededToken());
    await press('Validar QR');
    expect(await screen.findAllByText('Código: NETWORK_OFFLINE')).not.toHaveLength(0);
  });
});
