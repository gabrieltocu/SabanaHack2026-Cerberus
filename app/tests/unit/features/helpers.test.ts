import { Platform } from 'react-native';
import {
  ACTIVITIES,
  FACES,
  checkPass,
  orientationVars,
  simulateFace,
} from '@/features/demo/fixtures';
import { qrPath } from '@/features/invitations/QrCode';
import { validateInvitation } from '@/features/invitations/validation';
import { copyText } from '@/features/shared/clipboard';
import { dateLabel, greetingFor, spokenDate } from '@/features/shared/dates';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

describe('dates', () => {
  it('formats civil dates the same everywhere', () => {
    expect(dateLabel('2026-10-24')).toBe('sáb 24 oct 2026');
    expect(dateLabel('2026-10-27')).toBe('mar 27 oct 2026');
    expect(spokenDate('2026-10-24')).toBe('sábado 24 de octubre');
  });

  it('leaves non-dates untouched', () => {
    expect(dateLabel('mañana')).toBe('mañana');
    expect(spokenDate('mañana')).toBe('mañana');
  });

  it('greets by the Bogotá hour: tardes from 12:00, noches from 18:00', () => {
    expect(greetingFor(9)).toBe('Buenos días');
    expect(greetingFor(12)).toBe('Buenas tardes');
    expect(greetingFor(17)).toBe('Buenas tardes');
    expect(greetingFor(18)).toBe('Buenas noches');
  });
});

describe('validateInvitation', () => {
  const today = '2026-10-24';

  it('accepts a name and a date from today up to 30 days ahead', () => {
    expect(validateInvitation({ guestName: 'Valentina', date: '2026-10-24' }, today)).toEqual({});
    expect(validateInvitation({ guestName: 'Va', date: '2026-11-23' }, today)).toEqual({});
  });

  it('requires a name of 2 to 60 characters, trimmed', () => {
    for (const guestName of ['', '  ', 'A', ' B ', 'x'.repeat(61)]) {
      expect(validateInvitation({ guestName, date: today }, today).guestName).toBe(
        'INVITATION_GUEST_NAME_REQUIRED',
      );
    }
  });

  it('rejects dates in the past, beyond 30 days, malformed or impossible', () => {
    for (const date of ['2026-10-23', '2026-11-24', '24/10/2026', '', '2026-02-31']) {
      expect(validateInvitation({ guestName: 'Ana', date }, today).date).toBe(
        'INVITATION_DATE_INVALID',
      );
    }
    expect(validateInvitation({ guestName: 'Ana', date: today }, 'hoy').date).toBe(
      'INVITATION_DATE_INVALID',
    );
  });
});

describe('qrPath', () => {
  it('draws one run per horizontal stretch of dark modules, offset by the quiet zone', () => {
    const grid = [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ];
    expect(qrPath(3, (r, c) => grid[r]?.[c] === 1)).toBe('M4 4h2v1h-2zM5 5h2v1h-2z');
    expect(qrPath(2, () => false)).toBe('');
  });
});

describe('demo fixtures', () => {
  it('offers the seven presenter faces in the documented order', () => {
    expect(FACES.map((f) => f.label)).toEqual([
      'Andrés · miembro',
      'Camila · miembro',
      'Valentina · no miembro',
      'Mario · no miembro',
      'Laura · no miembro',
      'Rostro desconocido',
      'Error de cámara',
    ]);
  });

  it('classifies each face from records, never from the face alone', () => {
    expect(simulateFace('andres')).toMatchObject({ state: 'CONFIRMED', category: 'VIP' });
    expect(simulateFace('camila')).toMatchObject({ state: 'CONFIRMED', category: 'REGULAR' });
    expect(simulateFace('valentina')).toMatchObject({
      state: 'CONFIRMED',
      category: 'GUEST',
      evidence: 'Invitación de Camila para hoy',
    });
    expect(simulateFace('mario')).toMatchObject({ category: 'STAFF' });
    expect(simulateFace('laura', 'sábado')).toMatchObject({ category: 'EXTERNAL' });
    expect(simulateFace('unknown')).toEqual({
      state: 'MANUAL_REVIEW',
      code: 'RECOGNITION_UNKNOWN',
    });
    expect(simulateFace('error')).toEqual({ state: 'MANUAL_REVIEW', code: 'RECOGNITION_ERROR' });
  });

  it('denies the external worker outside her day with the weekday in the explanation', () => {
    expect(simulateFace('laura', 'martes')).toEqual({
      state: 'DENIED',
      code: 'EXTERNAL_DAY_NOT_ALLOWED',
      vars: { día: 'martes' },
    });
  });

  it('fills orientation variables from the category', () => {
    expect(orientationVars('VIP', 'Andrés')).toEqual({
      nombre: 'Andrés',
      anfitrión: 'Camila',
      destino: 'Salón reservado',
      acompañante: 'R2',
    });
    expect(orientationVars('STAFF', 'Mario').acompañante).toBeUndefined();
    expect(orientationVars('GUEST', 'Tomás', 'Andrés').anfitrión).toBe('Andrés');
  });

  it('checks a pass: valid confirms the guest, the rest explain with their code', () => {
    expect(checkPass('demo-valentina')).toMatchObject({
      host: 'Camila',
      result: { state: 'CONFIRMED', name: 'Valentina', category: 'GUEST' },
    });
    expect(checkPass('demo-vencido')).toMatchObject({ errorCode: 'QR_EXPIRED' });
    expect(checkPass('demo-usado')).toMatchObject({ errorCode: 'QR_ALREADY_USED' });
    expect(checkPass('demo-cancelado')).toMatchObject({ errorCode: 'QR_REVOKED' });
    expect(checkPass('demo-futuro')).toEqual({
      errorCode: 'QR_NOT_YET_VALID',
      vars: { fecha: 'dom 25 oct 2026' },
    });
    expect(checkPass('no-existe')).toEqual({ errorCode: 'QR_NOT_FOUND' });
    expect(checkPass(' x ')).toEqual({ errorCode: 'QR_INVALID' });
  });

  it('lists three public activities and no staff events', () => {
    expect(ACTIVITIES.map((a) => a.name)).toEqual([
      'Clase de tenis',
      'Té de la tarde',
      'Lectura en el salón',
    ]);
  });
});

describe('copyText', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
  });

  it('copies through the native clipboard outside the web', async () => {
    await expect(copyText('enlace')).resolves.toBe(true);
  });

  it('copies through the clipboard when there is one', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    });
    await expect(copyText('enlace')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('enlace');
  });

  it('resolves false when access is refused or there is no clipboard', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } },
      configurable: true,
    });
    await expect(copyText('x')).resolves.toBe(false);
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    await expect(copyText('x')).resolves.toBe(false);
  });
});
