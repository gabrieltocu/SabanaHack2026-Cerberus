import { createClubApp } from '@/club/app';
import { signToken } from '@/club/auth';
import { clubConfig } from '@/club/config';
import { moduleRoutes } from '@/club/routes';
import { getInvitacion, insertInvitacion } from '@/club/repo';
import type { Evento, Invitacion, Visita } from '@/club/types';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';

const NOW = new Date('2026-10-24T15:00:00Z');
const cfg = clubConfig({});
const ID = 'f39a2e70-75bc-4b27-a515-012345678901';
const event = {
  id: ID,
  ts: NOW.toISOString(),
  tipo: 'LLEGADA',
  categoria: 'INVITADO',
  persona_id: 'inv-3f9a1c2b',
  nombre: 'Laura Diaz',
  anfitrion_id: 'andres',
  destino: 'Sala de anfitriones',
  avisar: ['anfitrion', 'concierge'],
  severidad: 'info',
  requiere_atencion: false,
  motivo: 'Llegada',
  evidencia: { metodo: 'rostro', confianza: 0.89, reintentos: 0 },
};
function setup() {
  const store = createMemoryStore();
  const app = createClubApp({ store, cfg, routes: moduleRoutes, clock: () => NOW });
  const call = async (method: string, path: string, body?: unknown, role = 'BOT') => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (role === 'BOT') headers['x-bot-key'] = cfg.botKey!;
    else if (role)
      headers.authorization = `Bearer ${signToken({ sub: role === 'CONCIERGE' ? 'u-natalia' : role === 'ADMIN' ? 'u-luciana' : `u-${role}`, rol: role === 'CONCIERGE' || role === 'ADMIN' ? role : 'SOCIO' }, cfg.jwtSecret!, NOW.getTime() / 1000)}`;
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
  return { store, call };
}

test('tres envíos concurrentes reservan el id antes de asignar una única secuencia', async () => {
  const { store, call } = setup();
  const results = await Promise.all([1, 2, 3].map(() => call('POST', '/bot/eventos', event)));
  expect(results.filter((r) => r.status === 201)).toEqual([
    { status: 201, body: { id: ID, seq: 1 } },
  ]);
  expect(results.filter((r) => r.status === 200)).toEqual(
    Array(2).fill({ status: 200, body: { duplicado: true } }),
  );
  expect((await store.get('club:evento-id:' + ID))?.value).toBe(1);
  expect(await store.list('club:evento:')).toHaveLength(1);
  const feed = await call('GET', '/eventos', undefined, 'CONCIERGE');
  expect(feed.body.items[0]).toMatchObject({ ...event, seq: 1, estado: 'NUEVO' });
});

test('feed incremental: socio ve solo sus avisos; concierge todos y filtro de atención', async () => {
  const { store, call } = setup();
  for (const [i, patch] of [
    {},
    { anfitrion_id: 'sofia', requiere_atencion: true },
    { avisar: ['seguridad'] },
  ].entries()) {
    expect(
      (await call('POST', '/bot/eventos', { ...event, id: ID.slice(0, -1) + i, ...patch })).status,
    ).toBe(201);
  }
  const many = jest.spyOn(store, 'getMany');
  expect((await call('GET', '/eventos', undefined, 'andres')).body).toMatchObject({
    items: [{ seq: 1 }],
    ultimo_seq: 3,
  });
  expect(many).toHaveBeenCalledTimes(1);
  expect(many).toHaveBeenCalledWith(['club:evento:1', 'club:evento:2', 'club:evento:3']);
  expect(
    (
      await call('GET', '/eventos?despues_de=1&solo_atencion=false', undefined, 'CONCIERGE')
    ).body.items.map((e: Evento) => e.seq),
  ).toEqual([2, 3]);
  expect(
    (await call('GET', '/eventos?solo_atencion=true', undefined, 'CONCIERGE')).body,
  ).toMatchObject({ items: [{ seq: 2 }], ultimo_seq: 3 });
  expect((await call('GET', '/eventos?despues_de=3', undefined, 'andres')).body).toEqual({
    items: [],
    ultimo_seq: 3,
  });
});

test('feed pagina a 100 y no salta una escritura todavía no publicada', async () => {
  const { store, call } = setup();
  await store.compareAndSet('club:seq', 0, 102);
  for (let seq = 1; seq <= 102; seq++)
    await store.compareAndSet(`club:evento:${seq}`, 0, { ...event, seq });
  expect((await call('GET', '/eventos', undefined, 'CONCIERGE')).body.items).toHaveLength(100);
  expect((await call('GET', '/eventos?despues_de=100', undefined, 'CONCIERGE')).body).toMatchObject(
    { items: [{ seq: 101 }, { seq: 102 }], ultimo_seq: 102 },
  );
  await store.delete('club:evento:101');
  expect((await call('GET', '/eventos?despues_de=100', undefined, 'CONCIERGE')).body).toEqual({
    items: [],
    ultimo_seq: 100,
  });
});

test('LLEGADA y SALIDA actualizan invitación por persona_id aunque id sea distinto', async () => {
  const { store, call } = setup();
  const inv: Invitacion = {
    id: 'invitacion-1',
    persona_id: event.persona_id,
    anfitrion_id: 'andres',
    nombre: 'Laura',
    apellido: 'Diaz',
    trato: 'senora',
    documento: null,
    fecha: '2026-10-24',
    hora_desde: '09:00',
    hora_hasta: '17:00',
    lugar: 'INVITADO',
    nota: null,
    estado: 'PROGRAMADA',
    foto_estado: 'NINGUNA',
    foto_motivo: null,
    consentimiento_at: null,
    creada_at: NOW.toISOString(),
  };
  await insertInvitacion(store, inv);
  await call('POST', '/bot/eventos', event);
  expect((await getInvitacion(store, inv.id))?.estado).toBe('LLEGO');
  await call('POST', '/bot/eventos', { ...event, id: ID.slice(0, -1) + '2', tipo: 'SALIDA' });
  expect((await getInvitacion(store, inv.id))?.estado).toBe('SALIO');
  await call('POST', '/bot/eventos', { ...event, id: ID.slice(0, -1) + '3' });
  expect((await getInvitacion(store, inv.id))?.estado).toBe('SALIO');
});

test('atender es idempotente, resolver guarda nota y no reabre el evento', async () => {
  const { call } = setup();
  await call('POST', '/bot/eventos', event);
  const attended = await call('POST', `/eventos/${ID}/atender`, undefined, 'CONCIERGE');
  expect(attended).toMatchObject({
    status: 200,
    body: {
      estado: 'ATENDIDO',
      atendido_por: 'u-natalia',
      atendido_at: '2026-10-24T10:00:00.000-05:00',
    },
  });
  expect(await call('POST', `/eventos/${ID}/atender`, undefined, 'CONCIERGE')).toEqual(attended);
  expect(
    await call('POST', `/eventos/${ID}/resolver`, { nota: 'Recibida en recepción' }, 'CONCIERGE'),
  ).toMatchObject({ status: 200, body: { estado: 'RESUELTO', nota: 'Recibida en recepción' } });
  expect((await call('POST', `/eventos/${ID}/atender`, undefined, 'CONCIERGE')).status).toBe(409);
  expect((await call('POST', '/eventos/ausente/atender', undefined, 'CONCIERGE')).status).toBe(404);
  expect((await call('POST', `/eventos/${ID}/resolver`, {}, 'CONCIERGE')).status).toBe(422);
});

test.each([
  { id: 'x' },
  { tipo: 'DESCONOCIDO' },
  { categoria: 'SOCIO' },
  { categoria: null },
  { ts: 'ayer' },
  { avisar: ['nadie'] },
  { requiere_atencion: 'false' },
  { severidad: 'alta' },
  { evidencia: { detalle: 'é'.repeat(2100) } },
  { evidencia: { foto: 'abc' } },
  { imagen: 'x'.repeat(5000) },
  { evidencia: { anidada: { base64: 'abc' } } },
  { evidencia: { detalle: 'data:' + 'image/png;base64,abc' } },
])('rechaza evento inválido o imágenes sin persistir: %j', async (patch) => {
  const { store, call } = setup();
  expect((await call('POST', '/bot/eventos', { ...event, ...patch })).status).toBe(422);
  expect(await store.get('club:seq')).toBeNull();
});

test.each(['ESCALADO_RECEPCION', 'IMPREVISTO', 'EMERGENCIA', 'SALIDA'])(
  'guarda %s sin decidir acceso',
  async (tipo) => {
    const { call } = setup();
    expect(
      (
        await call('POST', '/bot/eventos', {
          id: ID,
          ts: event.ts,
          tipo,
          avisar: ['supervisor', 'mantenimiento'],
          severidad: 'urgente',
          requiere_atencion: true,
        })
      ).status,
    ).toBe(201);
  },
);

test.each(['despues_de=-1', 'despues_de=1.2', 'despues_de=x', 'solo_atencion=x'])(
  'rechaza query inválida %s',
  async (query) => {
    expect((await setup().call('GET', '/eventos?' + query, undefined, 'CONCIERGE')).status).toBe(
      422,
    );
  },
);

test('bot exige X-Bot-Key y socio no puede atender ni resolver', async () => {
  const { call } = setup();
  expect((await call('POST', '/bot/eventos', event, '')).status).toBe(401);
  for (const action of ['atender', 'resolver'])
    expect((await call('POST', `/eventos/${ID}/${action}`, {}, 'andres')).status).toBe(403);
});

test('imágenes de más de 32 KB reciben 422; evidencia de exactamente 4 KB se admite', async () => {
  const { call } = setup();
  expect((await call('POST', '/bot/eventos', { ...event, imagen: 'a'.repeat(40000) })).status).toBe(
    422,
  );
  const evidencia = { dato: ' '.repeat(4085) };
  expect(Buffer.byteLength(JSON.stringify(evidencia))).toBe(4096);
  expect((await call('POST', '/bot/eventos', { ...event, evidencia })).status).toBe(201);
});

test('GET /bot/eventos/{id} devuelve estado y quién atendió; 404 si no existe; exige llave', async () => {
  const { call } = setup();
  await call('POST', '/bot/eventos', event);
  expect(await call('GET', `/bot/eventos/${ID}`)).toEqual({
    status: 200,
    body: { estado: 'NUEVO', atendido_por: null, atendido_at: null },
  });
  await call('POST', `/eventos/${ID}/atender`, undefined, 'CONCIERGE');
  expect((await call('GET', `/bot/eventos/${ID}`)).body).toEqual({
    estado: 'ATENDIDO',
    atendido_por: 'u-natalia',
    atendido_at: '2026-10-24T10:00:00.000-05:00',
  });
  await call('POST', `/eventos/${ID}/resolver`, { nota: 'Listo' }, 'CONCIERGE');
  expect((await call('GET', `/bot/eventos/${ID}`)).body.estado).toBe('RESUELTO');
  expect(await call('GET', '/bot/eventos/ausente')).toMatchObject({
    status: 404,
    body: { error: 'evento_no_encontrado' },
  });
  expect((await call('GET', `/bot/eventos/${ID}`, undefined, '')).status).toBe(401);
});

test('ADMIN lee todos los eventos pero no atiende ni resuelve', async () => {
  const { call } = setup();
  await call('POST', '/bot/eventos', { ...event, anfitrion_id: 'sofia' });
  expect((await call('GET', '/eventos', undefined, 'ADMIN')).body.items).toHaveLength(1);
  for (const action of ['atender', 'resolver'])
    expect((await call('POST', `/eventos/${ID}/${action}`, {}, 'ADMIN')).status).toBe(403);
});

const visitas = async (call: ReturnType<typeof setup>['call'], activas = false) =>
  (await call('GET', `/bot/visitas${activas ? '?activas=1' : ''}`)).body.items as Visita[];

test('LLEGADA crea la visita con el robot del último latido y datos de la invitación; no la duplica', async () => {
  const { store, call } = setup();
  await insertInvitacion(store, {
    id: 'invitacion-1',
    persona_id: event.persona_id,
    anfitrion_id: 'u-andres',
    nombre: 'Laura',
    apellido: 'Diaz',
    trato: 'senora',
    documento: null,
    fecha: '2026-10-24',
    hora_desde: '09:00',
    hora_hasta: '17:00',
    lugar: 'Terraza',
    nota: null,
    estado: 'PROGRAMADA',
    foto_estado: 'NINGUNA',
    foto_motivo: null,
    consentimiento_at: null,
    creada_at: NOW.toISOString(),
    asistencia: ['silla_ruedas'],
    preferencias_bebida: ['té'],
    punto_encuentro: 'Entrada norte',
  });
  await call('POST', '/bot/heartbeat', { robot: 'x2-7', estado: 'ok' });
  await call('POST', '/bot/eventos', event);
  await call('POST', '/bot/eventos', { ...event, id: ID.slice(0, -1) + '2' });
  const [v, ...resto] = await visitas(call, true);
  expect(resto).toEqual([]);
  expect(v).toMatchObject({
    nombre: 'Laura Diaz',
    categoria: 'INVITADO',
    invitacion_id: 'invitacion-1',
    anfitrion_id: 'u-andres',
    destino: 'Sala de anfitriones',
    punto_encuentro: 'Entrada norte',
    asistencia: ['silla_ruedas'],
    preferencias_bebida: ['té'],
    estado: 'ACOMPANANDO',
    acompanante: { tipo: 'ROBOT', id: 'x2-7' },
    recorrido: [{ tipo: 'LLEGADA', actor: 'x2-7' }],
  });
});

test('SALIDA cierra la visita activa; sin visita o sin persona no hace nada', async () => {
  const { call } = setup();
  const salida = { ...event, id: ID.slice(0, -1) + '2', tipo: 'SALIDA' };
  expect((await call('POST', '/bot/eventos', salida)).status).toBe(201);
  expect(await visitas(call)).toEqual([]);
  const socio = {
    ...event,
    id: ID.slice(0, -1) + '3',
    categoria: 'VIP',
    persona_id: 'sofia',
    anfitrion_id: null,
  };
  await call('POST', '/bot/eventos', socio);
  await call('POST', '/bot/eventos', { ...event, id: ID.slice(0, -1) + '4', persona_id: null });
  expect(await visitas(call, true)).toMatchObject([
    { persona_id: 'sofia', categoria: 'VIP', anfitrion_id: 'u-sofia', acompanante: { id: 'x2-1' } },
  ]);
  await call('POST', '/bot/eventos', { ...salida, id: ID.slice(0, -1) + '5', persona_id: 'sofia' });
  expect(await visitas(call, true)).toEqual([]);
  expect(await visitas(call)).toMatchObject([
    {
      estado: 'CERRADA',
      cierre: 'SALIDA',
      acompanante: null,
      recorrido: [{ tipo: 'LLEGADA' }, { tipo: 'SALIDA', actor: 'x2-1' }],
    },
  ]);
});
