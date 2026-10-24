import { randomBytes } from 'node:crypto';
import {
  checkPass,
  generateToken,
  isWellFormedToken,
  type PassRecord,
} from '@/domain/policies/qr-token';
import { secureRandom } from '@/shared/random';

const nodeRandom = (n: number) => new Uint8Array(randomBytes(n));

describe('generateToken', () => {
  test('25 caracteres, prefijo nq_ y alfabeto base64url', () => {
    const t = generateToken(nodeRandom);
    expect(t).toHaveLength(25);
    expect(t.startsWith('nq_')).toBe(true);
    expect(t).toMatch(/^nq_[A-Za-z0-9_-]{22}$/);
    expect(isWellFormedToken(t)).toBe(true);
  });

  test('codifica base64url sin relleno (vectores conocidos)', () => {
    expect(generateToken(() => new Uint8Array(16))).toBe('nq_AAAAAAAAAAAAAAAAAAAAAA');
    expect(generateToken(() => new Uint8Array(16).fill(255))).toBe('nq______________________w');
    expect(generateToken(() => Uint8Array.from({ length: 16 }, (_, i) => i))).toBe(
      'nq_AAECAwQFBgcICQoLDA0ODw',
    );
  });

  test('1000 tokens sin colisión', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateToken(nodeRandom)));
    expect(seen.size).toBe(1000);
  });

  test('pide exactamente 16 bytes a la fuente de aleatoriedad', () => {
    const random = jest.fn((n: number) => new Uint8Array(n));
    generateToken(random);
    expect(random).toHaveBeenCalledWith(16);
  });

  test('rechaza una fuente que devuelve otra cantidad de bytes', () => {
    expect(() => generateToken(() => new Uint8Array(8))).toThrow('TOKEN_ENTROPY');
  });
});

describe('isWellFormedToken', () => {
  test.each([
    ['sin prefijo', 'AAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['corto', 'nq_AAAA'],
    ['largo', 'nq_AAAAAAAAAAAAAAAAAAAAAAA'],
    ['relleno', 'nq_AAAAAAAAAAAAAAAAAAAAA='],
    ['carácter inválido', 'nq_AAAAAAAAAAAAAAAAAAAA+A'],
    ['salto de línea final', 'nq_AAAAAAAAAAAAAAAAAAAAAA\n'],
    ['vacío', ''],
  ])('rechaza %s', (_n, s) => {
    expect(isWellFormedToken(s)).toBe(false);
  });
});

describe('checkPass', () => {
  const token = 'nq_AAECAwQFBgcICQoLDA0ODw';
  const other = 'nq_AAECAwQFBgcICQoLDA0ODx';
  const record: PassRecord = {
    token,
    invitationId: 'inv-1',
    validFrom: '2026-10-24T09:00:00-05:00',
    validTo: '2026-10-24T18:00:00-05:00',
  };
  const inside = new Date('2026-10-24T12:00:00-05:00');

  test('pase vigente: ok', () => {
    expect(checkPass(record, token, inside)).toEqual({ ok: true });
  });

  test('ventana [validFrom, validTo): validFrom entra y validTo exacto ya vence', () => {
    expect(checkPass(record, token, new Date(record.validFrom))).toEqual({ ok: true });
    expect(checkPass(record, token, new Date(record.validTo))).toEqual({
      ok: false,
      code: 'EXPIRED',
    });
  });

  test('MALFORMED: la cadena presentada no tiene forma de token', () => {
    expect(checkPass(record, 'hola', inside)).toEqual({ ok: false, code: 'MALFORMED' });
    expect(checkPass(null, '', inside)).toEqual({ ok: false, code: 'MALFORMED' });
  });

  test('UNKNOWN: sin registro', () => {
    expect(checkPass(null, token, inside)).toEqual({ ok: false, code: 'UNKNOWN' });
  });

  test('UNKNOWN: el registro es de otro token', () => {
    expect(checkPass(record, other, inside)).toEqual({ ok: false, code: 'UNKNOWN' });
  });

  test('REVOKED', () => {
    const r = { ...record, revokedAt: '2026-10-24T10:00:00-05:00' };
    expect(checkPass(r, token, inside)).toEqual({ ok: false, code: 'REVOKED' });
  });

  test('USED', () => {
    const r = { ...record, usedAt: '2026-10-24T10:00:00-05:00' };
    expect(checkPass(r, token, inside)).toEqual({ ok: false, code: 'USED' });
  });

  test('NOT_YET_VALID', () => {
    expect(checkPass(record, token, new Date('2026-10-24T08:59:59-05:00'))).toEqual({
      ok: false,
      code: 'NOT_YET_VALID',
    });
  });

  test('EXPIRED', () => {
    expect(checkPass(record, token, new Date('2026-10-24T18:00:01-05:00'))).toEqual({
      ok: false,
      code: 'EXPIRED',
    });
  });

  test('fechas del registro ilegibles fallan cerrado', () => {
    expect(checkPass({ ...record, validFrom: 'ayer' }, token, inside).ok).toBe(false);
    expect(checkPass({ ...record, validTo: 'mañana' }, token, inside)).toEqual({
      ok: false,
      code: 'EXPIRED',
    });
  });

  describe('prioridad MALFORMED > UNKNOWN > REVOKED > USED > NOT_YET_VALID > EXPIRED', () => {
    const all = {
      ...record,
      revokedAt: '2026-10-24T10:00:00-05:00',
      usedAt: '2026-10-24T10:30:00-05:00',
    };
    const late = new Date('2026-10-25T00:00:00-05:00');
    const early = new Date('2026-10-24T00:00:00-05:00');

    test('revocado y vencido a la vez: REVOKED', () => {
      expect(checkPass({ ...record, revokedAt: all.revokedAt }, token, late)).toEqual({
        ok: false,
        code: 'REVOKED',
      });
    });

    test('revocado y usado: REVOKED', () => {
      expect(checkPass(all, token, inside)).toEqual({ ok: false, code: 'REVOKED' });
    });

    test('usado y vencido: USED', () => {
      expect(checkPass({ ...record, usedAt: all.usedAt }, token, late)).toEqual({
        ok: false,
        code: 'USED',
      });
    });

    test('usado y aún no válido: USED', () => {
      expect(checkPass({ ...record, usedAt: all.usedAt }, token, early)).toEqual({
        ok: false,
        code: 'USED',
      });
    });

    test('malformado gana a todo, incluso con registro nulo', () => {
      expect(checkPass(all, 'x', late)).toEqual({ ok: false, code: 'MALFORMED' });
    });

    test('token ajeno y registro revocado: UNKNOWN', () => {
      expect(checkPass(all, other, late)).toEqual({ ok: false, code: 'UNKNOWN' });
    });
  });
});

describe('secureRandom', () => {
  test('devuelve la cantidad pedida de bytes no nulos en conjunto', () => {
    const bytes = secureRandom(32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(32);
    expect(bytes.some((b) => b !== 0)).toBe(true);
  });

  test('lanza si no hay crypto.getRandomValues (sin alternativa débil)', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => secureRandom(16)).toThrow('SECURE_RANDOM_UNAVAILABLE');
    } finally {
      if (desc) Object.defineProperty(globalThis, 'crypto', desc);
      else delete (globalThis as { crypto?: unknown }).crypto;
    }
  });
});
