import { err, ok } from '@/shared/result';

test('ok y err construyen resultados discriminados', () => {
  expect(ok(1)).toEqual({ ok: true, value: 1 });
  expect(err('X')).toEqual({ ok: false, error: 'X' });
});
