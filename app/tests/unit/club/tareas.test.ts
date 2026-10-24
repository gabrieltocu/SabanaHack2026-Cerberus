import { signToken } from '@/club/auth';
import { KV, addId } from '@/club/repo';
import { moduleRoutes } from '@/club/routes';
import type { Tarea, Visita } from '@/club/types';
import { NOW, makeClub } from '../../support/club-app';

function setup() {
  const club = makeClub(moduleRoutes);
  const tk = (sub: string, rol: string) =>
    signToken({ sub, rol: rol as 'SOCIO' }, club.cfg.jwtSecret!, NOW.getTime() / 1000);
  const t = {
    mateo: tk('u-mateo', 'EDECAN'),
    conc: tk('u-natalia', 'CONCIERGE'),
    andres: tk('u-andres', 'SOCIO'),
  };
  const visita = async (extra: object = {}) =>
    (
      await club.call('POST', '/visitas', {
        token: t.conc,
        body: { nombre: 'Laura Diaz', categoria: 'INVITADO', destino: 'Terraza', ...extra },
      })
    ).body as Visita;
  const ayuda = async (v: Visita) =>
    (
      await club.call('POST', `/visitas/${v.id}/ayuda`, {
        token: t.conc,
        body: { motivo: 'Ayuda' },
      })
    ).body as Tarea;
  return { ...club, t, visita, ayuda };
}

test('lista del edecán: abiertas sin asignar y las suyas; urgente primero; filtro por estado', async () => {
  const { call, t, visita, ayuda, store } = setup();
  const v1 = await visita();
  const v2 = await visita({ nombre: 'Otro Invitado' });
  await call('POST', `/visitas/${v1.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'u-mateo' },
  });
  const urgente = await ayuda(v2);
  // una tarea asignada a otra persona no se muestra al edecán
  await store.compareAndSet(KV.tarea('tar-ajena'), 0, {
    ...urgente,
    id: 'tar-ajena',
    asignada_a: 'u-otro',
  });
  await addId(store, KV.tareaDia('2026-10-24'), 'tar-ajena');
  const mias = (await call('GET', '/tareas', { token: t.mateo })).body.items as Tarea[];
  expect(mias.map((x) => [x.tipo, x.prioridad])).toEqual([
    ['AYUDA', 'urgente'],
    ['ACOMPANAR', 'normal'],
  ]);
  const todas = (await call('GET', '/tareas', { token: t.conc })).body.items as Tarea[];
  expect(todas).toHaveLength(3);
  expect((await call('GET', '/tareas?estado=ACEPTADA', { token: t.conc })).body.items).toEqual([]);
  expect((await call('GET', '/tareas?estado=X', { token: t.conc })).body.error).toBe(
    'estado_invalido',
  );
  expect((await call('GET', '/tareas', { token: t.andres })).status).toBe(403);
});

test('aceptar: idempotente para quien la aceptó, 409 si la tiene otra persona o está asignada a otra', async () => {
  const { call, t, visita, ayuda, store } = setup();
  const tarea = await ayuda(await visita());
  const ok = await call('POST', `/tareas/${tarea.id}/aceptar`, { token: t.mateo });
  expect(ok.body).toMatchObject({
    estado: 'ACEPTADA',
    asignada_a: 'u-mateo',
    aceptada_at: expect.any(String),
  });
  expect((await call('POST', `/tareas/${tarea.id}/aceptar`, { token: t.mateo })).status).toBe(200);
  // la misma tarea, ya aceptada por otra persona
  await store.compareAndSet(KV.tarea('tar-x'), 0, {
    ...tarea,
    id: 'tar-x',
    estado: 'ACEPTADA',
    asignada_a: 'u-otro',
  });
  const otro = await call('POST', '/tareas/tar-x/aceptar', { token: t.mateo });
  expect([otro.status, otro.body.error]).toEqual([409, 'tarea_ya_aceptada']);
  await store.compareAndSet(KV.tarea('tar-y'), 0, {
    ...tarea,
    id: 'tar-y',
    estado: 'ABIERTA',
    asignada_a: 'u-otro',
  });
  expect((await call('POST', '/tareas/tar-y/aceptar', { token: t.mateo })).body.error).toBe(
    'tarea_asignada_a_otro',
  );
  expect((await call('POST', '/tareas/tar-nada/aceptar', { token: t.mateo })).status).toBe(404);
  expect((await call('POST', `/tareas/${tarea.id}/aceptar`, { token: t.conc })).status).toBe(403);
  // aceptar una ayuda deja un paso en el recorrido de la visita
  const vis = (await call('GET', `/visitas/${tarea.visita_id}`, { token: t.conc })).body as Visita;
  expect(vis.recorrido.at(-1)).toMatchObject({ tipo: 'AYUDA', actor: 'u-mateo' });
});

test('rechazar: asignada vuelve a abierta sin asignar y deja de verse para quien rechazó', async () => {
  const { call, t, visita } = setup();
  const v = await visita();
  await call('POST', `/visitas/${v.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'u-mateo' },
  });
  const [tarea] = (await call('GET', '/tareas', { token: t.mateo })).body.items as Tarea[];
  expect(
    (await call('POST', `/tareas/${tarea!.id}/rechazar`, { token: t.mateo, body: {} })).status,
  ).toBe(422);
  const r = await call('POST', `/tareas/${tarea!.id}/rechazar`, {
    token: t.mateo,
    body: { motivo: 'Estoy en pausa' },
  });
  expect(r.body).toMatchObject({ estado: 'ABIERTA', asignada_a: null, rechazos: ['u-mateo'] });
  expect((await call('GET', '/tareas', { token: t.mateo })).body.items).toEqual([]);
  expect((await call('GET', '/tareas?estado=ABIERTA', { token: t.conc })).body.items).toHaveLength(
    1,
  );
  // una aceptada ya no se rechaza
  const a = await call('POST', `/tareas/${tarea!.id}/aceptar`, { token: t.mateo });
  expect(a.status).toBe(200);
  const x = await call('POST', `/tareas/${tarea!.id}/rechazar`, {
    token: t.mateo,
    body: { motivo: 'No' },
  });
  expect([x.status, x.body.error]).toEqual([409, 'tarea_no_rechazable']);
});
