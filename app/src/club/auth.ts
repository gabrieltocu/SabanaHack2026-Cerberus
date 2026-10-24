// Passwords (scrypt) and short JWTs (HS256) with node:crypto; robot auth with X-Bot-Key.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { fail } from './http';

export type Rol = 'SOCIO' | 'CONCIERGE' | 'ADMIN' | 'EDECAN' | 'PERSONAL';
export interface Claims {
  sub: string; // usuario.id
  rol: Rol;
  exp: number; // unix seconds
}

export const TOKEN_TTL_S = 3600;

const b64url = (buf: Buffer) => buf.toString('base64url');

export function hashPassword(clave: string, salt = randomBytes(16)): string {
  return `scrypt$${b64url(salt)}$${b64url(scryptSync(clave, salt, 32))}`;
}

export function verifyPassword(clave: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(clave, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function signToken(claims: Omit<Claims, 'exp'>, secret: string, nowS: number): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(Buffer.from(JSON.stringify({ ...claims, exp: nowS + TOKEN_TTL_S })));
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token: string, secret: string, nowS: number): Claims {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) throw fail(401, 'token_invalido', 'Inicia sesión de nuevo.');
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw fail(401, 'token_invalido', 'Inicia sesión de nuevo.');
  }
  let claims: Claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims;
  } catch {
    throw fail(401, 'token_invalido', 'Inicia sesión de nuevo.');
  }
  if (!(typeof claims.exp === 'number' && claims.exp > nowS)) {
    throw fail(401, 'token_vencido', 'Tu sesión venció. Inicia sesión de nuevo.');
  }
  return claims;
}

export function checkBotKey(given: string | null, expected: string, bridgeKey?: string): void {
  const a = Buffer.from(given ?? '');
  const matches = (key: string) => {
    const b = Buffer.from(key);
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  };
  if (!matches(expected) && !(bridgeKey && matches(bridgeKey))) {
    throw fail(401, 'bot_no_autorizado', 'Llave del robot inválida.');
  }
}
