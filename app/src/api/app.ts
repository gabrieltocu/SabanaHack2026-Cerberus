// The whole API as one platform-agnostic handler (docs/adr/0002-mocks-api.md). It runs in the Vercel
// function, in the local server and, with a localStorage store, in the browser demo.
import type { Clock } from '../domain/entities/types';
import { DEMO_INVITATION, DEMO_NOW, createSeed, ACTIVITIES } from '../domain/seed';
import {
  AccessVerifyRequest,
  ActivitiesQuery,
  AdvanceRequest,
  CloseRequest,
  DemoResetRequest,
  FeedbackRequest,
  HandoffCancelRequest,
  HandoffCreate,
  HandoffsQuery,
  InvitationCreate,
  InvitationsQuery,
  PeopleQuery,
  RecognitionEventRequest,
  RobotFailureRequest,
  VisitsQuery,
} from '../infrastructure/contracts';
import type { KeyValueStore } from '../infrastructure/stores/types';
import { recognize, verifyAccess } from './access';
import { findPerson, isPublic, personDto } from './directory';
import { fail, HttpError, parse } from './errors';
import * as handoffs from './handoffs';
import { errorBody, type ApiHandler, type ApiRequest, type ApiResponse } from './http';
import { withIdempotency } from './idempotency';
import {
  cancelInvitation,
  createInvitation,
  findByInvitationId,
  readPass,
  requireHostOrOperator,
} from './invitations';
import { contextDto, handoffDto, invitationDto, invitationState, visitDto } from './present';
import { rateLimit } from './rate-limit';
import { listVisits, readVisit, type Ctx } from './repo';
import { reportFailure } from './robots';
import { bogotaDay, bogotaIso } from './time';
import { advanceVisit, closeVisitEvent, feedbackDto, submitFeedback } from './visits';

export interface AppOptions {
  store: KeyValueStore;
  /** Wall clock; the demo clock is derived from it (see `POST /demo/reset`). */
  clock: Clock;
  random: (bytes: number) => Uint8Array;
  storage: 'memory' | 'redis' | 'browser';
  resetEnabled: boolean;
  /** When defined, the robot endpoints require `Authorization: Bearer <token>` (never set in the browser). */
  robotToken?: string;
  /** Per-client rate limit (default on). Only the local e2e server turns it off; see `server.ts`. */
  rateLimit?: boolean;
}

const CLOCK_KEY = 'meta:clock';
const RESET_PREFIXES = [
  'visit:',
  'visits:',
  'qr:',
  'inv:',
  'handoff:',
  'hostday:',
  'person:',
  'escort:',
  'robot:',
  'idem:',
];

interface ClockMeta {
  /** Demo instant fixed by the reset and the wall-clock instant it happened. */
  at: string;
  realAt: string;
}

const demoNow = (meta: ClockMeta, real: Date) =>
  new Date(Date.parse(meta.at) + (real.getTime() - Date.parse(meta.realAt)));

/** A path segment with an invalid escape cannot name any resource. */
const dec = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw fail('ROUTE_NOT_FOUND', 'Ruta no encontrada.');
  }
};

const json = (status: number, body: unknown): ApiResponse => ({ status, body });
const list = <T>(items: T[]) => json(200, { items, count: items.length });

async function seedDemoInvitation(ctx: Ctx) {
  const visit = await createInvitation(
    ctx,
    {
      hostId: DEMO_INVITATION.hostId,
      guest: { fullName: DEMO_INVITATION.guestName, note: DEMO_INVITATION.preferences },
      meetingPoint: DEMO_INVITATION.meetingPoint,
      date: bogotaDay(ctx.now),
      guestPersonId: DEMO_INVITATION.guestPersonId,
    },
    { system: true },
  );
  return invitationDto(visit.invitation!, ctx.now);
}

async function resetDemo(ctx: Ctx, opts: AppOptions, body: DemoResetRequest) {
  if (!ctx.resetEnabled)
    throw fail('RESET_DISABLED', 'El reinicio está desactivado en este despliegue.');
  const at = body.now ? new Date(body.now) : new Date(DEMO_NOW);
  // Validate before wiping anything: a reset that fails halfway would leave an empty store.
  if (Number.isNaN(at.getTime()))
    throw fail('VALIDATION_ERROR', 'La fecha de reinicio no es válida.', {
      fields: { now: 'Instante inexistente.' },
    });
  for (const prefix of RESET_PREFIXES) await ctx.store.clear(prefix);
  const meta: ClockMeta = { at: at.toISOString(), realAt: opts.clock.now().toISOString() };
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await ctx.store.get<ClockMeta>(CLOCK_KEY);
    if ((await ctx.store.compareAndSet(CLOCK_KEY, cur?.version ?? 0, meta)) !== null) break;
    if (attempt === 2)
      throw fail('VERSION_CONFLICT', 'El reloj cambió mientras se reiniciaba; reintenta.');
  }
  const demoInvitation = await seedDemoInvitation({ ...ctx, now: at });
  return json(200, { status: 'reset', clock: { now: bogotaIso(at) }, demoInvitation });
}

type Handler = (ctx: Ctx, req: ApiRequest, m: RegExpMatchArray) => Promise<ApiResponse>;
export interface Route {
  method: 'GET' | 'POST';
  path: RegExp;
  /** `Idempotency-Key` handling for POST: mandatory or honored when present. */
  key?: 'required' | 'optional';
  /** The reset route: it seeds the demo itself. */
  resets?: true;
  /** Called by the real robot: needs the bearer token when the server defines one. */
  robot?: true;
  handler: Handler;
}

const handoffResult = (v: Parameters<typeof handoffDto>[0]) => ({
  handoff: handoffDto(v),
  visit: visitDto(v),
});

/** Preferences of the visitor for the receiver of a handoff (directory, else the invitation note). */
const preferencesOf = (ctx: Ctx, v: Parameters<typeof contextDto>[0]) => {
  const pref = findPerson(ctx.seed, v.personId)?.preferences ?? v.invitation?.preferences;
  return pref ? [pref] : [];
};

/** The route table; exported so the contract tests can check it against `openapi.yaml`. */
export const ROUTES = (opts: AppOptions): Route[] => [
  {
    method: 'GET',
    path: /^\/health$/,
    handler: async (ctx) =>
      json(200, {
        status: 'ok',
        contract: 'v1',
        storage: ctx.storage,
        demo: true,
        clock: { now: bogotaIso(ctx.now), timezone: 'America/Bogota' },
      }),
  },
  {
    method: 'POST',
    path: /^\/demo\/reset$/,
    resets: true,
    handler: (ctx, req) => resetDemo(ctx, opts, parse(DemoResetRequest, req.body ?? {})),
  },
  {
    method: 'GET',
    path: /^\/people$/,
    handler: async (ctx, req) => {
      const { role } = parse(PeopleQuery, req.query);
      const people = ctx.seed.people.filter(isPublic);
      const dtos = await Promise.all(people.map((p) => personDto(ctx, p, false)));
      return list(dtos.filter((p) => role === undefined || p.roles.includes(role)));
    },
  },
  {
    method: 'GET',
    path: /^\/people\/([^/]+)$/,
    handler: async (ctx, _req, m) => {
      const person = findPerson(ctx.seed, dec(m[1]!));
      if (!person || !isPublic(person))
        throw fail('PERSON_NOT_FOUND', 'No existe la persona indicada.');
      return json(200, await personDto(ctx, person, true));
    },
  },
  {
    method: 'GET',
    path: /^\/activities$/,
    handler: async (ctx, req) => {
      const { date = bogotaDay(ctx.now) } = parse(ActivitiesQuery, req.query);
      return list(
        ACTIVITIES.map(([title, location, from, to, audience], i) => ({
          id: `act-${String(i + 1).padStart(3, '0')}`,
          title,
          location,
          startsAt: `${date}T${from}:00-05:00`,
          endsAt: `${date}T${to}:00-05:00`,
          audience: [...audience],
        })),
      );
    },
  },
  {
    method: 'POST',
    path: /^\/invitations$/,
    key: 'required',
    handler: async (ctx, req) => {
      const visit = await createInvitation(ctx, parse(InvitationCreate, req.body ?? {}));
      return json(201, invitationDto(visit.invitation!, ctx.now));
    },
  },
  {
    method: 'GET',
    path: /^\/invitations$/,
    handler: async (ctx, req) => {
      const q = parse(InvitationsQuery, req.query);
      requireHostOrOperator(ctx, q.hostId);
      const found = (await listVisits(ctx))
        .flatMap((v) => (v.invitation ? [v.invitation] : []))
        .filter((i) => i.hostId === q.hostId)
        .filter((i) => q.date === undefined || i.date === q.date)
        .filter((i) => q.state === undefined || invitationState(i, ctx.now) === q.state)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return list(found.map((i) => invitationDto(i, ctx.now)));
    },
  },
  {
    method: 'GET',
    path: /^\/invitations\/([^/]+)$/,
    handler: async (ctx, _req, m) => {
      requireHostOrOperator(ctx);
      const visit = await readVisit(ctx, await findByInvitationId(ctx, dec(m[1]!)));
      requireHostOrOperator(ctx, visit.invitation!.hostId);
      return json(200, invitationDto(visit.invitation!, ctx.now));
    },
  },
  {
    method: 'POST',
    path: /^\/invitations\/([^/]+)\/cancel$/,
    key: 'optional',
    handler: async (ctx, _req, m) => {
      const visit = await cancelInvitation(ctx, dec(m[1]!));
      return json(200, invitationDto(visit.invitation!, ctx.now));
    },
  },
  {
    // No actor: the pass token is the credential (the entry link of the guest).
    method: 'GET',
    path: /^\/passes\/([^/]+)$/,
    handler: async (ctx, _req, m) => json(200, await readPass(ctx, dec(m[1]!))),
  },
  {
    method: 'POST',
    path: /^\/access\/verify$/,
    robot: true,
    key: 'required',
    handler: async (ctx, req) =>
      json(200, await verifyAccess(ctx, parse(AccessVerifyRequest, req.body ?? {}))),
  },
  {
    method: 'POST',
    path: /^\/recognition\/events$/,
    robot: true,
    key: 'required',
    handler: async (ctx, req) => {
      const r = await recognize(ctx, parse(RecognitionEventRequest, req.body ?? {}));
      return json(r.status, r.body);
    },
  },
  {
    method: 'GET',
    path: /^\/visits$/,
    handler: async (ctx, req) => {
      const q = parse(VisitsQuery, req.query);
      const visits = (await listVisits(ctx))
        .filter((v) => q.state === undefined || v.state === q.state)
        .filter((v) => q.ownerId === undefined || v.ownerId === q.ownerId)
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt) || a.id.localeCompare(b.id))
        .slice(0, q.limit ?? 100);
      return list(visits.map(visitDto));
    },
  },
  {
    method: 'GET',
    path: /^\/visits\/([^/]+)$/,
    handler: async (ctx, _req, m) => json(200, visitDto(await readVisit(ctx, dec(m[1]!)))),
  },
  {
    method: 'POST',
    path: /^\/visits\/([^/]+)\/advance$/,
    key: 'optional',
    handler: async (ctx, req, m) =>
      json(
        200,
        visitDto(await advanceVisit(ctx, dec(m[1]!), parse(AdvanceRequest, req.body ?? {}))),
      ),
  },
  {
    method: 'POST',
    path: /^\/visits\/([^/]+)\/close$/,
    key: 'optional',
    handler: async (ctx, req, m) =>
      json(
        200,
        visitDto(await closeVisitEvent(ctx, dec(m[1]!), parse(CloseRequest, req.body ?? {}))),
      ),
  },
  {
    method: 'POST',
    path: /^\/visits\/([^/]+)\/feedback$/,
    key: 'optional',
    handler: async (ctx, req, m) => {
      const { visit } = await submitFeedback(
        ctx,
        dec(m[1]!),
        parse(FeedbackRequest, req.body ?? {}),
      );
      return json(201, feedbackDto(visit));
    },
  },
  {
    method: 'POST',
    path: /^\/handoffs$/,
    key: 'required',
    handler: async (ctx, req) =>
      json(
        201,
        handoffResult(await handoffs.createHandoff(ctx, parse(HandoffCreate, req.body ?? {}))),
      ),
  },
  {
    method: 'GET',
    path: /^\/handoffs$/,
    handler: async (ctx, req) =>
      list((await handoffs.listHandoffs(ctx, parse(HandoffsQuery, req.query))).map(handoffDto)),
  },
  {
    method: 'POST',
    path: /^\/handoffs\/([^/]+)\/accept$/,
    key: 'optional',
    handler: async (ctx, _req, m) =>
      json(200, handoffResult(await handoffs.accept(ctx, dec(m[1]!)))),
  },
  {
    method: 'POST',
    path: /^\/handoffs\/([^/]+)\/context$/,
    key: 'optional',
    handler: async (ctx, _req, m) => {
      const v = await handoffs.transfer(ctx, dec(m[1]!));
      return json(200, { handoff: handoffDto(v), context: contextDto(v, preferencesOf(ctx, v)) });
    },
  },
  {
    method: 'POST',
    path: /^\/handoffs\/([^/]+)\/confirm$/,
    key: 'optional',
    handler: async (ctx, _req, m) =>
      json(200, handoffResult(await handoffs.confirm(ctx, dec(m[1]!)))),
  },
  {
    method: 'POST',
    path: /^\/handoffs\/([^/]+)\/cancel$/,
    key: 'optional',
    handler: async (ctx, req, m) =>
      json(
        200,
        handoffResult(
          await handoffs.cancel(ctx, dec(m[1]!), parse(HandoffCancelRequest, req.body ?? {})),
        ),
      ),
  },
  {
    method: 'POST',
    path: /^\/robots\/([^/]+)\/failure$/,
    robot: true,
    key: 'required',
    handler: async (ctx, req, m) => {
      const robotId = dec(m[1]!);
      const body = parse(RobotFailureRequest, req.body ?? {});
      const visits = await reportFailure(ctx, robotId, body);
      return json(200, {
        robot: { id: robotId, status: 'FAULT' },
        handoffs: visits.map(handoffDto),
      });
    },
  },
];

/** Same-length comparison without an early exit on the first different character. */
function sameToken(given: string, expected: string): boolean {
  if (given.length !== expected.length || given.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function requireRobotToken(req: ApiRequest, expected: string) {
  const given = /^Bearer (\S+)$/i.exec(req.headers['authorization'] ?? '')?.[1] ?? '';
  if (!sameToken(given, expected))
    throw fail('UNAUTHENTICATED', 'Falta el token del robot o no es válido.');
}

/** Turns anything thrown into the stable error body; internals never reach the client. */
function toResponse(e: unknown): ApiResponse {
  if (e instanceof HttpError) {
    return {
      status: e.status,
      ...(e.headers ? { headers: e.headers } : {}),
      body: errorBody(e.code, e.message, e.details),
    };
  }
  const name = e instanceof Error ? e.name : typeof e;
  if (name === 'StoreUnavailableError') {
    return {
      status: 500,
      body: errorBody('STORAGE_UNAVAILABLE', 'El almacenamiento no está disponible.'),
    };
  }
  if (e instanceof Error && e.message.startsWith('INVALID_LOCAL_DATE')) {
    return { status: 422, body: errorBody('VALIDATION_ERROR', 'Fecha inexistente.') };
  }
  console.error('api_error', name);
  return { status: 500, body: errorBody('INTERNAL_ERROR', 'Error interno.') };
}

export function createApp(opts: AppOptions): ApiHandler {
  const seed = createSeed();
  const routes = ROUTES(opts);
  let cachedClock: { meta: ClockMeta; readAt: number } | undefined;
  let clockGeneration = 0;

  /** First request on an empty store behaves like a reset to the default demo instant. */
  async function loadClock(): Promise<{ now: Date; fresh: boolean }> {
    const real = opts.clock.now();
    const realMs = real.getTime();
    // ponytail: per-instance metadata cache; another instance's reset takes at most 10 s to appear.
    // Cache the anchor, not the demo instant: time still advances on every request.
    if (cachedClock && realMs >= cachedClock.readAt && realMs < cachedClock.readAt + 10_000)
      return { now: demoNow(cachedClock.meta, real), fresh: false };
    const generation = clockGeneration;
    let meta = await opts.store.get<ClockMeta>(CLOCK_KEY);
    let fresh = false;
    if (!meta) {
      const first: ClockMeta = { at: DEMO_NOW, realAt: real.toISOString() };
      fresh = (await opts.store.compareAndSet(CLOCK_KEY, 0, first)) !== null;
      meta = await opts.store.get<ClockMeta>(CLOCK_KEY);
    }
    if (!meta) throw fail('STORAGE_UNAVAILABLE', 'El almacenamiento no está disponible.');
    if (generation === clockGeneration) cachedClock = { meta: meta.value, readAt: realMs };
    return { now: demoNow(meta.value, real), fresh };
  }

  const contextOf = (now: Date, actor: string | undefined): Ctx => ({
    store: opts.store,
    random: opts.random,
    real: opts.clock,
    now,
    storage: opts.storage,
    resetEnabled: opts.resetEnabled,
    actor,
    seed,
  });

  // The first request on an empty store leaves the demo invitation. Every request of this instance
  // waits for that same promise, so a burst of reads never sees the store half seeded; across
  // instances the clock CAS picks the seeder and the reservation CAS makes a repeat harmless.
  // ponytail: another instance does not wait for the seeder (it may read an empty list once).
  let ready: Promise<void> | undefined;
  const bootstrap = () =>
    (ready ??= (async () => {
      const { now, fresh } = await loadClock();
      if (fresh)
        await seedDemoInvitation(contextOf(now, undefined)).catch((e: unknown) => {
          if (!(e instanceof HttpError && e.code === 'INVITATION_DUPLICATE')) throw e;
        });
    })().catch((e: unknown) => {
      ready = undefined;
      throw e;
    }));

  // For the team wiring the robot: which store backs this deployment (memory is volatile).
  const tagged = (res: ApiResponse): ApiResponse => ({
    ...res,
    headers: { ...res.headers, 'X-Cerberus-Storage': opts.storage },
  });

  return async (req) => {
    try {
      // The browser demo is one user on their own storage: there is nothing to share or protect.
      if (opts.storage !== 'browser' && opts.rateLimit !== false)
        await rateLimit(opts.store, opts.clock.now().getTime(), req);
      const route = routes.find((r) => r.method === req.method && r.path.test(req.path));
      if (!route) throw fail('ROUTE_NOT_FOUND', 'Ruta no encontrada.');
      if (route.robot && opts.robotToken !== undefined) requireRobotToken(req, opts.robotToken);

      // The reset seeds its own demo invitation; every other request waits for the first seeding.
      if (!route.resets) await bootstrap();
      const { now } = await loadClock();
      const ctx = contextOf(now, req.headers['x-demo-actor']);

      const run = () =>
        route.handler(ctx, req, req.path.match(route.path)!).finally(() => {
          // Also invalidate after a partial reset that wrote the clock before failing to seed.
          if (route.resets) {
            clockGeneration++;
            cachedClock = undefined;
          }
        });
      return tagged(
        route.key ? await withIdempotency(ctx, req, route.key === 'required', run) : await run(),
      );
    } catch (e) {
      return tagged(toResponse(e));
    }
  };
}
