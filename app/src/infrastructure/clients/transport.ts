// Un transporte lleva una petición del contrato hasta la API (HTTP real o manejador local).
// Puede lanzar `ApiError` con `status` 0 (`NETWORK_ERROR`, `TIMEOUT`); cualquier respuesta HTTP,
// incluidas las de error, se devuelve tal cual para que el cliente la valide.

export interface TransportRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Ruta bajo `/api/v1`, con la cadena de consulta si la hay (`/visits?state=CLOSED`). */
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface TransportResponse {
  status: number;
  body: unknown;
  /** Cabeceras en minúscula (`retry-after`, `idempotency-replayed`). */
  headers?: Record<string, string>;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;
