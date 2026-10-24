// API en memoria para las pruebas de pantallas con datos reales: `createApp` con reloj controlable
// detrás de `clientFor`. Cada prueba empieza con `freshApi()`; `failOn` simula caídas de una ruta.
import { createApp } from '@/api/app';
import { createCerberusClient } from '@/infrastructure/clients/cerberus-client';
import { ApiError } from '@/infrastructure/clients/errors';
import { createLocalTransport } from '@/infrastructure/clients/local-transport';
import type { Transport } from '@/infrastructure/clients/transport';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';

import { T_DEMO, seededRandom } from './api-harness';

interface Fault {
  method: string;
  path: RegExp;
  times: number;
  /** Respuesta de error del contrato; sin ella, un fallo de red. */
  reply?: { status: number; code: string };
}

let inner: Transport | undefined;
let faults: Fault[] = [];
let wall = Date.parse(T_DEMO);
let count = 0;

export function freshApi(now = T_DEMO) {
  faults = [];
  wall = Date.parse(now);
  inner = createLocalTransport({
    app: createApp({
      store: createMemoryStore(),
      clock: { now: () => new Date(wall) },
      random: seededRandom(),
      storage: 'memory',
      resetEnabled: true,
    }),
    channelName: `test-demo-api-${++count}`,
  });
}

/** Avanza el reloj de pared, y con él el de la demostración. */
export const advanceClock = (ms: number) => {
  wall += ms;
};

const transport: Transport = async (req) => {
  const fault = faults.find((f) => f.times > 0 && f.method === req.method && f.path.test(req.path));
  if (fault) {
    fault.times -= 1;
    if (!fault.reply) throw new ApiError(0, 'NETWORK_ERROR', 'Fallo de transporte simulado.');
    const { status, code } = fault.reply;
    return { status, body: { error: { code, message: 'Error simulado.' } } };
  }
  if (!inner) freshApi();
  return inner!(req);
};

/** Lo que reemplaza a `clientFor` en las pruebas. */
export const testClient = (actor?: string) => createCerberusClient(transport, actor);

/** Las próximas `times` peticiones que coincidan fallan por red, o con el error del contrato. */
export function failOn(
  method: 'GET' | 'POST',
  path: RegExp,
  times = 1,
  reply?: { status: number; code: string },
) {
  faults.push({ method, path, times, ...(reply ? { reply } : {}) });
}
