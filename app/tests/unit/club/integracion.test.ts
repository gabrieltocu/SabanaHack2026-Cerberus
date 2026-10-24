import { createHmac } from 'node:crypto';

import { createClubApp } from '@/club/app';
import { signToken } from '@/club/auth';
import { actividadesRoutes, listarActividades } from '@/club/actividades';
import { clubConfig } from '@/club/config';
import { fotosRoutes } from '@/club/fotos';
import { integracionRoutes } from '@/club/integracion';
import { invitacionesRoutes } from '@/club/invitaciones';
import { perfilRoutes } from '@/club/perfil';
import { personasRoutes } from '@/club/personas';
import { registrosRoutes } from '@/club/registros';
import { updatePerfil } from '@/club/repo';
import { usuarios } from '@/club/seed';
import { bogotaExp, qrRoutes, SOCIO_QR_TTL_S } from '@/club/qr';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { BOT_KEY, INVITACION, NOW } from '../../support/club-app';

function setup() {
  let now = NOW;
  const store = createMemoryStore();
  const cfg = clubConfig({});
  const app = createClubApp({
    store,
    cfg,
    routes: [
      ...integracionRoutes,
      ...personasRoutes,
      ...qrRoutes,
      ...invitacionesRoutes,
      ...fotosRoutes,
      ...perfilRoutes,
      ...registrosRoutes,
      ...actividadesRoutes,
    ],
    clock: () => now,
  });
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    auth: 'BOT' | string | null = 'BOT',
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth === 'BOT') headers['x-bot-key'] = BOT_KEY;
    else if (auth !== null) {
      headers.authorization = `Bearer ${signToken({ sub: auth, rol: ['u-andres', 'u-vale'].includes(auth) ? 'SOCIO' : 'CONCIERGE' }, cfg.jwtSecret!, now.getTime() / 1000)}`;
    }
    const res = await app(
      new Request(`http://x${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split('?')[0]!,
    );
    return { status: res.status, body: await res.json() };
  };
  return { call, store, setNow: (d: Date) => (now = d) };
}

const sesion = (overrides: Record<string, unknown> = {}) => ({
  robot: 'x2-1',
  sesion_id: 'sesion-1',
  secuencia: 0,
  fase: 'identificando',
  persona_id: 'andres',
  nombre: 'Andres',
  categoria: 'REGULAR',
  metodo: 'facial',
  confianza: 0.93,
  mensaje: 'Hola',
  ...overrides,
});

test('POST sesión requiere BOT, valida esquema estricto y descarta imágenes y campos desconocidos', async () => {
  const { call } = setup();
  expect((await call('POST', '/bot/sesion', sesion(), null)).status).toBe(401);
  expect(
    (await call('POST', '/bot/sesion', { ...sesion(), imagen: 'campo no admitido' })).status,
  ).toBe(422);
  expect((await call('POST', '/bot/sesion', sesion({ secuencia: -1 }))).status).toBe(422);
  expect((await call('POST', '/bot/sesion', sesion({ fase: 'foto' }))).status).toBe(422);
  const ok = await call('POST', '/bot/sesion', sesion());
  expect(ok.status).toBe(200);
  expect(ok.body.sesion).toMatchObject({
    ...sesion(),
    actualizado_at: '2026-10-24T10:00:00.000-05:00',
  });
  expect(ok.body.sesion).not.toHaveProperty('imagen');
});

test('GET sesión requiere concierge/admin y marca desactualizada después de 15 segundos', async () => {
  const { call, setNow } = setup();
  expect((await call('GET', '/robot/sesion', undefined, 'u-andres')).status).toBe(403);
  expect((await call('GET', '/robot/sesion', undefined, null)).status).toBe(401);
  expect((await call('GET', '/robot/sesion', undefined, 'u-natalia')).body).toEqual({
    sesion: null,
    desactualizada: true,
  });
  await call('POST', '/bot/sesion', sesion());
  expect((await call('GET', '/robot/sesion', undefined, 'u-natalia')).body.desactualizada).toBe(
    false,
  );
  setNow(new Date(NOW.getTime() + 15_001));
  expect((await call('GET', '/robot/sesion', undefined, 'u-natalia')).body.desactualizada).toBe(
    true,
  );
});

test('secuencia monotónica y una sesión anterior ya vista no puede sobrescribir la actual', async () => {
  const { call } = setup();
  await call('POST', '/bot/sesion', sesion({ secuencia: 5, mensaje: 'reciente' }));
  expect(
    (await call('POST', '/bot/sesion', sesion({ secuencia: 4, mensaje: 'replay' }))).status,
  ).toBe(409);
  expect((await call('GET', '/robot/sesion', undefined, 'u-natalia')).body.sesion.mensaje).toBe(
    'reciente',
  );
  await call(
    'POST',
    '/bot/sesion',
    sesion({ sesion_id: 'sesion-2', secuencia: 0, mensaje: 'nueva' }),
  );
  expect(
    (
      await call(
        'POST',
        '/bot/sesion',
        sesion({ sesion_id: 'sesion-1', secuencia: 99, mensaje: 'sesion anterior replay' }),
      )
    ).status,
  ).toBe(409);
  expect((await call('GET', '/robot/sesion', undefined, 'u-natalia')).body.sesion).toMatchObject({
    sesion_id: 'sesion-2',
    mensaje: 'nueva',
  });
});

test('QR exige firma, vigencia y registro asociado; socio desconocido e invitación ajena se rechazan', async () => {
  const { call } = setup();
  const key = clubConfig({}).qrSecret!;
  const qr = (tipo: string, persona: string, nombre: string, exp: number) => {
    const body = ['NCLUB1', tipo, persona, nombre, String(exp)].join('|');
    const sig = createHmac('sha256', key).update(body).digest('hex').slice(0, 20);
    return `${body}|${sig}`;
  };
  const invalid = await call('POST', '/bot/qr/verificar', { payload: 'malformado' });
  expect(invalid.body).toMatchObject({ valido: false });
  const qrLargoSocio = qr('socio', 'andres', 'Andres Mejia', 1_800_000_000);
  expect(
    (await call('POST', '/bot/qr/verificar', { payload: `${qrLargoSocio.slice(0, -1)}0` })).body,
  ).toMatchObject({ valido: false, motivo: 'firma_invalida' });
  const invExpired = qr('socio', 'andres', 'Andres Mejia', 1);
  expect((await call('POST', '/bot/qr/verificar', { payload: invExpired })).body).toMatchObject({
    valido: false,
    motivo: 'vencido',
  });
  const unknown = qr('socio', 'nadie', 'Persona Desconocida', 1_800_000_000);
  expect((await call('POST', '/bot/qr/verificar', { payload: unknown })).body).toMatchObject({
    valido: false,
    motivo: 'registro_no_vigente',
  });
  expect((await call('POST', '/bot/qr/verificar', { payload: qrLargoSocio })).body).toMatchObject({
    valido: true,
    tipo: 'socio',
    persona_id: 'andres',
  });
  const created = await call(
    'POST',
    '/invitaciones',
    { ...INVITACION, nombre: 'Laura', apellido: 'Diaz' },
    'u-andres',
  );
  const guest = qr(
    'invitado',
    created.body.persona_id,
    'Laura Diaz',
    bogotaExp('2026-10-24', '14:00'),
  );
  expect((await call('POST', '/bot/qr/verificar', { payload: guest })).body).toMatchObject({
    valido: true,
    tipo: 'invitado',
    persona_id: created.body.persona_id,
  });
  const qrLargoInvitado = qr('invitado', created.body.persona_id, 'Laura Diaz', 1_800_000_000);
  expect(
    (await call('POST', '/bot/qr/verificar', { payload: qrLargoInvitado })).body,
  ).toMatchObject({
    valido: true,
    tipo: 'invitado',
  });
  const ajena = qr('invitado', 'inv-no-existe', 'Laura Diaz', 1_800_000_000);
  expect((await call('POST', '/bot/qr/verificar', { payload: ajena })).body).toMatchObject({
    valido: false,
    motivo: 'registro_no_vigente',
  });
});

test('GET /bot/pases conserva el QR de socio emitido por la app y solo entrega pases vigentes', async () => {
  const { call, setNow } = setup();
  expect((await call('GET', '/bot/pases', undefined, null)).status).toBe(401);
  const created = await call(
    'POST',
    '/invitaciones',
    { ...INVITACION, nombre: 'Laura', apellido: 'Diaz' },
    'u-andres',
  );
  const expiring = await call(
    'POST',
    '/invitaciones',
    { ...INVITACION, nombre: 'Maria', apellido: 'Perez' },
    'u-andres',
  );
  expect(created.status).toBe(201);
  expect(expiring.status).toBe(201);
  const meQr = await call('GET', '/me/qr', undefined, 'u-andres');
  setNow(new Date(NOW.getTime() + 3_000));
  const current = await call('GET', '/bot/pases');
  expect(current.status).toBe(200);
  expect(current.body.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        tipo: 'socio',
        persona_id: 'andres',
        qr_payload: expect.stringMatching(/^NCLUB1\|socio\|andres\|Andres Mejia\|/),
      }),
      expect.objectContaining({
        tipo: 'invitado',
        persona_id: created.body.persona_id,
        qr_payload: created.body.qr_payload,
      }),
    ]),
  );
  expect(
    current.body.items.find((item: { persona_id: string }) => item.persona_id === 'andres')
      .qr_payload,
  ).toBe(meQr.body.qr_payload);
  expect(
    current.body.items.every(
      (item: { vence_at: string }) => Date.parse(item.vence_at) > NOW.getTime() + 3_000,
    ),
  ).toBe(true);
  const andresQr = current.body.items.find(
    (item: { persona_id: string }) => item.persona_id === 'andres',
  ).qr_payload;
  expect(andresQr).toBe(meQr.body.qr_payload);
  const sofiaQr = current.body.items.find(
    (item: { persona_id: string }) => item.persona_id === 'sofia',
  ).qr_payload;
  setNow(new Date(NOW.getTime() + 6_000));
  const repeated = await call('GET', '/bot/pases');
  expect(
    repeated.body.items.find((item: { persona_id: string }) => item.persona_id === 'andres')
      .qr_payload,
  ).toBe(andresQr);
  expect(
    repeated.body.items.find((item: { persona_id: string }) => item.persona_id === 'sofia')
      .qr_payload,
  ).toBe(sofiaQr);
  setNow(new Date(NOW.getTime() + 9_000));
  const refreshedAppQr = await call('GET', '/me/qr', undefined, 'u-andres');
  expect(refreshedAppQr.body.qr_payload).not.toBe(andresQr);
  expect(
    (await call('GET', '/bot/pases')).body.items.find(
      (item: { persona_id: string }) => item.persona_id === 'andres',
    ).qr_payload,
  ).toBe(refreshedAppQr.body.qr_payload);
  setNow(new Date(NOW.getTime() + SOCIO_QR_TTL_S * 1000 + 10_000));
  const renewed = await call('GET', '/bot/pases');
  const renewedAndres = renewed.body.items.find(
    (item: { persona_id: string }) => item.persona_id === 'andres',
  ).qr_payload;
  expect(renewedAndres).not.toBe(andresQr);
  expect(renewedAndres.split('|')[4]).toBe(
    String(Math.floor((NOW.getTime() + SOCIO_QR_TTL_S * 1000 + 10_000) / 1000) + SOCIO_QR_TTL_S),
  );
  await call('DELETE', `/invitaciones/${created.body.id}`, undefined, 'u-andres');
  expect(
    (await call('GET', '/bot/pases')).body.items.some(
      (item: { persona_id: string }) => item.persona_id === created.body.persona_id,
    ),
  ).toBe(false);
  expect(
    (await call('GET', '/bot/pases')).body.items.some(
      (item: { persona_id: string }) => item.persona_id === expiring.body.persona_id,
    ),
  ).toBe(true);
  setNow(new Date(Date.parse('2026-10-24T19:00:00Z')));
  expect(
    (await call('GET', '/bot/pases')).body.items.some(
      (item: { persona_id: string }) => item.persona_id === expiring.body.persona_id,
    ),
  ).toBe(false);
});

test('modo sabana expone cuatro socios acordados y exige contraseña del equipo', () => {
  const previousSource = process.env.CERBERUS_DATA_SOURCE;
  const previousPassword = process.env.CERBERUS_TEAM_PASSWORD;
  try {
    process.env.CERBERUS_DATA_SOURCE = 'sabana';
    delete process.env.CERBERUS_TEAM_PASSWORD;
    expect(() => usuarios()).toThrow('CERBERUS_TEAM_PASSWORD');
    process.env.CERBERUS_TEAM_PASSWORD = 'clave-de-prueba';
    expect(
      usuarios()
        .filter((u) => u.rol === 'SOCIO')
        .map(({ id, persona_id, nombre, apellido, email, nivel }) => ({
          id,
          persona_id,
          nombre,
          apellido,
          email,
          nivel,
        })),
    ).toEqual([
      {
        id: 'u-gabriel',
        persona_id: 'gabriel',
        nombre: 'Gabriel',
        apellido: '',
        email: 'gabriel@nclub.demo',
        nivel: 'VIP',
      },
      {
        id: 'u-vale',
        persona_id: 'vale',
        nombre: 'Vale',
        apellido: '',
        email: 'vale@nclub.demo',
        nivel: null,
      },
      {
        id: 'u-andres',
        persona_id: 'andres',
        nombre: 'Andres',
        apellido: '',
        email: 'andres@nclub.demo',
        nivel: 'REGULAR',
      },
      {
        id: 'u-thomas',
        persona_id: 'thomas',
        nombre: 'Thomas',
        apellido: '',
        email: 'thomas@nclub.demo',
        nivel: 'REGULAR',
      },
    ]);
  } finally {
    if (previousSource === undefined) delete process.env.CERBERUS_DATA_SOURCE;
    else process.env.CERBERUS_DATA_SOURCE = previousSource;
    if (previousPassword === undefined) delete process.env.CERBERUS_TEAM_PASSWORD;
    else process.env.CERBERUS_TEAM_PASSWORD = previousPassword;
    process.env.CERBERUS_DATA_SOURCE = 'legacy';
    usuarios();
    if (previousSource === undefined) delete process.env.CERBERUS_DATA_SOURCE;
    else process.env.CERBERUS_DATA_SOURCE = previousSource;
  }
});

test('modo sabana sincroniza roster mínimo y reutiliza QR exacto de app sin sembrar datos ficticios', async () => {
  const previousSource = process.env.CERBERUS_DATA_SOURCE;
  const previousPassword = process.env.CERBERUS_TEAM_PASSWORD;
  const { call, store, setNow } = setup();
  try {
    process.env.CERBERUS_DATA_SOURCE = 'sabana';
    process.env.CERBERUS_TEAM_PASSWORD = 'clave-de-prueba';
    expect(usuarios().find((u) => u.id === 'u-vale')).toMatchObject({
      activo: false,
      nivel: null,
      destino: null,
    });
    expect((await call('GET', '/me/qr', undefined, 'u-vale')).status).not.toBe(200);
    const personas = await call('GET', '/bot/personas');
    expect(personas.body.items).toEqual([
      { id: 'gabriel', nombre: 'Gabriel', categoria: 'VIP', foto_estado: 'NINGUNA' },
      { id: 'andres', nombre: 'Andres', categoria: 'REGULAR', foto_estado: 'NINGUNA' },
      { id: 'thomas', nombre: 'Thomas', categoria: 'REGULAR', foto_estado: 'NINGUNA' },
      { id: 'vale', nombre: 'Vale', categoria: 'EXTERNO', foto_estado: 'NINGUNA' },
    ]);
    expect(personas.body.items[0]).not.toHaveProperty('clave_hash');
    const pases = await call('GET', '/bot/pases');
    expect(pases.body.items.map((item: { persona_id: string }) => item.persona_id)).toEqual([
      'gabriel',
      'andres',
      'thomas',
      'vale',
    ]);
    expect(
      pases.body.items.find((item: { persona_id: string }) => item.persona_id === 'vale').tipo,
    ).toBe('externo');
    const appQr = await call('GET', '/me/qr', undefined, 'u-andres');
    setNow(new Date(NOW.getTime() + 3_000));
    expect(
      (await call('GET', '/bot/pases')).body.items.find(
        (item: { persona_id: string }) => item.persona_id === 'andres',
      ).qr_payload,
    ).toBe(appQr.body.qr_payload);
    const registros = await call('GET', '/bot/registros?fecha=2026-10-24');
    expect(Object.keys(registros.body.socios).sort()).toEqual(['andres', 'gabriel', 'thomas']);
    expect(registros.body.socios).not.toHaveProperty('vale');
    expect(registros.body.turnos).toEqual({});
    expect(registros.body.ordenes).toEqual({});
    expect(await listarActividades(store, '2026-10-24')).toEqual([]);
  } finally {
    if (previousSource === undefined) delete process.env.CERBERUS_DATA_SOURCE;
    else process.env.CERBERUS_DATA_SOURCE = previousSource;
    if (previousPassword === undefined) delete process.env.CERBERUS_TEAM_PASSWORD;
    else process.env.CERBERUS_TEAM_PASSWORD = previousPassword;
    usuarios();
  }
});

test('GET personas comunica DELETE /me/foto como NINGUNA y conserva la identidad del socio', async () => {
  const { call, store } = setup();
  await updatePerfil(store, 'u-andres', (perfil) => ({ ...perfil, foto_estado: 'LISTA' }));
  expect((await call('GET', '/bot/personas')).body.items).toContainEqual(
    expect.objectContaining({ id: 'andres', foto_estado: 'LISTA' }),
  );

  expect((await call('DELETE', '/me/foto', undefined, 'u-andres')).status).toBe(200);
  const items = (await call('GET', '/bot/personas')).body.items;
  expect(items).toContainEqual(expect.objectContaining({ id: 'andres', foto_estado: 'NINGUNA' }));
  expect(items.map((item: { id: string }) => item.id)).toContain('andres');
});

test('GET /bot/pases publica invitaciones futuras sin autorizar ingreso temprano', async () => {
  const { call } = setup();
  const future = await call(
    'POST',
    '/invitaciones',
    {
      ...INVITACION,
      fecha: '2026-10-25',
      nombre: 'Laura',
      apellido: 'Diaz',
    },
    'u-andres',
  );
  expect(future.status).toBe(201);
  const pases = await call('GET', '/bot/pases');
  expect(pases.body.items).toContainEqual(
    expect.objectContaining({
      persona_id: future.body.persona_id,
      qr_payload: future.body.qr_payload,
    }),
  );
  expect(
    (await call('POST', '/bot/qr/verificar', { payload: future.body.qr_payload })).body,
  ).toMatchObject({ valido: false, motivo: 'registro_no_vigente' });
  await call('DELETE', `/invitaciones/${future.body.id}`, undefined, 'u-andres');
  expect(
    (await call('GET', '/bot/pases')).body.items.some(
      (item: { persona_id: string }) => item.persona_id === future.body.persona_id,
    ),
  ).toBe(false);
});

test('una identidad registrada desde Brain comparte padrón y QR, y revocarla retira su acceso', async () => {
  const { call } = setup();
  const persona = {
    id: 'registro-tecnico',
    nombre: 'Registro técnico',
    categoria: 'VIP',
    activo: true,
    consentimiento: true,
  };
  expect((await call('POST', '/bot/personas', persona)).status).toBe(201);
  expect((await call('GET', '/bot/personas')).body.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: persona.id, nombre: persona.nombre, categoria: 'VIP' }),
    ]),
  );
  expect((await call('GET', '/bot/registros')).body.socios[persona.id]).toMatchObject({
    nivel: 'VIP',
  });
  const pase = (await call('GET', '/bot/pases')).body.items.find(
    (item: { persona_id: string }) => item.persona_id === persona.id,
  );
  expect(pase).toBeDefined();
  expect(
    (await call('POST', '/bot/qr/verificar', { payload: pase.qr_payload })).body,
  ).toMatchObject({ valido: true, categoria: 'VIP' });
  await call('POST', '/bot/personas', { ...persona, activo: false });
  expect(
    (await call('GET', '/bot/pases')).body.items.some(
      (item: { persona_id: string }) => item.persona_id === persona.id,
    ),
  ).toBe(false);
  expect((await call('POST', '/bot/qr/verificar', { payload: pase.qr_payload })).body.valido).toBe(
    false,
  );
});
