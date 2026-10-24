import { createApp } from '@/api/app';
import { fixedClock } from '@/domain/clock';
import { Health } from '@/infrastructure/contracts';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';

const req = (method: string, path: string) => ({
  method,
  path,
  query: {},
  headers: {},
  body: undefined,
  ip: 'test',
});

const app = createApp({
  store: createMemoryStore(),
  clock: fixedClock('2026-10-24T09:00:00-05:00'),
  random: (n) => new Uint8Array(n),
  storage: 'memory',
  resetEnabled: true,
});

test('health cumple el contrato y rutas desconocidas dan 404 estable', async () => {
  const res = await app(req('GET', '/health'));
  expect(res.status).toBe(200);
  expect(Health.parse(res.body).storage).toBe('memory');
  expect((await app(req('GET', '/nope'))).body).toMatchObject({
    error: { code: 'ROUTE_NOT_FOUND' },
  });
});
