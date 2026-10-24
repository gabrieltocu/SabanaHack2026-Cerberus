import { serviciosRoutes } from '@/club/servicios';
import { integracionRoutes } from '@/club/integracion';
import { signToken } from '@/club/auth';
import { registrosRoutes } from '@/club/registros';
import { BOT_KEY, makeClub, NOW } from '../../support/club-app';

const club = makeClub([...serviciosRoutes, ...registrosRoutes]);
const { call, login } = club;
const HOY = '2026-10-24';
const withSabana = async <T>(fn: () => Promise<T>): Promise<T> => {
  const source = process.env.CERBERUS_DATA_SOURCE;
  const password = process.env.CERBERUS_TEAM_PASSWORD;
  process.env.CERBERUS_DATA_SOURCE = 'sabana';
  process.env.CERBERUS_TEAM_PASSWORD = 'clave-de-prueba';
  try {
    return await fn();
  } finally {
    if (source === undefined) delete process.env.CERBERUS_DATA_SOURCE;
    else process.env.CERBERUS_DATA_SOURCE = source;
    if (password === undefined) delete process.env.CERBERUS_TEAM_PASSWORD;
    else process.env.CERBERUS_TEAM_PASSWORD = password;
  }
};
const ORDEN = {
  nombre: 'Luis',
  apellido: 'Pena',
  trato: 'senor',
  empresa: 'Climatec',
  trabajo: 'Revisión del aire acondicionado',
  solicitado_por: 'Natalia Rios',
  responsable: 'Marta Ruiz',
  area: 'mantenimiento',
  fecha: HOY,
  hora_desde: '11:00',
  hora_hasta: '13:00',
  punto_presentacion: 'Recepción',
};

test('personal crea una orden OT-dddd con persona ext- y estado PROGRAMADA', async () => {
  const t = await login('personal@nclub.demo');
  const r = await call('POST', '/servicios', { token: t, body: ORDEN });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ ...ORDEN, estado: 'PROGRAMADA' });
  expect(r.body.id).toMatch(/^OT-\d{4}$/);
  expect(r.body.persona).toMatch(/^ext-[0-9a-f]{6}$/);
  const l = await call('GET', `/servicios?fecha=${HOY}`, { token: t });
  expect(l.body.items.map((o: { id: string }) => o.id)).toEqual([r.body.id]);
  expect((await call('GET', '/servicios?fecha=2026-10-25', { token: t })).body.items).toEqual([]);
});

test('permisos: lectura para personal, admin, concierge y edecán; escritura solo personal y admin', async () => {
  for (const [email, leer, escribir] of [
    ['personal@nclub.demo', 200, 201],
    ['admin@nclub.demo', 200, 201],
    ['concierge@nclub.demo', 200, 403],
    ['edecan@nclub.demo', 200, 403],
    ['sofia@nclub.demo', 403, 403],
  ] as const) {
    const token = await login(email);
    expect((await call('GET', '/servicios', { token })).status).toBe(leer);
    expect((await call('POST', '/servicios', { token, body: ORDEN })).status).toBe(escribir);
  }
  expect((await call('GET', '/servicios')).status).toBe(401);
});

test('valida los campos obligatorios y el horario', async () => {
  const token = await login('admin@nclub.demo');
  const post = (b: object) => call('POST', '/servicios', { token, body: { ...ORDEN, ...b } });
  expect((await post({ empresa: '' })).body.error).toBe('empresa_invalido');
  expect((await post({ trato: 'x' })).body.error).toBe('trato_invalido');
  expect((await post({ hora_hasta: '10:00' })).body.error).toBe('horario_invalido');
  expect((await post({ fecha: 'mañana' })).body.error).toBe('fecha_invalida');
  const sinOpcionales: Partial<typeof ORDEN> = { ...ORDEN };
  delete sinOpcionales.solicitado_por;
  delete sinOpcionales.punto_presentacion;
  const r = await call('POST', '/servicios', { token, body: sinOpcionales });
  expect(r.body).toMatchObject({
    solicitado_por: 'Luciana Vargas',
    punto_presentacion: 'Recepción',
  });
});

test('PATCH cambia datos y estado sin tocar id ni persona; 404 si no existe', async () => {
  const token = await login('personal@nclub.demo');
  const o = (await call('POST', '/servicios', { token, body: ORDEN })).body;
  const p = await call('PATCH', `/servicios/${o.id}`, {
    token,
    body: { estado: 'EN_CURSO', fecha: '2026-10-25', persona: 'hack', id: 'OT-0000' },
  });
  expect(p.body).toMatchObject({
    id: o.id,
    persona: o.persona,
    estado: 'EN_CURSO',
    fecha: '2026-10-25',
  });
  expect((await call('GET', '/servicios?fecha=2026-10-25', { token })).body.items).toHaveLength(1);
  expect((await call('PATCH', `/servicios/${o.id}`, { token, body: { estado: 'X' } })).status).toBe(
    400,
  );
  expect((await call('PATCH', '/servicios/OT-0001', { token, body: {} })).status).toBe(404);
});

test('/bot/registros mezcla las órdenes del día no canceladas y sube la versión', async () => {
  const c = makeClub([...serviciosRoutes, ...registrosRoutes]);
  const token = await c.login('personal@nclub.demo');
  const reg = () => c.call('GET', `/bot/registros?fecha=${HOY}`, { bot: BOT_KEY });
  const v0 = (await reg()).body.version;
  const o = (await c.call('POST', '/servicios', { token, body: ORDEN })).body;
  const otra = (
    await c.call('POST', '/servicios', {
      token,
      body: { ...ORDEN, nombre: 'Ana', fecha: '2026-10-25' },
    })
  ).body;
  const r = await reg();
  expect(r.body.version).toBeGreaterThan(v0);
  expect(r.body.ordenes[o.id]).toEqual({
    persona: o.persona,
    nombre: 'Luis',
    apellido: 'Pena',
    trato: 'senor',
    empresa: 'Climatec',
    motivo: ORDEN.trabajo,
    supervisor: 'Marta Ruiz',
    area: 'mantenimiento',
    fecha: HOY,
    lugar: 'EXTERNO',
    hora_desde: ORDEN.hora_desde,
    hora_hasta: ORDEN.hora_hasta,
    estado: 'PROGRAMADA',
    en_horario: false,
  });
  expect(r.body.ordenes['OT-1042']).toBeDefined();
  expect(r.body.ordenes[otra.id]).toBeUndefined();
  const v1 = r.body.version;
  await c.call('PATCH', `/servicios/${o.id}`, { token, body: { estado: 'TERMINADA' } });
  const r2 = await reg();
  expect(r2.body.ordenes[o.id]).toBeUndefined();
  expect(r2.body.version).toBeGreaterThan(v1);
});

test('asigna un externo conocido, mantiene el id generado por defecto y expone la lista protegida', async () =>
  withSabana(async () => {
    const c = makeClub([...serviciosRoutes, ...integracionRoutes]);
    const personal = signToken(
      { sub: 'u-marta', rol: 'PERSONAL' },
      c.cfg.jwtSecret!,
      NOW.getTime() / 1000,
    );
    const vale = await c.call('GET', '/servicios/personas', { token: personal });
    expect(vale.body).toEqual({ items: [{ id: 'vale', nombre: 'Vale' }] });
    expect(
      (
        await c.call('GET', '/servicios/personas', {
          token: signToken(
            { sub: 'u-gabriel', rol: 'SOCIO' },
            c.cfg.jwtSecret!,
            NOW.getTime() / 1000,
          ),
        })
      ).status,
    ).toBe(403);
    const unlinkedPass = (await c.call('GET', '/bot/pases', { bot: BOT_KEY })).body.items.find(
      (item: { persona_id: string }) => item.persona_id === 'vale',
    );
    expect(unlinkedPass.tipo).toBe('externo');
    expect(
      (
        await c.call('POST', '/bot/qr/verificar', {
          bot: BOT_KEY,
          body: { payload: unlinkedPass.qr_payload },
        })
      ).body.valido,
    ).toBe(false);
    await c.call('POST', '/servicios', {
      token: personal,
      body: {
        ...ORDEN,
        nombre: 'Vale',
        apellido: 'Primera',
        hora_desde: '07:00',
        hora_hasta: '08:00',
        persona_id: 'vale',
      },
    });
    const order = await c.call('POST', '/servicios', {
      token: personal,
      body: {
        ...ORDEN,
        nombre: 'Vale',
        apellido: 'Pena',
        fecha: HOY,
        hora_desde: '09:00',
        hora_hasta: '11:00',
        persona_id: 'vale',
      },
    });
    expect(order.status).toBe(201);
    expect(order.body.persona).toBe('vale');
    expect(
      (
        await c.call('POST', '/servicios', {
          token: personal,
          body: { ...ORDEN, persona_id: 'desconocido' },
        })
      ).status,
    ).toBe(422);
    const pass = (await c.call('GET', '/bot/pases', { bot: BOT_KEY })).body.items.find(
      (item: { persona_id: string }) => item.persona_id === 'vale',
    );
    expect(pass.tipo).toBe('externo');
    expect(
      (
        await c.call('POST', '/bot/qr/verificar', {
          bot: BOT_KEY,
          body: { payload: pass.qr_payload },
        })
      ).body,
    ).toMatchObject({ valido: true, persona_id: 'vale', categoria: 'EXTERNO' });
  }));
