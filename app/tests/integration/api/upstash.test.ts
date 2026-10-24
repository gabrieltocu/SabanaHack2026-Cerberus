// Los mismos recorridos contra el adaptador de Upstash con el servidor falso (semántica de Redis).
import { createUpstashStore } from '@/infrastructure/stores/upstash-store';
import { createTestClock } from '../../unit/stores/store-contract';
import { flows, vipWithR2 } from '../../support/api-flows';
import { FAKE_TOKEN, FAKE_URL, createFakeUpstash } from '../../support/fake-upstash';
import { setup } from '../../support/api-harness';

const upstash = () =>
  setup({
    store: createUpstashStore({
      url: FAKE_URL,
      token: FAKE_TOKEN,
      fetch: createFakeUpstash(createTestClock()).fetch,
    }),
  });

describe('API sobre Upstash (servidor falso)', () => {
  test('relevo completo con dos accept simultáneos: un ganador exacto', () =>
    flows.robotFailureHandoff(upstash()));
  test('respuesta perdida: confirm repetido no duplica', () => flows.lostResponse(upstash()));
  test('invitación, QR y reutilización', () => flows.inviteAndUseQr(upstash()));
  test('idempotencia', () => flows.idempotency(upstash()));

  test('50 carreras de accept con órdenes de llegada distintos: siempre un único ganador', async () => {
    for (let round = 0; round < 50; round++) {
      const h = upstash();
      await vipWithR2(h);
      const failure = await h.call('POST', '/robots/R2/failure', {
        actor: 'O-01',
        body: { code: 'OBSTACLE' },
      });
      const hid = failure.body.handoffs[0].id as string;
      const actors = ['U-01', 'U-02', 'U-03'];
      const order = round % 2 === 0 ? actors : [...actors].reverse();
      const replies = await Promise.all(
        order.map((actor) => h.call('POST', `/handoffs/${hid}/accept`, { actor })),
      );
      const winners = replies.filter((r) => r.status === 200);
      expect(winners).toHaveLength(1);
      expect(replies.filter((r) => r.status === 409)).toHaveLength(2);
      const visit = (await h.call('GET', `/visits/${failure.body.handoffs[0].visitId}`)).body;
      expect(visit).toMatchObject({ state: 'WAITING_HANDOFF', ownerId: 'R2' });
    }
  });
});
