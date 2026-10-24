// C04-CP08: edecán sin callejones, sin dobles envíos y sin reintentos en cada sondeo.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { clearPause } from '@/features/data/api';
import { AttendantScreen } from '@/features/screens/AttendantScreen';
import type { Transport, TransportRequest } from '@/infrastructure/clients/transport';
import { createUiApi, escortedVip, type UiApi } from '../../support/ui-api';

let mockTransport: Transport;
jest.mock('@/features/data/api', () => {
  // El sondeo por defecto solo existe en modo API.
  process.env.EXPO_PUBLIC_DATA_MODE = 'api';
  const actual = jest.requireActual('@/features/data/api');
  const { createCerberusClient } = jest.requireActual('@/infrastructure/clients/cerberus-client');
  return {
    ...actual,
    clientFor: (actor?: string) => createCerberusClient(mockTransport, actor),
  };
});

type Gate = { match: (r: TransportRequest) => boolean; fail?: { status: number; code: string } };

let ui: UiApi;
let sent: TransportRequest[];
let faults: (Gate & { times: number })[];
let held: { match: (r: TransportRequest) => boolean; waiting: (() => void)[] } | undefined;
const hold = (match: (r: TransportRequest) => boolean) => {
  held = { match, waiting: [] };
  return held;
};
/** Lets every held request go (a write also wakes the other hooks, so several can queue). */
const releaseHeld = async () => {
  const gate = held;
  held = undefined;
  await act(async () => gate?.waiting.forEach((r) => r()));
};

beforeEach(() => {
  clearPause();
  ui = createUiApi();
  sent = [];
  faults = [];
  held = undefined;
  mockTransport = async (req) => {
    sent.push(req);
    const fault = faults.find((f) => f.times > 0 && f.match(req));
    if (fault?.fail) {
      fault.times -= 1;
      const { status, code } = fault.fail;
      return { status, body: { error: { code, message: 'simulado' } } };
    }
    const gate = held;
    if (gate?.match(req)) await new Promise<void>((r) => gate.waiting.push(r));
    return ui.transport(req);
  };
});
afterEach(() => {
  jest.useRealTimers();
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const pressWhenReady = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));
const events = (event: string) =>
  sent.filter(
    (r) =>
      r.method === 'POST' &&
      /\/advance$/.test(r.path) &&
      (r.body as { event?: string })?.event === event,
  );
const code = () => screen.getByLabelText('Código del pase');

const seededToken = async () =>
  (await ui.client('O-01').listInvitations({ hostId: 'V-209' })).items[0]!.qr.token;

/** Sofía walks Camila's visit and then validates Valentina's pass: a confirmed visit in her name. */
async function sofiaBusyWithAnotherVisit() {
  const r1 = ui.client('R1');
  const { visit: first } = await r1.createRecognitionEvent({
    source: { kind: 'SIMULATOR', id: 'R1' },
    face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-202', confidence: 0.97 },
  });
  await r1.advanceVisit(first.id, { event: 'START_ORIENTATION' });
  await r1.advanceVisit(first.id, {
    event: 'ASSIGN_ESCORT',
    assigneeId: 'U-02',
    visitorAccepted: true,
  });
  const granted = await ui.client('U-02').verifyAccess({ token: await seededToken() });
  if (granted.decision !== 'GRANTED') throw new Error('el pase de ejemplo debe ser válido');
  return { first, visit: granted.visit };
}

const BUSY_TEXT = 'Ya tienes una visita en curso. Llega a su destino antes de comenzar otra.';

describe('AttendantScreen · «Comenzar acompañamiento» sin callejón', () => {
  it('si el segundo evento falla, la visita queda en orientación, lo dice y se puede reintentar sin repetir el primero', async () => {
    const { first, visit } = await sofiaBusyWithAnotherVisit();
    await render(<AttendantScreen />);
    await pressWhenReady('Comenzar acompañamiento');
    expect(await screen.findByText(new RegExp(BUSY_TEXT))).toBeTruthy();
    expect(screen.getByText(/La orientación ya quedó iniciada/)).toBeTruthy();
    expect(screen.queryByText(/No se hizo ningún cambio/)).toBeNull();
    expect((await ui.client().getVisit(visit.id)).state).toBe('ORIENTING');
    // The card keeps its action in ORIENTING: it is not a dead end.
    const again = await screen.findByRole('button', { name: 'Comenzar acompañamiento' });
    expect(again).toBeTruthy();

    // Arriving frees the escort; the retry only assigns, it does not start the orientation again.
    await ui.client('U-02').advanceVisit(first.id, { event: 'ARRIVE' });
    await press('Comenzar acompañamiento');
    expect(await screen.findByText('Acompañas a Valentina Restrepo.')).toBeTruthy();
    expect(events('START_ORIENTATION')).toHaveLength(1);
    expect(events('ASSIGN_ESCORT')).toHaveLength(2);
    expect((await ui.client().getVisit(visit.id)).state).toBe('IN_PROGRESS');
  });

  it('ESCORT_NOT_ALLOWED tiene su propio texto, no el de «ocupado»', async () => {
    await ui.client('U-02').verifyAccess({ token: await seededToken() });
    faults.push({
      times: 1,
      match: (r) => (r.body as { event?: string } | undefined)?.event === 'ASSIGN_ESCORT',
      fail: { status: 422, code: 'ESCORT_NOT_ALLOWED' },
    });
    await render(<AttendantScreen />);
    await pressWhenReady('Comenzar acompañamiento');
    expect(await screen.findByText(/no está disponible ahora/)).toBeTruthy();
    expect(screen.queryByText(new RegExp(BUSY_TEXT))).toBeNull();
    expect(screen.queryByText(/ocupados/)).toBeNull();
  });
});

describe('AttendantScreen · una acción a la vez', () => {
  it('mientras la acción está en vuelo y hasta recargar, los botones de la visita están bloqueados', async () => {
    await ui.client('U-02').verifyAccess({ token: await seededToken() });
    await render(<AttendantScreen />);
    const start = await screen.findByRole('button', { name: 'Comenzar acompañamiento' });
    const close = screen.getByRole('button', { name: 'Cerrar visita' });
    // The reload after the write is held: the old card must not be pressable meanwhile.
    const gate = hold((r) => r.method === 'GET' && r.path.startsWith('/visits'));
    await fireEvent.press(start);
    await fireEvent.press(start);
    expect(screen.getByRole('button', { name: 'Comenzar acompañamiento' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Comenzar acompañamiento' }).props.accessibilityState,
    ).toMatchObject({ busy: true });
    expect(screen.getByRole('button', { name: 'Cerrar visita' })).toBeDisabled();
    expect(close).toBeTruthy();
    await waitFor(() => expect(gate.waiting.length).toBeGreaterThan(0));
    await releaseHeld();
    expect(await screen.findByText('Acompañas a Valentina Restrepo.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Confirmar llegada a/ })).toBeEnabled(),
    );
    expect(events('START_ORIENTATION')).toHaveLength(1);
    expect(events('ASSIGN_ESCORT')).toHaveLength(1);
  });

  it('Enter dos veces en el código del pase hace una sola comprobación', async () => {
    await render(<AttendantScreen />);
    await screen.findByText('No hay tareas pendientes.');
    await fireEvent.changeText(code(), await seededToken());
    const gate = hold((r) => r.path === '/access/verify');
    await fireEvent(code(), 'submitEditing');
    await fireEvent(code(), 'submitEditing');
    await waitFor(() => expect(gate.waiting.length).toBeGreaterThan(0));
    await releaseHeld();
    expect(await screen.findByText(/Pase válido/)).toBeTruthy();
    expect(sent.filter((r) => r.path === '/access/verify')).toHaveLength(1);
  });
});

describe('AttendantScreen · contexto del relevo', () => {
  it('si no llega el contexto no se reintenta en cada sondeo: un botón lo pide de nuevo', async () => {
    await escortedVip(ui);
    const handoff = (
      await ui
        .client('R2')
        .reportRobotFailure('R2', { code: 'MOTOR_FAULT', lastKnownPoint: 'Pasillo' })
    ).handoffs[0]!;
    const sofia = ui.client('U-02');
    await sofia.acceptHandoff(handoff.id);
    await sofia.transferHandoffContext(handoff.id);
    const contextCalls = () => sent.filter((r) => /\/handoffs\/.+\/context$/.test(r.path)).length;
    faults.push({
      times: 1,
      match: (r) => /\/handoffs\/.+\/context$/.test(r.path),
      fail: { status: 503, code: 'STORAGE_UNAVAILABLE' },
    });
    jest.useFakeTimers();
    await render(<AttendantScreen />);
    await act(async () => {});
    expect(contextCalls()).toBe(1);
    for (let s = 0; s < 12; s++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(contextCalls()).toBe(1);
    expect(screen.getByText(/No pudimos traer el contexto/)).toBeTruthy();
    await press('Reintentar');
    await act(async () => {});
    expect(contextCalls()).toBe(2);
    expect(await screen.findByText('Contexto de la visita')).toBeTruthy();
    expect(screen.queryByText(/No pudimos traer el contexto/)).toBeNull();
  });
});
