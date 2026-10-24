import { bogotaInstant, bogotaParts, parseLocalTime } from '@/domain/policies/bogota-time';

describe('bogotaParts', () => {
  test('04:59:59Z sigue siendo 23:59:59 del día anterior en Bogotá', () => {
    expect(bogotaParts(new Date('2026-10-24T04:59:59Z'))).toEqual({
      date: '2026-10-23',
      weekday: 5,
      minutes: 23 * 60 + 59,
    });
  });

  test('05:00:00Z ya es medianoche del día siguiente en Bogotá', () => {
    expect(bogotaParts(new Date('2026-10-24T05:00:00Z'))).toEqual({
      date: '2026-10-24',
      weekday: 6,
      minutes: 0,
    });
  });

  test('cruza fin de año y respeta el offset de entrada', () => {
    expect(bogotaParts(new Date('2027-01-01T04:00:00Z')).date).toBe('2026-12-31');
    expect(bogotaParts(new Date('2026-10-24T15:00:00-05:00'))).toEqual({
      date: '2026-10-24',
      weekday: 6,
      minutes: 15 * 60,
    });
  });
});

describe('parseLocalTime', () => {
  test('convierte HH:MM a minutos', () => {
    expect(parseLocalTime('00:00')).toBe(0);
    expect(parseLocalTime('07:30')).toBe(450);
    expect(parseLocalTime('23:59')).toBe(1439);
  });

  test.each(['7:30', '24:00', '12:60', '12-30', '', '12:30:00', 'ab:cd'])(
    'lanza con formato inválido %p',
    (value) => {
      expect(() => parseLocalTime(value)).toThrow();
    },
  );
});

describe('bogotaInstant', () => {
  test('combina fecha y hora local de Bogotá en un instante UTC', () => {
    expect(bogotaInstant('2026-10-24', '07:00').toISOString()).toBe('2026-10-24T12:00:00.000Z');
    expect(bogotaInstant('2026-10-23', '23:59').toISOString()).toBe('2026-10-24T04:59:00.000Z');
  });

  test('lanza con fecha u hora inválidas', () => {
    expect(() => bogotaInstant('2026-13-40', '07:00')).toThrow();
    expect(() => bogotaInstant('24/10/2026', '07:00')).toThrow();
    expect(() => bogotaInstant('2026-10-24', '7am')).toThrow();
  });
});
