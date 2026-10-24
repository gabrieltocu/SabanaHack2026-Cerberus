// Los bloques JSON de docs/api/CONTRACT.md (peticiones y respuestas de la guía de integración) deben
// cumplir los esquemas Zod: así la guía no se separa del código.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { z } from 'zod';

import {
  AccessVerifyRequest,
  AccessVerifyResponse,
  Activity,
  AdvanceRequest,
  CloseRequest,
  DemoResetRequest,
  DemoResetResponse,
  ErrorResponse,
  Feedback,
  FeedbackRequest,
  Handoff,
  HandoffCancelRequest,
  HandoffContext,
  HandoffContextResult,
  HandoffCreate,
  HandoffResult,
  Health,
  Invitation,
  InvitationCreate,
  Pass,
  Person,
  Qr,
  RecognitionEventRequest,
  RecognitionEventResponse,
  RobotFailureRequest,
  RobotFailureResponse,
  Visit,
} from '@/infrastructure/contracts';

type Shape = [keys: string[], schema: z.ZodType];
// First match wins, so wrappers come before the objects they contain.
const SHAPES: Shape[] = [
  [['error'], ErrorResponse],
  [['status', 'contract', 'storage'], Health],
  [['status', 'clock', 'demoInvitation'], DemoResetResponse],
  [['robot', 'handoffs'], RobotFailureResponse],
  [['handoff', 'context'], HandoffContextResult],
  [['handoff', 'visit'], HandoffResult],
  [['decision', 'visit', 'invitation'], AccessVerifyResponse],
  [['decision', 'reason'], AccessVerifyResponse],
  [['visit', 'classification', 'matchedOpenVisit'], RecognitionEventResponse],
  [['source', 'face'], RecognitionEventRequest],
  [['guestFirstName', 'hostShortName', 'qr'], Pass],
  [['hostId', 'guest', 'qr'], Invitation],
  [['hostId', 'guest', 'date'], InvitationCreate],
  [['visitId', 'visitor', 'progress'], HandoffContext],
  [['visitId', 'createdAt'], Feedback],
  [['fromId', 'preferredToId', 'summary'], Handoff],
  [['visitId', 'reason'], HandoffCreate],
  [['id', 'state', 'ownerId', 'classification'], Visit],
  [['token', 'validFrom', 'usedAt'], Qr],
  [['displayName', 'roles'], Person],
  [['startsAt', 'endsAt'], Activity],
  [['event'], AdvanceRequest],
  [['code'], RobotFailureRequest],
  [['cancelReason'], HandoffCancelRequest],
  [['robotRating'], FeedbackRequest],
  [['clubRating'], FeedbackRequest],
  [['method'], CloseRequest],
  [['now'], DemoResetRequest],
  [['token'], AccessVerifyRequest],
];

const keysOf = (v: unknown) => Object.keys(v as object);
const shapeOf = (v: unknown) =>
  SHAPES.find(([keys]) => keys.every((k) => keysOf(v).includes(k)))?.[1];

/** Validates the object by shape, or looks for known shapes inside it (lists, wrappers). */
function check(value: unknown, where: string, found: string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => check(v, `${where}[${i}]`, found));
  if (!value || typeof value !== 'object') return [];
  const schema = shapeOf(value);
  if (schema) {
    found.push(where);
    const r = schema.safeParse(value);
    return r.success
      ? []
      : [
          `${where}: ${JSON.stringify(r.error.issues.slice(0, 2).map((i) => `${i.path.join('.')}: ${i.message}`))}`,
        ];
  }
  return Object.entries(value).flatMap(([k, v]) => check(v, `${where}.${k}`, found));
}

const doc = readFileSync(join(process.cwd(), 'docs/api/CONTRACT.md'), 'utf8');
const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m, i) => ({
  n: i + 1,
  value: JSON.parse(m[1]!) as unknown,
}));

test('la guía trae bloques JSON y reconocemos la mayoría', () => {
  const found: string[] = [];
  for (const b of blocks) check(b.value, `bloque ${b.n}`, found);
  expect(blocks.length).toBeGreaterThan(40);
  expect(found.length).toBeGreaterThan(40);
});

test('cada bloque JSON reconocido cumple su esquema', () => {
  const problems = blocks.flatMap((b) => check(b.value, `bloque ${b.n}`, []));
  expect(problems).toEqual([]);
});
