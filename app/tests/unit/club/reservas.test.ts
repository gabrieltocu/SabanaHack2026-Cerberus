import { reservasRoutes } from '@/club/reservas';
import { makeClub } from '../../support/club-app';

const { call, login } = makeClub(reservasRoutes);
const HOY = '2026-10-24';
const RESERVA = {
  evento: 'Cata de vinos',
  fecha: HOY,
  hora_desde: '15:00',
  hora_hasta: '16:00',
  robot: 'x2-1',
  lugar: 'Salón principal',
  cobertura_recepcion: true,
};

test('concierge y admin reservan, listan y cancelan; otros roles no', async () => {
  const nat = await login('concierge@nclub.demo');
  const c = await call('POST', '/reservas-robot', { token: nat, body: RESERVA });
  expect(c.status).toBe(201);
  expect(c.body).toMatchObject({ ...RESERVA, creada_por: 'u-natalia' });
  expect(c.body.id).toMatch(/^rr-[0-9a-f]{8}$/);
  expect(c.body).not.toHaveProperty('advertencia');
  const admin = await login('admin@nclub.demo');
  expect((await call('GET', `/reservas-robot?fecha=${HOY}`, { token: admin })).body.items).toEqual([
    c.body,
  ]);
  expect(
    (await call('GET', '/reservas-robot?fecha=2026-10-25', { token: admin })).body.items,
  ).toEqual([]);
  for (const email of ['sofia@nclub.demo', 'personal@nclub.demo', 'edecan@nclub.demo']) {
    expect((await call('GET', '/reservas-robot', { token: await login(email) })).status).toBe(403);
  }
  expect((await call('DELETE', `/reservas-robot/${c.body.id}`, { token: admin })).body).toEqual({
    ok: true,
  });
  expect((await call('GET', `/reservas-robot?fecha=${HOY}`, { token: admin })).body.items).toEqual(
    [],
  );
  expect((await call('DELETE', `/reservas-robot/${c.body.id}`, { token: admin })).status).toBe(404);
});

test('el mismo robot no se reserva dos veces a la vez (409 robot_ocupado); otro robot o franja sí', async () => {
  const t = await login('concierge@nclub.demo');
  const post = (b: object) =>
    call('POST', '/reservas-robot', { token: t, body: { ...RESERVA, ...b } });
  expect((await post({ fecha: '2026-11-01' })).status).toBe(201);
  expect(
    await post({ fecha: '2026-11-01', hora_desde: '15:30', hora_hasta: '17:00' }),
  ).toMatchObject({
    status: 409,
    body: { error: 'robot_ocupado' },
  });
  expect(
    (await post({ fecha: '2026-11-01', hora_desde: '14:00', hora_hasta: '15:01' })).status,
  ).toBe(409);
  expect((await post({ fecha: '2026-11-01', robot: 'x2-2' })).status).toBe(201);
  expect(
    (await post({ fecha: '2026-11-01', hora_desde: '16:00', hora_hasta: '17:00' })).status,
  ).toBe(201);
  expect((await post({ fecha: '2026-11-02' })).status).toBe(201);
});

test('sin cobertura de recepción avisa solo si no queda otro robot libre; nunca bloquea', async () => {
  const t = await login('admin@nclub.demo');
  const post = (b: object) =>
    call('POST', '/reservas-robot', {
      token: t,
      body: { ...RESERVA, fecha: '2026-12-01', cobertura_recepcion: false, ...b },
    });
  const libre = await post({});
  expect(libre.status).toBe(201);
  expect(libre.body).not.toHaveProperty('advertencia'); // x2-2 sigue libre en esa franja
  const sin = await post({ robot: 'x2-2', hora_desde: '15:30', hora_hasta: '16:30' });
  expect(sin.status).toBe(201);
  expect(sin.body.advertencia).toMatch(/recepci/i); // x2-1 ya está ocupado a esa hora
  const conCobertura = await post({
    robot: 'x2-2',
    hora_desde: '10:00',
    hora_hasta: '11:00',
    cobertura_recepcion: true,
  });
  expect(conCobertura.body).not.toHaveProperty('advertencia');
});

test('valida los campos', async () => {
  const t = await login('admin@nclub.demo');
  const post = (b: object) =>
    call('POST', '/reservas-robot', { token: t, body: { ...RESERVA, ...b } });
  expect((await post({ hora_hasta: '14:00' })).body.error).toBe('horario_invalido');
  expect((await post({ evento: '' })).body.error).toBe('evento_invalido');
  expect((await post({ robot: '' })).body.error).toBe('robot_invalido');
  expect((await post({ cobertura_recepcion: 'si' })).body.error).toBe('cobertura_invalida');
  expect((await post({ fecha: 'x' })).body.error).toBe('fecha_invalida');
});
