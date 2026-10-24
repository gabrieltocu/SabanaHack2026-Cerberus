// The club directory as the API sees it: roles, public person shape, actors and escort availability.
import type { ClubRecords, Person as DomainPerson } from '../domain/entities/types';
import type { Visit } from '../domain/entities/visit';
import { bogotaParts } from '../domain/policies/bogota-time';
import type { PersonRole, Person as PersonDto } from '../infrastructure/contracts';
import { fail } from './errors';
import { resumeStateOf } from './present';
import type { Ctx } from './repo';
import { bogotaDay } from './time';

export const findPerson = (seed: ClubRecords, id: string | undefined) =>
  seed.people.find((p) => p.id === id);

/** Guests with a consented face profile exist only as part of an invitation: not in the directory. */
export const isPublic = (p: DomainPerson) => p.kind !== 'GUEST';

export function rolesOf(seed: ClubRecords, p: DomainPerson): PersonRole[] {
  const roles = new Set<PersonRole>();
  if (p.kind === 'MEMBER') roles.add('MEMBER');
  if (p.kind === 'STAFF') roles.add('STAFF');
  if (p.kind === 'EXTERNAL') roles.add('EXTERNAL');
  if (p.kind === 'ATTENDANT') roles.add('USHER');
  if (p.kind === 'ROBOT') roles.add('ROBOT');
  if (p.kind === 'OPERATOR') roles.add('OPERATOR');
  if (seed.memberships.some((m) => m.personId === p.id)) roles.add('MEMBER');
  if (seed.shifts.some((s) => s.personId === p.id)) roles.add('STAFF');
  return [...roles];
}

export const robotKey = (id: string) => `robot:${id}`;

export async function robotStatus(ctx: Ctx, id: string): Promise<'OK' | 'FAULT'> {
  const stored = await ctx.store.get<{ status: 'OK' | 'FAULT' }>(robotKey(id));
  return stored?.value.status ?? 'OK';
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** `detail` adds the preferences, which the list leaves out. */
export async function personDto(ctx: Ctx, p: DomainPerson, detail: boolean): Promise<PersonDto> {
  const { seed } = ctx;
  const roles = rolesOf(seed, p);
  const membership = seed.memberships.find((m) => m.personId === p.id);
  const shifts = seed.shifts.filter((s) => s.personId === p.id);
  const permit = seed.permits.find((x) => x.personId === p.id);
  const isRobot = p.kind === 'ROBOT';
  const reception = p.id === 'R1';
  return {
    id: p.id,
    displayName: isRobot ? `${p.name} · ${reception ? 'recepción' : 'acompañamiento'}` : p.name,
    roles,
    ...(membership
      ? {
          membership: {
            tier: membership.tier,
            status: membership.status,
            validTo: membership.validTo,
          },
        }
      : {}),
    ...(roles.includes('STAFF')
      ? {
          staff: {
            department: shifts[0]?.area ?? p.defaultDestination ?? 'Club',
            shifts: shifts.map((s) => {
              const from = bogotaParts(new Date(s.start));
              const to = bogotaParts(new Date(s.end));
              const hhmm = (minutes: number) =>
                `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
              return { date: bogotaDay(s.start), from: hhmm(from.minutes), to: hhmm(to.minutes) };
            }),
          },
        }
      : {}),
    ...(permit
      ? {
          external: {
            company: permit.company,
            orderCode: permit.id,
            responsibleId: permit.sponsorId,
            permit: {
              daysOfWeek: permit.weekdays.map((d) => DAYS[d]!),
              from: permit.from,
              to: permit.to,
              validFrom: permit.validFrom,
              validTo: permit.validTo,
            },
          },
        }
      : {}),
    ...(isRobot
      ? {
          robot: {
            role: reception ? ('RECEPTION' as const) : ('ESCORT' as const),
            canEscort: !reception,
            status: await robotStatus(ctx, p.id),
          },
        }
      : {}),
    defaultDestination: p.defaultDestination ?? null,
    ...(detail && p.preferences ? { preferences: [p.preferences] } : {}),
  };
}

export type ActorKind = 'ROBOT' | 'USHER' | 'OPERATOR' | 'MEMBER' | 'STAFF' | 'EXTERNAL' | 'GUEST';
const KIND: Record<DomainPerson['kind'], ActorKind> = {
  ROBOT: 'ROBOT',
  ATTENDANT: 'USHER',
  OPERATOR: 'OPERATOR',
  MEMBER: 'MEMBER',
  STAFF: 'STAFF',
  EXTERNAL: 'EXTERNAL',
  GUEST: 'GUEST',
};

/** The declared actor, which must be a known directory id of one of `allowed` kinds. */
export function requireActor(ctx: Ctx, allowed: ActorKind[]): DomainPerson {
  const person = findPerson(ctx.seed, ctx.actor);
  if (!person) {
    throw fail('ACTOR_NOT_ALLOWED', 'Falta o no es válida la cabecera X-Demo-Actor.');
  }
  if (!allowed.includes(KIND[person.kind])) {
    throw fail('ACTOR_NOT_ALLOWED', 'El actor no puede realizar esta acción.');
  }
  return person;
}

export const actorKind = (p: DomainPerson): ActorKind => KIND[p.kind];

/**
 * Escorts with an unfinished walk: owner of an IN_PROGRESS visit (or one waiting from it) without
 * `arrivedAt`, or receiver of a handoff accepted and not yet confirmed (it will be theirs).
 */
export function busyEscorts(visits: Visit[], exceptVisitId?: string): Set<string> {
  const busy = new Set<string>();
  for (const v of visits) {
    if (v.id === exceptVisitId || v.arrivedAt) continue;
    const active =
      v.state === 'IN_PROGRESS' ||
      (v.state === 'WAITING_HANDOFF' && resumeStateOf(v) === 'IN_PROGRESS');
    if (active && v.ownerId) busy.add(v.ownerId);
    const h = v.handoff;
    if (v.state !== 'CLOSED' && h?.toId && ['ACCEPTED', 'CONTEXT_TRANSFERRED'].includes(h.state))
      busy.add(h.toId);
  }
  return busy;
}

/** An escort is an usher, or an escort robot that is not in FAULT. R1 (reception) never escorts. */
export async function isEligibleEscort(ctx: Ctx, p: DomainPerson): Promise<boolean> {
  if (p.kind === 'ATTENDANT') return true;
  return p.kind === 'ROBOT' && p.id !== 'R1' && (await robotStatus(ctx, p.id)) === 'OK';
}
