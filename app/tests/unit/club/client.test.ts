import { ClubApiError, createClubClient, tokenStore } from '@/features/club/client';

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

beforeEach(() => tokenStore.set(null));

test('login guarda el token y lo envía; listas y feed se normalizan', async () => {
  const f = fakeFetch([
    { status: 200, body: { token: 'T1', usuario: { id: 'u-sofia', rol: 'SOCIO' } } },
    { status: 200, body: { items: [{ id: 'i1' }] } },
    { status: 200, body: [{ id: 'i2' }] },
    { status: 200, body: [{ seq: 4 }, { seq: 7 }] },
    { status: 200, body: { items: [], ultimo_seq: 9 } },
  ]);
  const c = createClubClient('https://x/api', f.impl);
  expect((await c.login('a@b', 'k')).id).toBe('u-sofia');
  expect(await c.listarInvitaciones({ fecha: '2026-10-24' })).toEqual([{ id: 'i1' }]);
  expect(f.calls[1]!.url).toBe('https://x/api/invitaciones?fecha=2026-10-24');
  expect((f.calls[1]!.init.headers as Record<string, string>).authorization).toBe('Bearer T1');
  expect(await c.listarInvitaciones()).toEqual([{ id: 'i2' }]);
  expect((await c.eventos(3, true)).ultimo_seq).toBe(7);
  expect(f.calls[3]!.url).toBe('https://x/api/eventos?despues_de=3&solo_atencion=true');
  expect((await c.eventos(9)).ultimo_seq).toBe(9);
  expect(c.qrPngUrl('a b')).toBe('https://x/api/invitaciones/a%20b/qr.png');
});

test('errores {error, detalle} → ClubApiError; 401 borra el token; red caída → sin_conexion', async () => {
  await tokenStore.set('viejo');
  const f = fakeFetch([
    { status: 401, body: { error: 'token_vencido', detalle: 'Inicia sesión.' } },
  ]);
  const c = createClubClient('https://x/api', f.impl);
  await expect(c.me()).rejects.toMatchObject({ status: 401, code: 'token_vencido' });
  expect(await tokenStore.get()).toBeNull();
  const down = createClubClient('https://x/api', (async () => {
    throw new TypeError('network');
  }) as unknown as typeof fetch);
  await expect(down.me()).rejects.toBeInstanceOf(ClubApiError);
  await expect(down.me()).rejects.toMatchObject({ code: 'sin_conexion' });
});

test('métodos de escritura usan la ruta y el método del contrato', async () => {
  const f = fakeFetch([]);
  const c = createClubClient('https://x/api', f.impl);
  await c.crearInvitacion({
    nombre: 'Laura',
    apellido: 'Diaz',
    trato: 'senora',
    fecha: '2026-10-24',
    hora_desde: '10:00',
    hora_hasta: '14:00',
  });
  await c.editarInvitacion('i1', { nota: 'x' });
  await c.cancelarInvitacion('i1');
  await c.quitarFoto('i1');
  const form = new FormData();
  await c.subirFoto('i1', form);
  await c.atenderEvento('e1');
  await c.resolverEvento('e1', 'listo');
  await c.responderConfirmacion('c1', true);
  await c.confirmacionesPendientes();
  await c.miQr();
  await c.robotEstado();
  await c.robotSesion();
  await c.invitacion('i1');
  await c.logout();
  expect(f.calls.map((x) => `${x.init.method} ${x.url.replace('https://x/api', '')}`)).toEqual([
    'POST /invitaciones',
    'PATCH /invitaciones/i1',
    'DELETE /invitaciones/i1',
    'DELETE /invitaciones/i1/foto',
    'PUT /invitaciones/i1/foto',
    'POST /eventos/e1/atender',
    'POST /eventos/e1/resolver',
    'POST /confirmaciones/c1/responder',
    'GET /confirmaciones/pendientes',
    'GET /me/qr',
    'GET /robot/estado',
    'GET /robot/sesion',
    'GET /invitaciones/i1',
  ]);
  expect((f.calls[4]!.init.headers as Record<string, string>)['content-type']).toBeUndefined();
});
