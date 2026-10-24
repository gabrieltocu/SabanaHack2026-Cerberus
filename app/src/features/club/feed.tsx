// Live event feed of the concierge: one incremental poll shared by every tab, so a new alert
// buzzes and shows a banner wherever the concierge is looking.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Evento } from '../../club/types';
import { ClubApiError } from './client';
import { unirEventos } from './eventos';
import { useSession } from './session';
import { useAppActiva, vibrarAlerta } from './ui/visible';

export const SONDEO_MS = 3000;

export interface Aviso {
  id: number;
  tipo: 'alerta' | 'error' | 'ok';
  texto: string;
}

export interface Feed {
  eventos: Evento[];
  ultimoSeq: number;
  /** True until the first answer arrives. */
  cargando: boolean;
  error: ClubApiError | null;
  sinConexion: boolean;
  aviso: Aviso | null;
  recargar: () => Promise<void>;
  /** Replaces one event with the server's copy (after Atender / Resolver). */
  actualizar: (e: Evento) => void;
  avisar: (tipo: Aviso['tipo'], texto: string) => void;
  /** Turns any failure into a sentence; a 401 sends the user back to the login. */
  mensajeDe: (e: unknown) => string;
}

const Ctx = createContext<Feed | null>(null);

export function FeedProvider({ children }: { children: ReactNode }) {
  const { client, logout } = useSession();
  const activa = useAppActiva();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<ClubApiError | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const seq = useRef(0);
  const vistos = useRef(new Set<string>());
  const baseline = useRef(false);
  const avisoId = useRef(0);

  const avisar = useCallback((tipo: Aviso['tipo'], texto: string) => {
    setAviso({ id: ++avisoId.current, tipo, texto });
  }, []);

  const mensajeDe = useCallback(
    (e: unknown) => {
      if (e instanceof ClubApiError) {
        if (e.status === 401) void logout();
        return e.detalle;
      }
      return 'No se pudo completar. Intenta de nuevo.';
    },
    [logout],
  );

  const sondear = useCallback(
    async (desdeCero = false) => {
      try {
        const r = await client.eventos(desdeCero ? 0 : seq.current);
        seq.current = Math.max(seq.current, r.ultimo_seq);
        const nuevos = r.items.filter((e) => !vistos.current.has(e.id));
        r.items.forEach((e) => vistos.current.add(e.id));
        setEventos((prev) => unirEventos(prev, r.items));
        // The first answer is the baseline: only what arrives afterwards is "new".
        const alertas = nuevos.filter((e) => e.requiere_atencion && e.estado === 'NUEVO');
        if (baseline.current && alertas.length > 0) {
          vibrarAlerta();
          const a = alertas[0]!;
          avisar(
            'alerta',
            alertas.length > 1
              ? `${alertas.length} alertas nuevas`
              : `Alerta: ${a.nombre ?? 'persona sin identificar'}`,
          );
        }
        baseline.current = true;
        setError(null);
      } catch (e) {
        if (e instanceof ClubApiError && e.status === 401) void logout();
        setError(
          e instanceof ClubApiError ? e : new ClubApiError(0, 'error', 'No se pudo cargar.'),
        );
      } finally {
        setCargando(false);
      }
    },
    [client, logout, avisar],
  );

  useEffect(() => {
    if (!activa) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const vuelta = async () => {
      await sondear();
      if (vivo) timer = setTimeout(vuelta, SONDEO_MS);
    };
    void vuelta();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [activa, sondear]);

  const actualizar = useCallback((e: Evento) => setEventos((prev) => unirEventos(prev, [e])), []);
  const recargar = useCallback(() => sondear(true), [sondear]);

  const valor = useMemo<Feed>(
    () => ({
      eventos,
      ultimoSeq: eventos.reduce((m, e) => Math.max(m, e.seq), 0),
      cargando,
      error,
      sinConexion: error?.code === 'sin_conexion',
      aviso,
      recargar,
      actualizar,
      avisar,
      mensajeDe,
    }),
    [eventos, cargando, error, aviso, recargar, actualizar, avisar, mensajeDe],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useFeed(): Feed {
  const f = useContext(Ctx);
  if (!f) throw new Error('useFeed necesita un FeedProvider');
  return f;
}
