import { membresiaRoutes } from '@/club/membresia';
import { LIMITE_ACTIVAS } from '@/club/seed';
import { makeClub } from '../../support/club-app';

const SOLICITUD = {
  nombre: 'Valentina Cruz',
  email: 'valentina@example.com',
  telefono: '3000000000',
  interes: 'familiar',
  mensaje: 'Quisiera conocer el club',
};
const ip = (n: number) => ({ 'x-forwarded-for': `203.0.113.${n}, 10.0.0.1` });

test('info pública: dos niveles con beneficios y límite de invitados', async () => {
  const { call } = makeClub(membresiaRoutes);
  const r = await call('GET', '/membresia/info');
  expect(r.status).toBe(200);
  expect(r.body.niveles.map((n: { nivel: string }) => n.nivel)).toEqual(['VIP', 'Regular']);
  expect(r.body.niveles[0].invitados_activos).toBe(LIMITE_ACTIVAS.VIP);
  expect(r.body.niveles[1].invitados_activos).toBe(LIMITE_ACTIVAS.REGULAR);
  expect(r.body.niveles.every((n: { beneficios: string[] }) => n.beneficios.length >= 3)).toBe(
    true,
  );
});

test('solicitud pública 201; el admin la lista y la marca contactada; otros no la ven', async () => {
  const { call, login } = makeClub(membresiaRoutes);
  const c = await call('POST', '/membresia/solicitudes', { body: SOLICITUD, headers: ip(1) });
  expect(c.status).toBe(201);
  expect(c.body).toMatchObject({ ...SOLICITUD, estado: 'NUEVA' });
  expect(c.body.id).toMatch(/^sol-[0-9a-f]{8}$/);
  expect(typeof c.body.creada_at).toBe('string');
  expect((await call('GET', '/membresia/solicitudes')).status).toBe(401);
  expect(
    (await call('GET', '/membresia/solicitudes', { token: await login('sofia@nclub.demo') }))
      .status,
  ).toBe(403);
  const admin = await login('admin@nclub.demo');
  expect((await call('GET', '/membresia/solicitudes', { token: admin })).body.items).toEqual([
    c.body,
  ]);
  const p = await call('PATCH', `/membresia/solicitudes/${c.body.id}`, {
    token: admin,
    body: { estado: 'CONTACTADA' },
  });
  expect(p.body).toMatchObject({ id: c.body.id, estado: 'CONTACTADA' });
  expect(
    (
      await call('PATCH', `/membresia/solicitudes/${c.body.id}`, {
        token: admin,
        body: { estado: 'X' },
      })
    ).body.error,
  ).toBe('estado_invalido');
  expect(
    (
      await call('PATCH', '/membresia/solicitudes/sol-0', {
        token: admin,
        body: { estado: 'NUEVA' },
      })
    ).status,
  ).toBe(404);
});

test('valida el correo, el interés y los textos opcionales', async () => {
  const { call } = makeClub(membresiaRoutes);
  const post = (b: object) =>
    call('POST', '/membresia/solicitudes', { body: { ...SOLICITUD, ...b }, headers: ip(2) });
  expect((await post({ email: 'no-es-correo' })).body.error).toBe('email_invalido');
  expect((await post({ nombre: '' })).body.error).toBe('nombre_invalido');
  expect((await post({ interes: 'otro' })).body.error).toBe('interes_invalido');
  expect((await post({ telefono: 'x'.repeat(31) })).body.error).toBe('telefono_invalido');
  const r = await post({ telefono: undefined, mensaje: undefined });
  expect(r.body).toMatchObject({ telefono: null, mensaje: null });
});

test('máximo 5 solicitudes por IP y hora; otra IP sigue libre', async () => {
  const { call } = makeClub(membresiaRoutes);
  const post = (n: number) =>
    call('POST', '/membresia/solicitudes', { body: SOLICITUD, headers: ip(n) });
  for (let i = 0; i < 5; i++) expect((await post(9)).status).toBe(201);
  expect(await post(9)).toMatchObject({ status: 429, body: { error: 'demasiadas_solicitudes' } });
  expect((await post(10)).status).toBe(201);
});
