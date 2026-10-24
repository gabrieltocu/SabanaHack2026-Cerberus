// Shared state of the socio app: the signed-in socio, their invitations and the notices feed.
// One provider keeps the three tabs in step (the Avisos badge, the Inicio summary, the lists).
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Confirmacion, Evento, Invitacion, Perfil, Visita } from '../../../club/types';
import { ClubApiError, club, type ClubClient, type UsuarioPublico } from '../client';
import { describir, type ErrorInfo } from './errors';

export interface Lista<T> {
  datos: T | null;
  cargando: boolean;
  error: ErrorInfo | null;
}

export interface Respuesta {
  estado: 'ENVIANDO' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA' | 'ERROR';
  confirmacion: Confirmacion;
  detalle?: string;
}

export interface Tarjeta {
  confirmacion: Confirmacion;
  respuesta?: Respuesta;
}

interface Avisos {
  /** Ascending by `seq`. */
  eventos: Evento[];
  confirmaciones: Confirmacion[];
  cargado: boolean;
  error: ErrorInfo | null;
}

export interface Socio {
  client: ClubClient;
  usuario: UsuarioPublico;
  ahora: () => Date;
  invitaciones: Lista<Invitacion[]>;
  recargarInvitaciones: () => Promise<void>;
  /** Own visit and the visits of the socio's guests (the API scopes the list to the socio). */
  visitas: Lista<Visita[]>;
  recargarVisitas: () => Promise<void>;
  /**
   * Visits rated in this session. ponytail: `Visita` has no "evaluated" flag, so a reload forgets
   * them; if the API adds one, read it instead.
   */
  evaluadas: ReadonlySet<string>;
  marcarEvaluada: (visitaId: string) => void;
  /** Drinks, assistance needs and the recognition-photo state. */
  perfil: Lista<Perfil>;
  recargarPerfil: () => Promise<void>;
  /** Saves part of the profile and keeps every screen in step with the answer. */
  guardarPerfil: (cambios: Parameters<ClubClient['editarPerfil']>[0]) => Promise<Perfil>;
  /** The profile came back from a photo upload or removal. */
  aplicarPerfil: (p: Perfil) => void;
  avisos: Avisos;
  /** Confirmations still waiting for an answer (answered and expired ones are not counted). */
  tarjetas: Tarjeta[];
  porResponder: number;
  actualizarAvisos: () => Promise<void>;
  responder: (c: Confirmacion, aprueba: boolean) => Promise<void>;
}

const Ctx = createContext<Socio | null>(null);

export function useSocio(): Socio {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSocio fuera de SocioProvider');
  return s;
}

const MAX_EVENTOS = 200;
const PAGINA = 100;
const MAX_PAGINAS = 5;
const ahoraReal = () => new Date();

export function SocioProvider({
  client = club,
  usuario,
  ahora = ahoraReal,
  children,
}: {
  client?: ClubClient;
  usuario: UsuarioPublico;
  /** Injected clock (tests); defaults to the system time. */
  ahora?: () => Date;
  children: ReactNode;
}) {
  const [invitaciones, setInvitaciones] = useState<Lista<Invitacion[]>>({
    datos: null,
    cargando: false,
    error: null,
  });
  const [visitas, setVisitas] = useState<Lista<Visita[]>>({
    datos: null,
    cargando: false,
    error: null,
  });
  const [evaluadas, setEvaluadas] = useState<ReadonlySet<string>>(new Set());
  const marcarEvaluada = useCallback((id: string) => setEvaluadas((e) => new Set(e).add(id)), []);
  const [perfil, setPerfil] = useState<Lista<Perfil>>({
    datos: null,
    cargando: false,
    error: null,
  });
  const [avisos, setAvisos] = useState<Avisos>({
    eventos: [],
    confirmaciones: [],
    cargado: false,
    error: null,
  });
  const [respuestas, setRespuestas] = useState<Record<string, Respuesta>>({});
  const seq = useRef(0);
  const enVuelo = useRef(false);

  const recargarInvitaciones = useCallback(async () => {
    setInvitaciones((s) => ({ ...s, cargando: true, error: null }));
    try {
      setInvitaciones({
        datos: await client.listarInvitaciones(),
        cargando: false,
        error: null,
      });
    } catch (e) {
      setInvitaciones((s) => ({ ...s, cargando: false, error: describir(e) }));
    }
  }, [client]);

  const recargarVisitas = useCallback(async () => {
    setVisitas((s) => ({ ...s, cargando: true }));
    try {
      setVisitas({ datos: await client.visitas(), cargando: false, error: null });
    } catch (e) {
      setVisitas((s) => ({ ...s, cargando: false, error: describir(e) }));
    }
  }, [client]);

  const recargarPerfil = useCallback(async () => {
    setPerfil((s) => ({ ...s, cargando: true }));
    try {
      setPerfil({ datos: await client.perfil(), cargando: false, error: null });
    } catch (e) {
      setPerfil((s) => ({ ...s, cargando: false, error: describir(e) }));
    }
  }, [client]);

  const aplicarPerfil = useCallback(
    (datos: Perfil) => setPerfil({ datos, cargando: false, error: null }),
    [],
  );

  const guardarPerfil = useCallback(
    async (cambios: Parameters<ClubClient['editarPerfil']>[0]) => {
      const datos = await client.editarPerfil(cambios);
      aplicarPerfil(datos);
      return datos;
    },
    [client, aplicarPerfil],
  );

  const actualizarAvisos = useCallback(async () => {
    if (enVuelo.current) return; // polling never overlaps itself
    enVuelo.current = true;
    try {
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const r = await client.eventos(seq.current);
        seq.current = Math.max(seq.current, r.ultimo_seq);
        if (r.items.length) {
          setAvisos((a) => {
            const vistos = new Set(a.eventos.map((e) => e.seq));
            const nuevos = r.items.filter((e) => !vistos.has(e.seq));
            return { ...a, eventos: [...a.eventos, ...nuevos].slice(-MAX_EVENTOS) };
          });
        }
        if (r.items.length < PAGINA) break;
      }
      // The server already hides expired ones; the filter covers clock drift between polls.
      const confirmaciones = (await client.confirmacionesPendientes()).filter(
        (c) => Date.parse(c.vence_at) > ahora().getTime(),
      );
      setAvisos((a) => ({ ...a, confirmaciones, cargado: true, error: null }));
    } catch (e) {
      setAvisos((a) => ({ ...a, cargado: true, error: describir(e) }));
    } finally {
      enVuelo.current = false;
    }
  }, [client, ahora]);

  const responder = useCallback(
    async (confirmacion: Confirmacion, aprueba: boolean) => {
      const poner = (r: Omit<Respuesta, 'confirmacion'>) =>
        setRespuestas((m) => ({ ...m, [confirmacion.id]: { ...r, confirmacion } }));
      poner({ estado: 'ENVIANDO' });
      try {
        const c = await client.responderConfirmacion(confirmacion.id, aprueba);
        poner({
          estado: c?.estado === 'VENCIDA' ? 'VENCIDA' : aprueba ? 'APROBADA' : 'RECHAZADA',
        });
      } catch (e) {
        // 409: someone already answered it or it expired while the card was open.
        const info = describir(e);
        poner({
          estado: e instanceof ClubApiError && e.status === 409 ? 'VENCIDA' : 'ERROR',
          detalle: info.detalle,
        });
      }
    },
    [client],
  );

  const tarjetas = useMemo(() => {
    const abiertas = avisos.confirmaciones.map((c) => ({
      confirmacion: c,
      respuesta: respuestas[c.id],
    }));
    const ids = new Set(abiertas.map((t) => t.confirmacion.id));
    // Answered cards stay visible after the server stops listing them.
    const resueltas = Object.values(respuestas)
      .filter((r) => !ids.has(r.confirmacion.id))
      .map((r) => ({ confirmacion: r.confirmacion, respuesta: r }));
    return [...abiertas, ...resueltas];
  }, [avisos.confirmaciones, respuestas]);

  const value = useMemo<Socio>(
    () => ({
      client,
      usuario,
      ahora,
      invitaciones,
      recargarInvitaciones,
      visitas,
      recargarVisitas,
      evaluadas,
      marcarEvaluada,
      perfil,
      recargarPerfil,
      guardarPerfil,
      aplicarPerfil,
      avisos,
      tarjetas,
      porResponder: tarjetas.filter((t) => !t.respuesta || t.respuesta.estado === 'ERROR').length,
      actualizarAvisos,
      responder,
    }),
    [
      client,
      usuario,
      ahora,
      invitaciones,
      recargarInvitaciones,
      visitas,
      recargarVisitas,
      evaluadas,
      marcarEvaluada,
      perfil,
      recargarPerfil,
      guardarPerfil,
      aplicarPerfil,
      avisos,
      tarjetas,
      actualizarAvisos,
      responder,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
