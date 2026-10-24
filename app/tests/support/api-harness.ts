// Arnés de las pruebas de la API: ejecuta `createApp` con almacén en memoria (o el que se pase),
// reloj fijo y aleatoriedad determinista, y valida CADA respuesta contra su esquema Zod del contrato.
import type { z } from 'zod';

import { createApp } from '@/api/app';
import type { ApiHandler } from '@/api/http';
import { fixedClock } from '@/domain/clock';
import type { Clock } from '@/domain/entities/types';
import {
  AccessVerifyResponse,
  ActivityList,
  DemoResetResponse,
  ErrorResponse,
  Feedback,
  HandoffContextResult,
  HandoffList,
  HandoffResult,
  Health,
  Invitation,
  InvitationList,
  Pass,
  Person,
  PersonList,
  RecognitionEventResponse,
  RobotFailureResponse,
  Visit,
  VisitList,
} from '@/infrastructure/contracts';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import type { KeyValueStore } from '@/infrastructure/stores/types';

export const T_DEMO = '2026-10-24T09:00:00-05:00';

/** Aleatoriedad determinista y sin repetidos (LCG): suficiente para ids y tokens de prueba. */
export function seededRandom(seed = 1): (bytes: number) => Uint8Array {
  let s = seed;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      out[i] = (s >>> 16) & 255;
    }
    return out;
  };
}

const R = (re: string): RegExp => new RegExp(`^${re.replace(/:id/g, '[^/]+')}$`);
const SCHEMAS: { method: string; path: RegExp; ok: Record<number, z.ZodType> }[] = [
  { method: 'GET', path: R('/health'), ok: { 200: Health } },
  { method: 'POST', path: R('/demo/reset'), ok: { 200: DemoResetResponse } },
  { method: 'GET', path: R('/people'), ok: { 200: PersonList } },
  { method: 'GET', path: R('/people/:id'), ok: { 200: Person } },
  { method: 'GET', path: R('/activities'), ok: { 200: ActivityList } },
  { method: 'POST', path: R('/invitations'), ok: { 201: Invitation } },
  { method: 'GET', path: R('/invitations'), ok: { 200: InvitationList } },
  { method: 'GET', path: R('/invitations/:id'), ok: { 200: Invitation } },
  { method: 'POST', path: R('/invitations/:id/cancel'), ok: { 200: Invitation } },
  { method: 'GET', path: R('/passes/:id'), ok: { 200: Pass } },
  { method: 'POST', path: R('/access/verify'), ok: { 200: AccessVerifyResponse } },
  {
    method: 'POST',
    path: R('/recognition/events'),
    ok: { 200: RecognitionEventResponse, 201: RecognitionEventResponse },
  },
  { method: 'GET', path: R('/visits'), ok: { 200: VisitList } },
  { method: 'GET', path: R('/visits/:id'), ok: { 200: Visit } },
  { method: 'POST', path: R('/visits/:id/advance'), ok: { 200: Visit } },
  { method: 'POST', path: R('/visits/:id/close'), ok: { 200: Visit } },
  { method: 'POST', path: R('/visits/:id/feedback'), ok: { 201: Feedback } },
  { method: 'POST', path: R('/handoffs'), ok: { 201: HandoffResult } },
  { method: 'GET', path: R('/handoffs'), ok: { 200: HandoffList } },
  { method: 'POST', path: R('/handoffs/:id/accept'), ok: { 200: HandoffResult } },
  { method: 'POST', path: R('/handoffs/:id/context'), ok: { 200: HandoffContextResult } },
  { method: 'POST', path: R('/handoffs/:id/confirm'), ok: { 200: HandoffResult } },
  { method: 'POST', path: R('/handoffs/:id/cancel'), ok: { 200: HandoffResult } },
  { method: 'POST', path: R('/robots/:id/failure'), ok: { 200: RobotFailureResponse } },
];

export interface CallOptions {
  body?: unknown;
  actor?: string;
  /** `Idempotency-Key`: texto fijo, o `false` para no enviarla. Por defecto, una clave nueva en cada POST. */
  key?: string | false;
  ip?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface Reply {
  status: number;
  body: any;
  headers: Record<string, string>;
}

export interface Harness {
  app: ApiHandler;
  store: KeyValueStore;
  call(method: 'GET' | 'POST', path: string, o?: CallOptions): Promise<Reply>;
}

export function setup(
  o: {
    store?: KeyValueStore;
    now?: string;
    /** Reloj de pared propio (para avanzar el tiempo); sustituye a `now`. */
    clock?: Clock;
    resetEnabled?: boolean;
    validate?: boolean;
  } = {},
): Harness {
  const store = o.store ?? createMemoryStore();
  const app = createApp({
    store,
    clock: o.clock ?? fixedClock(o.now ?? T_DEMO),
    random: seededRandom(),
    storage: 'memory',
    resetEnabled: o.resetEnabled ?? true,
  });
  let n = 0;
  let calls = 0;
  return {
    app,
    store,
    async call(method, path, c = {}) {
      const headers: Record<string, string> = { ...c.headers };
      if (c.actor) headers['x-demo-actor'] = c.actor;
      if (c.body !== undefined) headers['content-type'] = 'application/json';
      if (method === 'POST' && c.key !== false)
        headers['idempotency-key'] = c.key ?? `k-test-${++n}`;
      const res = await app({
        method,
        path,
        query: c.query ?? {},
        headers,
        body: c.body,
        // A new client every 20 calls keeps long tests under the per-client rate limit.
        ip: c.ip ?? `10.0.${Math.floor(calls++ / 20)}.1`,
      });
      const reply: Reply = { status: res.status, body: res.body, headers: res.headers ?? {} };
      if (o.validate !== false) validate(method, path, reply);
      return reply;
    },
  };
}

/** Every real response must satisfy the contract schema of its route (drift detector). */
function validate(method: string, path: string, reply: Reply) {
  const schema =
    reply.status >= 400
      ? ErrorResponse
      : SCHEMAS.find((s) => s.method === method && s.path.test(path))?.ok[reply.status];
  if (!schema) throw new Error(`Sin esquema de contrato para ${method} ${path} -> ${reply.status}`);
  const parsed = schema.safeParse(reply.body);
  if (!parsed.success) {
    throw new Error(
      `${method} ${path} -> ${reply.status} no cumple el contrato: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`,
    );
  }
}
