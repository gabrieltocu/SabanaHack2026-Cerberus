// Matriz actor x operación de la API v1. `X-Demo-Actor` es declarativo, pero la API debe ser coherente:
// cada operación acepta solo a los actores que le corresponden y rechaza al resto con 403
// `ACTOR_NOT_ALLOWED`. El oráculo (listas de permitidos) es independiente de src/api.
import { createSeed } from '@/domain/seed';
import { setup, type Harness, type Reply } from '../../support/api-harness';
import { vipWithR2 } from '../../support/api-flows';

const ACTORS: (string | undefined)[] = [
  undefined,
  'V-999',
  'inv-00000000',
  ...createSeed().people.map((p) => p.id),
];
const USHERS = ['U-01', 'U-02', 'U-03'];

interface World {
  h: Harness;
  visitId: string;
  handoffId: string;
  invitationId: string;
}

type Stage = 'in-progress' | 'requested' | 'accepted' | 'transferred';

/** Andrés con R2 en IN_PROGRESS; según la etapa, con relevo pedido, aceptado o con contexto entregado. */
async function world(stage: Stage): Promise<World> {
  const h = setup();
  const visitId = await vipWithR2(h);
  let handoffId = '';
  if (stage !== 'in-progress') {
    const f = await h.call('POST', '/robots/R2/failure', {
      actor: 'O-01',
      body: { code: 'OBSTACLE' },
    });
    handoffId = f.body.handoffs[0].id as string;
  }
  if (stage === 'accepted' || stage === 'transferred')
    await h.call('POST', `/handoffs/${handoffId}/accept`, { actor: 'U-01' });
  if (stage === 'transferred')
    await h.call('POST', `/handoffs/${handoffId}/context`, { actor: 'U-01' });
  const inv = await h.call('POST', '/invitations', {
    actor: 'V-202',
    body: { hostId: 'V-202', guest: { fullName: 'Sebastián Lozano' }, date: '2026-10-24' },
  });
  return { h, visitId, handoffId, invitationId: inv.body.id as string };
}

interface Op {
  name: string;
  stage: Stage;
  allowed: string[];
  run: (w: World, actor: string | undefined) => Promise<Reply>;
}

const ROBOT_SOURCE = (actor: string | undefined) => ({
  kind: 'ROBOT',
  id: actor?.startsWith('R') && actor.length === 2 ? actor : 'R1',
});

const OPS: Op[] = [
  {
    name: 'POST /recognition/events',
    stage: 'in-progress',
    allowed: ['R1', 'R2', 'R3', 'O-01'],
    run: ({ h }, actor) =>
      h.call('POST', '/recognition/events', {
        actor,
        body: { source: ROBOT_SOURCE(actor), face: { status: 'UNKNOWN' } },
      }),
  },
  {
    name: 'POST /access/verify',
    stage: 'in-progress',
    allowed: ['R1', 'R2', 'R3', ...USHERS, 'O-01'],
    run: ({ h }, actor) =>
      h.call('POST', '/access/verify', { actor, body: { token: 'nq_AAAAAAAAAAAAAAAAAAAAAA' } }),
  },
  {
    name: 'POST /robots/R2/failure (solo el propio robot u operador)',
    stage: 'in-progress',
    allowed: ['R2', 'O-01'],
    run: ({ h }, actor) =>
      h.call('POST', '/robots/R2/failure', { actor, body: { code: 'MOTOR_FAULT' } }),
  },
  {
    name: 'POST /handoffs (responsable actual u operador)',
    stage: 'in-progress',
    allowed: ['R2', 'O-01'],
    run: ({ h, visitId }, actor) =>
      h.call('POST', '/handoffs', { actor, body: { visitId, reason: 'OPERATIONAL' } }),
  },
  {
    name: 'POST /handoffs/{id}/accept',
    stage: 'requested',
    allowed: USHERS,
    run: ({ h, handoffId }, actor) => h.call('POST', `/handoffs/${handoffId}/accept`, { actor }),
  },
  {
    name: 'POST /handoffs/{id}/context (solo el edecán asignado)',
    stage: 'accepted',
    allowed: ['U-01'],
    run: ({ h, handoffId }, actor) => h.call('POST', `/handoffs/${handoffId}/context`, { actor }),
  },
  {
    name: 'POST /handoffs/{id}/confirm (solo el edecán asignado)',
    stage: 'transferred',
    allowed: ['U-01'],
    run: ({ h, handoffId }, actor) => h.call('POST', `/handoffs/${handoffId}/confirm`, { actor }),
  },
  {
    name: 'POST /handoffs/{id}/cancel sin asignado (dueño u operador)',
    stage: 'requested',
    allowed: ['R2', 'O-01'],
    run: ({ h, handoffId }, actor) => h.call('POST', `/handoffs/${handoffId}/cancel`, { actor }),
  },
  {
    name: 'POST /handoffs/{id}/cancel con asignado (dueño, asignado u operador)',
    stage: 'accepted',
    allowed: ['R2', 'U-01', 'O-01'],
    run: ({ h, handoffId }, actor) => h.call('POST', `/handoffs/${handoffId}/cancel`, { actor }),
  },
  {
    name: 'POST /invitations (anfitrión socio u operador)',
    stage: 'in-progress',
    allowed: ['V-209', 'O-01'],
    run: ({ h }, actor) =>
      h.call('POST', '/invitations', {
        actor,
        body: { hostId: 'V-209', guest: { fullName: 'Marina Pardo' }, date: '2026-10-24' },
      }),
  },
  {
    name: 'POST /invitations/{id}/cancel (anfitrión u operador)',
    stage: 'in-progress',
    allowed: ['V-202', 'O-01'],
    run: ({ h, invitationId }, actor) =>
      h.call('POST', `/invitations/${invitationId}/cancel`, { actor }),
  },
  {
    name: 'GET /invitations?hostId= (solo el propio anfitrión u operador)',
    stage: 'in-progress',
    allowed: ['V-202', 'O-01'],
    run: ({ h }, actor) => h.call('GET', '/invitations', { actor, query: { hostId: 'V-202' } }),
  },
  {
    name: 'GET /invitations/{id} (anfitrión u operador)',
    stage: 'in-progress',
    allowed: ['V-202', 'O-01'],
    run: ({ h, invitationId }, actor) => h.call('GET', `/invitations/${invitationId}`, { actor }),
  },
];

describe('matriz actor x operación: 403 ACTOR_NOT_ALLOWED fuera de la lista', () => {
  test.each(OPS)('$name', async (op) => {
    const wrong: string[] = [];
    for (const actor of ACTORS) {
      const res = await op.run(await world(op.stage), actor);
      const denied = res.status === 403 && res.body?.error?.code === 'ACTOR_NOT_ALLOWED';
      const shouldAllow = actor !== undefined && op.allowed.includes(actor);
      const ok = shouldAllow ? res.status < 400 : denied;
      if (!ok)
        wrong.push(`${actor ?? '(sin actor)'} -> ${res.status} ${res.body?.error?.code ?? ''}`);
    }
    expect(wrong).toEqual([]);
  });

  test('un anfitrión sin membresía activa nunca crea invitaciones (V-204 personal, V-207 suspendida)', async () => {
    for (const host of ['V-204', 'V-207', 'V-208', 'V-205']) {
      const { h } = await world('in-progress');
      const res = await h.call('POST', '/invitations', {
        actor: host,
        body: { hostId: host, guest: { fullName: 'Ana Gómez' }, date: '2026-10-24' },
      });
      expect([host, res.status]).toEqual([host, 403]);
    }
  });
});

describe('origen de los eventos de reconocimiento', () => {
  const event = (source: { kind: string; id: string }) => ({
    source,
    face: { status: 'UNKNOWN' },
  });

  test('un robot no firma con el identificador de otro robot ni de una persona', async () => {
    const { h } = await world('in-progress');
    for (const id of ['R3', 'U-01', 'V-201', 'O-01', 'X'.repeat(20)]) {
      const res = await h.call('POST', '/recognition/events', {
        actor: 'R2',
        body: event({ kind: 'ROBOT', id }),
      });
      expect([id, res.status, res.body.error?.code]).toEqual([id, 403, 'ACTOR_NOT_ALLOWED']);
    }
  });

  test('el operador solo puede indicar un robot real como origen', async () => {
    const { h } = await world('in-progress');
    const ok = await h.call('POST', '/recognition/events', {
      actor: 'O-01',
      body: event({ kind: 'SIMULATOR', id: 'R3' }),
    });
    expect(ok.status).toBe(201);
    const bad = await h.call('POST', '/recognition/events', {
      actor: 'O-01',
      body: event({ kind: 'ROBOT', id: 'V-201' }),
    });
    expect(bad.status).toBe(403);
  });

  test('un robot no declara a otro robot en FAULT (R3 contra R2)', async () => {
    const { h } = await world('in-progress');
    const res = await h.call('POST', '/robots/R2/failure', {
      actor: 'R3',
      body: { code: 'MOTOR_FAULT' },
    });
    expect(res.status).toBe(403);
    const people = await h.call('GET', '/people/R2');
    expect(people.body.robot.status).toBe('OK');
  });
});
