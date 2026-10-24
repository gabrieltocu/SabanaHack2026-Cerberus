/** @jest-environment node */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeSqliteStores, createSqliteStore } from '@/infrastructure/stores/sqlite-store';
import { runStoreContract } from './store-contract';

const dirs: string[] = [];
const tmpFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'nclub-sqlite-'));
  dirs.push(dir);
  return join(dir, 'kv.db');
};

afterEach(() => closeSqliteStores());
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

runStoreContract('sqlite', (clock) => createSqliteStore(tmpFile(), clock.now));

test('los datos sobreviven al cerrar y reabrir el archivo', async () => {
  const file = tmpFile();
  const a = createSqliteStore(file);
  await a.compareAndSet('k', 0, { n: 1 });
  await a.compareAndSet('k', 1, { n: 2 });
  closeSqliteStores();
  const b = createSqliteStore(file);
  expect(await b.get('k')).toEqual({ value: { n: 2 }, version: 2 });
});

test('la misma ruta comparte una sola conexión', async () => {
  const file = tmpFile();
  const a = createSqliteStore(file);
  const b = createSqliteStore(file);
  await a.compareAndSet('k', 0, 1);
  expect((await b.get('k'))?.value).toBe(1);
});
