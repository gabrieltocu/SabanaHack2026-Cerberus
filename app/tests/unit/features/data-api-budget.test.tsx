import { act, renderHook, waitFor } from '@testing-library/react-native';

import { clearPause, useApi } from '@/features/data/api';
import { ApiError } from '@/infrastructure/clients/errors';

afterEach(() => {
  clearPause();
  jest.useRealTimers();
  delete (globalThis as { document?: unknown }).document;
});

const fakeDocument = () => {
  const listeners = new Set<() => void>();
  const doc = {
    hidden: true,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    show: () => {
      doc.hidden = false;
      listeners.forEach((l) => l());
    },
  };
  (globalThis as { document?: unknown }).document = doc;
  return doc;
};

describe('useApi · presupuesto de sondeo', () => {
  it('no sondea con la pestaña oculta y refresca una vez al volver a verla', async () => {
    jest.useFakeTimers();
    const doc = fakeDocument();
    const load = jest.fn(async () => 'ok');
    const { unmount } = await renderHook(() => useApi(load, [], { pollMs: 1000 }));
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      doc.show();
    });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(load).toHaveBeenCalledTimes(3);
    await unmount();
  });

  it('un RATE_LIMITED en un hook pausa el sondeo de todos los demás', async () => {
    jest.useFakeTimers();
    const limited = jest.fn(async () => {
      throw new ApiError(429, 'RATE_LIMITED', 'x', { retryAfter: 10 });
    });
    const other = jest.fn(async () => 'ok');
    const a = await renderHook(() => useApi(limited, [], { pollMs: 1000 }));
    const b = await renderHook(() => useApi(other, [], { pollMs: 1000 }));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(other).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    expect(other.mock.calls.length).toBeGreaterThan(1);
    await a.unmount();
    await b.unmount();
  });

  it('al cambiar las dependencias no muestra los datos de la anterior', async () => {
    let release: (v: string) => void = () => {};
    const load = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce('Andrés')
      .mockImplementationOnce(() => new Promise((r) => (release = r)));
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useApi(load, [id]), {
      initialProps: { id: 'V-201' },
    });
    await waitFor(() => expect(result.current.data).toBe('Andrés'));
    await rerender({ id: 'V-202' });
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    await act(async () => release('Camila'));
    expect(result.current.data).toBe('Camila');
  });
});
