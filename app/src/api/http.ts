// Framework-agnostic HTTP shapes shared by the Vercel function, the local server and the in-browser demo.
// Server-side modules use relative imports: Vercel compiles api/ without tsconfig path aliases.

export interface ApiRequest {
  method: string;
  /** Path below `/api/v1`, always starting with `/` (e.g. `/visits/v-1`). */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  /** Client address used for rate limiting; `local` in the browser demo. */
  ip: string;
}

export interface ApiResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

export type ApiHandler = (req: ApiRequest) => Promise<ApiResponse>;

export const API_PREFIX = '/api/v1';
const MAX_BODY_BYTES = 32 * 1024;

export function errorBody(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

/** Adapts an ApiHandler to the web-standard `Request → Response` signature. */
export function toFetchHandler(handle: ApiHandler) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    // Vercel rewrites `/api/v1/:path*` to `/api/router?__path=:path*`; only that entry honors `__path`.
    const viaRouter = url.pathname === '/api/router';
    const raw = viaRouter
      ? `/${url.searchParams.get('__path') ?? ''}`
      : url.pathname.replace(API_PREFIX, '');
    if (viaRouter) url.searchParams.delete('__path');
    const path = raw.replace(/\/+$/, '') || '/';

    let body: unknown = undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return tooLarge();
      const text = await request.text();
      if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return tooLarge();
      if (text) {
        // Requiring JSON forces a CORS preflight on cross-site writes (no "simple" text/plain posts).
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
          return json({
            status: 415,
            body: errorBody('UNSUPPORTED_MEDIA_TYPE', 'Se requiere Content-Type: application/json'),
          });
        }
        try {
          body = JSON.parse(text);
        } catch {
          return json({ status: 400, body: errorBody('BAD_REQUEST', 'JSON inválido') });
        }
      }
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    // On Vercel these headers are set by the platform; behind other proxies they are spoofable.
    const ip = (
      headers['x-vercel-forwarded-for'] ||
      headers['x-real-ip'] ||
      headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      'unknown'
    ).slice(0, 64);

    try {
      return json(
        await handle({
          method: request.method.toUpperCase(),
          path,
          query: Object.fromEntries(url.searchParams),
          headers,
          body,
          ip,
        }),
      );
    } catch (e) {
      // Never leak stack traces or internals to clients; log only the error class.
      console.error('api_error', e instanceof Error ? e.name : typeof e);
      return json({ status: 500, body: errorBody('INTERNAL_ERROR', 'Error interno') });
    }
  };
}

const tooLarge = () =>
  json({ status: 413, body: errorBody('PAYLOAD_TOO_LARGE', 'Cuerpo demasiado grande') });

function json(res: ApiResponse): Response {
  return new Response(res.status === 204 ? null : JSON.stringify(res.body), {
    status: res.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...res.headers,
    },
  });
}
