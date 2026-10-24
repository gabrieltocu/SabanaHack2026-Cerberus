// C04-CP08: el quiosco no avanza con respuestas viejas, no deja botones activos con una petición
// en vuelo y dice la razón cuando el despliegue exige el token del robot.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { RobotScreen } from '@/features/screens/RobotScreen';
import type { Transport, TransportRequest } from '@/infrastructure/clients/transport';
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
let faults: {
  times: number;
  match: (r: TransportRequest) => boolean;
  status: number;
  code: string;
}[];
let held: { match: (r: TransportRequest) => boolean; waiting: (() => void)[] } | undefined;

beforeEach(() => {
  ui = createUiApi();
  faults = [];
  held = undefined;
  mockTransport = async (req) => {
    const fault = faults.find((f) => f.times > 0 && f.match(req));
    if (fault) {
      fault.times -= 1;
      return { status: fault.status, body: { error: { code: fault.code, message: 'simulado' } } };
    }
    const gate = held;
    if (gate?.match(req)) await new Promise<void>((r) => gate.waiting.push(r));
    return ui.transport(req);
  };
});

const hold = (match: (r: TransportRequest) => boolean) => {
  held = { match, waiting: [] };
  return held;
};
const releaseHeld = async () => {
  const gate = held;
  held = undefined;
  await act(async () => gate?.waiting.forEach((r) => r()));
};
const queued = (gate: NonNullable<typeof held>) =>
  waitFor(() => expect(gate.waiting.length).toBeGreaterThan(0));

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const pressWhenReady = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));
const heading = (name: string | RegExp) => screen.findByRole('heading', { name });
const kiosk = () => render(<RobotScreen farewellSeconds={600} />);

async function recognize(face: string, who: string) {
  await pressWhenReady('Comenzar');
  await pressWhenReady(face);
  expect(await heading(`${who}, ¿eres tú?`)).toBeTruthy();
}
const confirmIdentity = () => press('Confirmar y notificar');

/** The presenter drawer is shared by the stages: open it only if it is closed. */
async function restartVisit() {
  if (!screen.queryByRole('button', { name: 'Reiniciar esta visita' })) await press('Operación');
  await press('Reiniciar esta visita');
}

/** A visit opened through the API: recognised, oriented and escorted by `escort`. */
async function visitWith(candidateId: string, escort: string, arrive = false) {
  const r1 = ui.client('R1');
  const { visit } = await r1.createRecognitionEvent({
    source: { kind: 'SIMULATOR', id: 'R1' },
    face: { status: 'MATCH', classHint: 'MEMBER', candidateId, confidence: 0.97 },
  });
  await r1.advanceVisit(visit.id, { event: 'START_ORIENTATION' });
  await r1.advanceVisit(visit.id, {
    event: 'ASSIGN_ESCORT',
    assigneeId: escort,
    visitorAccepted: true,
  });
  if (arrive) await ui.client(escort).advanceVisit(visit.id, { event: 'ARRIVE' });
  return visit;
}

describe('RobotScreen · «No soy yo»', () => {
  it('si no se puede cerrar la visita, se queda en la confirmación con su error y reintento', async () => {
    await kiosk();
    await recognize('Andrés · miembro', 'Andrés');
    faults.push({
      times: 1,
      match: (r) => /\/close$/.test(r.path),
      status: 503,
      code: 'STORAGE_UNAVAILABLE',
    });
    await press('Más opciones');
    await press('No soy yo');
    expect(await screen.findByText('Código: API_UNAVAILABLE')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar y notificar' })).toBeTruthy();
    const [open] = (await ui.client().listVisits()).items.filter((v) => v.state !== 'EXPECTED');
    expect(open!.state).toBe('VERIFIED');

    await press('Reintentar');
    expect(await heading('No pude confirmar tu identidad')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar y notificar' })).toBeNull();
    const [closed] = (await ui.client().listVisits()).items.filter((v) => v.state !== 'EXPECTED');
    expect(closed!.state).toBe('CLOSED');
  });
});

describe('RobotScreen · respuestas de otra visita', () => {
  it('el seguimiento del relevo de una visita reiniciada no mueve la pantalla de la siguiente', async () => {
    const a = await visitWith('V-201', 'R2');
    await ui
      .client('R2')
      .reportRobotFailure('R2', { code: 'MOTOR_FAULT', lastKnownPoint: 'Pasillo' });
    const gate = hold((r) => r.method === 'GET' && r.path === `/visits/${a.id}`);
    await kiosk();
    await recognize('Andrés · miembro', 'Andrés');
    await confirmIdentity();
    expect(await heading('Tengo un inconveniente')).toBeTruthy();
    await queued(gate);

    // Sofía finishes the walk while the kiosk is still waiting for the answer about A.
    const [handoff] = (await ui.client().listHandoffs({ visitId: a.id })).items;
    const sofia = ui.client('U-02');
    await sofia.acceptHandoff(handoff!.id);
    await sofia.transferHandoffContext(handoff!.id);
    await sofia.confirmHandoff(handoff!.id);
    await sofia.advanceVisit(a.id, { event: 'ARRIVE' });

    // The presenter restarts, and Camila (her visit waits for relief too) arrives.
    await restartVisit();
    const b = await visitWith('V-202', 'R3');
    await ui
      .client('R3')
      .reportRobotFailure('R3', { code: 'MOTOR_FAULT', lastKnownPoint: 'Pasillo' });
    await recognize('Camila · miembro', 'Camila');
    await confirmIdentity();
    expect(await heading('Tengo un inconveniente')).toBeTruthy();

    await releaseHeld();
    // The late answer says «llegaron» about A: B still waits for its own relief.
    expect(await heading('Tengo un inconveniente')).toBeTruthy();
    expect(screen.queryByText(/Llegamos al salón/)).toBeNull();
    expect((await ui.client().getVisit(b.id)).state).toBe('WAITING_HANDOFF');
  });

  it('la salida asistida de una visita reiniciada no cierra la pantalla de la siguiente', async () => {
    const a = await visitWith('V-201', 'U-02', true);
    const b = await visitWith('V-202', 'U-01', true);
    const gate = hold((r) => r.method === 'GET' && r.path === `/visits/${a.id}`);
    await kiosk();
    await recognize('Andrés · miembro', 'Andrés');
    await confirmIdentity();
    expect(await screen.findByText(/Sofía confirmará tu salida/)).toBeTruthy();
    await queued(gate);

    await restartVisit();
    await ui.client('U-02').closeVisit(a.id, { method: 'MANUAL' });
    await recognize('Camila · miembro', 'Camila');
    await confirmIdentity();
    expect(await screen.findByText(/Sara confirmará tu salida/)).toBeTruthy();

    await releaseHeld();
    expect(screen.getByText(/Sara confirmará tu salida/)).toBeTruthy();
    expect(screen.queryByText('Servicio de los robots')).toBeNull();
    expect((await ui.client().getVisit(b.id)).state).toBe('IN_PROGRESS');
  });
});

describe('RobotScreen · una petición a la vez', () => {
  it('«Volver» del QR queda bloqueado mientras se comprueba el pase', async () => {
    await kiosk();
    await pressWhenReady('Tengo un código QR');
    const token = (await ui.client('O-01').listInvitations({ hostId: 'V-209' })).items[0]!.qr.token;
    await fireEvent.changeText(screen.getByLabelText('O escribe el código de tu pase'), token);
    const gate = hold((r) => r.path === '/access/verify');
    await press('Comprobar');
    await queued(gate);
    expect(screen.getByRole('button', { name: 'Volver' })).toBeDisabled();
    await releaseHeld();
    expect(await heading(/¿eres tú\?/)).toBeTruthy();
  });

  it('«Reiniciar esta visita» queda bloqueado mientras hay una petición en vuelo', async () => {
    await kiosk();
    await recognize('Andrés · miembro', 'Andrés');
    await confirmIdentity();
    await screen.findByText(/Andrés, bienvenido/);
    await press('Nada por ahora');
    await press('Continuar');
    await press('Operación');
    const gate = hold((r) => /\/advance$/.test(r.path));
    await press('Ir a mi reserva del salón');
    await queued(gate);
    expect(screen.getByRole('button', { name: 'Reiniciar esta visita' })).toBeDisabled();
    await releaseHeld();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reiniciar esta visita' })).toBeEnabled(),
    );
  });
});

describe('RobotScreen · falla con llave del robot', () => {
  it('un 401 explica que la acción necesita la llave del robot, sin reintento inútil', async () => {
    await kiosk();
    await recognize('Andrés · miembro', 'Andrés');
    await confirmIdentity();
    await screen.findByText(/Andrés, bienvenido/);
    await press('Café');
    await press('Continuar');
    await press('Ir a mi reserva del salón');
    await pressWhenReady('Sí, con R2');
    await screen.findByText('Robot R2 · Acompañando');
    await press('Operación');
    faults.push({
      times: 1,
      match: (r) => /\/robots\/R2\/failure$/.test(r.path),
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    await press('Reportar falla del robot');
    expect(await screen.findByText('Esta acción necesita la llave del robot.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tengo un inconveniente' })).toBeNull();
  });
});
