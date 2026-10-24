// El token del QR es la credencial de la invitación: solo lo ve quien la creó (u operador) y quien lo
// escanea. Ningún listado de visitas, relevos, personas ni mensaje de error lo transporta, y el token
// de una invitación nunca valida otra visita.
import { setup, type Harness, type Reply } from '../../support/api-harness';
import { vipWithR2 } from '../../support/api-flows';

const TOKEN = /nq_[A-Za-z0-9_-]{22}/g;
const tokensIn = (r: Reply) => JSON.stringify(r.body).match(TOKEN) ?? [];

async function twoInvitations(h: Harness) {
  const mk = async (host: string, name: string) =>
    (
      await h.call('POST', '/invitations', {
        actor: host,
        body: { hostId: host, guest: { fullName: name }, date: '2026-10-24' },
      })
    ).body;
  return { a: await mk('V-202', 'Sebastián Lozano'), b: await mk('V-209', 'Marina Pardo') };
}

describe('el token del QR no sale de las respuestas que no le corresponden', () => {
  test('visitas, relevos, robots, personas, actividades y errores nunca lo contienen', async () => {
    const h = setup();
    const { a, b } = await twoInvitations(h);
    const demoBefore = (
      await h.call('GET', '/invitations', { actor: 'O-01', query: { hostId: 'V-209' } })
    ).body.items as { qr: { token: string } }[];
    const known = [a.qr.token, b.qr.token, ...demoBefore.map((i) => i.qr.token)];

    const visitId = await vipWithR2(h);
    const replies: [string, Reply][] = [];
    const rec = async (name: string, p: Promise<Reply>) => replies.push([name, await p]);

    await rec('visits', h.call('GET', '/visits'));
    await rec('visit', h.call('GET', `/visits/${a.visitId}`));
    await rec('visit-vip', h.call('GET', `/visits/${visitId}`));
    const failure = await h.call('POST', '/robots/R2/failure', {
      actor: 'O-01',
      body: { code: 'OBSTACLE' },
    });
    replies.push(['failure', failure]);
    const hid = failure.body.handoffs[0].id as string;
    await rec('handoffs', h.call('GET', '/handoffs'));
    await rec('accept', h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-01' }));
    await rec('context', h.call('POST', `/handoffs/${hid}/context`, { actor: 'U-01' }));
    await rec('confirm', h.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-01' }));
    await rec('people', h.call('GET', '/people'));
    await rec('person', h.call('GET', '/people/V-201'));
    await rec('activities', h.call('GET', '/activities'));
    await rec('health', h.call('GET', '/health'));
    // Errores que tocan una invitación o un token.
    await rec('404', h.call('GET', '/invitations/inv-00000000', { actor: 'V-202' }));
    await rec('403-get', h.call('GET', `/invitations/${a.id}`, { actor: 'V-201' }));
    await rec(
      '403-list',
      h.call('GET', '/invitations', { actor: 'V-201', query: { hostId: 'V-202' } }),
    );
    await rec('403-cancel', h.call('POST', `/invitations/${a.id}/cancel`, { actor: 'V-201' }));
    await rec(
      '409-dup',
      h.call('POST', '/invitations', {
        actor: 'V-202',
        body: { hostId: 'V-202', guest: { fullName: 'Sebastián Lozano' }, date: '2026-10-24' },
      }),
    );
    await rec(
      '422-long-token',
      h.call('POST', '/access/verify', {
        actor: 'R1',
        body: { token: `${a.qr.token}${'x'.repeat(120)}` },
      }),
    );
    await rec(
      '422-recognition',
      h.call('POST', '/recognition/events', {
        actor: 'R1',
        body: {
          source: { kind: 'ROBOT', id: 'R1' },
          face: { status: 'UNKNOWN' },
          evidence: { qrToken: `${a.qr.token}${'x'.repeat(120)}` },
        },
      }),
    );
    // Otro actor con la misma clave de idempotencia no recibe la respuesta guardada del anfitrión.
    await h.call('POST', '/invitations', {
      actor: 'V-209',
      key: 'k-shared-key-1',
      body: { hostId: 'V-209', guest: { fullName: 'Pedro Gil' }, date: '2026-10-24' },
    });
    await rec(
      'idem-other-actor',
      h.call('POST', '/invitations', {
        actor: 'V-201',
        key: 'k-shared-key-1',
        body: { hostId: 'V-209', guest: { fullName: 'Pedro Gil' }, date: '2026-10-24' },
      }),
    );

    expect(replies.filter(([, r]) => tokensIn(r).length > 0).map(([n]) => n)).toEqual([]);
    for (const [, r] of replies)
      for (const t of known) expect(JSON.stringify(r.body)).not.toContain(t);
  });

  test('solo el anfitrión (o el operador) ve el token, en la creación, el detalle y su lista', async () => {
    const h = setup();
    const { a } = await twoInvitations(h);
    const mine = await h.call('GET', '/invitations', {
      actor: 'V-202',
      query: { hostId: 'V-202' },
    });
    expect(tokensIn(mine)).toEqual([a.qr.token]);
    const byId = await h.call('GET', `/invitations/${a.id}`, { actor: 'V-202' });
    expect(tokensIn(byId)).toEqual([a.qr.token]);
    const op = await h.call('GET', `/invitations/${a.id}`, { actor: 'O-01' });
    expect(tokensIn(op)).toEqual([a.qr.token]);
    for (const who of ['V-209', 'U-01', 'R1', undefined]) {
      const list = await h.call('GET', '/invitations', { actor: who, query: { hostId: 'V-202' } });
      const one = await h.call('GET', `/invitations/${a.id}`, { actor: who });
      expect([who, list.status, tokensIn(list)]).toEqual([who, 403, []]);
      expect([who, one.status, tokensIn(one)]).toEqual([who, 403, []]);
    }
  });
});

describe('un token solo valida su propia visita', () => {
  const verify = (h: Harness, token: string) =>
    h.call('POST', '/access/verify', { actor: 'R1', body: { token } });

  test('el token de A concede la visita de A y deja intacta la de B', async () => {
    const h = setup();
    const { a, b } = await twoInvitations(h);
    expect((await verify(h, a.qr.token)).body).toMatchObject({
      decision: 'GRANTED',
      visit: { id: a.visitId },
    });
    expect((await h.call('GET', `/visits/${b.visitId}`)).body.state).toBe('EXPECTED');
    expect((await verify(h, a.qr.token)).body).toEqual({
      decision: 'DENIED',
      reason: 'QR_ALREADY_USED',
    });
  });

  test('una invitación cancelada revoca solo su token', async () => {
    const h = setup();
    const { a, b } = await twoInvitations(h);
    await h.call('POST', `/invitations/${a.id}/cancel`, { actor: 'V-202' });
    expect((await verify(h, a.qr.token)).body).toEqual({
      decision: 'DENIED',
      reason: 'QR_REVOKED',
    });
    expect((await verify(h, b.qr.token)).body).toMatchObject({
      decision: 'GRANTED',
      visit: { id: b.visitId },
    });
  });

  test('un token bien formado pero inventado no revela nada ni cambia el estado', async () => {
    const h = setup();
    const { a, b } = await twoInvitations(h);
    const forged = a.qr.token.slice(0, -1) + (a.qr.token.endsWith('A') ? 'B' : 'A');
    expect((await verify(h, forged)).body).toEqual({ decision: 'DENIED', reason: 'QR_UNKNOWN' });
    for (const inv of [a, b])
      expect((await h.call('GET', `/visits/${inv.visitId}`)).body.state).toBe('EXPECTED');
  });

  test('en un evento facial, el QR de A no confirma la invitación de otra persona', async () => {
    const h = setup();
    const { a } = await twoInvitations(h);
    // Valentina (V-203) tiene la invitación de demostración; presenta el QR de otra invitación.
    const res = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: {
        source: { kind: 'ROBOT', id: 'R1' },
        face: { status: 'MATCH', classHint: 'NON_MEMBER', candidateId: 'V-203', confidence: 0.95 },
        evidence: { qrToken: a.qr.token },
      },
    });
    expect(res.body.visit.id).not.toBe(a.visitId);
    expect(res.body.visit.invitationId).not.toBe(a.id);
    expect((await h.call('GET', `/visits/${a.visitId}`)).body.state).toBe('EXPECTED');
  });
});
