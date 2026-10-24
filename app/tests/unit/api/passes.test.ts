// `GET /passes/{token}`: el enlace de entrada del invitado. Poseer el token es la autorización: no
// hay actor, y la respuesta solo trae lo que el invitado necesita para mostrar su pase.
import { createCerberusClient } from '@/infrastructure/clients/cerberus-client';
import { setup, type Harness } from '../../support/api-harness';

const invite = async (
  h: Harness,
  o: { name?: string; date?: string; window?: { from: string; to: string } } = {},
) =>
  (
    await h.call('POST', '/invitations', {
      actor: 'V-202',
      body: {
        hostId: 'V-202',
        guest: {
          fullName: o.name ?? 'Sebastián Lozano',
          note: 'Café sin azúcar',
          contact: 'seb@example.test',
        },
        meetingPoint: 'Cancha de tenis',
        date: o.date ?? '2026-10-24',
        ...(o.window ? { window: o.window } : {}),
      },
    })
  ).body;

describe('GET /passes/{token}', () => {
  test('sin actor devuelve solo los campos públicos del pase', async () => {
    const h = setup();
    const inv = await invite(h);
    const res = await h.call('GET', `/passes/${inv.qr.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      guestFirstName: 'Sebastián',
      hostShortName: 'Camila',
      meetingPoint: 'Cancha de tenis',
      date: '2026-10-24',
      window: { from: '06:00', to: '22:00' },
      state: 'ACTIVE',
      qr: {
        token: inv.qr.token,
        validFrom: '2026-10-24T06:00:00-05:00',
        validTo: '2026-10-24T22:00:00-05:00',
      },
    });
    const text = JSON.stringify(res.body);
    for (const secret of ['Lozano', 'Café', 'seb@example', inv.id, inv.visitId, 'V-202'])
      expect(text).not.toContain(secret);
  });

  test('el estado sigue al reloj y al uso: NOT_YET_VALID, USED, CANCELLED y EXPIRED', async () => {
    let wall = Date.parse('2026-10-24T09:00:00-05:00');
    const h = setup({ clock: { now: () => new Date(wall) } });
    const later = await invite(h, { window: { from: '14:00', to: '16:00' } });
    const state = async (token: string) => (await h.call('GET', `/passes/${token}`)).body.state;
    expect(await state(later.qr.token)).toBe('NOT_YET_VALID');

    const used = await invite(h, { name: 'Beto Gil' });
    const other = (
      await h.call('POST', '/invitations', {
        actor: 'V-202',
        body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
      })
    ).body;
    await h.call('POST', '/access/verify', { actor: 'R1', body: { token: used.qr.token } });
    expect(await state(used.qr.token)).toBe('USED');
    await h.call('POST', `/invitations/${other.id}/cancel`, { actor: 'V-202' });
    expect(await state(other.qr.token)).toBe('CANCELLED');

    wall = Date.parse('2026-10-24T17:00:00-05:00');
    expect(await state(later.qr.token)).toBe('EXPIRED');
  });

  test('token mal formado o desconocido es el mismo 404 PASS_NOT_FOUND', async () => {
    const h = setup();
    const inv = await invite(h);
    const flipped = `${inv.qr.token.slice(0, -1)}${inv.qr.token.endsWith('A') ? 'B' : 'A'}`;
    const replies = await Promise.all(
      ['nope', 'nq_corto', encodeURIComponent('nq_ AAAAAAAAAAAAAAAAAAAAA'), flipped].map((t) =>
        h.call('GET', `/passes/${t}`),
      ),
    );
    for (const r of replies) {
      expect([r.status, r.body.error.code]).toEqual([404, 'PASS_NOT_FOUND']);
      expect(r.body).toEqual(replies[0]!.body);
    }
  });

  test('el límite de lecturas aplica', async () => {
    const h = setup({ validate: false });
    const inv = await invite(h);
    let last = 0;
    for (let i = 0; i < 601; i++)
      last = (await h.call('GET', `/passes/${inv.qr.token}`, { ip: '8.8.8.8' })).status;
    expect(last).toBe(429);
  });

  test('el cliente getPass lo valida con el esquema y no envía actor', async () => {
    const h = setup();
    const inv = await invite(h);
    const seen: Record<string, string>[] = [];
    const client = createCerberusClient(async (req) => {
      seen.push(req.headers ?? {});
      const r = await h.app({
        method: req.method,
        path: req.path,
        query: {},
        headers: req.headers ?? {},
        body: undefined,
        ip: '3.3.3.3',
      });
      return { status: r.status, body: r.body, headers: r.headers ?? {} };
    });
    expect((await client.getPass(inv.qr.token)).guestFirstName).toBe('Sebastián');
    expect(seen[0]).not.toHaveProperty('x-demo-actor');
    await expect(client.getPass('nq_AAAAAAAAAAAAAAAAAAAAAA')).rejects.toMatchObject({
      status: 404,
      code: 'PASS_NOT_FOUND',
    });
  });
});
