// Cliente tipado del contrato v1: un método por operación de docs/api/openapi.yaml.
// Valida cada respuesta con su esquema Zod y traduce cualquier fallo a `ApiError`.
import { z } from 'zod';

import { secureRandom } from '../../shared/random';
import {
  AccessVerifyResponse,
  ActivityList,
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
  DemoResetResponse,
  type AccessVerifyRequest,
  type ActivitiesQuery,
  type AdvanceRequest,
  type CloseRequest,
  type DemoResetRequest,
  type FeedbackRequest,
  type HandoffCancelRequest,
  type HandoffCreate,
  type HandoffsQuery,
  type InvitationCreate,
  type InvitationsQuery,
  type PeopleQuery,
  type RecognitionEventRequest,
  type RobotFailureRequest,
  type VisitsQuery,
} from '../contracts';
import { ApiError } from './errors';
import type { Transport } from './transport';

export interface CallOptions {
  /** Sustituye al actor del cliente (`X-Demo-Actor`) solo en esta llamada. */
  actor?: string;
  /** Reutilizar la misma clave al reintentar a mano tras un `TIMEOUT` o `NETWORK_ERROR`. */
  idempotencyKey?: string;
}

/** Cuerpo de error tolerante: un código desconocido (contrato ampliado) no rompe al cliente. */
const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** Clave de 8 a 128 caracteres exigida por el contrato (128 bits aleatorios en hexadecimal). */
export function newIdempotencyKey(random: (bytes: number) => Uint8Array = secureRandom): string {
  return `cb-${Array.from(random(16), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const qs = (params: Record<string, string | number | undefined> = {}) => {
  const q = Object.entries(params)
    .filter((e): e is [string, string | number] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
};
const seg = encodeURIComponent;

export function createCerberusClient(
  transport: Transport,
  actor?: string,
  random: (bytes: number) => Uint8Array = secureRandom,
) {
  async function call<S extends z.ZodType>(
    schema: S,
    method: 'GET' | 'POST',
    path: string,
    o: { body?: unknown; opts?: CallOptions; idempotent?: boolean } = {},
  ): Promise<z.output<S>> {
    const headers: Record<string, string> = {};
    const who = o.opts?.actor ?? actor;
    if (who) headers['x-demo-actor'] = who;
    if (o.idempotent)
      headers['idempotency-key'] = o.opts?.idempotencyKey ?? newIdempotencyKey(random);

    let res;
    try {
      res = await transport({ method, path, body: o.body, headers });
    } catch (e) {
      throw e instanceof ApiError ? e : new ApiError(0, 'NETWORK_ERROR', 'Fallo de transporte.');
    }

    if (res.status >= 200 && res.status < 300) {
      const parsed = schema.safeParse(res.body);
      if (parsed.success) return parsed.data;
      throw new ApiError(res.status, 'MALFORMED_RESPONSE', 'La respuesta no cumple el contrato.', {
        issues: parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
      });
    }
    const failure = ErrorEnvelope.safeParse(res.body);
    if (!failure.success) {
      throw new ApiError(res.status, 'MALFORMED_RESPONSE', 'Error sin el formato del contrato.');
    }
    const { code, message, details } = failure.data.error;
    const retryAfter = res.headers?.['retry-after'];
    throw new ApiError(res.status, code as ApiError['code'], message, {
      ...details,
      ...(retryAfter ? { retryAfter: Number(retryAfter) } : {}),
    });
  }

  const get = <S extends z.ZodType>(schema: S, path: string) => call(schema, 'GET', path);
  const post = <S extends z.ZodType>(
    schema: S,
    path: string,
    body?: unknown,
    opts?: CallOptions,
    idempotent = false,
  ) => call(schema, 'POST', path, { body, opts, idempotent });

  return {
    // Sistema
    getHealth: () => get(Health, '/health'),
    resetDemo: (body?: DemoResetRequest, opts?: CallOptions) =>
      post(DemoResetResponse, '/demo/reset', body, opts),

    // Directorio
    listPeople: (query: PeopleQuery = {}) => get(PersonList, `/people${qs(query)}`),
    getPerson: (id: string) => get(Person, `/people/${seg(id)}`),
    listActivities: (query: ActivitiesQuery = {}) => get(ActivityList, `/activities${qs(query)}`),

    // Invitaciones
    createInvitation: (body: InvitationCreate, opts?: CallOptions) =>
      post(Invitation, '/invitations', body, opts, true),
    listInvitations: (query: InvitationsQuery) => get(InvitationList, `/invitations${qs(query)}`),
    getInvitation: (id: string) => get(Invitation, `/invitations/${seg(id)}`),
    cancelInvitation: (id: string, opts?: CallOptions) =>
      post(Invitation, `/invitations/${seg(id)}/cancel`, undefined, opts),
    /** Pase del invitado: sin actor, el token es la credencial. */
    getPass: (token: string) => get(Pass, `/passes/${seg(token)}`),

    // Acceso
    verifyAccess: (body: AccessVerifyRequest, opts?: CallOptions) =>
      post(AccessVerifyResponse, '/access/verify', body, opts, true),
    createRecognitionEvent: (body: RecognitionEventRequest, opts?: CallOptions) =>
      post(RecognitionEventResponse, '/recognition/events', body, opts, true),

    // Visitas
    listVisits: (query: VisitsQuery = {}) => get(VisitList, `/visits${qs(query)}`),
    getVisit: (id: string) => get(Visit, `/visits/${seg(id)}`),
    advanceVisit: (id: string, body: AdvanceRequest, opts?: CallOptions) =>
      post(Visit, `/visits/${seg(id)}/advance`, body, opts),
    closeVisit: (id: string, body?: CloseRequest, opts?: CallOptions) =>
      post(Visit, `/visits/${seg(id)}/close`, body, opts),
    submitFeedback: (id: string, body: FeedbackRequest, opts?: CallOptions) =>
      post(Feedback, `/visits/${seg(id)}/feedback`, body, opts),

    // Relevos
    createHandoff: (body: HandoffCreate, opts?: CallOptions) =>
      post(HandoffResult, '/handoffs', body, opts, true),
    listHandoffs: (query: HandoffsQuery = {}) => get(HandoffList, `/handoffs${qs(query)}`),
    acceptHandoff: (id: string, opts?: CallOptions) =>
      post(HandoffResult, `/handoffs/${seg(id)}/accept`, undefined, opts),
    transferHandoffContext: (id: string, opts?: CallOptions) =>
      post(HandoffContextResult, `/handoffs/${seg(id)}/context`, undefined, opts),
    confirmHandoff: (id: string, opts?: CallOptions) =>
      post(HandoffResult, `/handoffs/${seg(id)}/confirm`, undefined, opts),
    cancelHandoff: (id: string, body?: HandoffCancelRequest, opts?: CallOptions) =>
      post(HandoffResult, `/handoffs/${seg(id)}/cancel`, body, opts),

    // Robots
    reportRobotFailure: (robotId: string, body: RobotFailureRequest, opts?: CallOptions) =>
      post(RobotFailureResponse, `/robots/${seg(robotId)}/failure`, body, opts, true),
  };
}

export type CerberusClient = ReturnType<typeof createCerberusClient>;
