// Invitations (docs/domain/invitations-qr.md): a member invites a guest for a date; the invitation
// and its one-use QR live inside the expected visit (`visit:<id>`).
import type { Invitation } from '../domain/entities/types';
import type { Visit } from '../domain/entities/visit';
import { bogotaInstant, parseLocalTime } from '../domain/policies/bogota-time';
import { invitationStatusAt } from '../domain/policies/permissions';
import { generateToken, isWellFormedToken } from '../domain/policies/qr-token';
import { closeVisit, toInstant } from '../domain/policies/visit-machine';
import type { InvitationCreate } from '../infrastructure/contracts';
import { actorKind, findPerson, requireActor } from './directory';
import { fail } from './errors';
import { invitationState, passDto } from './present';
import {
  indexVisit,
  listVisits,
  modifyVisit,
  newId,
  randomHex,
  readVisit,
  settle,
  visitKey,
  type Ctx,
} from './repo';
import { bogotaDay } from './time';

const MAX_PER_DAY = 5;
const HOSTDAY_ATTEMPTS = 8; // up to six concurrent creators must each get a turn
const DEFAULT_WINDOW = { from: '06:00', to: '22:00' };

const ORPHAN_MS = 60_000;

interface HostDay {
  /** `at`: wall-clock ms of the reservation; without it (older data) a missing visit is an orphan. */
  entries: { visitId: string; invitationId: string; guestKey: string; at?: number }[];
}

/** Same guest = same name after lower-casing, removing accents and collapsing spaces (IR-05). */
export const guestKey = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface InvitationSource extends InvitationCreate {
  /** Directory id of a guest with a consented demo face profile. */
  guestPersonId?: string;
}

/** `system` skips the actor, eligibility and past-date rules (the demo invitation left by the reset). */
export async function createInvitation(
  ctx: Ctx,
  input: InvitationSource,
  opts: { system?: boolean } = {},
): Promise<Visit> {
  const { seed, store, now } = ctx;
  // Authorization before anything else: an unauthorized actor learns nothing about the host.
  const creator = opts.system ? undefined : requireActor(ctx, ['MEMBER', 'STAFF', 'OPERATOR']);
  const window = input.window ?? DEFAULT_WINDOW;
  if (parseLocalTime(window.from) >= parseLocalTime(window.to)) {
    throw fail('VALIDATION_ERROR', 'La ventana debe terminar después de empezar.', {
      fields: { window: 'from debe ser menor que to.' },
    });
  }

  const host = findPerson(seed, input.hostId);
  if (!host) throw fail('PERSON_NOT_FOUND', 'No existe el anfitrión indicado.');
  if (creator && creator.id !== host.id && actorKind(creator) !== 'OPERATOR') {
    throw fail('ACTOR_NOT_ALLOWED', 'Solo el anfitrión o un operador crea la invitación.');
  }
  const membership = seed.memberships.find((m) => m.personId === host.id);
  const eligible =
    membership?.status === 'ACTIVE' &&
    membership.validFrom <= input.date &&
    input.date <= membership.validTo;
  // The demo invitation of a reset must exist whatever date the presenter picked.
  if (!eligible && !opts.system) {
    throw fail('HOST_NOT_ELIGIBLE', 'El anfitrión debe ser socio con membresía activa.');
  }

  if (!opts.system) {
    const today = bogotaDay(now);
    const over = input.date === today && !(now < bogotaInstant(input.date, window.to));
    if (input.date < today || over) {
      throw fail('INVITATION_DATE_IN_PAST', 'La fecha de la invitación ya pasó.');
    }
  }

  const key = guestKey(input.guest.fullName);
  const invitationId = newId(ctx, 'inv');
  const visitId = newId(ctx, 'vis');
  const dayKey = `hostday:${host.id}:${input.date}`;

  // Reserve the slot first: duplicates and the daily limit are checked and claimed with one CAS.
  // A reservation whose visit never appeared (a crash between both writes) holds its slot for
  // ORPHAN_MS and is then dropped, so it cannot block that guest or the daily limit for good.
  for (let attempt = 0; ; attempt++) {
    const cur = await store.get<HostDay>(dayKey);
    const wall = ctx.real.now().getTime();
    const checked = await Promise.all(
      (cur?.value.entries ?? []).map(async (e) => {
        const stored = await store.get<Visit>(visitKey(e.visitId));
        const inv = stored?.value.invitation;
        const orphan = !inv && !(e.at !== undefined && wall - e.at < ORPHAN_MS);
        // A reservation without its visit yet is an invitation being created: it counts.
        const counts = !inv
          ? !orphan
          : ['VALID', 'NOT_YET', 'USED'].includes(invitationStatusAt(inv, now));
        return { e, counts, orphan };
      }),
    );
    const counted = checked.filter((c) => c.counts).map((c) => c.e);
    const dup = counted.find((e) => e.guestKey === key);
    if (dup) {
      throw fail(
        'INVITATION_DUPLICATE',
        'Ya existe una invitación para este invitado, anfitrión y fecha.',
        {
          invitationId: dup.invitationId,
        },
      );
    }
    if (counted.length >= MAX_PER_DAY) {
      throw fail('INVITATION_DAILY_LIMIT', 'El socio ya tiene 5 invitaciones para esa fecha.');
    }
    const kept = checked.filter((c) => !c.orphan).map((c) => c.e);
    const next: HostDay = {
      entries: [...kept, { visitId, invitationId, guestKey: key, at: wall }],
    };
    if ((await store.compareAndSet(dayKey, cur?.version ?? 0, next)) !== null) break;
    if (attempt >= HOSTDAY_ATTEMPTS)
      throw fail('VERSION_CONFLICT', 'Demasiadas solicitudes simultáneas.');
  }

  let token = generateToken(ctx.random);
  while ((await store.compareAndSet(`qr:${token}`, 0, { visitId })) === null) {
    token = generateToken(ctx.random);
  }
  await store.compareAndSet(`inv:${invitationId}`, 0, { visitId });

  const invitation: Invitation = {
    id: invitationId,
    hostId: host.id,
    hostName: host.name.trim().split(/\s+/)[0] ?? host.name,
    guestName: input.guest.fullName,
    ...(input.guestPersonId ? { guestPersonId: input.guestPersonId } : {}),
    guestRef: input.guestPersonId ?? `G-${randomHex(ctx)}`,
    ...(input.guest.contact ? { guestContact: input.guest.contact } : {}),
    date: input.date,
    windowFrom: window.from,
    windowTo: window.to,
    status: 'ACTIVE',
    ...(input.meetingPoint ? { meetingPoint: input.meetingPoint } : {}),
    ...(input.guest.note ? { preferences: input.guest.note } : {}),
    createdAt: toInstant(now),
    visitId,
    pass: {
      token,
      validFrom: toInstant(bogotaInstant(input.date, window.from)),
      validTo: toInstant(bogotaInstant(input.date, window.to)),
    },
  };
  const visit: Visit = {
    id: visitId,
    state: 'EXPECTED',
    entry: 'QR',
    phase: 0,
    visitorRef: invitation.guestRef!,
    visitorName: invitation.guestName,
    ...(invitation.meetingPoint ? { destination: invitation.meetingPoint } : {}),
    invitation,
    openedAt: toInstant(now),
    history: [],
    version: 1,
  };
  await indexVisit(ctx, visitId);
  if ((await store.compareAndSet(visitKey(visitId), 0, visit)) === null) {
    throw fail('VERSION_CONFLICT', 'No se pudo crear la visita esperada; reintenta.');
  }
  return visit;
}

/**
 * Reading an invitation (it carries the QR token): its host or an operator, nobody else. Without
 * `hostId` it only checks the kind of actor, so a lookup never answers 404 to a stranger.
 */
export function requireHostOrOperator(ctx: Ctx, hostId?: string): void {
  const actor = requireActor(ctx, ['MEMBER', 'OPERATOR']);
  if (hostId !== undefined && actor.id !== hostId && actorKind(actor) !== 'OPERATOR')
    throw fail('ACTOR_NOT_ALLOWED', 'Solo el anfitrión o un operador consulta la invitación.');
}

/**
 * The guest's pass by token. Holding the token is the authorization, so a malformed, unknown or
 * stale token is one and the same 404 and nothing but the public fields leaves.
 */
export async function readPass(ctx: Ctx, token: string) {
  const notFound = () => fail('PASS_NOT_FOUND', 'No existe el pase indicado.');
  const idx = isWellFormedToken(token)
    ? await ctx.store.get<{ visitId: string }>(`qr:${token}`)
    : null;
  if (!idx) throw notFound();
  const visit = await readVisit(ctx, idx.value.visitId).catch(() => undefined);
  const inv = visit?.invitation;
  if (!inv || inv.pass?.token !== token) throw notFound();
  return passDto(inv, findPerson(ctx.seed, inv.hostId)?.name ?? 'Tu anfitrión', ctx.now);
}

export async function findByInvitationId(ctx: Ctx, id: string): Promise<string> {
  const idx = await ctx.store.get<{ visitId: string }>(`inv:${id}`);
  if (!idx) throw fail('INVITATION_NOT_FOUND', 'No existe la invitación indicada.');
  return idx.value.visitId;
}

/** Every invitation of the club, as the classifier needs them. */
export async function allInvitations(ctx: Ctx, visits?: Visit[]): Promise<Invitation[]> {
  return (visits ?? (await listVisits(ctx))).flatMap((v) => (v.invitation ? [v.invitation] : []));
}

export async function cancelInvitation(ctx: Ctx, id: string): Promise<Visit> {
  const actor = requireActor(ctx, ['MEMBER', 'OPERATOR']);
  const visitId = await findByInvitationId(ctx, id);
  return modifyVisit<Visit>(ctx, visitId, (cur) => {
    const v = settle(cur, ctx.now);
    const inv = v.invitation!;
    if (actor.id !== inv.hostId && actorKind(actor) !== 'OPERATOR') {
      return {
        visit: v,
        error: fail('ACTOR_NOT_ALLOWED', 'Solo el anfitrión o un operador cancela.'),
      };
    }
    if (inv.status === 'CANCELLED') return { visit: v, value: v };
    const state = invitationState(inv, ctx.now);
    if (state !== 'ACTIVE') {
      return {
        visit: v,
        error: fail('INVITATION_NOT_ACTIVE', 'La invitación está usada o vencida.', { state }),
      };
    }
    const closed = closeVisit(v, actor.id, ctx.now, 'invitation-cancelled', 'INVITATION_CANCELLED');
    if (!closed.ok) {
      return { visit: v, error: fail('INVALID_TRANSITION', 'La visita no admite cancelar.') };
    }
    const at = toInstant(ctx.now);
    const next: Visit = {
      ...closed.value,
      invitation: {
        ...inv,
        status: 'CANCELLED',
        cancelledAt: at,
        pass: { ...inv.pass!, revokedAt: at },
      },
    };
    return { visit: next, value: next };
  });
}
