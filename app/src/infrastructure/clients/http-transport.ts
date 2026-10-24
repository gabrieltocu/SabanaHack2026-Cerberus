import { ApiError } from './errors';
import type { Transport, TransportRequest, TransportResponse } from './transport';

export interface HttpTransportOptions {
  /** Por defecto `/api/v1` (mismo origen). */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Esperas entre reintentos; su longitud es el máximo de reintentos. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRY_DELAYS_MS = [300, 900];

const hasIdempotencyKey = (headers: Record<string, string> = {}) =>
  Object.keys(headers).some((h) => h.toLowerCase() === 'idempotency-key');

/**
 * `fetch` con tiempo máximo y reintento acotado. Solo se reintenta lo que es seguro repetir:
 * los GET y las escrituras con `Idempotency-Key` (el servidor repite la respuesta guardada).
 * Se reintenta ante fallo de red, tiempo agotado o 5xx; nunca ante 4xx.
 */
export function createHttpTransport(opts: HttpTransportOptions = {}): Transport {
  const base = (opts.baseUrl ?? '/api/v1').replace(/\/+$/, '');
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function once(req: TransportRequest): Promise<TransportResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const hasBody = req.body !== undefined;
      const res = await doFetch(base + req.path, {
        method: req.method,
        headers: {
          accept: 'application/json',
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
          ...req.headers,
        },
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = undefined;
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { status: res.status, body, headers };
    } catch {
      throw timedOut
        ? new ApiError(0, 'TIMEOUT', 'La API no respondió a tiempo.')
        : new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con la API.');
    } finally {
      clearTimeout(timer);
    }
  }

  return async (req) => {
    const retryable = req.method === 'GET' || hasIdempotencyKey(req.headers);
    for (let attempt = 0; ; attempt++) {
      const last = !retryable || attempt >= delays.length;
      try {
        const res = await once(req);
        if (res.status < 500 || last) return res;
      } catch (e) {
        if (last) throw e;
      }
      await sleep(delays[attempt] as number);
    }
  };
}
