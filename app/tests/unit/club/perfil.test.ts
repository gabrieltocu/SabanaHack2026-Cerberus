import { fotosRoutes } from '@/club/fotos';
import { invitacionesRoutes } from '@/club/invitaciones';
import { perfilRoutes } from '@/club/perfil';
import { BOT_KEY, INVITACION, NOW, fotoForm, jpeg, makeClub } from '../../support/club-app';

const club = makeClub([...invitacionesRoutes, ...fotosRoutes, ...perfilRoutes]);
const { call, login, store } = club;
const plus = (s: number) => new Date(NOW.getTime() + s * 1000);
const relative = (url: string) => url.replace('http://x/api', '');
let sofia: string;
let andres: string;

beforeAll(async () => {
  sofia = await login('sofia@nclub.demo');
  andres = await login('andres@nclub.demo');
});

const patch = (body: unknown, token = sofia) => call('PATCH', '/me/perfil', { token, body });
const subir = (bytes = jpeg(), consent: string | null = 'true', token = sofia) =>
  call('PUT', '/me/foto', { token, form: fotoForm(bytes, consent ?? undefined) });
const pendientes = () => call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY });

test('GET /me/perfil: valores por defecto para cada rol con usuario; sin token 401', async () => {
  const cases = [
    ['sofia', 'u-sofia'],
    ['concierge', 'u-natalia'],
    ['admin', 'u-luciana'],
    ['edecan', 'u-mateo'],
    ['personal', 'u-marta'],
  ] as const;
  for (const [email, id] of cases) {
    const r = await call('GET', '/me/perfil', { token: await login(`${email}@nclub.demo`) });
    expect(r).toMatchObject({
      status: 200,
      body: {
        usuario_id: id,
        preferencias_bebida: [],
        asistencia: [],
        nota_asistencia: null,
        foto_estado: 'NINGUNA',
        foto_motivo: null,
      },
    });
  }
  expect((await call('GET', '/me/perfil')).status).toBe(401);
});

test('PATCH /me/perfil guarda solo lo enviado y lo devuelve en el GET', async () => {
  const a = await patch({ preferencias_bebida: ['cafe', 'jugo de mora'], asistencia: ['visual'] });
  expect(a).toMatchObject({
    status: 200,
    body: { preferencias_bebida: ['cafe', 'jugo de mora'], asistencia: ['visual'] },
  });
  const b = await patch({ nota_asistencia: 'Prefiere hablar despacio' });
  expect(b.body).toMatchObject({
    preferencias_bebida: ['cafe', 'jugo de mora'],
    nota_asistencia: 'Prefiere hablar despacio',
  });
  const c = await patch({ nota_asistencia: null, asistencia: [] });
  expect(c.body).toMatchObject({ nota_asistencia: null, asistencia: [] });
  expect((await call('GET', '/me/perfil', { token: sofia })).body).toMatchObject({
    preferencias_bebida: ['cafe', 'jugo de mora'],
    nota_asistencia: null,
  });
  expect((await call('GET', '/me/perfil', { token: andres })).body.preferencias_bebida).toEqual([]);
});

test.each([
  [{ preferencias_bebida: 'cafe' }, 'preferencias_invalidas'],
  [{ preferencias_bebida: Array(11).fill('te') }, 'preferencias_invalidas'],
  [{ preferencias_bebida: ['x'.repeat(41)] }, 'preferencias_invalidas'],
  [{ preferencias_bebida: [3] }, 'preferencias_invalidas'],
  [{ preferencias_bebida: [''] }, 'preferencias_invalidas'],
  [{ asistencia: ['a'.repeat(41)] }, 'asistencia_invalida'],
  [{ asistencia: null }, 'asistencia_invalida'],
  [{ nota_asistencia: 'x'.repeat(281) }, 'nota_asistencia_invalida'],
  [{ nota_asistencia: 4 }, 'nota_asistencia_invalida'],
])('PATCH /me/perfil rechaza %j', async (body, error) => {
  expect(await patch(body)).toMatchObject({ status: 400, body: { error } });
});

test('PATCH /me/perfil acepta 10 ítems de 40 caracteres', async () => {
  const r = await patch({ asistencia: Array(10).fill('x'.repeat(40)) });
  expect(r.status).toBe(200);
  await patch({ asistencia: [] });
});

test('PUT /me/foto exige consentimiento, JPEG y tamaño, y no guarda nada si falla', async () => {
  for (const c of [null, 'false']) {
    expect(await subir(jpeg(), c, andres)).toMatchObject({
      status: 400,
      body: { error: 'consentimiento_requerido' },
    });
  }
  expect((await subir(jpeg(600 * 1024 - 3), 'true', andres)).body.error).toBe('foto_muy_grande');
  expect(
    (await subir(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]), 'true', andres)).status,
  ).toBe(415);
  expect(await call('PUT', '/me/foto', { token: andres, body: { a: 1 } })).toMatchObject({
    status: 400,
    body: { error: 'multipart_invalido' },
  });
  expect(await store.get('club:mifoto:u-andres')).toBeNull();
  expect((await call('GET', '/me/perfil', { token: andres })).body.foto_estado).toBe('NINGUNA');
});

test('PUT/GET/DELETE /me/foto: cifrada, PENDIENTE, sin caché y para cualquier rol', async () => {
  const bytes = jpeg(220);
  const edecan = await login('edecan@nclub.demo');
  const r = await subir(bytes, 'true', edecan);
  expect(r).toMatchObject({
    status: 200,
    body: { usuario_id: 'u-mateo', foto_estado: 'PENDIENTE', foto_motivo: null },
  });
  const saved = (await store.get<Record<string, string>>('club:mifoto:u-mateo'))!.value;
  expect(Buffer.from(saved.data!, 'base64').includes(bytes.subarray(8))).toBe(false);
  const g = await call('GET', '/me/foto', { token: edecan });
  expect(g.status).toBe(200);
  expect(g.res.headers.get('content-type')).toBe('image/jpeg');
  expect(g.res.headers.get('cache-control')).toBe('no-store');
  expect(Buffer.from(await g.res.arrayBuffer()).equals(bytes)).toBe(true);
  const d = await call('DELETE', '/me/foto', { token: edecan });
  expect(d).toMatchObject({ status: 200, body: { foto_estado: 'NINGUNA', foto_motivo: null } });
  expect(await store.get('club:mifoto:u-mateo')).toBeNull();
  expect(await call('GET', '/me/foto', { token: edecan })).toMatchObject({
    status: 404,
    body: { error: 'foto_no_encontrada' },
  });
});

test('la foto del socio no vence con el tiempo', async () => {
  const c = makeClub([...invitacionesRoutes, ...fotosRoutes, ...perfilRoutes]);
  const t = await c.login('camila@nclub.demo');
  await c.call('PUT', '/me/foto', { token: t, form: fotoForm(jpeg(), 'true') });
  await c.call('POST', '/bot/fotos/u-camila/resultado', { bot: BOT_KEY, body: { ok: true } });
  c.setNow(plus(10 * 24 * 3600));
  const fresco = await c.login('camila@nclub.demo'); // el token dura 1 h
  expect((await c.call('GET', '/me/foto', { token: fresco })).status).toBe(200);
  expect((await c.call('GET', '/bot/fotos/u-camila', { bot: BOT_KEY })).status).toBe(200);
});

test('robot: pendientes mezcla socios e invitados con su tipo y persona_id', async () => {
  const c = makeClub([...invitacionesRoutes, ...fotosRoutes, ...perfilRoutes]);
  const t = await c.login('sofia@nclub.demo');
  const inv = (await c.call('POST', '/invitaciones', { token: t, body: INVITACION })).body;
  await c.call('PUT', `/invitaciones/${inv.id}/foto`, { token: t, form: fotoForm(jpeg(), 'true') });
  const bytes = jpeg(90);
  await c.call('PUT', '/me/foto', { token: t, form: fotoForm(bytes, 'true') });
  const { items } = (await c.call('GET', '/bot/fotos/pendientes', { bot: BOT_KEY })).body;
  const invitado = items.find((i: { tipo: string }) => i.tipo === 'invitado');
  const socio = items.find((i: { tipo: string }) => i.tipo === 'socio');
  expect(items).toHaveLength(2);
  expect(invitado).toMatchObject({ invitacion_id: inv.id, persona_id: inv.persona_id });
  expect(socio).toMatchObject({
    id: 'u-sofia',
    usuario_id: 'u-sofia',
    invitacion_id: null,
    persona_id: 'sofia',
  });
  expect(new URL(socio.url).pathname).toBe('/api/bot/fotos/u-sofia/archivo');
  const file = await c.call('GET', relative(socio.url));
  expect(file.status).toBe(200);
  expect(Buffer.from(await file.res.arrayBuffer()).equals(bytes)).toBe(true);
});

test('robot: resultado sobre un socio; ok conserva la foto, no ok la borra', async () => {
  await subir(jpeg(), 'true', andres);
  const post = (id: string, body: unknown) =>
    call('POST', `/bot/fotos/${id}/resultado`, { bot: BOT_KEY, body });
  const bad = await post('u-andres', { ok: false, motivo: 'poca luz' });
  expect(bad).toMatchObject({
    status: 200,
    body: {
      id: 'u-andres',
      persona_id: 'andres',
      foto_estado: 'RECHAZADA',
      foto_motivo: 'poca luz',
    },
  });
  expect(await store.get('club:mifoto:u-andres')).toBeNull();
  expect((await call('GET', '/me/perfil', { token: andres })).body).toMatchObject({
    foto_estado: 'RECHAZADA',
    foto_motivo: 'poca luz',
  });
  expect((await post('u-andres', { ok: true })).status).toBe(409);
  expect((await post('u-nadie', { ok: true })).status).toBe(404);

  await subir(jpeg(), 'true', andres); // sube otra
  const ok = await post('u-andres', { ok: true });
  expect(ok.body).toMatchObject({ foto_estado: 'LISTA', foto_motivo: null });
  expect(await store.get('club:mifoto:u-andres')).not.toBeNull();
  expect((await pendientes()).body.items.some((i: { id?: string }) => i.id === 'u-andres')).toBe(
    false,
  );
});

test('GET /bot/fotos/:id sirve la foto del socio', async () => {
  const bytes = jpeg(70);
  await subir(bytes, 'true', sofia);
  const r = await call('GET', '/bot/fotos/u-sofia', { bot: BOT_KEY });
  expect(r.status).toBe(200);
  expect(r.res.headers.get('content-type')).toBe('image/jpeg');
  expect(Buffer.from(await r.res.arrayBuffer()).equals(bytes)).toBe(true);
});

test('perfil con foto PENDIENTE pero sin archivo se marca RECHAZADA al listar pendientes', async () => {
  const t = await login('concierge@nclub.demo');
  await call('PUT', '/me/foto', { token: t, form: fotoForm(jpeg(), 'true') });
  await store.delete('club:mifoto:u-natalia');
  const p = await pendientes();
  expect(p.body.items.some((i: { id?: string }) => i.id === 'u-natalia')).toBe(false);
  expect((await call('GET', '/me/perfil', { token: t })).body.foto_estado).toBe('RECHAZADA');
});
