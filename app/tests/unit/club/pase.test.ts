import { signToken } from '@/club/auth';
import { bogotaExp, leerQr, qrPayload } from '@/club/qr';
import { moduleRoutes } from '@/club/routes';
import type { Visita } from '@/club/types';
import { INVITACION, NOW, makeClub } from '../../support/club-app';

async function setup() {
  const club = makeClub(moduleRoutes);
  const tk = (sub: string, rol: string) =>
    signToken({ sub, rol: rol as 'SOCIO' }, club.cfg.jwtSecret!, NOW.getTime() / 1000);
  const t = {
    andres: tk('u-andres', 'SOCIO'),
    conc: tk('u-natalia', 'CONCIERGE'),
    mateo: tk('u-mateo', 'EDECAN'),
  };
  const inv = (
    await club.call('POST', '/invitaciones', {
      token: t.andres,
      body: { ...INVITACION, punto_encuentro: undefined },
    })
  ).body;
  const q = encodeURIComponent(inv.qr_payload);
  return { ...club, t, inv, qr: inv.qr_payload as string, q };
}

test('leerQr: formato, firma, vencimiento y firma correcta aunque esté vencido', () => {
  const p = qrPayload('invitado', 'inv-1', 'Laura Diaz', 2000, 's');
  expect(leerQr(p, 's', 1999)).toEqual({
    qr: { tipo: 'invitado', persona_id: 'inv-1', nombre: 'Laura Diaz', exp: 2000 },
    motivo: null,
  });
  expect(leerQr(p, 's', 2000).motivo).toBe('vencido');
  expect(leerQr(p, 's', 2000).qr).not.toBeNull();
  expect(leerQr(p, 'otro', 1)).toEqual({ qr: null, motivo: 'firma_invalida' });
  expect(leerQr(p.replace('Laura', 'Pedro'), 's', 1).motivo).toBe('firma_invalida');
  expect(leerQr('hola', 's', 1).motivo).toBe('formato_invalido');
});

test('GET /pase: pública, devuelve invitación, anfitrión, visita activa y actividades del día', async () => {
  const { call, t, q, inv } = await setup();
  const sin = await call('GET', `/pase?qr=${q}`);
  expect(sin.status).toBe(200);
  expect(sin.body).toMatchObject({
    invitacion: {
      id: inv.id,
      nombre: 'Laura',
      apellido: 'Diaz',
      trato: 'senora', // the guest pass greets with Bienvenida/Bienvenido
      fecha: '2026-10-24',
      estado: 'PROGRAMADA',
      punto_encuentro: 'INVITADO', // defaults to the invitation's place
    },
    anfitrion: { nombre: 'Andres', apellido: 'Mejia' },
    visita: null,
  });
  // The activities of the guest's day (the seed fills an empty day with the club's base list).
  expect(sin.body.actividades.length).toBeGreaterThan(0);
  expect(sin.body.invitacion).not.toHaveProperty('documento');
  await call('POST', '/visitas', { token: t.conc, body: { invitacion_id: inv.id } });
  const con = await call('GET', `/pase?qr=${q}`);
  expect(con.body.visita).toMatchObject({ nombre: 'Laura Diaz', estado: 'EN_RECEPCION' });
  expect(con.body.invitacion.estado).toBe('LLEGO');
  expect(con.body.actividades.every((a: { fecha: string }) => a.fecha === '2026-10-24')).toBe(true);
});

test('pase: QR inválido 401 qr_invalido, vencido 401 qr_vencido, de otro tipo o inexistente', async () => {
  const { call, cfg, setNow, qr, q } = await setup();
  for (const mala of ['', 'x', qr.replace('Laura', 'Pedro')]) {
    const r = await call('GET', `/pase?qr=${encodeURIComponent(mala)}`);
    expect([r.status, r.body.error]).toEqual([401, 'qr_invalido']);
  }
  const socio = qrPayload(
    'socio',
    'andres',
    'Andres Mejia',
    bogotaExp('2026-10-24', '11:00'),
    cfg.qrSecret!,
  );
  expect((await call('GET', `/pase?qr=${encodeURIComponent(socio)}`)).body.error).toBe(
    'qr_invalido',
  );
  const fantasma = qrPayload(
    'invitado',
    'inv-ffffffff',
    'Nadie',
    bogotaExp('2026-10-24', '11:00'),
    cfg.qrSecret!,
  );
  expect((await call('GET', `/pase?qr=${encodeURIComponent(fantasma)}`)).status).toBe(404);
  setNow(new Date('2026-10-24T19:00:01Z')); // pasada la hora_hasta (14:00 Bogotá)
  const v = await call('GET', `/pase?qr=${q}`);
  expect([v.status, v.body.error]).toEqual([401, 'qr_vencido']);
  expect((await call('POST', `/pase/ayuda?qr=${q}`, { body: { motivo: 'x' } })).body.error).toBe(
    'qr_vencido',
  );
});

test('pase/evaluacion y pase/ayuda actúan sobre la visita del invitado', async () => {
  const { call, t, q, inv } = await setup();
  const ev = (body: object) => call('POST', `/pase/evaluacion?qr=${q}`, { body });
  const ay = (body: object) => call('POST', `/pase/ayuda?qr=${q}`, { body });
  expect((await ev({ robot: 5, club: 5 })).body.error).toBe('sin_visita');
  expect((await ay({ motivo: 'x' })).body.error).toBe('sin_visita_activa');
  const v: Visita = (
    await call('POST', '/visitas', { token: t.conc, body: { invitacion_id: inv.id } })
  ).body;
  const a = await ay({ motivo: 'No encuentro a mi anfitrión' });
  expect(a.status).toBe(201);
  expect(a.body).toMatchObject({
    tipo: 'AYUDA',
    prioridad: 'urgente',
    visita_id: v.id,
    estado: 'ABIERTA',
  });
  expect((await ay({})).status).toBe(422);
  const e = await ev({ robot: 4, club: 5, comentario: 'Todo muy bien' });
  expect(e.body).toMatchObject({ visita_id: v.id, autor: 'invitado', robot: 4, club: 5 });
  expect((await ev({ robot: 9, club: 5 })).body.error).toBe('evaluacion_invalida');
  // después de salir todavía puede evaluar, pero ya no pedir ayuda
  await call('POST', `/visitas/${v.id}/salida`, { token: t.conc });
  expect((await ev({ robot: 5, club: 5 })).status).toBe(201);
  expect((await ay({ motivo: 'x' })).body.error).toBe('sin_visita_activa');
});

test('POST /qr/verificar: invitación y visita activa; firma inválida o vencida; roles', async () => {
  const { call, t, qr, inv, cfg } = await setup();
  const ver = (payload: string, token = t.mateo) =>
    call('POST', '/qr/verificar', { token, body: { payload } });
  const ok = await ver(qr);
  expect(ok.body).toMatchObject({
    valido: true,
    motivo: null,
    tipo: 'invitado',
    persona_id: inv.persona_id,
    nombre: 'Laura Diaz',
    invitacion: { id: inv.id, estado: 'PROGRAMADA' },
    visita: null,
  });
  const v: Visita = (
    await call('POST', '/visitas', { token: t.conc, body: { invitacion_id: inv.id } })
  ).body;
  expect((await ver(qr, t.conc)).body.visita).toMatchObject({ id: v.id });
  expect((await ver(qr.replace('Laura', 'Pedro'))).body).toMatchObject({
    valido: false,
    motivo: 'firma_invalida',
    tipo: null,
    invitacion: null,
  });
  expect((await ver('basura')).body).toMatchObject({ valido: false, motivo: 'formato_invalido' });
  const vencido = qrPayload('socio', 'andres', 'Andres Mejia', 10, cfg.qrSecret!);
  expect((await ver(vencido)).body).toMatchObject({
    valido: false,
    motivo: 'vencido',
    tipo: 'socio',
    nombre: 'Andres Mejia',
    invitacion: null,
  });
  expect(
    (await call('POST', '/qr/verificar', { token: t.andres, body: { payload: qr } })).status,
  ).toBe(403);
  expect((await call('POST', '/qr/verificar', { token: t.mateo, body: {} })).status).toBe(422);
});
