import { actividadesRoutes, listarActividades } from '@/club/actividades';
import { makeClub, BOT_KEY } from '../../support/club-app';

const club = makeClub(actividadesRoutes);
const { call, login } = club;
const HOY = '2026-10-24';
const NUEVA = {
  nombre: 'Noche de jazz',
  descripcion: null,
  lugar: 'Terraza',
  fecha: '2026-11-02',
  hora_desde: '19:00',
  hora_hasta: '21:00',
  cupo: 2,
  robot_puede_ofrecer: true,
};

test('un día sin actividades recibe las 4 de ejemplo y no se vuelve a sembrar', async () => {
  const t = await login('sofia@nclub.demo');
  const r = await call('GET', `/actividades?fecha=${HOY}`, { token: t });
  expect(r.status).toBe(200);
  expect(r.body.items.map((a: { nombre: string }) => a.nombre).sort()).toEqual([
    'Brunch familiar',
    'Cata de vinos',
    'Clase de yoga',
    'Torneo de squash',
  ]);
  expect(r.body.items[0].id).toMatch(/^act-[0-9a-f]{8}$/);
  const again = await call('GET', `/actividades?fecha=${HOY}`, { token: t });
  expect(again.body.items.map((a: { id: string }) => a.id)).toEqual(
    r.body.items.map((a: { id: string }) => a.id),
  );
  expect((await listarActividades(club.store, HOY)).length).toBe(4);
});

test('exige sesión y fecha válida', async () => {
  expect((await call('GET', '/actividades')).status).toBe(401);
  const t = await login('sofia@nclub.demo');
  expect(await call('GET', '/actividades?fecha=hoy', { token: t })).toMatchObject({
    status: 400,
    body: { error: 'fecha_invalida' },
  });
  expect((await call('GET', '/actividades', { token: t })).body.items).toHaveLength(4);
});

test('personal crea, edita (cambiando de día) y borra; el socio no', async () => {
  const marta = await login('personal@nclub.demo');
  const sofia = await login('sofia@nclub.demo');
  expect((await call('POST', '/actividades', { token: sofia, body: NUEVA })).status).toBe(403);
  const c = await call('POST', '/actividades', { token: marta, body: NUEVA });
  expect(c.status).toBe(201);
  expect(c.body).toMatchObject({ ...NUEVA, inscritos: [] });
  const id = c.body.id as string;
  const p = await call('PATCH', `/actividades/${id}`, {
    token: marta,
    body: { fecha: '2026-11-03', nombre: 'Jazz y vino' },
  });
  expect(p.body).toMatchObject({ nombre: 'Jazz y vino', fecha: '2026-11-03', cupo: 2 });
  expect((await listarActividades(club.store, '2026-11-02')).map((a) => a.id)).not.toContain(id);
  expect((await listarActividades(club.store, '2026-11-03')).map((a) => a.id)).toContain(id);
  expect((await call('DELETE', `/actividades/${id}`, { token: marta })).body).toEqual({ ok: true });
  expect((await call('PATCH', `/actividades/${id}`, { token: marta, body: {} })).status).toBe(404);
});

test('valida horario, cupo y campos', async () => {
  const t = await login('admin@nclub.demo');
  const post = (b: object) => call('POST', '/actividades', { token: t, body: { ...NUEVA, ...b } });
  expect((await post({ hora_hasta: '19:00' })).body.error).toBe('horario_invalido');
  expect((await post({ hora_desde: '9am' })).body.error).toBe('hora_invalida');
  expect((await post({ cupo: 0 })).body.error).toBe('cupo_invalido');
  expect((await post({ cupo: 1.5 })).body.error).toBe('cupo_invalido');
  expect((await post({ cupo: null })).status).toBe(201);
  expect((await post({ nombre: '' })).body.error).toBe('nombre_invalido');
  expect((await post({ fecha: '2026-13-01' })).body.error).toBe('fecha_invalida');
});

test('inscripción: cupo lleno 409, idempotente y se puede cancelar', async () => {
  const marta = await login('personal@nclub.demo');
  const id = (await call('POST', '/actividades', { token: marta, body: { ...NUEVA, cupo: 1 } }))
    .body.id as string;
  const sofia = await login('sofia@nclub.demo');
  const andres = await login('andres@nclub.demo');
  const a = await call('POST', `/actividades/${id}/inscripcion`, { token: sofia });
  expect(a.body.inscritos).toEqual(['u-sofia']);
  expect((await call('POST', `/actividades/${id}/inscripcion`, { token: sofia })).status).toBe(200);
  expect(await call('POST', `/actividades/${id}/inscripcion`, { token: andres })).toMatchObject({
    status: 409,
    body: { error: 'cupo_lleno' },
  });
  expect((await call('POST', `/actividades/${id}/inscripcion`, { token: marta })).status).toBe(403);
  expect(
    (await call('DELETE', `/actividades/${id}/inscripcion`, { token: sofia })).body.inscritos,
  ).toEqual([]);
  expect((await call('POST', `/actividades/${id}/inscripcion`, { token: andres })).status).toBe(
    200,
  );
  expect((await call('POST', '/actividades/nope/inscripcion', { token: sofia })).status).toBe(404);
});

test('el robot solo recibe las actividades que puede ofrecer', async () => {
  const marta = await login('personal@nclub.demo');
  await call('POST', '/actividades', { token: marta, body: { ...NUEVA, fecha: HOY } });
  await call('POST', '/actividades', {
    token: marta,
    body: { ...NUEVA, nombre: 'Privada', fecha: HOY, robot_puede_ofrecer: false },
  });
  expect((await call('GET', `/bot/actividades?fecha=${HOY}`)).status).toBe(401);
  const r = await call('GET', `/bot/actividades?fecha=${HOY}`, { bot: BOT_KEY });
  expect(r.status).toBe(200);
  expect(r.body.items.every((a: { robot_puede_ofrecer: boolean }) => a.robot_puede_ofrecer)).toBe(
    true,
  );
  expect(r.body.items.map((a: { nombre: string }) => a.nombre)).toContain('Noche de jazz');
  expect(r.body.items.map((a: { nombre: string }) => a.nombre)).not.toContain('Privada');
});
