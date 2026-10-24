// openapi.yaml y el enrutador describen la misma API: cada operación documentada existe en el
// enrutador, cada ruta del enrutador está documentada, la cabecera Idempotency-Key declarada coincide
// con la que la ruta exige o acepta, y los códigos de error que usan las pruebas están declarados.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ROUTES } from '@/api/app';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { loadOpenApi } from './openapi';

const spec = loadOpenApi();
const routes = ROUTES({
  store: createMemoryStore(),
  clock: { now: () => new Date() },
  random: () => new Uint8Array(),
  storage: 'memory',
  resetEnabled: true,
});

interface Operation {
  method: string;
  path: string;
  id: string;
  parameters: { $ref?: string }[];
}
const operations: Operation[] = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item as Record<string, { operationId?: string; parameters?: { $ref?: string }[] }>)
    .filter(([, op]) => op.operationId)
    .map(([method, op]) => ({
      method: method.toUpperCase(),
      path,
      id: op.operationId!,
      parameters: op.parameters ?? [],
    })),
);

/** `/visits/{id}/close` -> `/visits/x/close`, la forma que casa con la expresión de la ruta. */
const concrete = (path: string) => path.replace(/\{[^}]+\}/g, 'x');
const find = (method: string, path: string) =>
  routes.find((r) => r.method === method && r.path.test(path));

describe('openapi.yaml y el enrutador', () => {
  test.each(operations.map((o) => [`${o.method} ${o.path}`, o] as const))(
    '%s existe en el enrutador y declara la misma Idempotency-Key',
    (_name, o) => {
      const route = find(o.method, concrete(o.path));
      expect(route).toBeDefined();
      const declared = o.parameters
        .map((p) => p.$ref?.split('/').pop())
        .filter((n) => n?.startsWith('IdempotencyKey'));
      const expected = route!.key
        ? [route!.key === 'required' ? 'IdempotencyKeyRequired' : 'IdempotencyKeyOptional']
        : [];
      expect(declared).toEqual(expected);
    },
  );

  test('cada ruta del enrutador está documentada en openapi.yaml', () => {
    const documented = new Set(operations.map((o) => `${o.method} ${concrete(o.path)}`));
    const missing = routes.filter((r) => {
      return !operations.some((o) => o.method === r.method && r.path.test(concrete(o.path)));
    });
    expect(missing.map((r) => `${r.method} ${r.path}`)).toEqual([]);
    expect(documented.size).toBe(routes.length);
  });
});

/** Todos los archivos .ts/.tsx bajo `dir`. */
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });

test('los códigos de error que usan las pruebas están declarados en openapi.yaml', () => {
  const declared = new Set(
    (spec.components as { schemas: { ErrorCode: { enum: string[] } } }).schemas.ErrorCode.enum,
  );
  // Formas con las que las pruebas nombran un código de error de la API.
  const forms = [
    /\[[45]\d\d, '([A-Z][A-Z_]+)'\]/g,
    /error\??\.code\)?\.toBe\('([A-Z][A-Z_]+)'\)/g,
    /error: \{ code: '([A-Z][A-Z_]+)'/g,
  ];
  const used = new Set<string>();
  for (const file of [
    ...sources(join(process.cwd(), 'tests/unit')),
    ...sources(join(process.cwd(), 'tests/e2e')),
  ]) {
    const text = readFileSync(file, 'utf8');
    for (const re of forms) for (const m of text.matchAll(re)) used.add(m[1]!);
  }
  expect(used.size).toBeGreaterThan(20);
  // Los códigos propios del cliente (red, tiempo) no son de la API.
  const clientOnly = new Set(['NETWORK_ERROR', 'TIMEOUT', 'MALFORMED_RESPONSE']);
  expect([...used].filter((c) => !declared.has(c) && !clientOnly.has(c))).toEqual([]);
});
