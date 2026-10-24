import { createClubApp } from '@/club/app';
import { descifrar, fotosRoutes, type FotoGuardada } from '@/club/fotos';
import { invitacionesRoutes } from '@/club/invitaciones';
import { listInvitaciones, updateInvitacion } from '@/club/repo';
import { perfilRoutes } from '@/club/perfil';
import { qrRoutes } from '@/club/qr';
import { signToken } from '@/club/auth';
import { BOT_KEY, INVITACION, NOW, fotoForm, jpeg, makeClub } from '../../support/club-app';

const club = makeClub([...invitacionesRoutes, ...fotosRoutes]);
const { call, login, store } = club;
let sofia: string;
let andres: string;

beforeAll(async () => {
  sofia = await login('sofia@nclub.demo');
  andres = await login('andres@nclub.demo');
});

// Frees the VIP invitation slots between tests.
afterEach(async () => {
  for (const i of await listInvitaciones(store)) {
    await updateInvitacion(store, i.id, (cur) => ({ ...cur, estado: 'CANCELADA' }));
  }
});

const crear = async () =>
  (await call('POST', '/invitaciones', { token: sofia, body: INVITACION })).body;
const subir = (id: string, bytes = jpeg(), consent: string | null = 'true', token = sofia) =>
  call('PUT', `/invitaciones/${id}/foto`, { token, form: fotoForm(bytes, consent ?? undefined) });
const key = (id: string) => `club:foto:${id}`;
const relative = (url: string) => url.replace('http://x/api', '');
const pendientes = () => call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY });
const plus = (s: number) => new Date(NOW.getTime() + s * 1000);

test('PUT foto sin consentimiento es 400 y no guarda nada', async () => {
  const inv = await crear();
  for (const c of [null, 'false', 'si']) {
    expect(await subir(inv.id, jpeg(), c)).toMatchObject({
      status: 400,
      body: { error: 'consentimiento_requerido' },
    });
  }
  expect(await store.get(key(inv.id))).toBeNull();
});

test('PUT foto: queda PENDIENTE con consentimiento y cifrada en el almacén', async () => {
  const inv = await crear();
  const bytes = jpeg(200);
  const r = await subir(inv.id, bytes);
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({
    foto_estado: 'PENDIENTE',
    foto_motivo: null,
    consentimiento_at: '2026-10-24T10:00:00.000-05:00',
  });
  const saved = (await store.get<Record<string, string>>(key(inv.id)))!.value;
  expect(Object.keys(saved).sort()).toEqual(['data', 'iv', 'subida_at', 'tag']);
  expect(Buffer.from(saved.data!, 'base64').includes(bytes.subarray(8))).toBe(false);
  expect(JSON.stringify(saved)).not.toContain(bytes.toString('base64').slice(0, 20));
});

test('PUT foto valida tamaño, JPEG, multipart y archivo', async () => {
  const inv = await crear();
  expect((await subir(inv.id, jpeg(600 * 1024 - 4))).status).toBe(200);
  expect(await subir(inv.id, jpeg(600 * 1024 - 3))).toMatchObject({
    status: 413,
    body: { error: 'foto_muy_grande' },
  });
  expect(
    await subir(inv.id, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]), 'true'),
  ).toMatchObject({ status: 415, body: { error: 'foto_no_jpeg' } });
  const sinArchivo = new FormData();
  sinArchivo.set('consentimiento', 'true');
  expect(
    await call('PUT', `/invitaciones/${inv.id}/foto`, { token: sofia, form: sinArchivo }),
  ).toMatchObject({
    status: 400,
    body: { error: 'foto_requerida' },
  });
  expect(
    await call('PUT', `/invitaciones/${inv.id}/foto`, { token: sofia, body: { a: 1 } }),
  ).toMatchObject({ status: 400, body: { error: 'multipart_invalido' } });
});

test('PUT foto rechaza cuerpos enormes por Content-Length antes de leerlos', async () => {
  const inv = await crear();
  const app = createClubApp({
    store,
    cfg: club.cfg,
    routes: [...invitacionesRoutes, ...fotosRoutes],
    clock: () => NOW,
  });
  const res = await app(
    new Request(`http://x/api/invitaciones/${inv.id}/foto`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${sofia}`,
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': String(5 * 1024 * 1024),
      },
      body: 'x',
    }),
    `/invitaciones/${inv.id}/foto`,
  );
  expect(res.status).toBe(413);
});

test('PUT/DELETE foto: solo el dueño; no se sube en estados finales', async () => {
  const inv = await crear();
  expect((await subir(inv.id, jpeg(), 'true', andres)).status).toBe(403);
  expect((await call('DELETE', `/invitaciones/${inv.id}/foto`, { token: andres })).status).toBe(
    403,
  );
  await updateInvitacion(store, inv.id, (i) => ({ ...i, estado: 'LLEGO' }));
  expect(await subir(inv.id)).toMatchObject({
    status: 409,
    body: { error: 'invitacion_no_editable' },
  });
});

test('DELETE foto la quita y borra el archivo, incluso con la invitación cancelada', async () => {
  const inv = await crear();
  await subir(inv.id);
  const r = await call('DELETE', `/invitaciones/${inv.id}/foto`, { token: sofia });
  expect(r).toMatchObject({
    status: 200,
    body: { foto_estado: 'NINGUNA', foto_motivo: null, consentimiento_at: null },
  });
  expect(await store.get(key(inv.id))).toBeNull();
});

test('cancelar la invitación borra la foto', async () => {
  const inv = await crear();
  await subir(inv.id);
  const r = await call('DELETE', `/invitaciones/${inv.id}`, { token: sofia });
  expect(r.body).toMatchObject({ estado: 'CANCELADA', foto_estado: 'NINGUNA' });
  expect(await store.get(key(inv.id))).toBeNull();
});

test('robot: pendientes con URL firmada de 60 s y descarga del JPEG original', async () => {
  const c = makeClub([...invitacionesRoutes, ...fotosRoutes]);
  const t = await c.login('sofia@nclub.demo');
  const inv = (await c.call('POST', '/invitaciones', { token: t, body: INVITACION })).body;
  const bytes = jpeg(500);
  await c.call('PUT', `/invitaciones/${inv.id}/foto`, { token: t, form: fotoForm(bytes, 'true') });

  expect((await c.call('GET', '/bot/fotos/pendientes')).status).toBe(401);
  const p = await c.call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY });
  expect(p.body.items).toHaveLength(1);
  const [item] = p.body.items;
  expect(item).toMatchObject({ invitacion_id: inv.id, persona_id: inv.persona_id });
  const url = new URL(item.url);
  expect(url.pathname).toBe(`/api/bot/fotos/${inv.id}/archivo`);
  expect(Number(url.searchParams.get('exp'))).toBe(Math.floor(NOW.getTime() / 1000) + 60);

  const file = await c.call('GET', relative(item.url)); // PUBLIC: la firma es la credencial
  expect(file.status).toBe(200);
  expect(file.res.headers.get('content-type')).toBe('image/jpeg');
  expect(file.res.headers.get('cache-control')).toBe('no-store');
  expect(Buffer.from(await file.res.arrayBuffer()).equals(bytes)).toBe(true);

  const bad = relative(item.url).replace(/sig=.{4}/, 'sig=0000');
  expect(await c.call('GET', bad)).toMatchObject({
    status: 401,
    body: { error: 'firma_invalida' },
  });
  expect((await c.call('GET', `/bot/fotos/${inv.id}/archivo`)).status).toBe(401);
  const other = relative(item.url).replace(inv.id, 'otra');
  expect((await c.call('GET', other)).status).toBe(401);
  c.setNow(plus(61));
  expect(await c.call('GET', relative(item.url))).toMatchObject({
    status: 401,
    body: { error: 'url_vencida' },
  });
});

test('la URL firmada usa el host público con el que el robot llamó', async () => {
  const inv = await crear();
  await subir(inv.id);
  const via = async (headers: Record<string, string>) =>
    (await call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY, headers })).body.items.find(
      (i: { invitacion_id: string }) => i.invitacion_id === inv.id,
    ).url as string;
  expect(await via({ host: 'club.example.com' })).toMatch(
    /^https:\/\/club\.example\.com\/api\/bot\/fotos\//,
  );
  expect(await via({ host: 'localhost:4192' })).toMatch(/^http:\/\/localhost:4192\/api\//);
  expect(
    await via({
      host: 'internal',
      'x-forwarded-host': 'p.example.com',
      'x-forwarded-proto': 'http',
    }),
  ).toMatch(/^http:\/\/p\.example\.com\/api\//);
  await call('DELETE', `/invitaciones/${inv.id}`, { token: sofia }); // frees a VIP slot
});

test('robot: resultado ok → LISTA y conserva la foto cifrada', async () => {
  const inv = await crear();
  await subir(inv.id);
  const url = relative(
    (await pendientes()).body.items.find(
      (i: { invitacion_id: string }) => i.invitacion_id === inv.id,
    ).url,
  );
  const r = await call('POST', `/bot/fotos/${inv.id}/resultado`, {
    bot: BOT_KEY,
    body: { ok: true },
  });
  expect(r).toMatchObject({
    status: 200,
    body: { id: inv.id, foto_estado: 'LISTA', foto_motivo: null },
  });
  expect(await store.get(key(inv.id))).not.toBeNull();
  expect((await call('GET', url)).status).toBe(200); // la URL de 60 s sigue sirviendo la foto
  expect((await call('GET', `/invitaciones/${inv.id}`, { token: sofia })).body.foto_estado).toBe(
    'LISTA',
  );
  expect(
    await call('POST', `/bot/fotos/${inv.id}/resultado`, { bot: BOT_KEY, body: { ok: true } }),
  ).toMatchObject({ status: 409, body: { error: 'foto_no_pendiente' } });
});

test('robot: resultado no ok → RECHAZADA con el motivo tal cual y foto borrada', async () => {
  const inv = await crear();
  await subir(inv.id);
  const r = await call('POST', `/bot/fotos/${inv.id}/resultado`, {
    bot: BOT_KEY,
    body: { ok: false, motivo: 'poca luz, mire de frente' },
  });
  expect(r.body).toMatchObject({
    foto_estado: 'RECHAZADA',
    foto_motivo: 'poca luz, mire de frente',
  });
  expect(await store.get(key(inv.id))).toBeNull();
  const again = await subir(inv.id); // el socio puede volver a subirla
  expect(again.body).toMatchObject({ foto_estado: 'PENDIENTE', foto_motivo: null });
});

test('robot: resultado valida el cuerpo y la invitación', async () => {
  const inv = await crear();
  const post = (id: string, body: unknown, bot = BOT_KEY) =>
    call('POST', `/bot/fotos/${id}/resultado`, { bot, body });
  expect((await post(inv.id, { ok: 'si' })).status).toBe(400);
  expect((await post('nada', { ok: true })).status).toBe(404);
  expect((await post(inv.id, { ok: true }, '')).status).toBe(401);
  await subir(inv.id);
  const sinMotivo = await post(inv.id, { ok: false });
  expect(sinMotivo.body).toMatchObject({ foto_estado: 'RECHAZADA', foto_motivo: null });
});

test('las fotos de más de 24 h se ignoran y se borran al listar pendientes', async () => {
  const c = makeClub([...invitacionesRoutes, ...fotosRoutes]);
  const t = await c.login('sofia@nclub.demo');
  const inv = (await c.call('POST', '/invitaciones', { token: t, body: INVITACION })).body;
  await c.call('PUT', `/invitaciones/${inv.id}/foto`, { token: t, form: fotoForm(jpeg(), 'true') });
  await updateInvitacion(c.store, inv.id, (i) => ({ ...i, estado: 'LLEGO' })); // la visita sigue
  c.setNow(plus(24 * 3600 - 30));
  const item = (await c.call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY })).body.items[0];
  expect(item).toBeDefined();
  c.setNow(plus(24 * 3600 + 10)); // URL aún vigente, pero la foto ya venció
  expect(await c.call('GET', relative(item.url))).toMatchObject({
    status: 404,
    body: { error: 'foto_no_encontrada' },
  });
  expect(await c.store.get(key(inv.id))).toBeNull();

  c.setNow(NOW);
  await updateInvitacion(c.store, inv.id, (i) => ({ ...i, estado: 'PROGRAMADA' }));
  await c.call('PUT', `/invitaciones/${inv.id}/foto`, { token: t, form: fotoForm(jpeg(), 'true') });
  await updateInvitacion(c.store, inv.id, (i) => ({ ...i, estado: 'LLEGO' }));
  c.setNow(plus(3 * 24 * 3600));
  expect((await c.call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY })).body.items).toEqual([]);
  expect(await c.store.get(key(inv.id))).toBeNull();
  const after = await c.call('GET', `/invitaciones/${inv.id}`, {
    token: await c.login('sofia@nclub.demo'),
  });
  expect(after.body).toMatchObject({ foto_estado: 'RECHAZADA' });
  expect(after.body.foto_motivo).toContain('venció');
});

test('pendiente sin archivo guardado se marca vencida en vez de quedar colgada', async () => {
  const inv = await crear();
  await updateInvitacion(store, inv.id, (i) => ({ ...i, foto_estado: 'PENDIENTE' }));
  const p = await pendientes();
  expect(p.body.items.some((i: { invitacion_id: string }) => i.invitacion_id === inv.id)).toBe(
    false,
  );
  expect((await call('GET', `/invitaciones/${inv.id}`, { token: sofia })).body.foto_estado).toBe(
    'RECHAZADA',
  );
});

test('sin CERBERUS_PHOTO_KEY no se acepta ni se firma nada', async () => {
  const c = makeClub([...invitacionesRoutes, ...fotosRoutes], { photoKey: undefined });
  const t = await c.login('sofia@nclub.demo');
  const inv = (await c.call('POST', '/invitaciones', { token: t, body: INVITACION })).body;
  expect(
    (
      await c.call('PUT', `/invitaciones/${inv.id}/foto`, {
        token: t,
        form: fotoForm(jpeg(), 'true'),
      })
    ).body.error,
  ).toBe('config_faltante');
});

// ---- v3: descarga, retención y cédula -------------------------------------------------------

const get = (path: string, token?: string, bot?: string) => call('GET', path, { token, bot });
const bytesOf = async (r: { res: Response }) => Buffer.from(await r.res.arrayBuffer());
const listaConFoto = async (bytes = jpeg(300)) => {
  const inv = await crear();
  await subir(inv.id, bytes);
  await call('POST', `/bot/fotos/${inv.id}/resultado`, { bot: BOT_KEY, body: { ok: true } });
  return inv;
};

test('GET /invitaciones/:id/foto devuelve el JPEG sin caché al dueño, concierge, admin y edecán', async () => {
  const bytes = jpeg(300);
  const inv = await listaConFoto(bytes);
  for (const email of ['sofia', 'concierge', 'admin', 'edecan']) {
    const t = await login(`${email}@nclub.demo`);
    const r = await get(`/invitaciones/${inv.id}/foto`, t);
    expect(r.status).toBe(200);
    expect(r.res.headers.get('content-type')).toBe('image/jpeg');
    expect(r.res.headers.get('cache-control')).toBe('no-store');
    expect((await bytesOf(r)).equals(bytes)).toBe(true);
  }
});

test('GET /invitaciones/:id/foto: otro socio 403, personal 403, sin foto 404, sin token 401', async () => {
  const inv = await listaConFoto();
  expect((await get(`/invitaciones/${inv.id}/foto`, andres)).status).toBe(403);
  expect(
    (await get(`/invitaciones/${inv.id}/foto`, await login('personal@nclub.demo'))).status,
  ).toBe(403);
  expect((await get(`/invitaciones/${inv.id}/foto`)).status).toBe(401);
  const otra = await crear();
  expect(await get(`/invitaciones/${otra.id}/foto`, sofia)).toMatchObject({
    status: 404,
    body: { error: 'foto_no_encontrada' },
  });
});

test.each([
  [
    'cancelada',
    (id: string) => updateInvitacion(store, id, (i) => ({ ...i, estado: 'CANCELADA' })),
  ],
  ['salió', (id: string) => updateInvitacion(store, id, (i) => ({ ...i, estado: 'SALIO' }))],
])('la foto retenida se borra al leer cuando la invitación está %s', async (_n, fin) => {
  const inv = await listaConFoto();
  expect((await get(`/invitaciones/${inv.id}/foto`, sofia)).status).toBe(200);
  await fin(inv.id);
  expect((await get(`/invitaciones/${inv.id}/foto`, sofia)).status).toBe(404);
  expect(await store.get(key(inv.id))).toBeNull();
});

test('la foto retenida se borra al leer cuando la invitación vence o pasan 24 h', async () => {
  const c = makeClub([...invitacionesRoutes, ...fotosRoutes]);
  const t = await c.login('sofia@nclub.demo');
  const hacer = async () => {
    const inv = (await c.call('POST', '/invitaciones', { token: t, body: INVITACION })).body;
    await c.call('PUT', `/invitaciones/${inv.id}/foto`, {
      token: t,
      form: fotoForm(jpeg(), 'true'),
    });
    await c.call('POST', `/bot/fotos/${inv.id}/resultado`, { bot: BOT_KEY, body: { ok: true } });
    return inv;
  };
  const ver = async (id: string) =>
    (
      await c.call('GET', `/invitaciones/${id}/foto`, {
        token: await c.login('sofia@nclub.demo'), // el token dura 1 h
      })
    ).status;
  const a = await hacer();
  c.setNow(plus(3 * 3600)); // 13:00, antes de hora_hasta
  expect(await ver(a.id)).toBe(200);
  c.setNow(plus(5 * 3600)); // 15:00, la invitación ya venció
  expect(await ver(a.id)).toBe(404);
  expect(await c.store.get(key(a.id))).toBeNull();

  c.setNow(NOW);
  const b = await hacer();
  await updateInvitacion(c.store, b.id, (i) => ({ ...i, estado: 'LLEGO' }));
  c.setNow(plus(23 * 3600));
  expect(await ver(b.id)).toBe(200);
  c.setNow(plus(24 * 3600 + 5));
  expect(await ver(b.id)).toBe(404);
  expect(await c.store.get(key(b.id))).toBeNull();
});

test('GET /bot/fotos/:id sirve el JPEG al robot y no choca con /pendientes', async () => {
  const bytes = jpeg(120);
  const inv = await listaConFoto(bytes);
  expect((await get(`/bot/fotos/${inv.id}`)).status).toBe(401);
  const r = await get(`/bot/fotos/${inv.id}`, undefined, BOT_KEY);
  expect(r.status).toBe(200);
  expect(r.res.headers.get('content-type')).toBe('image/jpeg');
  expect((await bytesOf(r)).equals(bytes)).toBe(true);
  expect((await get('/bot/fotos/nada', undefined, BOT_KEY)).status).toBe(404);
  expect((await pendientes()).status).toBe(200);
});

test('pendientes barre las fotos y cédulas retenidas ya caducadas', async () => {
  const c = makeClub([...invitacionesRoutes, ...fotosRoutes]);
  const t = await c.login('sofia@nclub.demo');
  const inv = (await c.call('POST', '/invitaciones', { token: t, body: INVITACION })).body;
  await c.call('PUT', `/invitaciones/${inv.id}/foto`, { token: t, form: fotoForm(jpeg(), 'true') });
  await c.call('PUT', `/invitaciones/${inv.id}/documento`, {
    token: t,
    form: fotoForm(jpeg(), 'true'),
  });
  await c.call('POST', `/bot/fotos/${inv.id}/resultado`, { bot: BOT_KEY, body: { ok: true } });
  expect(await c.store.get(key(inv.id))).not.toBeNull();
  expect(await c.store.get(`club:doc:${inv.id}`)).not.toBeNull();
  await updateInvitacion(c.store, inv.id, (i) => ({ ...i, estado: 'SALIO' }));
  await c.call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY });
  expect(await c.store.get(key(inv.id))).toBeNull();
  expect(await c.store.get(`club:doc:${inv.id}`)).toBeNull();
});

test('BOT sube y sirve la foto EXTERNO Vale con la clave y AAD previos; cuenta antigua no accede', async () => {
  const source = process.env.CERBERUS_DATA_SOURCE;
  const password = process.env.CERBERUS_TEAM_PASSWORD;
  process.env.CERBERUS_DATA_SOURCE = 'sabana';
  process.env.CERBERUS_TEAM_PASSWORD = 'clave-de-prueba';
  try {
    const c = makeClub([...fotosRoutes, ...perfilRoutes, ...qrRoutes]);
    const bytes = jpeg(90);
    const oldJwt = signToken(
      { sub: 'u-vale', rol: 'SOCIO' },
      c.cfg.jwtSecret!,
      NOW.getTime() / 1000,
    );
    expect((await c.call('GET', '/me/foto', { token: oldJwt })).status).toBe(401);
    expect(
      (
        await c.call('POST', '/bot/personas/vale/foto', {
          bot: BOT_KEY,
          form: fotoForm(bytes, undefined),
        })
      ).status,
    ).toBe(400);
    expect(
      (await c.call('POST', '/bot/personas/gabriel/foto', { bot: BOT_KEY, form: fotoForm(bytes) }))
        .status,
    ).toBe(404);
    const uploaded = await c.call('POST', '/bot/personas/vale/foto', {
      bot: BOT_KEY,
      form: fotoForm(bytes, 'true'),
    });
    expect(uploaded.body).toMatchObject({
      id: 'u-vale',
      persona_id: 'vale',
      foto_estado: 'PENDIENTE',
    });
    const stored = (await c.store.get<FotoGuardada>('club:mifoto:u-vale'))!.value;
    expect(descifrar(stored, c.cfg.photoKey!, 'u-vale').equals(bytes)).toBe(true);
    expect(
      (await c.store.get<{ consentimiento_foto_at: string }>('club:perfil:u-vale'))?.value
        .consentimiento_foto_at,
    ).toBe('2026-10-24T10:00:00.000-05:00');
    const pendientes = await c.call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY });
    expect(pendientes.body.items).toContainEqual(
      expect.objectContaining({ tipo: 'externo', id: 'u-vale', persona_id: 'vale' }),
    );
    expect(
      (await c.call('POST', '/bot/fotos/u-vale/resultado', { bot: BOT_KEY, body: { ok: true } }))
        .body,
    ).toMatchObject({ persona_id: 'vale', foto_estado: 'LISTA' });
    for (const path of ['/bot/fotos/u-vale', '/bot/fotos/vale']) {
      const response = await c.call('GET', path, { bot: BOT_KEY });
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.res.arrayBuffer()).equals(bytes)).toBe(true);
    }
    expect((await c.call('DELETE', '/bot/personas/vale/foto', { bot: BOT_KEY })).status).toBe(200);
    expect(await c.store.get('club:mifoto:u-vale')).toBeNull();
    expect(
      (await c.store.get<{ consentimiento_foto_at: string | null }>('club:perfil:u-vale'))?.value
        .consentimiento_foto_at,
    ).toBeNull();
  } finally {
    if (source === undefined) delete process.env.CERBERUS_DATA_SOURCE;
    else process.env.CERBERUS_DATA_SOURCE = source;
    if (password === undefined) delete process.env.CERBERUS_TEAM_PASSWORD;
    else process.env.CERBERUS_TEAM_PASSWORD = password;
  }
});

const doc = (bytes = jpeg(), consent: string | null = 'true', numero?: string) => {
  const f = fotoForm(bytes, consent ?? undefined);
  if (numero !== undefined) f.set('numero', numero);
  return f;
};
const subirDoc = (id: string, form: FormData, token = sofia) =>
  call('PUT', `/invitaciones/${id}/documento`, { token, form });

test('PUT documento sin consentimiento es 400 y no guarda nada', async () => {
  const inv = await crear();
  for (const c of [null, 'false']) {
    expect(await subirDoc(inv.id, doc(jpeg(), c))).toMatchObject({
      status: 400,
      body: { error: 'consentimiento_requerido' },
    });
  }
  expect(await store.get(`club:doc:${inv.id}`)).toBeNull();
});

test('PUT documento guarda la cédula cifrada, marca GUARDADA y actualiza el número', async () => {
  const inv = await crear();
  const bytes = jpeg(400);
  const r = await subirDoc(inv.id, doc(bytes, 'true', '1020304050'));
  expect(r).toMatchObject({
    status: 200,
    body: { documento_foto: 'GUARDADA', documento: '1020304050', foto_estado: 'NINGUNA' },
  });
  const saved = (await store.get<Record<string, string>>(`club:doc:${inv.id}`))!.value;
  expect(Object.keys(saved).sort()).toEqual(['data', 'iv', 'subida_at', 'tag']);
  expect(Buffer.from(saved.data!, 'base64').includes(bytes.subarray(8))).toBe(false);
  const sin = await crear();
  const r2 = await subirDoc(sin.id, doc());
  expect(r2.body).toMatchObject({ documento_foto: 'GUARDADA', documento: null });
});

test.each(['1234', '1234567890123456', '12a45', ' 12345'])(
  'PUT documento rechaza el número %j sin guardar',
  async (numero) => {
    const inv = await crear();
    expect(await subirDoc(inv.id, doc(jpeg(), 'true', numero))).toMatchObject({
      status: 400,
      body: { error: 'documento_invalido' },
    });
    expect(await store.get(`club:doc:${inv.id}`)).toBeNull();
  },
);

test('PUT documento valida tamaño y JPEG', async () => {
  const inv = await crear();
  expect((await subirDoc(inv.id, doc(jpeg(600 * 1024 - 4)))).status).toBe(200);
  expect((await subirDoc(inv.id, doc(jpeg(600 * 1024 - 3)))).body.error).toBe('foto_muy_grande');
  expect(
    (await subirDoc(inv.id, doc(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])))).status,
  ).toBe(415);
});

test('documento: solo el dueño sube y borra, y solo mientras PROGRAMADA', async () => {
  const inv = await crear();
  expect((await subirDoc(inv.id, doc(), andres)).status).toBe(403);
  expect((await subirDoc(inv.id, doc(), await login('concierge@nclub.demo'))).status).toBe(403);
  expect(
    (await call('DELETE', `/invitaciones/${inv.id}/documento`, { token: andres })).status,
  ).toBe(403);
  await updateInvitacion(store, inv.id, (i) => ({ ...i, estado: 'LLEGO' }));
  expect(await subirDoc(inv.id, doc())).toMatchObject({
    status: 409,
    body: { error: 'invitacion_no_editable' },
  });
});

test('GET documento: dueño, concierge, admin y edecán; 404 sin cédula; otros roles no', async () => {
  const bytes = jpeg(250);
  const inv = await crear();
  expect(await get(`/invitaciones/${inv.id}/documento`, sofia)).toMatchObject({
    status: 404,
    body: { error: 'documento_no_encontrado' },
  });
  await subirDoc(inv.id, doc(bytes));
  for (const email of ['sofia', 'concierge', 'admin', 'edecan']) {
    const r = await get(`/invitaciones/${inv.id}/documento`, await login(`${email}@nclub.demo`));
    expect(r.status).toBe(200);
    expect(r.res.headers.get('content-type')).toBe('image/jpeg');
    expect(r.res.headers.get('cache-control')).toBe('no-store');
    expect((await bytesOf(r)).equals(bytes)).toBe(true);
  }
  expect((await get(`/invitaciones/${inv.id}/documento`, andres)).status).toBe(403);
  expect(
    (await get(`/invitaciones/${inv.id}/documento`, await login('personal@nclub.demo'))).status,
  ).toBe(403);
});

test('DELETE documento lo borra y deja NINGUNA; cancelar la invitación también', async () => {
  const inv = await crear();
  await subirDoc(inv.id, doc());
  const r = await call('DELETE', `/invitaciones/${inv.id}/documento`, { token: sofia });
  expect(r).toMatchObject({ status: 200, body: { documento_foto: 'NINGUNA' } });
  expect(await store.get(`club:doc:${inv.id}`)).toBeNull();

  await subirDoc(inv.id, doc());
  const c = await call('DELETE', `/invitaciones/${inv.id}`, { token: sofia });
  expect(c.body).toMatchObject({ estado: 'CANCELADA', documento_foto: 'NINGUNA' });
  expect(await store.get(`club:doc:${inv.id}`)).toBeNull();
});

test('la cédula caduca con la visita: se borra al leer y vuelve a NINGUNA', async () => {
  const inv = await crear();
  await subirDoc(inv.id, doc());
  await updateInvitacion(store, inv.id, (i) => ({ ...i, estado: 'SALIO' }));
  expect((await get(`/invitaciones/${inv.id}/documento`, sofia)).status).toBe(404);
  expect(await store.get(`club:doc:${inv.id}`)).toBeNull();
  expect((await get(`/invitaciones/${inv.id}`, sofia)).body.documento_foto).toBe('NINGUNA');
});

test('la foto de la cédula no se puede leer cambiando de registro (AAD distinto)', async () => {
  const a = await crear();
  const b = await crear();
  await subirDoc(a.id, doc());
  const rec = (await store.get(`club:doc:${a.id}`))!.value;
  await store.compareAndSet(`club:doc:${b.id}`, 0, rec); // el almacén intercambia registros
  const silencio = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  expect((await get(`/invitaciones/${b.id}/documento`, sofia)).status).not.toBe(200);
  silencio.mockRestore();
});
