import { useEffect, useState } from 'react';

import type { ClubClient } from '../client';

export type EstadoFoto = 'sin' | 'cargando' | 'lista' | 'error';

interface Resultado {
  /** Which request this answers: `path|version`. */
  clave: string;
  uri: string | null;
}

/**
 * Downloads a protected image (`client.foto`) while `path` is set. `version` re-downloads when the
 * photo changed server-side (state or replacement). Blob URIs on web are released on change.
 */
export function useFoto(client: ClubClient, path: string | null, version: unknown = null) {
  const clave = path ? `${path}|${String(version)}` : null;
  const [r, setR] = useState<Resultado | null>(null);
  useEffect(() => {
    if (!path || !clave) return;
    let viva = true;
    let uri: string | null = null;
    client.foto(path).then(
      (u) => {
        uri = u;
        if (viva) setR({ clave, uri: u });
        else if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      },
      () => viva && setR({ clave, uri: null }),
    );
    return () => {
      viva = false;
      if (uri?.startsWith('blob:')) URL.revokeObjectURL(uri);
    };
  }, [client, path, clave]);
  const estado: EstadoFoto = !clave
    ? 'sin'
    : r?.clave !== clave
      ? 'cargando'
      : r.uri
        ? 'lista'
        : 'error';
  return { uri: estado === 'lista' ? (r?.uri ?? null) : null, estado };
}
