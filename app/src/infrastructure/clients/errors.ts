import type { ErrorCode } from '../contracts/common';

/** Códigos del contrato más los que solo existen en el cliente (red, tiempo, respuesta rota). */
export type ClientErrorCode = ErrorCode | 'MALFORMED_RESPONSE' | 'NETWORK_ERROR' | 'TIMEOUT';

/** Error estable para la UI: `status` 0 significa que no hubo respuesta HTTP. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
