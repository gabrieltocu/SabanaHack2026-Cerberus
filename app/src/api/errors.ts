// Stable API errors: `code` is part of the public contract (docs/api/CONTRACT.md §2).
import type { z } from 'zod';

import type { ErrorCode } from '../infrastructure/contracts/common';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Contract status for every error code a use case raises. */
const STATUS: Partial<Record<ErrorCode, number>> = {
  BAD_REQUEST: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  UNAUTHENTICATED: 401,
  ACTOR_NOT_ALLOWED: 403,
  HOST_NOT_ELIGIBLE: 403,
  RESET_DISABLED: 403,
  ROUTE_NOT_FOUND: 404,
  PERSON_NOT_FOUND: 404,
  INVITATION_NOT_FOUND: 404,
  PASS_NOT_FOUND: 404,
  VISIT_NOT_FOUND: 404,
  HANDOFF_NOT_FOUND: 404,
  ROBOT_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  VERSION_CONFLICT: 409,
  INVITATION_DUPLICATE: 409,
  INVITATION_DAILY_LIMIT: 409,
  INVITATION_NOT_ACTIVE: 409,
  HANDOFF_ALREADY_OPEN: 409,
  HANDOFF_ALREADY_ACCEPTED: 409,
  HANDOFF_EXPIRED: 409,
  RECEIVER_BUSY: 409,
  ASSIGNEE_BUSY: 409,
  FEEDBACK_ALREADY_SUBMITTED: 409,
  VALIDATION_ERROR: 422,
  INVITATION_DATE_IN_PAST: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
  VISITOR_ACCEPTANCE_REQUIRED: 422,
  ESCORT_NOT_ALLOWED: 422,
  REVIEW_NOT_CONFIRMABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  STORAGE_UNAVAILABLE: 500,
};

export function fail(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): HttpError {
  return new HttpError(STATUS[code] ?? 500, code, message, details);
}

/** Parses with a contract schema; a failure is a 422 whose `details.fields` names each bad field. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues)
    fields[issue.path.join('.') || '(cuerpo)'] ??= issue.message;
  throw fail('VALIDATION_ERROR', 'El cuerpo o los parámetros no cumplen el contrato.', { fields });
}
