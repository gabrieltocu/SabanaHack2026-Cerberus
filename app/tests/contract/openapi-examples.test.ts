// Cada ejemplo de docs/api/openapi.yaml debe cumplir el esquema Zod de su operación.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { z } from 'zod';

import {
  Category,
  DenialReason,
  Evidence,
  Handoff,
  HandoffCancelReason,
  HandoffContext,
  HandoffReason,
  HandoffState,
  HandoffSummary,
  InvitationState,
  PassState,
  ManualReviewReason,
  PersonRole,
  Qr,
  RecognitionRecord,
  VisitState,
  VisitorSummary,
  AccessVerifyRequest,
  AccessVerifyResponse,
  AdvanceRequest,
  CloseRequest,
  DemoResetRequest,
  ErrorResponse,
  Feedback,
  FeedbackRequest,
  HandoffCancelRequest,
  HandoffContextResult,
  HandoffCreate,
  HandoffList,
  HandoffResult,
  Health,
  InvitationCreate,
  Person,
  PersonList,
  RecognitionEventRequest,
  RecognitionEventResponse,
  RobotFailureRequest,
  RobotFailureResponse,
  Visit,
  VisitList,
  ActivityList,
  Invitation,
  InvitationList,
  Pass,
  DemoResetResponse,
} from '@/infrastructure/contracts';
import { loadOpenApi } from './openapi';

const spec = loadOpenApi();

// operationId -> esquema del cuerpo de la petición y de la respuesta por estado HTTP.
const OPERATIONS: Record<string, { request?: z.ZodType; responses?: Record<string, z.ZodType> }> = {
  getHealth: { responses: { '200': Health } },
  resetDemo: { request: DemoResetRequest, responses: { '200': DemoResetResponse } },
  listPeople: { responses: { '200': PersonList } },
  getPerson: { responses: { '200': Person } },
  listActivities: { responses: { '200': ActivityList } },
  createInvitation: { request: InvitationCreate, responses: { '201': Invitation } },
  listInvitations: { responses: { '200': InvitationList } },
  getInvitation: { responses: { '200': Invitation } },
  cancelInvitation: { responses: { '200': Invitation } },
  getPass: { responses: { '200': Pass } },
  verifyAccess: { request: AccessVerifyRequest, responses: { '200': AccessVerifyResponse } },
  createRecognitionEvent: {
    request: RecognitionEventRequest,
    responses: { '200': RecognitionEventResponse, '201': RecognitionEventResponse },
  },
  listVisits: { responses: { '200': VisitList } },
  getVisit: { responses: { '200': Visit } },
  advanceVisit: { request: AdvanceRequest, responses: { '200': Visit } },
  closeVisit: { request: CloseRequest, responses: { '200': Visit } },
  submitFeedback: { request: FeedbackRequest, responses: { '201': Feedback } },
  createHandoff: { request: HandoffCreate, responses: { '201': HandoffResult } },
  listHandoffs: { responses: { '200': HandoffList } },
  acceptHandoff: { responses: { '200': HandoffResult } },
  transferHandoffContext: { responses: { '200': HandoffContextResult } },
  confirmHandoff: { responses: { '200': HandoffResult } },
  cancelHandoff: { request: HandoffCancelRequest, responses: { '200': HandoffResult } },
  reportRobotFailure: { request: RobotFailureRequest, responses: { '200': RobotFailureResponse } },
};

interface Media {
  example?: unknown;
  examples?: Record<string, { value: unknown }>;
}
const examplesOf = (media: Media | undefined): unknown[] =>
  media
    ? [
        ...(media.example !== undefined ? [media.example] : []),
        ...Object.values(media.examples ?? {}).map((e) => e.value),
      ]
    : [];
const json = (c: unknown) =>
  (c as { 'application/json'?: Media } | undefined)?.['application/json'];

describe('operaciones de openapi.yaml', () => {
  const ops = Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item as Record<string, { operationId?: string }>)
      .filter(([, op]) => op.operationId)
      .map(([method, op]) => ({
        path,
        method,
        op: op as Record<string, unknown> & { operationId: string },
      })),
  );

  test('todas las operaciones tienen esquemas registrados en la prueba', () => {
    expect(ops.map((o) => o.op.operationId).sort()).toEqual(Object.keys(OPERATIONS).sort());
    expect(ops).toHaveLength(24);
  });

  test.each(ops.map((o) => [o.op.operationId, o] as const))(
    '%s: ejemplos válidos',
    (id, { op }) => {
      const schemas = OPERATIONS[id]!;
      const body = (op.requestBody as { content?: unknown } | undefined)?.content;
      for (const ex of examplesOf(json(body))) {
        expect(schemas.request!.safeParse(ex)).toMatchObject({ success: true });
      }
      const responses = op.responses as Record<string, { content?: unknown }>;
      for (const [status, res] of Object.entries(responses)) {
        for (const ex of examplesOf(json(res.content))) {
          const schema = Number(status) >= 400 ? ErrorResponse : schemas.responses?.[status];
          if (!schema) throw new Error(`${id} ${status}: falta el esquema en la prueba`);
          expect(schema.safeParse(ex)).toMatchObject({ success: true });
        }
      }
    },
  );

  test('los ejemplos de respuestas reutilizables cumplen ErrorResponse', () => {
    const responses = (spec.components as { responses: Record<string, { content?: unknown }> })
      .responses;
    for (const res of Object.values(responses)) {
      for (const ex of examplesOf(json(res.content))) {
        expect(ErrorResponse.safeParse(ex).success).toBe(true);
      }
    }
  });
});

test('los códigos de error del contrato coinciden con el esquema ErrorCode', () => {
  const schemas = (spec.components as { schemas: Record<string, { enum?: string[] }> }).schemas;
  const doc = readFileSync(join(process.cwd(), 'docs/api/CONTRACT.md'), 'utf8');
  // Catálogo de la sección 2: filas `| 409 | `A`, `B` | ...`.
  const catalog = doc
    .split('\n')
    .filter((l) => /^\| [45]\d\d /.test(l))
    .flatMap((l) => [...(l.split('|')[2] ?? '').matchAll(/`([A-Z_]+)`/g)].map((m) => m[1]));
  const zod = ErrorResponse.shape.error.shape.code.options as string[];
  expect(new Set(schemas.ErrorCode!.enum)).toEqual(new Set(zod));
  expect(new Set(catalog)).toEqual(new Set(zod));
});

describe('los esquemas de openapi.yaml coinciden con los de Zod', () => {
  const schemas = (
    spec.components as {
      schemas: Record<string, { enum?: string[]; required?: string[]; properties?: object }>;
    }
  ).schemas;

  test.each([
    ['Category', Category],
    ['PersonRole', PersonRole],
    ['InvitationState', InvitationState],
    ['PassState', PassState],
    ['VisitState', VisitState],
    ['HandoffState', HandoffState],
    ['HandoffReason', HandoffReason],
    ['HandoffCancelReason', HandoffCancelReason],
    ['ManualReviewReason', ManualReviewReason],
    ['DenialReason', DenialReason],
    ['Evidence', Evidence],
  ] as const)('enumeración %s', (name, zod) => {
    expect([...schemas[name]!.enum!].sort()).toEqual([...zod.options].sort());
  });

  test.each([
    ['Visit', Visit],
    ['Handoff', Handoff],
    ['Invitation', Invitation],
    ['Qr', Qr],
    ['Pass', Pass],
    ['HandoffSummary', HandoffSummary],
    ['RecognitionRecord', RecognitionRecord],
    ['VisitorSummary', VisitorSummary],
    ['HandoffContext', HandoffContext],
  ] as const)('campos obligatorios de %s', (name, zod) => {
    const required = Object.entries(zod.shape as Record<string, z.ZodType>)
      .filter(([, field]) => !field.isOptional())
      .map(([key]) => key)
      .sort();
    expect([...schemas[name]!.required!].sort()).toEqual(required);
    expect(Object.keys(schemas[name]!.properties!).sort()).toEqual(Object.keys(zod.shape).sort());
  });
});
