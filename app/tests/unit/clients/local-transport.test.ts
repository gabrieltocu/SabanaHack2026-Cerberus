import type { ApiHandler, ApiRequest } from '@/api/http';
import { createCerberusClient } from '@/infrastructure/clients/cerberus-client';
import { createDefaultClient, createTransport, dataMode } from '@/infrastructure/clients/config';
import { createLocalTransport, onRemoteWrite } from '@/infrastructure/clients/local-transport';

class FakeChannel {
  static instances: FakeChannel[] = [];
  messages: unknown[] = [];
  onmessage: (() => void) | null = null;
  closed = false;
  constructor(readonly name: string) {
    FakeChannel.instances.push(this);
  }
  postMessage(m: unknown) {
    this.messages.push(m);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeChannel.instances = [];
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeChannel;
});
afterEach(() => {
  delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
});

test('traduce la petición a ApiRequest con IP local, cabeceras en minúscula y copia del cuerpo', async () => {
  const seen: ApiRequest[] = [];
  const app: ApiHandler = async (req) => {
    seen.push(req);
    return { status: 201, headers: { 'idempotency-replayed': 'true' }, body: { echo: req.body } };
  };
  const transport = createLocalTransport({ app });
  const body = { a: 1, skip: undefined };
  const res = await transport({
    method: 'POST',
    path: '/invitations/?x=1&y=dos',
    body,
    headers: { 'X-Demo-Actor': 'V-202' },
  });
  expect(seen[0]).toEqual({
    method: 'POST',
    path: '/invitations',
    query: { x: '1', y: 'dos' },
    headers: { 'x-demo-actor': 'V-202', 'content-type': 'application/json' },
    body: { a: 1 },
    ip: 'local',
  });
  expect(res).toEqual({
    status: 201,
    headers: { 'idempotency-replayed': 'true' },
    body: { echo: { a: 1 } },
  });
});

test('emite un evento por canal solo tras las escrituras', async () => {
  const app: ApiHandler = async () => ({ status: 200, body: { ok: true } });
  const transport = createLocalTransport({ app });
  await transport({ method: 'GET', path: '/health' });
  await transport({ method: 'POST', path: '/visits/vis-1/close' });
  const [channel] = FakeChannel.instances;
  expect(channel?.name).toBe('cerberus');
  expect(channel?.messages).toEqual([
    { type: 'write', method: 'POST', path: '/visits/vis-1/close' },
  ]);
});

test('sin BroadcastChannel funciona igual y onRemoteWrite no hace nada', async () => {
  delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  const transport = createLocalTransport({ app: async () => ({ status: 200, body: undefined }) });
  expect(await transport({ method: 'POST', path: '/x', body: {} })).toMatchObject({ status: 200 });
  expect(onRemoteWrite(() => {})()).toBeUndefined();
});

test('onRemoteWrite escucha el canal y se da de baja', () => {
  const calls: number[] = [];
  const off = onRemoteWrite(() => calls.push(1));
  const channel = FakeChannel.instances.at(-1)!;
  channel.onmessage?.();
  off();
  expect(calls).toEqual([1]);
  expect(channel.closed).toBe(true);
});

test('un BroadcastChannel que lanza se ignora', async () => {
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = class {
    constructor() {
      throw new Error('no disponible');
    }
  };
  const transport = createLocalTransport({ app: async () => ({ status: 200, body: {} }) });
  expect((await transport({ method: 'POST', path: '/x', body: {} })).status).toBe(200);
});

test('por defecto ejecuta la API real sobre localStorage y el cliente la entiende', async () => {
  const client = createCerberusClient(createLocalTransport());
  const health = await client.getHealth();
  expect(health).toMatchObject({ contract: 'v1', storage: 'browser' });
});

test('config: solo EXPO_PUBLIC_DATA_MODE=api elige HTTP', async () => {
  expect(dataMode('api')).toBe('api');
  expect(dataMode('mock')).toBe('mock');
  expect(dataMode(undefined, false)).toBe('mock');
  expect(dataMode('cualquier-cosa', false)).toBe('mock');
  expect(typeof createTransport('api', 'https://x.test/api/v1')).toBe('function');
  const client = createDefaultClient('U-01');
  expect((await client.getHealth()).status).toBe('ok');
});
