import { createServerApp } from '@/api/server';

const get = (path: string) => ({
  method: 'GET',
  path,
  query: {},
  headers: {},
  body: undefined,
  ip: 't',
});

test('health publica el commit desplegado y el almacenamiento elegido', async () => {
  const app = createServerApp({ VERCEL_GIT_COMMIT_SHA: 'abc123' });
  expect((await app(get('/health'))).body).toMatchObject({ storage: 'memory', commit: 'abc123' });
  const local = createServerApp({});
  expect((await local(get('/health'))).body).toMatchObject({ commit: null });
  expect((await local(get('/people'))).body).not.toHaveProperty('commit');
});
