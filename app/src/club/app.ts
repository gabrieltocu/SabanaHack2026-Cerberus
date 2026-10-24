// Club API router: modules contribute routes; auth is resolved per route.
import type { KeyValueStore } from '../infrastructure/stores/types';
import { checkBotKey, signToken, verifyPassword, verifyToken, type Claims, type Rol } from './auth';
import type { ClubConfig } from './config';
import { ClubError, fail, json, readJson } from './http';
import { isoBogota } from './qr';
import { usuarioPorId, usuarios } from './seed';
import type { Usuario } from './types';

export interface ClubCtx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  store: KeyValueStore;
  now: Date;
  cfg: Partial<ClubConfig>;
  /** Present on routes with `auth: Rol[]`. */
  user?: Usuario;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** e.g. `/invitaciones/:id/foto` */
  path: string;
  /** Roles allowed (JWT), `'BOT'` (X-Bot-Key), or `'PUBLIC'`. */
  auth: Rol[] | 'BOT' | 'PUBLIC';
  handler: (ctx: ClubCtx) => Promise<Response>;
}

export interface ClubAppOptions {
  store: KeyValueStore;
  cfg: Partial<ClubConfig>;
  clock?: () => Date;
  routes?: Route[];
}

const need = (cfg: Partial<ClubConfig>, key: keyof ClubConfig): string => {
  const v = cfg[key];
  if (!v) throw fail(503, 'config_faltante', 'El servidor no tiene configurada esta función.');
  return v;
};
export { need as requireSecret };

const loginAttempts = new Map<string, { n: number; until: number }>();
// ponytail: per-instance login throttle (5 tries / 5 min); move to the store if brute force matters.

export const coreRoutes: Route[] = [
  {
    method: 'POST',
    path: '/auth/login',
    auth: 'PUBLIC',
    handler: async (ctx) => {
      const body = await readJson(ctx.req);
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase();
      const clave = String(body.clave ?? '');
      const nowMs = ctx.now.getTime();
      const slot = loginAttempts.get(email);
      if (slot && slot.until > nowMs && slot.n >= 5) {
        throw fail(429, 'demasiados_intentos', 'Demasiados intentos. Espera unos minutos.');
      }
      const u = usuarios().find((x) => x.email === email && x.activo);
      if (!u || !verifyPassword(clave, u.clave_hash)) {
        const n = slot && slot.until > nowMs ? slot.n + 1 : 1;
        loginAttempts.set(email, { n, until: nowMs + 5 * 60_000 });
        throw fail(401, 'credenciales_invalidas', 'Correo o clave incorrectos.');
      }
      loginAttempts.delete(email);
      const token = signToken({ sub: u.id, rol: u.rol }, need(ctx.cfg, 'jwtSecret'), nowS(ctx));
      return json(200, { token, usuario: publicUser(u) });
    },
  },
  {
    method: 'POST',
    path: '/auth/refresh',
    auth: ['SOCIO', 'CONCIERGE', 'ADMIN', 'EDECAN', 'PERSONAL'],
    handler: async (ctx) =>
      json(200, {
        token: signToken(
          { sub: ctx.user!.id, rol: ctx.user!.rol },
          need(ctx.cfg, 'jwtSecret'),
          nowS(ctx),
        ),
      }),
  },
  {
    method: 'GET',
    path: '/me',
    auth: ['SOCIO', 'CONCIERGE', 'ADMIN', 'EDECAN', 'PERSONAL'],
    handler: async (ctx) => json(200, publicUser(ctx.user!)),
  },
  {
    method: 'GET',
    path: '/club-health',
    auth: 'PUBLIC',
    handler: async (ctx) => json(200, { status: 'ok', api: 'club', ts: isoBogota(ctx.now) }),
  },
];

export const nowS = (ctx: { now: Date }) => Math.floor(ctx.now.getTime() / 1000);

export function publicUser(u: Usuario) {
  const { clave_hash: _hash, ...rest } = u;
  return rest;
}

function compile(path: string) {
  const keys: string[] = [];
  const re = new RegExp(
    `^${path.replace(/\/:([a-z_]+)/gi, (_m, k: string) => {
      keys.push(k);
      return '/([^/]+)';
    })}/?$`,
  );
  return { re, keys };
}

export function createClubApp(opts: ClubAppOptions) {
  const table = [...coreRoutes, ...(opts.routes ?? [])].map((r) => ({ ...r, ...compile(r.path) }));
  const clock = opts.clock ?? (() => new Date());

  return async (req: Request, path: string): Promise<Response> => {
    try {
      const url = new URL(req.url);
      const candidates = table.filter((r) => r.re.test(path));
      if (!candidates.length) throw fail(404, 'ruta_no_encontrada', 'La ruta no existe.');
      const route = candidates.find((r) => r.method === req.method);
      if (!route) throw fail(405, 'metodo_no_permitido', 'Método no permitido en esta ruta.');
      const m = route.re.exec(path)!;
      const params = Object.fromEntries(
        route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]),
      );
      const ctx: ClubCtx = { req, url, params, store: opts.store, now: clock(), cfg: opts.cfg };
      if (route.auth === 'BOT') {
        checkBotKey(req.headers.get('x-bot-key'), need(opts.cfg, 'botKey'), opts.cfg.bridgeKey);
      } else if (route.auth !== 'PUBLIC') {
        const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
        if (!bearer) throw fail(401, 'sin_token', 'Inicia sesión para continuar.');
        const claims: Claims = verifyToken(bearer, need(opts.cfg, 'jwtSecret'), nowS(ctx));
        const user = usuarioPorId(claims.sub);
        if (!user?.activo) throw fail(401, 'usuario_inactivo', 'Tu usuario no está activo.');
        if (!route.auth.includes(user.rol)) {
          throw fail(403, 'rol_no_permitido', 'Tu rol no puede hacer esto.');
        }
        ctx.user = user;
      }
      return await route.handler(ctx);
    } catch (e) {
      if (e instanceof ClubError) return json(e.status, { error: e.code, detalle: e.detalle });
      if (e instanceof URIError) {
        return json(404, { error: 'ruta_no_encontrada', detalle: 'La ruta no existe.' });
      }
      console.error('club_error', e instanceof Error ? e.name : typeof e);
      return json(500, { error: 'error_interno', detalle: 'Error interno. Intenta de nuevo.' });
    }
  };
}
