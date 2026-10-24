import { clubConfig } from '@/club/config';

const KEYS = {
  CERBERUS_JWT_SECRET: 'j',
  CERBERUS_BOT_KEY: 'b',
  CERBERUS_QR_SECRET: 'q',
  CERBERUS_PHOTO_KEY: 'p',
};

test('en desarrollo sin variables usa valores locales obvios', () => {
  expect(clubConfig({})).toEqual({
    jwtSecret: 'local-CERBERUS_JWT_SECRET',
    botKey: 'local-CERBERUS_BOT_KEY',
    qrSecret: 'local-CERBERUS_QR_SECRET',
    photoKey: 'local-CERBERUS_PHOTO_KEY',
  });
});

test('en Vercel sin variable la función responde 503 (valor indefinido)', () => {
  expect(clubConfig({ VERCEL: '1', ...KEYS, CERBERUS_BOT_KEY: '' }).botKey).toBeUndefined();
});

test('en producción fuera de Vercel con las 4 llaves las usa', () => {
  expect(clubConfig({ NODE_ENV: 'production', ...KEYS })).toEqual({
    jwtSecret: 'j',
    botKey: 'b',
    qrSecret: 'q',
    photoKey: 'p',
  });
});

test('en producción fuera de Vercel falla y nombra solo las llaves que faltan', () => {
  expect(() =>
    clubConfig({ NODE_ENV: 'production', ...KEYS, CERBERUS_QR_SECRET: '', CERBERUS_BOT_KEY: '' }),
  ).toThrow('CERBERUS_BOT_KEY, CERBERUS_QR_SECRET');
  expect(() => clubConfig({ NODE_ENV: 'production' })).toThrow(/CERBERUS_JWT_SECRET/);
});

test('la clave opcional del puente no reemplaza la del robot ni recibe valor local', () => {
  expect(clubConfig({ ...KEYS, CERBERUS_BRIDGE_KEY: 'adicional' })).toMatchObject({
    botKey: 'b',
    bridgeKey: 'adicional',
  });
  expect(clubConfig({}).bridgeKey).toBeUndefined();
  expect(clubConfig({ CERBERUS_BRIDGE_KEY: '' }).bridgeKey).toBeUndefined();
});
