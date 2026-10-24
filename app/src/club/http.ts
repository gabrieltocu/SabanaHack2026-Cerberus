// Club API (robot team contract): web-standard Request/Response, Spanish error envelope
// `{ error, detalle }`. Server-only: it needs secrets, so it never runs in the browser.

export class ClubError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detalle: string,
  ) {
    super(code);
  }
}

export const fail = (status: number, code: string, detalle: string) =>
  new ClubError(status, code, detalle);

export function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

/** Parses a JSON body (max 32 KB); multipart routes read the Request themselves. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 32 * 1024) {
    throw fail(413, 'cuerpo_muy_grande', 'El cuerpo de la petición es demasiado grande.');
  }
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw fail(400, 'json_invalido', 'El cuerpo no es un objeto JSON válido.');
}
