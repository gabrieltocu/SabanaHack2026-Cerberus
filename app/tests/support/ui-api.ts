// Arnés de las pruebas de pantallas: la API real en memoria detrás del transporte local, con
// reloj controlable y un interruptor para simular que la red falla. Cada prueba crea el suyo.
import { createApp } from '@/api/app';
import { createCerberusClient } from '@/infrastructure/clients/cerberus-client';
import { ApiError } from '@/infrastructure/clients/errors';
import { createLocalTransport } from '@/infrastructure/clients/local-transport';
import type { Transport } from '@/infrastructure/clients/transport';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';

import { T_DEMO, seededRandom } from './api-harness';

export function createUiApi(start: string = T_DEMO) {
  let t = Date.parse(start);
  // Each reading moves the clock a little, so the per-minute rate limits never block a long test.
  const clock = { now: () => new Date((t += 200)) };
  const app = createApp({
    store: createMemoryStore(),
    clock,
    random: seededRandom(),
    storage: 'memory',
    resetEnabled: true,
  });
  const local = createLocalTransport({ app });
  const state = { offline: false };
  const transport: Transport = async (req) => {
    if (state.offline) throw new ApiError(0, 'NETWORK_ERROR', 'sin red');
    return local(req);
  };
  return {
    app,
    transport,
    /** `true`: every call fails like a lost connection. */
    setOffline: (offline: boolean) => {
      state.offline = offline;
    },
    advance: (ms: number) => {
      t += ms;
    },
    client: (actor?: string) => createCerberusClient(local, actor),
  };
}
export type UiApi = ReturnType<typeof createUiApi>;

/** Leaves the demo VIP visit escorted by R2: recognised, oriented and assigned. */
export async function escortedVip(ui: UiApi) {
  const r1 = ui.client('R1');
  const { visit } = await r1.createRecognitionEvent({
    source: { kind: 'SIMULATOR', id: 'R1' },
    face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-201', confidence: 0.97 },
  });
  await r1.advanceVisit(visit.id, { event: 'START_ORIENTATION' });
  const escorted = await r1.advanceVisit(visit.id, {
    event: 'ASSIGN_ESCORT',
    assigneeId: 'R2',
    visitorAccepted: true,
  });
  return escorted;
}
