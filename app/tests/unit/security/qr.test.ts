// Adversarial checks over opaque QR passes: tampering, replay, sharing and unreadable windows.
import {
  checkPass,
  generateToken,
  isWellFormedToken,
  type PassRecord,
} from '@/domain/policies/qr-token';
import { createSeed } from '@/domain/seed';
import { secureRandom } from '@/shared/random';

const NOW = new Date('2026-10-24T10:00:00-05:00');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Deterministic generator (never the platform RNG) so failures reproduce.
const seeded = (seed: number) => (n: number) => {
  let x = seed;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
};

const TOKEN_A = generateToken(seeded(1));
const TOKEN_B = generateToken(seeded(2));
const record = (over: Partial<PassRecord> = {}): PassRecord => ({
  token: TOKEN_A,
  invitationId: 'inv-valentina',
  validFrom: '2026-10-24T06:00:00-05:00',
  validTo: '2026-10-24T22:00:00-05:00',
  ...over,
});
const code = (r: PassRecord | null, presented: string, now = NOW) => {
  const c = checkPass(r, presented, now);
  return c.ok ? 'OK' : c.code;
};

describe('QR manipulado', () => {
  test('el token legítimo valida', () => {
    expect(code(record(), TOKEN_A)).toBe('OK');
  });

  test('cambiar un carácter, en cualquier posición, nunca valida', () => {
    for (let i = 0; i < TOKEN_A.length; i++) {
      const current = TOKEN_A[i]!;
      const other = current === 'A' ? 'B' : 'A';
      const tampered = TOKEN_A.slice(0, i) + other + TOKEN_A.slice(i + 1);
      expect(code(record(), tampered)).not.toBe('OK');
    }
  });

  test('cambiar cada carácter por todo el alfabeto nunca valida salvo el original', () => {
    for (let i = 0; i < TOKEN_A.length; i++) {
      for (const ch of ALPHABET) {
        const tampered = TOKEN_A.slice(0, i) + ch + TOKEN_A.slice(i + 1);
        expect(code(record(), tampered) === 'OK').toBe(tampered === TOKEN_A);
      }
    }
  });

  test.each([
    ['espacio al inicio', ` ${TOKEN_A}`],
    ['espacio al final', `${TOKEN_A} `],
    ['salto de línea final', `${TOKEN_A}\n`],
    ['tabulación', `${TOKEN_A}\t`],
    ['prefijo distinto', TOKEN_A.replace('nq_', 'nx_')],
    ['prefijo en mayúsculas', TOKEN_A.replace('nq_', 'NQ_')],
    ['sin prefijo', TOKEN_A.slice(3)],
    ['longitud -1', TOKEN_A.slice(0, -1)],
    ['longitud +1', `${TOKEN_A}A`],
    ['unicode (cirílica a)', `${TOKEN_A.slice(0, -1)}а`],
    ['unicode (ancho completo)', `${TOKEN_A.slice(0, -1)}Ａ`],
    ['carácter nulo', `${TOKEN_A.slice(0, -1)}\u0000`],
    ['cadena vacía', ''],
    ['solo prefijo', 'nq_'],
    ['10 KB', 'nq_' + 'A'.repeat(10 * 1024)],
    ['10 KB de unicode', 'é'.repeat(10 * 1024)],
    ['concatenado con otro token', TOKEN_A + TOKEN_B],
    ['URL con el token', `https://club.example/p?t=${TOKEN_A}`],
    ['inyección SQL', "nq_' OR '1'='1"],
  ])('%s -> MALFORMED', (_name, presented) => {
    expect(isWellFormedToken(presented)).toBe(false);
    expect(code(record(), presented)).toBe('MALFORMED');
    // Malformed is reported before the record is consulted: no oracle on what exists.
    expect(code(null, presented)).toBe('MALFORMED');
  });

  test('mayúsculas y minúsculas: otro texto, no coincide con el registro', () => {
    for (const variant of [TOKEN_A.toUpperCase(), TOKEN_A.toLowerCase()]) {
      if (variant !== TOKEN_A) expect(code(record(), variant)).not.toBe('OK');
    }
    expect(code(record(), 'NQ_' + TOKEN_A.slice(3))).toBe('MALFORMED');
  });

  test('un valor no cadena no valida y no lanza', () => {
    for (const v of [undefined, null, 0, {}, [], NaN] as unknown[]) {
      expect(() => checkPass(record(), v as string, NOW)).not.toThrow();
      expect(code(record(), v as string)).toBe('MALFORMED');
    }
  });
});

describe('QR reutilizado, compartido o sin registro', () => {
  test('usedAt -> USED (un solo uso), también si además venció', () => {
    expect(code(record({ usedAt: '2026-10-24T09:00:00-05:00' }), TOKEN_A)).toBe('USED');
    expect(
      code(record({ usedAt: '2026-10-24T09:00:00-05:00' }), TOKEN_A, new Date('2026-10-25')),
    ).toBe('USED');
  });

  test('revocado gana a usado y a vigente', () => {
    const revoked = record({
      revokedAt: '2026-10-24T08:00:00-05:00',
      usedAt: '2026-10-24T09:00:00-05:00',
    });
    expect(code(revoked, TOKEN_A)).toBe('REVOKED');
  });

  test('presentar el token de otro invitado contra este registro no coincide', () => {
    const mine = record({ token: TOKEN_A, invitationId: 'inv-valentina' });
    // Whoever presents B against A's invitation: UNKNOWN, never OK and never a detailed code.
    expect(code(mine, TOKEN_B)).toBe('UNKNOWN');
    // And the reverse pairing.
    const theirs = record({ token: TOKEN_B, invitationId: 'inv-daniela' });
    expect(code(theirs, TOKEN_A)).toBe('UNKNOWN');
    expect(code(theirs, TOKEN_B)).toBe('OK');
  });

  test('sin registro (token desconocido) -> UNKNOWN', () => {
    expect(code(null, TOKEN_A)).toBe('UNKNOWN');
  });

  test('un token ajeno no revela el estado del registro (usado, vencido, revocado)', () => {
    for (const over of [
      { usedAt: '2026-10-24T09:00:00-05:00' },
      { revokedAt: '2026-10-24T09:00:00-05:00' },
      { validTo: '2026-10-24T08:00:00-05:00' },
    ]) {
      expect(code(record(over), TOKEN_B)).toBe('UNKNOWN');
    }
  });

  test('la ventana es [validFrom, validTo) y falla cerrada fuera de ella', () => {
    const r = record();
    expect(code(r, TOKEN_A, new Date('2026-10-24T05:59:59-05:00'))).toBe('NOT_YET_VALID');
    expect(code(r, TOKEN_A, new Date('2026-10-24T06:00:00-05:00'))).toBe('OK');
    expect(code(r, TOKEN_A, new Date('2026-10-24T21:59:59.999-05:00'))).toBe('OK');
    expect(code(r, TOKEN_A, new Date('2026-10-24T22:00:00-05:00'))).toBe('EXPIRED');
  });

  test.each(['', 'mañana', 'NaN', '2026-13-45T99:99:99', '24/10/2026', 'undefined'])(
    'fecha ilegible %p en validFrom o validTo falla cerrado',
    (bad) => {
      expect(code(record({ validFrom: bad }), TOKEN_A)).not.toBe('OK');
      expect(code(record({ validTo: bad }), TOKEN_A)).not.toBe('OK');
    },
  );

  test('un instante actual inválido falla cerrado', () => {
    expect(code(record(), TOKEN_A, new Date(NaN))).not.toBe('OK');
  });
});

describe('generateToken es opaco', () => {
  const seed = createSeed();
  const pii = [
    ...seed.people.flatMap((p) => [p.id, p.name]),
    ...seed.invitations.flatMap((i) => [i.id, i.guestName, i.hostId, i.date]),
  ].filter((v) => v.length >= 5); // shorter strings would match random bytes by chance

  test('no depende de datos del invitado: solo de los bytes aleatorios inyectados', () => {
    const bytes = seeded(7)(16);
    const t1 = generateToken(() => bytes);
    const t2 = generateToken(() => bytes);
    expect(t1).toBe(t2);
    expect(generateToken.length).toBe(1); // única entrada: la fuente de aleatoriedad
  });

  test('el token nunca contiene ni codifica datos del club (texto, base64 o hex)', () => {
    const tokens = Array.from({ length: 200 }, (_, i) => generateToken(seeded(i + 1)));
    for (const token of tokens) {
      expect(isWellFormedToken(token)).toBe(true);
      const body = token.slice(3).toLowerCase();
      for (const value of pii) {
        const v = value.toLowerCase();
        expect(body.includes(v)).toBe(false);
        expect(body.includes(Buffer.from(v).toString('base64url').toLowerCase())).toBe(false);
        expect(body.includes(Buffer.from(v).toString('hex'))).toBe(false);
      }
    }
  });

  test('con entropía real: 22 caracteres base64url, sin repetidos en 1000 emisiones', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken(secureRandom)));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) expect(t).toMatch(/^nq_[A-Za-z0-9_-]{22}$/);
  });

  test('entropía insuficiente o excesiva se rechaza (no hay tokens débiles)', () => {
    expect(() => generateToken(() => new Uint8Array(15))).toThrow('TOKEN_ENTROPY');
    expect(() => generateToken(() => new Uint8Array(0))).toThrow('TOKEN_ENTROPY');
    expect(() => generateToken(() => new Uint8Array(17))).toThrow('TOKEN_ENTROPY');
  });

  test('la fuente aleatoria falla en vez de degradarse', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => secureRandom(16)).toThrow('SECURE_RANDOM_UNAVAILABLE');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});
