import { createClubServer } from '@/club/server';

test('SABANAHACK en Vercel requiere almacenamiento compartido', () => {
  expect(() => createClubServer({ VERCEL: '1', CERBERUS_DATA_SOURCE: 'sabana' })).toThrow(
    /almacenamiento compartido/,
  );
});

test('SABANAHACK en Vercel no acepta SQLite local como almacenamiento compartido', () => {
  expect(() =>
    createClubServer({
      VERCEL: '1',
      CERBERUS_DATA_SOURCE: 'sabana',
      SQLITE_PATH: '/tmp/nclub.sqlite',
      KV_REST_API_URL: 'https://example.com',
      KV_REST_API_TOKEN: 'prueba',
    }),
  ).toThrow(/almacenamiento compartido/);
});
