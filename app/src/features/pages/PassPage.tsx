import { ApiError } from '../../infrastructure/clients/errors';
import { clientFor, useApi } from '../data/api';
import { fromPass } from '../data/view';
import { PassScreen } from '../screens/PassScreen';
import { copyText } from '../shared/clipboard';
import type { PassView } from '../types';

// Holding the token is the authorization (`GET /passes/{token}`, no actor): an unknown, malformed
// or tampered token is one «No válido». Old links carried `?inv=`; it is ignored.
const NOT_FOUND = new Set(['PASS_NOT_FOUND', 'VALIDATION_ERROR', 'ROUTE_NOT_FOUND']);

async function loadPass(token: string): Promise<PassView | null> {
  try {
    return fromPass(await clientFor().getPass(token));
  } catch (e) {
    if (e instanceof ApiError && NOT_FOUND.has(e.code)) return null;
    throw e;
  }
}

/** `/pase/[token]`: the guest's pass with its real state. Validity always comes from the API. */
export function PassPage({ token }: { token: string }) {
  const pass = useApi(() => loadPass(token), [token]);
  const loaded = pass.data !== undefined;
  return (
    <PassScreen
      pass={pass.data ?? null}
      status={loaded ? 'ready' : pass.error ? 'error' : 'loading'}
      offline={loaded && pass.error !== undefined}
      onRetry={() => void pass.refresh()}
      onCopyLink={() => copyText(globalThis.location?.href ?? '')}
    />
  );
}
