// C04-CP08: la portada no reinicia dos veces y cambiar de perfil no deja datos ni formularios del anterior.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { InvitePage } from '@/features/pages/InvitePage';
import { MemberPage } from '@/features/pages/MemberPage';
import { HomeScreen } from '@/features/screens/HomeScreen';
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
let sent: TransportRequest[];
let held: { match: (r: TransportRequest) => boolean; waiting: (() => void)[] } | undefined;

beforeEach(() => {
  ui = createUiApi();
  sent = [];
  held = undefined;
  mockTransport = async (req) => {
    sent.push(req);
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
const resets = () => sent.filter((r) => r.path === '/demo/reset');
const noop = () => {};

describe('HomeScreen · un reinicio a la vez', () => {
  it('elegir fecha dos veces o reiniciar mientras otro reinicio está en vuelo envía uno solo', async () => {
    await render(<HomeScreen onNavigate={noop} />);
    await screen.findByRole('link', { name: 'Sofía, Socio VIP' });
    await press('Ajustes');
    const gate = hold((r) => r.path === '/demo/reset');
    await fireEvent.press(screen.getByRole('radio', { name: 'Martes 27 oct 2026' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Martes 27 oct 2026' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Sábado 24 oct 2026' }));
    await queued(gate);
    expect(screen.getByRole('button', { name: 'Reiniciar datos' })).toBeDisabled();
    expect(
      screen.getByRole('radio', { name: 'Sábado 24 oct 2026' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    await releaseHeld();
    expect(await screen.findByText('Fecha de trabajo: Martes 27 oct 2026.')).toBeTruthy();
    expect(resets()).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reiniciar datos' })).toBeEnabled(),
    );
  });
});

describe('cambiar de perfil', () => {
  it('MemberPage no muestra al socio anterior mientras carga el siguiente', async () => {
    const page = (perfil: string) => (
      <MemberPage perfil={perfil} onInvite={noop} onViewActivities={noop} onOpenPass={noop} />
    );
    const view = await render(page('V-201'));
    expect(await screen.findByText(/Andrés/)).toBeTruthy();
    const gate = hold((r) => r.path === '/people/V-202');
    await view.rerender(page('V-202'));
    await queued(gate);
    expect(screen.queryByText(/Andrés/)).toBeNull();
    await releaseHeld();
    expect(await screen.findByText(/Camila/)).toBeTruthy();
  });

  it('InvitePage deja el formulario vacío al pasar a otro anfitrión', async () => {
    const page = (perfil: string) => <InvitePage perfil={perfil} onBack={noop} onOpenPass={noop} />;
    const view = await render(page('V-201'));
    const field = await screen.findByLabelText('Nombre de tu invitado');
    await fireEvent.changeText(field, 'Sebastián Lozano');
    expect(screen.getByLabelText('Nombre de tu invitado').props.value).toBe('Sebastián Lozano');
    await view.rerender(page('V-202'));
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre de tu invitado').props.value).toBe(''),
    );
  });
});
