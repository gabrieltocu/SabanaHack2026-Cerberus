// Lector de docs/api/openapi.yaml para las pruebas de contrato.
// ponytail: js-yaml llega como dependencia transitiva (eslint/jest); pedir `js-yaml` en devDependencies.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml') as { load(text: string): unknown };

export interface OpenApi {
  paths: Record<string, unknown>;
  components: Record<string, unknown>;
}

export function loadOpenApi(): OpenApi {
  return yaml.load(readFileSync(join(process.cwd(), 'docs/api/openapi.yaml'), 'utf8')) as OpenApi;
}
