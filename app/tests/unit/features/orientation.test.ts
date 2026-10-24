import type { Category } from '@/domain/entities/types';
import { messageFor, MESSAGES } from '@/features/messages';
import {
  COMMON_COPY,
  ORIENTATION,
  PHASE_TO_STEP,
  renderCopy,
  type OrientationPhase,
} from '@/features/orientation/copy';
import { VISIT_PHASES } from '@/design-system';

const CATEGORIES: Category[] = ['VIP', 'REGULAR', 'GUEST', 'STAFF', 'EXTERNAL'];
const PHASES: OrientationPhase[] = [
  'greeting',
  'destination',
  'assignment',
  'route',
  'arrival',
  'exit',
  'farewell',
];

describe('renderCopy', () => {
  it('fills every placeholder it has a value for, repeated ones included', () => {
    expect(renderCopy('{nombre}, ¿eres tú? Sí, {nombre}.', { nombre: 'Andrés' })).toBe(
      'Andrés, ¿eres tú? Sí, Andrés.',
    );
    expect(
      renderCopy('{anfitrión} te espera en {destino}', {
        anfitrión: 'Camila',
        destino: 'la terraza',
      }),
    ).toBe('Camila te espera en la terraza');
  });

  it('keeps a placeholder with no value visible instead of inventing text', () => {
    expect(renderCopy('Hola, {nombre}. Te espera {anfitrión}.', { nombre: 'Laura' })).toBe(
      'Hola, Laura. Te espera {anfitrión}.',
    );
    expect(renderCopy('Sin variables {desconocida}')).toBe('Sin variables {desconocida}');
  });

  it('is pure: the same input gives the same output and templates are untouched', () => {
    const template = '{nombre} y {nombre}';
    expect(renderCopy(template, { nombre: 'A' })).toBe(renderCopy(template, { nombre: 'A' }));
    expect(template).toBe('{nombre} y {nombre}');
  });
});

describe('orientation scripts', () => {
  const vars = { nombre: 'Persona', anfitrión: 'Anfitrión', acompañante: 'Guía' };

  it('covers the five categories with every spoken phase', () => {
    for (const category of CATEGORIES) {
      for (const phase of PHASES) {
        expect(ORIENTATION[category].phases[phase].text.length).toBeGreaterThan(10);
      }
    }
  });

  it('makes the five orientations different in greeting, destination question and destination', () => {
    const greetings = CATEGORIES.map((c) => renderCopy(ORIENTATION[c].phases.greeting.text, vars));
    const questions = CATEGORIES.map((c) =>
      renderCopy(ORIENTATION[c].phases.destination.text, vars),
    );
    const destinations = CATEGORIES.map((c) => ORIENTATION[c].destination);
    expect(new Set(greetings).size).toBe(5);
    expect(new Set(questions).size).toBe(5);
    expect(new Set(destinations).size).toBe(5);
    expect(destinations).toEqual([
      'Salón reservado',
      'Cancha de tenis',
      'Terraza',
      'Operaciones',
      'Recepción de proveedores',
    ]);
  });

  it('follows the business script for each persona', () => {
    expect(ORIENTATION.VIP.phases.greeting.text).toContain('café');
    expect(ORIENTATION.VIP.phases.greeting.options).toEqual([
      'Café',
      'Otra bebida',
      'Nada por ahora',
    ]);
    expect(ORIENTATION.REGULAR.phases.greeting.options).toEqual([
      'Té',
      'Otra bebida',
      'Nada por ahora',
    ]);
    expect(ORIENTATION.GUEST.phases.greeting.text).toContain('{anfitrión}');
    expect(ORIENTATION.GUEST.phases.arrival.options).toContain('Contactar a {anfitrión}');
    expect(ORIENTATION.GUEST.phases.exit.options).toEqual(['Quiero saber más', 'No, gracias']);
    expect(ORIENTATION.STAFF.escort).toBeNull();
    expect(ORIENTATION.VIP.escort).toBe('R2');
    expect(ORIENTATION.REGULAR.escort).toBe('Sara');
    expect(ORIENTATION.EXTERNAL.escort).toBe('Sara');
  });

  it('uses «usted» only with the external worker', () => {
    expect(CATEGORIES.filter((c) => ORIENTATION[c].address === 'usted')).toEqual(['EXTERNAL']);
    expect(ORIENTATION.EXTERNAL.phases.greeting.text).toContain('Su visita');
  });

  it('never shows the private meeting detail on the kiosk', () => {
    const kiosk = ORIENTATION.STAFF.phases.destination;
    expect(kiosk.text).not.toMatch(/reunión|7 p\. m\./);
    expect(kiosk.privateText).toMatch(/reunión/);
  });

  it('offers at most three answers per screen and never promises what is not confirmed', () => {
    for (const category of CATEGORIES) {
      for (const phase of PHASES) {
        const { options, text } = ORIENTATION[category].phases[phase];
        expect(options.length).toBeLessThanOrEqual(3);
        expect(text).not.toMatch(/está en el destino|será preparad/i);
      }
    }
  });

  it('maps every spoken phase onto one of the ten official visit phases', () => {
    const keys = VISIT_PHASES.map((p) => p.key);
    for (const key of Object.values(PHASE_TO_STEP)) expect(keys).toContain(key);
  });

  it('keeps the common texts of the script', () => {
    expect(COMMON_COPY.idle).toBe('Bienvenido a N Club.');
    expect(renderCopy(COMMON_COPY.confirmIdentity, { nombre: 'Camila' })).toBe('Camila, ¿eres tú?');
  });
});

describe('message catalog', () => {
  it('returns the catalog text and fills variables', () => {
    expect(messageFor('EXTERNAL_DAY_NOT_ALLOWED', { día: 'martes' })).toBe(
      'Su permiso de acceso aplica los sábados y hoy es martes.',
    );
    expect(messageFor('QR_REVOKED')).toBe('Tu anfitrión canceló esta invitación.');
  });

  it('never leaks an unknown code: it falls back to the generic message', () => {
    expect(messageFor('ALGO_INTERNO_EXTRAÑO')).toBe(MESSAGES.SERVER_ERROR);
  });
});
