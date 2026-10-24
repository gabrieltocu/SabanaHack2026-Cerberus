import { fixedClock, systemClock } from '@/domain/clock';
import { DEMO_DATE, DEMO_INVITATION, DEMO_NOW, createSeed } from '@/domain/seed';
import { activeShift, isMembershipActive, permitStatus } from '@/domain/policies/permissions';
import { bogotaParts } from '@/domain/policies/bogota-time';

describe('clock', () => {
  test('fixedClock devuelve siempre el mismo instante', () => {
    const clock = fixedClock('2026-10-24T10:00:00-05:00');
    expect(clock.now().toISOString()).toBe('2026-10-24T15:00:00.000Z');
    expect(clock.now().getTime()).toBe(clock.now().getTime());
  });

  test('fixedClock devuelve copias: mutar no afecta al reloj', () => {
    const clock = fixedClock('2026-10-24T10:00:00-05:00');
    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-10-24T15:00:00.000Z');
  });

  test('fixedClock lanza con un instante inválido', () => {
    expect(() => fixedClock('no-es-fecha')).toThrow('INVALID_INSTANT');
  });

  test('systemClock entrega un Date cercano al real', () => {
    expect(Math.abs(systemClock.now().getTime() - Date.now())).toBeLessThan(1000);
  });
});

describe('createSeed (directorio de docs/api/CONTRACT.md §3)', () => {
  const now = fixedClock('2026-10-24T10:00:00-05:00').now();
  const seed = createSeed();
  const byId = (id: string) => seed.people.find((p) => p.id === id)!;

  test('DEMO_DATE es sábado y DEMO_NOW es su instante por defecto', () => {
    expect(DEMO_DATE).toBe('2026-10-24');
    expect(bogotaParts(now)).toMatchObject({ date: DEMO_DATE, weekday: 6 });
    expect(DEMO_NOW).toBe('2026-10-24T09:00:00-05:00');
  });

  test('es determinista y no comparte referencias entre llamadas', () => {
    expect(createSeed()).toEqual(createSeed());
    expect(createSeed().people).not.toBe(createSeed().people);
  });

  test('ids del contrato, únicos y con referencias coherentes', () => {
    const ids = seed.people.map((p) => p.id);
    expect(ids).toEqual([
      'V-201',
      'V-202',
      'V-203',
      'V-204',
      'V-205',
      'V-206',
      'V-207',
      'V-208',
      'V-209',
      'V-210',
      'U-01',
      'U-02',
      'U-03',
      'R1',
      'R2',
      'R3',
      'O-01',
    ]);
    const known = new Set(ids);
    for (const m of seed.memberships) expect(known.has(m.personId)).toBe(true);
    for (const s of seed.shifts) expect(known.has(s.personId)).toBe(true);
    for (const p of seed.permits) {
      expect(known.has(p.personId)).toBe(true);
      expect(known.has(p.sponsorId)).toBe(true);
    }
    expect(known.has(DEMO_INVITATION.hostId)).toBe(true);
    expect(known.has(DEMO_INVITATION.guestPersonId)).toBe(true);
  });

  test('edecanes, robots y operador', () => {
    const names = (kind: string) => seed.people.filter((p) => p.kind === kind).map((p) => p.name);
    expect(names('ATTENDANT')).toEqual(['Sara', 'Sofía', 'Ramiro']);
    expect(names('ROBOT')).toEqual(['R1', 'R2', 'R3']);
    expect(names('OPERATOR')).toEqual(['Operación']);
  });

  test('perfiles de referencia con su registro', () => {
    expect(byId('V-201')).toMatchObject({
      name: 'Andrés Mejía',
      kind: 'MEMBER',
      preferences: 'Café',
      defaultDestination: 'Salón reservado',
    });
    expect(byId('V-202')).toMatchObject({
      preferences: 'Té',
      defaultDestination: 'Cancha de tenis',
    });
    expect(byId('V-203')).toMatchObject({ kind: 'GUEST', name: 'Valentina Restrepo' });
    expect(byId('V-204')).toMatchObject({ kind: 'STAFF', defaultDestination: 'Operaciones' });
    expect(byId('V-205')).toMatchObject({ kind: 'EXTERNAL' });

    const tier = (id: string) => seed.memberships.find((m) => m.personId === id);
    expect(tier('V-201')).toMatchObject({ tier: 'VIP', validTo: '2027-06-30' });
    expect(tier('V-202')).toMatchObject({ tier: 'REGULAR', validTo: '2027-03-31' });
    expect(tier('V-209')).toMatchObject({ tier: 'REGULAR', validTo: '2027-01-31' });
    expect(activeShift(seed.shifts, 'V-204', now)?.area).toBe('Operaciones');
    const permit = seed.permits.find((p) => p.personId === 'V-205')!;
    expect(permit).toMatchObject({
      id: 'OT-0412',
      sponsorId: 'V-204',
      meetingPoint: 'Recepción de proveedores',
      weekdays: [6],
      from: '08:00',
      to: '17:00',
      validFrom: '2026-10-01',
      validTo: '2026-12-31',
    });
    expect(permitStatus(permit, now)).toBe('ACTIVE');
  });

  test('casos de la matriz: suspendida, vencida, doble rol y personal sin turno', () => {
    const m = (id: string) => seed.memberships.find((x) => x.personId === id);
    expect(m('V-207')?.status).toBe('SUSPENDED');
    expect(isMembershipActive(m('V-207'), now)).toBe(false);
    expect(m('V-208')).toMatchObject({ status: 'ACTIVE', validTo: '2026-09-30' });
    expect(isMembershipActive(m('V-208'), now)).toBe(false);
    expect(isMembershipActive(m('V-206'), now)).toBe(true);
    expect(activeShift(seed.shifts, 'V-206', now)).toBeDefined();
    expect(activeShift(seed.shifts, 'V-206', fixedClock('2026-10-24T09:00:00-05:00').now())).toBe(
      undefined,
    );
    expect(activeShift(seed.shifts, 'V-210', now)).toBeUndefined();
    expect(seed.shifts.some((s) => s.personId === 'V-210')).toBe(true);
  });

  test('la invitación de demostración: Male invita a Valentina a la terraza', () => {
    expect(DEMO_INVITATION).toMatchObject({
      hostId: 'V-209',
      guestName: 'Valentina Restrepo',
      guestPersonId: 'V-203',
      meetingPoint: 'Terraza',
      preferences: 'Agua aromática',
    });
    expect(seed.invitations).toEqual([]);
  });
});
