// POST /demo/sembrar (ADMIN): loads sample visits, team, queue and alerts so the panel is not empty.
// ponytail: local helper until `client.ts` gets `sembrarDemo`; then swap this body for that call.
import { CLUB_API_URL, ClubApiError, tokenStore } from '../client';

export async function sembrarDemo(
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<{ ya_sembrado: boolean }> {
  const token = await tokenStore.get();
  let res: Response;
  try {
    res = await fetchImpl(`${CLUB_API_URL}/demo/sembrar`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ClubApiError(0, 'sin_conexion', 'Sin conexión. Revisa tu red e intenta de nuevo.');
  }
  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as {
    ya_sembrado?: boolean;
    detalle?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new ClubApiError(
      res.status,
      data.error ?? 'error',
      data.detalle ?? 'No se pudo cargar los datos iniciales.',
    );
  }
  return { ya_sembrado: data.ya_sembrado === true };
}
