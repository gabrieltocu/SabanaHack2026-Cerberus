import { signToken } from '@/club/auth';
import { puntosClave } from '@/club/evaluaciones';
import { moduleRoutes } from '@/club/routes';
import { BOT_KEY, NOW, makeClub } from '../../support/club-app';

function setup() {
  const club = makeClub(moduleRoutes);
  const tk = (sub: string, rol: string) =>
    signToken({ sub, rol: rol as 'SOCIO' }, club.cfg.jwtSecret!, NOW.getTime() / 1000);
  return {
    ...club,
    t: {
      admin: tk('u-luciana', 'ADMIN'),
      conc: tk('u-natalia', 'CONCIERGE'),
      mateo: tk('u-mateo', 'EDECAN'),
    },
  };
}

test('puntosClave: palabras de 5+ letras sin conectores, más repetidas primero, máximo 8', () => {
  expect(
    puntosClave([
      'El robot fue muy amable y el robot muy rápido',
      'Excelente atención, porque el robot es amable',
      'La atención del club fue excelente',
    ]),
  ).toEqual(['robot', 'amable', 'atención', 'excelente', 'rápido']);
  expect(puntosClave([])).toEqual([]);
  expect(
    puntosClave(['alfa1 bravo charlie delta eco foxtrot golfo hotel india julio']),
  ).toHaveLength(8);
});

test('GET /evaluaciones: promedios con un decimal y puntos clave de comentarios y voz', async () => {
  const { call, t } = setup();
  const bot = { bot: BOT_KEY };
  expect((await call('GET', '/evaluaciones', { token: t.admin })).body).toEqual({
    items: [],
    promedio_robot: null,
    promedio_club: null,
    puntos_clave: [],
  });
  await call('POST', '/bot/evaluaciones', {
    ...bot,
    body: { robot: 5, club: 4, comentario: 'Robot amable' },
  });
  await call('POST', '/bot/evaluaciones', {
    ...bot,
    body: { robot: 4, club: 4, transcripcion: 'el robot amable y rápido' },
  });
  await call('POST', '/bot/evaluaciones', { ...bot, body: { robot: 4, club: 5 } });
  const r = await call('GET', '/evaluaciones?fecha=2026-10-24', { token: t.conc });
  expect(r.body).toMatchObject({
    promedio_robot: 4.3,
    promedio_club: 4.3,
    puntos_clave: ['amable', 'robot', 'rápido'],
  });
  expect(r.body.items).toHaveLength(3);
  expect(
    (await call('GET', '/evaluaciones?fecha=2026-10-23', { token: t.conc })).body.items,
  ).toEqual([]);
  expect((await call('GET', '/evaluaciones?fecha=ayer', { token: t.conc })).body.error).toBe(
    'fecha_invalida',
  );
  expect((await call('GET', '/evaluaciones', { token: t.mateo })).status).toBe(403);
});

test('POST /bot/evaluaciones valida notas y visita; autor = robot', async () => {
  const { call, t } = setup();
  const bot = { bot: BOT_KEY };
  expect(
    (await call('POST', '/bot/evaluaciones', { ...bot, body: { robot: 0, club: 4 } })).body.error,
  ).toBe('evaluacion_invalida');
  expect(
    (await call('POST', '/bot/evaluaciones', { ...bot, body: { robot: 4.5, club: 4 } })).status,
  ).toBe(422);
  expect(
    (
      await call('POST', '/bot/evaluaciones', {
        ...bot,
        body: { robot: 4, club: 4, visita_id: 'vis-0' },
      })
    ).status,
  ).toBe(404);
  const v = (
    await call('POST', '/visitas', { token: t.conc, body: { nombre: 'Laura', destino: 'Terraza' } })
  ).body;
  const ok = await call('POST', '/bot/evaluaciones', {
    ...bot,
    body: { robot: 4, club: 3, visita_id: v.id },
  });
  expect(ok.status).toBe(201);
  expect(ok.body).toMatchObject({
    visita_id: v.id,
    autor: 'x2-1',
    comentario: null,
    transcripcion: null,
  });
});
