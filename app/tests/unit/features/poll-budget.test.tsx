// Presupuesto de sondeo en modo API (plan gratuito de Upstash: cada petición cuesta comandos):
// con un transporte contador, cada pantalla abierta 60 s simulados no pasa de su tope.
import { act, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ActivitiesPage } from '@/features/pages/ActivitiesPage';
import { InvitePage } from '@/features/pages/InvitePage';
import { MemberPage } from '@/features/pages/MemberPage';
import { StaffPage } from '@/features/pages/StaffPage';
import { AttendantScreen } from '@/features/screens/AttendantScreen';
import { HomeScreen } from '@/features/screens/HomeScreen';
import { RobotScreen } from '@/features/screens/RobotScreen';
import type { Transport } from '@/infrastructure/clients/transport';
import { createUiApi } from '../../support/ui-api';

let mockTransport: Transport;
jest.mock('@/features/data/api', () => {
  // `useApi` sondea por defecto solo en modo API: se fija antes de cargar el módulo real.
  process.env.EXPO_PUBLIC_DATA_MODE = 'api';
  const actual = jest.requireActual('@/features/data/api');
  const { createCerberusClient } = jest.requireActual('@/infrastructure/clients/cerberus-client');
  return {
    ...actual,
    clientFor: (actor?: string) => createCerberusClient(mockTransport, actor),
  };
});

afterEach(() => {
  jest.useRealTimers();
});

/** Peticiones que hace `element` en 60 s de reloj simulado (carga inicial incluida). */
async function requestsIn60s(element: ReactElement): Promise<number> {
  jest.useFakeTimers();
  const ui = createUiApi();
  let n = 0;
  mockTransport = (req) => {
    n += 1;
    return ui.transport(req);
  };
  const view = await render(element);
  await act(async () => {});
  for (let s = 0; s < 60; s++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
  await view.unmount();
  return n;
}

const noop = () => {};

describe('presupuesto de sondeo en modo API', () => {
  it('MemberPage: solo visitas e invitaciones siguen a 3 s (≤ 45 en 60 s)', async () => {
    const n = await requestsIn60s(
      <MemberPage perfil="V-202" onInvite={noop} onViewActivities={noop} onOpenPass={noop} />,
    );
    expect(n).toBeLessThanOrEqual(45);
  });

  it('AttendantScreen: relevos y visitas a 3 s, el directorio una vez (≤ 45)', async () => {
    expect(await requestsIn60s(<AttendantScreen />)).toBeLessThanOrEqual(45);
  });

  it('RobotScreen en reposo: solo la carga inicial (≤ 3)', async () => {
    expect(await requestsIn60s(<RobotScreen />)).toBeLessThanOrEqual(3);
  });

  it('HomeScreen, StaffPage, ActivitiesPage e InvitePage no sondean datos estáticos', async () => {
    expect(await requestsIn60s(<HomeScreen onNavigate={noop} />)).toBeLessThanOrEqual(44);
    expect(await requestsIn60s(<StaffPage onViewActivities={noop} />)).toBeLessThanOrEqual(24);
    expect(await requestsIn60s(<ActivitiesPage onBack={noop} />)).toBeLessThanOrEqual(2);
    expect(
      await requestsIn60s(<InvitePage perfil="V-202" onBack={noop} onOpenPass={noop} />),
    ).toBeLessThanOrEqual(2);
  });
});
