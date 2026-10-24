import { execFileSync } from 'node:child_process';

import { clubConfig } from '@/club/config';
import { invitacionesRoutes } from '@/club/invitaciones';
import { bogotaExp, qrPayload, qrSocioActual } from '@/club/qr';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { INVITACION, makeClub } from '../../support/club-app';

const PY = `
import hashlib, hmac, sys
secret, tipo, persona, nombre, exp = sys.argv[1:6]
body = '|'.join(['NCLUB1', tipo, persona, nombre, exp])
sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()[:20]
print(f'{body}|{sig}', end='')
`;

const python = (...args: string[]): string | null => {
  try {
    return execFileSync('python3', ['-I', '-c', PY, ...args], { encoding: 'utf8' });
  } catch {
    return null;
  }
};
const hasPython = python('s', 'socio', 'p', 'n', '1') !== null;
const pyTest = hasPython ? test : test.skip; // skip reason: python3 is not available here

test('bogotaExp: fecha + hora en America/Bogota (UTC-5) como unix', () => {
  expect(bogotaExp('2026-10-24', '14:00')).toBe(Date.parse('2026-10-24T19:00:00Z') / 1000);
});

test('qrPayload: formato NCLUB1|tipo|persona|nombre|exp|firma[:20] y sin "|" en el nombre', () => {
  const p = qrPayload('invitado', 'inv-3f9a1c2b', 'Laura Diaz', 1793000000, 'secreto');
  const [magic, tipo, persona, nombre, exp, sig] = p.split('|');
  expect([magic, tipo, persona, nombre, exp]).toEqual([
    'NCLUB1',
    'invitado',
    'inv-3f9a1c2b',
    'Laura Diaz',
    '1793000000',
  ]);
  expect(sig).toMatch(/^[0-9a-f]{20}$/);
  expect(qrPayload('socio', 'p', 'A|B', 1, 'k').split('|')).toHaveLength(6);
});

test('qrSocioActual reuses the last app QR for the bot and renews only on request or expiry', async () => {
  const store = createMemoryStore();
  const secret = clubConfig({}).qrSecret!;
  const t0 = new Date('2026-10-24T15:00:00Z');
  const appQr = await qrSocioActual(store, t0, secret, 'andres', 'Andres Mejia', true);
  expect(
    await qrSocioActual(store, new Date(t0.getTime() + 3_000), secret, 'andres', 'Andres Mejia'),
  ).toBe(appQr);
  const refreshed = await qrSocioActual(
    store,
    new Date(t0.getTime() + 3_000),
    secret,
    'andres',
    'Andres Mejia',
    true,
  );
  expect(refreshed).not.toBe(appQr);
  expect(
    await qrSocioActual(store, new Date(t0.getTime() + 303_000), secret, 'andres', 'Andres Mejia'),
  ).not.toBe(refreshed);
});

pyTest(
  'el payload de la API coincide byte a byte con vision/qr_pass.py (HMAC en Python)',
  async () => {
    const cfg = clubConfig({});
    const c = makeClub(invitacionesRoutes);
    const t = await c.login('sofia@nclub.demo');
    const r = await c.call('POST', '/invitaciones', {
      token: t,
      body: { ...INVITACION, nombre: 'Laura', apellido: 'Díaz' },
    });
    const exp = String(bogotaExp('2026-10-24', '14:00'));
    expect(r.body.qr_payload).toBe(
      python(cfg.qrSecret!, 'invitado', r.body.persona_id, 'Laura Díaz', exp),
    );
    expect(qrPayload('personal', 'marta', 'Marta Ruiz', 1793000000, cfg.qrSecret!)).toBe(
      python(cfg.qrSecret!, 'personal', 'marta', 'Marta Ruiz', '1793000000'),
    );
  },
);

test('sin CERBERUS_QR_SECRET el servidor responde 503 config_faltante y no guarda nada', async () => {
  const c = makeClub(invitacionesRoutes, { qrSecret: undefined });
  const t = await c.login('sofia@nclub.demo');
  const r = await c.call('POST', '/invitaciones', { token: t, body: INVITACION });
  expect(r).toMatchObject({ status: 503, body: { error: 'config_faltante' } });
  expect((await c.call('GET', '/invitaciones', { token: t })).body.items).toEqual([]);
});
