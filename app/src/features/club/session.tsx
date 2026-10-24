// Session of the club apps: who is signed in, login/logout, and the token restored on start.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { club, ClubApiError, tokenStore, type ClubClient, type UsuarioPublico } from './client';

export type EstadoSesion = 'cargando' | 'anonimo' | 'activo' | 'sin_conexion';

export interface Sesion {
  estado: EstadoSesion;
  usuario: UsuarioPublico | null;
  /** The API client the screens use; tests inject one with a fake fetch. */
  client: ClubClient;
  login: (email: string, clave: string) => Promise<UsuarioPublico>;
  logout: () => Promise<void>;
  /** Tries to restore the session again after `sin_conexion`. */
  reintentar: () => void;
}

const Ctx = createContext<Sesion | null>(null);

export function SessionProvider({
  client = club,
  children,
}: {
  client?: ClubClient;
  children: ReactNode;
}) {
  const [estado, setEstado] = useState<EstadoSesion>('cargando');
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!(await tokenStore.get())) return vivo && setEstado('anonimo');
      try {
        const u = await client.me();
        if (!vivo) return;
        setUsuario(u);
        setEstado('activo');
      } catch (e) {
        if (!vivo) return;
        // 401: the client already dropped the token. Offline: keep it and let the user retry.
        setEstado(
          e instanceof ClubApiError && e.code === 'sin_conexion' ? 'sin_conexion' : 'anonimo',
        );
      }
    })();
    return () => {
      vivo = false;
    };
  }, [client, intento]);

  const login = useCallback(
    async (email: string, clave: string) => {
      const u = await client.login(email.trim(), clave);
      setUsuario(u);
      setEstado('activo');
      return u;
    },
    [client],
  );

  const logout = useCallback(async () => {
    await client.logout();
    setUsuario(null);
    setEstado('anonimo');
  }, [client]);

  const reintentar = useCallback(() => {
    setEstado('cargando');
    setIntento((n) => n + 1);
  }, []);

  const valor = useMemo(
    () => ({ estado, usuario, client, login, logout, reintentar }),
    [estado, usuario, client, login, logout, reintentar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSession(): Sesion {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession necesita un SessionProvider');
  return s;
}

/** Route each role lands on after signing in. */
export const rutaPorRol = (rol: UsuarioPublico['rol']) =>
  ({
    ADMIN: '/app/panel',
    CONCIERGE: '/app/concierge',
    EDECAN: '/app/edecan',
    PERSONAL: '/app/personal',
    SOCIO: '/app/socio',
  })[rol];
