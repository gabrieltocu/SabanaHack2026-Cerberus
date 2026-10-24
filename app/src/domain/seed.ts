// Deterministic demo directory for the club (no clock, no randomness). Demo day is a Saturday.
// Ids and names are the ones published in docs/api/CONTRACT.md §3. All data is fictitious.
import type { ClubRecords, ExternalPermit, Membership, Person, Shift } from './entities/types';

export const DEMO_DATE = '2026-10-24';
/** Default demo instant: Saturday 2026-10-24 09:00 in Bogotá. */
export const DEMO_NOW = `${DEMO_DATE}T09:00:00-05:00`;

const membership = (
  personId: string,
  tier: Membership['tier'],
  validTo: string,
  status: Membership['status'] = 'ACTIVE',
): Membership => ({ personId, tier, status, validFrom: '2026-01-01', validTo });

const shift = (personId: string, date: string, from: string, to: string, area: string): Shift => ({
  personId,
  start: `${date}T${from}:00-05:00`,
  end: `${date}T${to}:00-05:00`,
  area,
});

export function createSeed(): ClubRecords {
  const people: Person[] = [
    {
      id: 'V-201',
      name: 'Andrés Mejía',
      kind: 'MEMBER',
      preferences: 'Café',
      defaultDestination: 'Salón reservado',
    },
    {
      id: 'V-202',
      name: 'Camila Torres',
      kind: 'MEMBER',
      preferences: 'Té',
      defaultDestination: 'Cancha de tenis',
    },
    // Guest with a consented demo face profile; hidden from the public directory.
    { id: 'V-203', name: 'Valentina Restrepo', kind: 'GUEST', preferences: 'Agua aromática' },
    { id: 'V-204', name: 'Mario Salcedo', kind: 'STAFF', defaultDestination: 'Operaciones' },
    {
      id: 'V-205',
      name: 'Laura Beltrán',
      kind: 'EXTERNAL',
      defaultDestination: 'Recepción de proveedores',
    },
    { id: 'V-206', name: 'Daniela Vega', kind: 'MEMBER' },
    { id: 'V-207', name: 'Esteban Cruz', kind: 'MEMBER' },
    { id: 'V-208', name: 'Iván Rojas', kind: 'MEMBER' },
    { id: 'V-209', name: 'Male Ospina', kind: 'MEMBER' },
    { id: 'V-210', name: 'Paula Rincón', kind: 'STAFF' },
    { id: 'U-01', name: 'Sara', kind: 'ATTENDANT' },
    { id: 'U-02', name: 'Sofía', kind: 'ATTENDANT' },
    { id: 'U-03', name: 'Ramiro', kind: 'ATTENDANT' },
    { id: 'R1', name: 'R1', kind: 'ROBOT' },
    { id: 'R2', name: 'R2', kind: 'ROBOT' },
    { id: 'R3', name: 'R3', kind: 'ROBOT' },
    { id: 'O-01', name: 'Operación', kind: 'OPERATOR' },
  ];

  const memberships: Membership[] = [
    membership('V-201', 'VIP', '2027-06-30'),
    membership('V-202', 'REGULAR', '2027-03-31'),
    membership('V-206', 'REGULAR', '2027-01-31'),
    membership('V-207', 'REGULAR', '2027-01-31', 'SUSPENDED'),
    membership('V-208', 'VIP', '2026-09-30'),
    membership('V-209', 'REGULAR', '2027-01-31'),
  ];

  const shifts: Shift[] = [
    shift('V-204', DEMO_DATE, '08:00', '20:00', 'Operaciones'),
    shift('V-206', DEMO_DATE, '10:00', '18:00', 'Eventos'),
    shift('V-210', '2026-10-23', '08:00', '16:00', 'Eventos'),
  ];

  const permits: ExternalPermit[] = [
    {
      id: 'OT-0412',
      personId: 'V-205',
      sponsorId: 'V-204',
      company: 'Mantenimientos Andinos',
      purpose: 'Mantenimiento',
      meetingPoint: 'Recepción de proveedores',
      weekdays: [6],
      from: '08:00',
      to: '17:00',
      validFrom: '2026-10-01',
      validTo: '2026-12-31',
    },
  ];

  // Invitations are created at runtime (see `POST /demo/reset`); none ship in the seed.
  return { people, memberships, shifts, permits, invitations: [] };
}

/** The sample invitation `POST /demo/reset` leaves active: Male invites Valentina to the terrace. */
export const DEMO_INVITATION = {
  hostId: 'V-209',
  guestName: 'Valentina Restrepo',
  guestPersonId: 'V-203',
  preferences: 'Agua aromática',
  meetingPoint: 'Terraza',
} as const;

/** Activities of the day as `[title, location, start, end, audience]`; the date is the request's. */
export const ACTIVITIES = [
  ['Clase abierta de tenis', 'Cancha de tenis', '09:30', '10:30', ['VIP', 'REGULAR', 'GUEST']],
  ['Cata de cafés de origen', 'Sala de catas', '11:00', '12:00', ['VIP', 'REGULAR']],
  ['Yoga en la terraza', 'Terraza', '10:30', '11:30', ['VIP', 'REGULAR', 'GUEST']],
] as const;
