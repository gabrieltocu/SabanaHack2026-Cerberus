import { qrPayload } from '@/club/qr';
import {
  diaBogota,
  ejemplo,
  estadoPase,
  fechaCorta,
  horaCorta,
  horaDeTexto,
  iniciales,
  limpiar,
  parsePase,
} from '@/features/visita/pase';

// 2026-10-24 14:00 en Bogotá (UTC-5).
const EXP = Date.parse('2026-10-24T18:00:00-05:00') / 1000;
const FIRMA = 'a1b2c3d4e5f6a7b8c9d0';
const PAYLOAD = `NCLUB1|invitado|INV-7|Laura Díaz|${EXP}|${FIRMA}`;

describe('parsePase', () => {
  it('lee un pase con la forma del robot', () => {
    expect(parsePase(PAYLOAD)).toEqual({
      tipo: 'invitado',
      personaId: 'INV-7',
      nombre: 'Laura Díaz',
      venceUnix: EXP,
      firma: FIRMA,
    });
  });

  it('lee exactamente lo que firma la API del club (qrPayload)', () => {
    const p = qrPayload('externo', 'EXT-3', 'Luis Peña', EXP, 'secreto-de-prueba');
    expect(parsePase(p)).toMatchObject({
      tipo: 'externo',
      personaId: 'EXT-3',
      nombre: 'Luis Peña',
    });
  });

  it.each([
    ['vacío', ''],
    ['nulo', null],
    ['indefinido', undefined],
    ['5 partes', `NCLUB1|invitado|INV-7|Laura|${EXP}`],
    ['7 partes', `${PAYLOAD}|x`],
    ['versión distinta', PAYLOAD.replace('NCLUB1', 'NCLUB2')],
    ['tipo desconocido', PAYLOAD.replace('invitado', 'visitante')],
    ['persona vacía', `NCLUB1|invitado| |Laura|${EXP}|${FIRMA}`],
    ['nombre vacío', `NCLUB1|invitado|INV-7| |${EXP}|${FIRMA}`],
    ['exp no numérico', `NCLUB1|invitado|INV-7|Laura|mañana|${FIRMA}`],
    ['exp negativo', `NCLUB1|invitado|INV-7|Laura|-5|${FIRMA}`],
    ['firma corta', `NCLUB1|invitado|INV-7|Laura|${EXP}|abc123`],
    ['firma no hex', `NCLUB1|invitado|INV-7|Laura|${EXP}|${'z'.repeat(20)}`],
    ['demasiado largo', `NCLUB1|invitado|INV-7|${'a'.repeat(300)}|${EXP}|${FIRMA}`],
  ])('rechaza: %s', (_caso, p) => {
    expect(parsePase(p)).toBeNull();
  });

  it('acepta los cuatro tipos del robot (la ruta decide cuáles muestra)', () => {
    for (const t of ['socio', 'invitado', 'personal', 'externo']) {
      expect(parsePase(`NCLUB1|${t}|X|Ana|${EXP}|${FIRMA}`)?.tipo).toBe(t);
    }
  });
});

describe('reloj de Bogotá', () => {
  const ms = EXP * 1000;
  it('da hora, fecha y día en UTC-5', () => {
    expect(horaCorta(ms)).toBe('6:00\u00a0p.\u00a0m.');
    expect(horaCorta(Date.parse('2026-10-24T00:05:00-05:00'))).toBe('12:05\u00a0a.\u00a0m.');
    expect(horaCorta(Date.parse('2026-10-24T12:30:00-05:00'))).toBe('12:30\u00a0p.\u00a0m.');
    expect(fechaCorta(ms)).toBe('sáb 24 oct 2026');
    expect(diaBogota(Date.parse('2026-10-25T02:00:00Z'))).toBe('2026-10-24');
  });

  it('convierte HH:MM del enlace y descarta lo que no es hora', () => {
    expect(horaDeTexto('14:00')).toBe('2:00\u00a0p.\u00a0m.');
    expect(horaDeTexto('8:15')).toBe('8:15\u00a0a.\u00a0m.');
    expect(horaDeTexto('25:00')).toBeUndefined();
    expect(horaDeTexto('tarde')).toBeUndefined();
    expect(horaDeTexto(undefined)).toBeUndefined();
  });
});

describe('estadoPase', () => {
  const pase = parsePase(PAYLOAD)!;
  const t = (hhmm: string) => Date.parse(`2026-10-24T${hhmm}:00-05:00`);

  it('vigente antes del vencimiento, vencido desde el segundo exacto', () => {
    expect(estadoPase(pase, t('17:59')).estado).toBe('vigente');
    expect(estadoPase(pase, t('18:00'))).toMatchObject({ estado: 'vencido', finMs: EXP * 1000 });
    expect(estadoPase(pase, t('21:00')).estado).toBe('vencido');
  });

  it('el horario del enlace acota: aún no empieza y `hasta` anticipa el fin', () => {
    const v = { fecha: '2026-10-24', desde: '15:00', hasta: '17:00' };
    expect(estadoPase(pase, t('14:00'), v)).toMatchObject({
      estado: 'aun-no',
      inicioMs: t('15:00'),
    });
    expect(estadoPase(pase, t('16:00'), v).estado).toBe('vigente');
    expect(estadoPase(pase, t('17:30'), v)).toMatchObject({ estado: 'vencido', finMs: t('17:00') });
  });

  it('un `hasta` posterior al vencimiento firmado no lo alarga; datos inválidos se ignoran', () => {
    expect(estadoPase(pase, t('18:30'), { hasta: '20:00' }).estado).toBe('vencido');
    expect(estadoPase(pase, t('16:00'), { desde: 'x', hasta: 'y' }).estado).toBe('vigente');
    expect(estadoPase(pase, t('16:00'), { fecha: 'hoy', desde: '17:00' }).estado).toBe('vigente');
  });
});

describe('utilidades de texto', () => {
  it('limpia espacios y acota', () => {
    expect(limpiar('  Sala   de\nanfitriones ')).toBe('Sala de anfitriones');
    expect(limpiar('x'.repeat(200))).toHaveLength(80);
    expect(limpiar('   ')).toBeUndefined();
    expect(limpiar(undefined)).toBeUndefined();
  });

  it('saca iniciales', () => {
    expect(iniciales('laura díaz')).toBe('LD');
    expect(iniciales('Ana María Gómez')).toBe('AM');
    expect(iniciales('Cher')).toBe('C');
    expect(iniciales('  ')).toBe('?');
  });
});

describe('ejemplo', () => {
  it.each([
    ['2026-10-24T15:20:00-05:00'],
    ['2026-10-24T23:30:00-05:00'],
    ['2026-10-24T00:10:00-05:00'],
  ])('es un pase vigente ahora mismo (%s)', (iso) => {
    const now = Date.parse(iso);
    for (const tipo of ['invitado', 'externo'] as const) {
      const e = ejemplo(tipo, now);
      const pase = parsePase(e.p)!;
      expect(pase.tipo).toBe(tipo);
      expect(diaBogota(pase.venceUnix * 1000)).toBe(diaBogota(now));
      expect(estadoPase(pase, now, e).estado).toBe('vigente');
    }
  });

  it('usa los datos ficticios del encargo', () => {
    const a = ejemplo('invitado', Date.parse('2026-10-24T15:20:00-05:00'));
    expect(parsePase(a.p)?.nombre).toBe('Laura Díaz');
    expect(a).toMatchObject({ anfitrion: 'Sofía', lugar: 'Sala de anfitriones', hasta: '20:00' });
    const b = ejemplo('externo', Date.parse('2026-10-24T15:20:00-05:00'));
    expect(parsePase(b.p)?.nombre).toBe('Luis Peña');
    expect(b).toMatchObject({ orden: 'OT-1042', empresa: 'Climatec', supervisor: 'Jorge' });
    expect(b.desde).toBe('15:00');
  });
});
