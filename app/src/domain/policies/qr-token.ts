import type { Instant } from '../entities/types';

const PREFIX = 'nq_';
const TOKEN_BYTES = 16;
const WELL_FORMED = /^nq_[A-Za-z0-9_-]{22}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export interface PassRecord {
  token: string;
  invitationId: string;
  validFrom: Instant;
  validTo: Instant;
  usedAt?: Instant;
  revokedAt?: Instant;
}

export type PassCheck =
  | { ok: true }
  | {
      ok: false;
      code: 'MALFORMED' | 'UNKNOWN' | 'REVOKED' | 'USED' | 'NOT_YET_VALID' | 'EXPIRED';
    };

/** base64url without padding (no Buffer/btoa: they are not guaranteed on every runtime). */
function base64url(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += ALPHABET[(acc >> bits) & 63];
    }
    acc &= (1 << bits) - 1;
  }
  return bits > 0 ? out + ALPHABET[(acc << (6 - bits)) & 63] : out;
}

/** 128-bit opaque token, no personal data. Randomness is injected so the domain stays pure. */
export function generateToken(random: (bytes: number) => Uint8Array): string {
  const bytes = random(TOKEN_BYTES);
  if (bytes.length !== TOKEN_BYTES) throw new Error('TOKEN_ENTROPY');
  return PREFIX + base64url(bytes);
}

export function isWellFormedToken(s: string): boolean {
  return WELL_FORMED.test(s);
}

/** Priority: MALFORMED > UNKNOWN > REVOKED > USED > NOT_YET_VALID > EXPIRED. The window is `validFrom <= t < validTo`, like invitations. */
export function checkPass(record: PassRecord | null, presented: string, now: Date): PassCheck {
  if (!isWellFormedToken(presented)) return { ok: false, code: 'MALFORMED' };
  if (!record || record.token !== presented) return { ok: false, code: 'UNKNOWN' };
  if (record.revokedAt) return { ok: false, code: 'REVOKED' };
  if (record.usedAt) return { ok: false, code: 'USED' };
  const t = now.getTime();
  // Negated comparisons so an unreadable date (NaN) fails closed.
  if (!(t >= Date.parse(record.validFrom))) return { ok: false, code: 'NOT_YET_VALID' };
  if (!(t < Date.parse(record.validTo))) return { ok: false, code: 'EXPIRED' };
  return { ok: true };
}
