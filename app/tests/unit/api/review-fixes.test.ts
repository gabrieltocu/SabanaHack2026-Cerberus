// Bloqueantes y mejoras de la revisión de la API (C04-CP08): cada prueba nace de un defecto o de un
// riesgo concreto de esa revisión.
import { createUpstashStore } from '@/infrastructure/stores/upstash-store';
import { FAKE_TOKEN, FAKE_URL, createFakeUpstash } from '../../support/fake-upstash';
import { setup, type Harness } from '../../support/api-harness';
import { createTestClock } from '../stores/store-contract';

const clockAt = (iso: string) => {
  let wall = Date.parse(iso);
  return {
    clock: { now: () => new Date(wall) },
    set: (to: string) => {
      wall = Date.parse(to);
    },
  };
};

const mkInvitation = async (h: Harness, name: string, date: string, host = 'V-202') =>
  (
    await h.call('POST', '/invitations', {
      actor: host,
      body: { hostId: host, guest: { fullName: name }, date },
    })
  ).body;

/** Llegada por rostro de `candidate` registrada por el robot `by`. */
const arrive = (h: Harness, candidate: string, by = 'R1') =>
  h.call('POST', '/recognition/events', {
    actor: by,
    body: {
      source: { kind: 'ROBOT', id: by },
      face: { status: 'MATCH', classHint: 'MEMBER', candidateId: candidate, confidence: 0.97 },
    },
  });

describe('B1: la visita por QR de un día futuro no se cierra como DAY_ROLLOVER al entrar', () => {
  test('invitación de hoy para mañana: al verificar mañana la visita sigue abierta', async () => {
    const t = clockAt('2026-10-24T09:00:00-05:00');
    const h = setup({ clock: t.clock });
    const inv = await mkInvitation(h, 'Ana Pérez', '2026-10-25');
    t.set('2026-10-25T10:00:00-05:00');
    const granted = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token },
    });
    expect(granted.body.decision).toBe('GRANTED');
    const visit = (await h.call('GET', `/visits/${inv.visitId}`)).body;
    expect([visit.state, visit.closeReason]).toEqual(['VERIFIED', null]);
    expect(visit.createdAt).toBe('2026-10-25T10:00:00-05:00');
    // Un día después sí es otro día: la regla perezosa sigue vigente.
    t.set('2026-10-26T08:00:00-05:00');
    expect((await h.call('GET', `/visits/${inv.visitId}`)).body.closeReason).toBe('DAY_ROLLOVER');
  });
});

describe('B2: el reinicio con una fecha fuera de las membresías no borra nada ni da 403', () => {
  test('POST /demo/reset con now 2027-02-01 responde 200 y deja la demostración consistente', async () => {
    const h = setup();
    await mkInvitation(h, 'Ana Pérez', '2026-10-24');
    const res = await h.call('POST', '/demo/reset', { body: { now: '2027-02-01T09:00:00-05:00' } });
    expect(res.status).toBe(200);
    expect(res.body.clock.now).toBe('2027-02-01T09:00:00-05:00');
    expect(res.body.demoInvitation.date).toBe('2027-02-01');
    expect((await h.call('GET', '/health')).body.clock.now).toBe('2027-02-01T09:00:00-05:00');
    const visits = await h.call('GET', '/visits');
    expect(visits.body.count).toBe(1);
  });

  test('si algo falla al sembrar, no se borró lo anterior', async () => {
    const h = setup();
    await mkInvitation(h, 'Ana Pérez', '2026-10-24');
    // Un instante que no existe en el calendario se rechaza antes de limpiar.
    const bad = await h.call('POST', '/demo/reset', { body: { now: '2026-02-30T09:00:00-05:00' } });
    expect(bad.status).toBe(422);
    expect((await h.call('GET', '/visits')).body.count).toBe(2);
  });
});

describe('B3: reconocimientos simultáneos del mismo candidato crean una sola visita', () => {
  test('3 eventos a la vez de V-201 dejan 1 visita abierta y dos respuestas matchedOpenVisit', async () => {
    const h = setup();
    const replies = await Promise.all([1, 2, 3].map(() => arrive(h, 'V-201')));
    expect(replies.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    const ids = new Set(replies.map((r) => r.body.visit.id));
    expect(ids.size).toBe(1);
    expect(replies.filter((r) => r.body.matchedOpenVisit === true)).toHaveLength(2);
    const mine = (await h.call('GET', '/visits')).body.items.filter(
      (v: { visitor: { personId: string } }) => v.visitor.personId === 'V-201',
    );
    expect(mine).toHaveLength(1);
  });

  test('tras cerrar la visita, un nuevo reconocimiento abre otra', async () => {
    const h = setup();
    const first = await arrive(h, 'V-201');
    await h.call('POST', `/visits/${first.body.visit.id}/close`, { actor: 'R1', body: {} });
    const second = await arrive(h, 'V-201');
    expect([second.status, second.body.matchedOpenVisit]).toEqual([201, false]);
    expect(second.body.visit.id).not.toBe(first.body.visit.id);
  });
});

describe('B4: un edecán no queda dueño de dos visitas en curso', () => {
  /** Visitas orientadas por R1 (una por cada candidato), listas para asignar. */
  async function oriented(h: Harness, ...who: string[]) {
    const ids: string[] = [];
    for (const person of who) {
      const id = (await arrive(h, person)).body.visit.id as string;
      await h.call('POST', `/visits/${id}/advance`, {
        actor: 'R1',
        body: { event: 'START_ORIENTATION' },
      });
      ids.push(id);
    }
    return ids;
  }
  const assign = (h: Harness, id: string, to: string, actor = 'R1') =>
    h.call('POST', `/visits/${id}/advance`, {
      actor,
      body: { event: 'ASSIGN_ESCORT', assigneeId: to, visitorAccepted: true },
    });
  const err = (r: { status: number; body: { error?: { code: string } } }) => [
    r.status,
    r.body.error?.code,
  ];

  /** Una visita por robot (R2, R3) con su relevo pedido; devuelve los ids de relevo. */
  async function handoffs(h: Harness, ...who: string[]) {
    const visits = await oriented(h, ...who);
    const out: string[] = [];
    for (const [i, id] of visits.entries()) {
      const robot = ['R2', 'R3'][i]!;
      await assign(h, id, robot);
      const f = await h.call('POST', `/robots/${robot}/failure`, {
        actor: 'O-01',
        body: { code: 'OBSTACLE' },
      });
      out.push(f.body.handoffs[0].id as string);
    }
    return { visits, handoffIds: out };
  }
  const step = (h: Harness, id: string, what: 'accept' | 'context' | 'confirm', actor = 'U-01') =>
    h.call('POST', `/handoffs/${id}/${what}`, { actor });

  test('ASSIGN_ESCORT secuencial: el segundo da ASSIGNEE_BUSY', async () => {
    const h = setup();
    const [a, b] = await oriented(h, 'V-201', 'V-202');
    expect((await assign(h, a!, 'U-01')).status).toBe(200);
    expect(err(await assign(h, b!, 'U-01'))).toEqual([409, 'ASSIGNEE_BUSY']);
  });

  test('ASSIGN_ESCORT concurrente: de dos asignaciones al mismo edecán gana una', async () => {
    const h = setup();
    const [a, b] = await oriented(h, 'V-201', 'V-202');
    const res = await Promise.all([assign(h, a!, 'U-01'), assign(h, b!, 'U-01')]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(res.find((r) => r.status === 409)!.body.error.code).toBe('ASSIGNEE_BUSY');
    expect((await h.call('GET', '/visits', { query: { ownerId: 'U-01' } })).body.count).toBe(1);
  });

  test('SELF también cuenta: el edecán que recibió dos llegadas no acompaña las dos', async () => {
    const h = setup();
    const ids: string[] = [];
    for (const name of ['Ana Pérez', 'Beto Gil']) {
      const inv = await mkInvitation(h, name, '2026-10-24');
      await h.call('POST', '/access/verify', { actor: 'U-01', body: { token: inv.qr.token } });
      await h.call('POST', `/visits/${inv.visitId}/advance`, {
        actor: 'U-01',
        body: { event: 'START_ORIENTATION' },
      });
      ids.push(inv.visitId as string);
    }
    expect((await assign(h, ids[0]!, 'SELF', 'U-01')).status).toBe(200);
    expect(err(await assign(h, ids[1]!, 'SELF', 'U-01'))).toEqual([409, 'ASSIGNEE_BUSY']);
  });

  test('quien tiene un relevo aceptado abierto está ocupado: no recibe otro ni se le asigna una visita', async () => {
    const h = setup();
    const { handoffIds } = await handoffs(h, 'V-201', 'V-202');
    expect((await step(h, handoffIds[0]!, 'accept')).status).toBe(200);
    expect(err(await step(h, handoffIds[1]!, 'accept'))).toEqual([409, 'RECEIVER_BUSY']);
    const [extra] = await oriented(h, 'V-209');
    expect(err(await assign(h, extra!, 'U-01'))).toEqual([409, 'ASSIGNEE_BUSY']);
    // Con el contexto entregado sigue ocupado, y al confirmar queda dueño de una sola visita.
    expect((await step(h, handoffIds[0]!, 'context')).status).toBe(200);
    expect(err(await assign(h, extra!, 'U-01'))).toEqual([409, 'ASSIGNEE_BUSY']);
    expect((await step(h, handoffIds[0]!, 'confirm')).status).toBe(200);
  });

  test('accept concurrente: el mismo edecán no acepta dos relevos a la vez', async () => {
    const h = setup();
    const { handoffIds } = await handoffs(h, 'V-201', 'V-202');
    const res = await Promise.all(handoffIds.map((id) => step(h, id, 'accept')));
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(res.find((r) => r.status === 409)!.body.error.code).toBe('RECEIVER_BUSY');
  });

  test('confirm recalcula la ocupación: si otra visita ya es suya, RECEIVER_BUSY y nada cambia', async () => {
    const h = setup();
    const { visits, handoffIds } = await handoffs(h, 'V-201', 'V-202');
    await step(h, handoffIds[0]!, 'accept');
    await step(h, handoffIds[0]!, 'context');
    // La visita del otro relevo pasa a ser de U-01 por una escritura que llegó entre medias.
    const key = `visit:${visits[1]}`;
    const other = (await h.store.get<Record<string, unknown>>(key))!;
    await h.store.compareAndSet(key, other.version, {
      ...other.value,
      state: 'IN_PROGRESS',
      ownerId: 'U-01',
      handoff: undefined,
    });
    expect(err(await step(h, handoffIds[0]!, 'confirm'))).toEqual([409, 'RECEIVER_BUSY']);
    expect((await h.call('GET', `/visits/${visits[0]}`)).body.ownerId).toBe('R2');
  });
});

describe('siembra en carrera: todas las peticiones esperan la misma siembra', () => {
  test('4 lecturas paralelas sobre un almacén vacío ven la invitación demo', async () => {
    const h = setup();
    const replies = await Promise.all(
      [1, 2, 3, 4].map(() =>
        h.call('GET', '/invitations', { actor: 'O-01', query: { hostId: 'V-209' } }),
      ),
    );
    expect(replies.map((r) => r.body.count)).toEqual([1, 1, 1, 1]);
    expect((await h.call('GET', '/visits')).body.count).toBe(1);
  });

  test('dos instancias sobre el mismo almacén siembran una sola invitación', async () => {
    const first = setup();
    const second = setup({ store: first.store });
    await Promise.all([
      first.call('GET', '/health'),
      second.call('GET', '/health', { ip: '9.9.9.9' }),
    ]);
    expect((await first.call('GET', '/visits')).body.count).toBe(1);
  });
});

describe('M1: una reserva huérfana de hostday caduca a los 60 s', () => {
  test('sin visita, bloquea al principio y se ignora pasado un minuto', async () => {
    const t = clockAt('2026-10-24T09:00:00-05:00');
    const h = setup({ clock: t.clock });
    await h.call('GET', '/health');
    const key = 'hostday:V-202:2026-10-24';
    await h.store.compareAndSet(key, 0, {
      entries: [
        {
          visitId: 'vis-0badbeef',
          invitationId: 'inv-0badbeef',
          guestKey: 'ana perez',
          at: t.clock.now().getTime(),
        },
      ],
    });
    const dup = await h.call('POST', '/invitations', {
      actor: 'V-202',
      body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
    });
    expect([dup.status, dup.body.error.code]).toEqual([409, 'INVITATION_DUPLICATE']);
    t.set('2026-10-24T09:01:01-05:00');
    const again = await h.call('POST', '/invitations', {
      actor: 'V-202',
      body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
    });
    expect(again.status).toBe(201);
    const stored = (await h.store.get<{ entries: { guestKey: string }[] }>(key))!;
    expect(stored.value.entries.filter((e) => e.guestKey === 'ana perez')).toHaveLength(1);
  });

  test('una reserva con su visita sigue contando aunque sea vieja', async () => {
    const t = clockAt('2026-10-24T09:00:00-05:00');
    const h = setup({ clock: t.clock });
    await mkInvitation(h, 'Ana Pérez', '2026-10-24');
    t.set('2026-10-24T10:00:00-05:00');
    const dup = await h.call('POST', '/invitations', {
      actor: 'V-202',
      body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
    });
    expect(dup.body.error.code).toBe('INVITATION_DUPLICATE');
  });
});

describe('M5: X-Cerberus-Storage en todas las respuestas de la API', () => {
  test('éxito, 403, 404, 422 y 429 llevan el almacenamiento activo', async () => {
    const h = setup({ validate: false });
    const replies = [
      await h.call('GET', '/health'),
      await h.call('POST', '/invitations', {
        body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
      }),
      await h.call('GET', '/visits/vis-00000000'),
      await h.call('GET', '/nada'),
      await h.call('GET', '/people', { query: { role: 'NADA' } }),
    ];
    expect(replies.map((r) => r.status)).toEqual([200, 403, 404, 404, 422]);
    for (const r of replies) expect(r.headers['X-Cerberus-Storage']).toBe('memory');
    let last = { status: 0, headers: {} as Record<string, string> };
    for (let i = 0; i < 601; i++) last = await h.call('GET', '/health', { ip: '7.7.7.7' });
    expect([last.status, last.headers['X-Cerberus-Storage']]).toEqual([429, 'memory']);
  });
});

describe('M8: listar visitas no recorre el espacio de claves', () => {
  const upstash = () => {
    const clock = createTestClock();
    const fake = createFakeUpstash(clock);
    const store = createUpstashStore({ url: FAKE_URL, token: FAKE_TOKEN, fetch: fake.fetch });
    return { fake, store };
  };
  const scans = (fake: { commands: string[][] }) => fake.commands.filter((c) => c[0] === 'SCAN');

  test('con claves idem: y rate: de por medio, GET /visits no hace SCAN y lista todo', async () => {
    const { fake, store } = upstash();
    const h = setup({ store });
    for (const name of ['Ana Pérez', 'Beto Gil', 'Carla Ruiz'])
      await mkInvitation(h, name, '2026-10-24');
    await arrive(h, 'V-201');
    expect([...fake.data.keys()].some((k) => k.startsWith('idem:'))).toBe(true);
    expect([...fake.data.keys()].some((k) => k.startsWith('rate:'))).toBe(true);
    fake.commands.length = 0;
    const res = await h.call('GET', '/visits');
    expect(res.body.count).toBe(5);
    expect(scans(fake)).toEqual([]);
  });

  test('un almacén con visitas de antes del índice se reconstruye una vez', async () => {
    const { fake, store } = upstash();
    const h = setup({ store });
    await mkInvitation(h, 'Ana Pérez', '2026-10-24');
    await store.delete('visits:ids');
    fake.commands.length = 0;
    expect((await h.call('GET', '/visits')).body.count).toBe(2);
    expect(scans(fake)).toHaveLength(1);
    fake.commands.length = 0;
    expect((await h.call('GET', '/visits')).body.count).toBe(2);
    expect(scans(fake)).toEqual([]);
  });

  test('el reinicio vacía el índice y las listas', async () => {
    const h = setup();
    await mkInvitation(h, 'Ana Pérez', '2026-10-24');
    await h.call('POST', '/demo/reset', { body: {} });
    expect((await h.call('GET', '/visits')).body.count).toBe(1);
  });
});
