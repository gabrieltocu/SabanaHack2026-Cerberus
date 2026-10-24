import { ok } from '@/shared/result';

test('la configuración de integración resuelve alias', () => {
  expect(ok('listo').ok).toBe(true);
});
