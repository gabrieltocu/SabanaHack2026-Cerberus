import { act, renderHook, waitFor } from '@testing-library/react-native';

import { clientFor, errorCode, useApi } from '@/features/data/api';
import { ApiError } from '@/infrastructure/clients/errors';

test('useApi carga, expone errores estables y refresca bajo demanda', async () => {
  let n = 0;
  const load = jest.fn(async () => {
    n += 1;
    if (n === 2) throw new ApiError(409, 'VERSION_CONFLICT', 'x');
    return n;
  });
  const { result } = await renderHook(() => useApi(load, []));
  await waitFor(() => expect(result.current.data).toBe(1));
  await act(() => result.current.refresh());
  expect(result.current).toMatchObject({ data: 1, error: 'VERSION_CONFLICT', loading: false });
  await act(() => result.current.refresh());
  expect(result.current).toMatchObject({ data: 3, error: undefined });
});

test('useApi sondea cuando se pide y deja de hacerlo al desmontar', async () => {
  jest.useFakeTimers();
  const load = jest.fn(async () => 'ok');
  const { unmount } = await renderHook(() => useApi(load, [], { pollMs: 1000 }));
  await act(async () => {
    jest.advanceTimersByTime(3100);
  });
  expect(load.mock.calls.length).toBeGreaterThanOrEqual(4);
  await unmount();
  const calls = load.mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(load.mock.calls.length).toBe(calls);
  jest.useRealTimers();
});

test('errorCode normaliza errores desconocidos y el cliente demo responde health', async () => {
  expect(errorCode(new Error('x'))).toBe('NETWORK_ERROR');
  const health = await clientFor('R1').getHealth();
  expect(health.status).toBe('ok');
});

test('useApi pausa el sondeo tras RATE_LIMITED y descarta respuestas viejas', async () => {
  jest.useFakeTimers();
  let calls = 0;
  const load = jest.fn(async () => {
    calls += 1;
    if (calls === 1) throw new ApiError(429, 'RATE_LIMITED', 'x', { retryAfter: 10 });
    return calls;
  });
  const { result, unmount } = await renderHook(() => useApi(load, [], { pollMs: 1000 }));
  expect(result.current.error).toBe('RATE_LIMITED');
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(calls).toBe(1);
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });
  expect(calls).toBeGreaterThan(1);
  await unmount();
  jest.useRealTimers();

  let resolveSlow: (v: string) => void = () => {};
  const slowThenFast = jest
    .fn()
    .mockImplementationOnce(() => Promise.resolve('inicial'))
    .mockImplementationOnce(() => new Promise<string>((r) => (resolveSlow = r)))
    .mockImplementationOnce(() => Promise.resolve('nuevo'));
  const hook = await renderHook(() => useApi(slowThenFast, []));
  let slow!: Promise<void>;
  await act(async () => {
    slow = hook.result.current.refresh();
    await hook.result.current.refresh();
  });
  await act(async () => {
    resolveSlow('viejo');
    await slow;
  });
  expect(hook.result.current.data).toBe('nuevo');
  await hook.unmount();
});
