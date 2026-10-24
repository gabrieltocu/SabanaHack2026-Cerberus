// Orientation scripts per category, transcribed from docs/design/orientation-copy.md.
// Texts are templates: `{nombre}`, `{anfitrión}`, `{destino}`... are filled by `renderCopy`.
import type { Category } from '../../domain/entities/types';

export type CopyVar =
  'nombre' | 'anfitrión' | 'destino' | 'bebida' | 'acompañante' | 'edecán' | 'día' | 'fecha';

export type CopyVars = Partial<Record<CopyVar, string>>;

/**
 * Pure. Replaces every `{var}` that has a value; an unknown or missing placeholder is kept
 * as written so a gap in the data is visible instead of silently producing broken sentences.
 */
export function renderCopy(template: string, vars: CopyVars = {}): string {
  return template.replace(/\{([^{}]+)\}/g, (whole, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value === undefined ? whole : value;
  });
}

/** Spoken phases of a visit after identity is confirmed. `feedback` is shared by every category. */
export type OrientationPhase =
  'greeting' | 'destination' | 'assignment' | 'route' | 'arrival' | 'exit' | 'farewell';

export type PhaseCopy = {
  text: string;
  /** Answer buttons, at most three (kiosk rule). */
  options: readonly string[];
  /** Line shown after the first answer to the greeting (offer, never a promise). */
  afterChoice?: string;
  /** Text for the private screen when the kiosk must not show the detail (staff agenda). */
  privateText?: string;
};

export type CategoryOrientation = {
  /** Destination used by the demonstration. */
  destination: string;
  /** Who escorts; `null` when no escort is requested. */
  escort: string | null;
  /** Register of the script: informal (tú) or formal (usted). */
  address: 'tu' | 'usted';
  phases: Record<OrientationPhase, PhaseCopy>;
};

export const COMMON_COPY = {
  idle: 'Bienvenido a N Club.',
  recognizing:
    'Bienvenido. Voy a confirmar tu visita. Si lo necesitas, podemos usar tu QR o pedir ayuda en recepción.',
  confirmIdentity: '{nombre}, ¿eres tú?',
  feedbackPrompt:
    'Si quieres, cuéntanos cómo te fue con el servicio de los robots y con los servicios del club. Puedes responder por texto o no participar.',
  feedbackSkipped: 'Sin problema. Tu salida no cambia.',
} as const;

export const ORIENTATION: Record<Category, CategoryOrientation> = {
  VIP: {
    destination: 'Salón reservado',
    escort: 'R2',
    address: 'tu',
    phases: {
      greeting: {
        text: '{nombre}, bienvenido. ¿Te apetece un café, como tienes registrado, o prefieres otra cosa?',
        options: ['Café', 'Otra bebida', 'Nada por ahora'],
        afterChoice: 'Anotado. Te indicaremos dónde recibirla.',
      },
      destination: {
        text: 'Hoy tenemos actividades registradas por el club. ¿Quieres conocerlas o prefieres que te acompañemos a tu reserva del salón?',
        options: ['Ver actividades de hoy', 'Ir a mi reserva del salón'],
      },
      assignment: {
        text: '{acompañante} puede acompañarte al salón. ¿Te parece bien?',
        options: ['Sí, con {acompañante}', 'Prefiero recibir indicaciones'],
      },
      route: {
        text: 'Vamos hacia tu salón, {nombre}. Si necesitas algo, puedes decírmelo.',
        options: [],
      },
      arrival: {
        text: 'Llegamos al salón de tu reserva. Que disfrutes el día en el club.',
        options: ['Entendido'],
      },
      exit: {
        text: '{nombre}, bienvenido de nuevo a recepción. ¿Ya terminaste tu visita por hoy?',
        options: ['Sí, terminé', 'Todavía no'],
      },
      farewell: {
        text: 'Hasta pronto, {nombre}. Gracias por venir; esperamos verte de nuevo.',
        options: ['Listo'],
      },
    },
  },
  REGULAR: {
    destination: 'Cancha de tenis',
    escort: 'Sara',
    address: 'tu',
    phases: {
      greeting: {
        text: '{nombre}, bienvenida. ¿Quieres un té o prefieres otra bebida?',
        options: ['Té', 'Otra bebida', 'Nada por ahora'],
        afterChoice: 'Anotado. Te indicaremos dónde recibirlo.',
      },
      destination: {
        text: '¿Vienes a tu reserva de tenis o quieres ir a otro lugar del club?',
        options: ['Voy a mi reserva de tenis', 'Otro lugar', 'Ver actividades de hoy'],
      },
      assignment: {
        text: '{acompañante} puede acompañarte a la cancha. ¿Prefieres ir con ella o recibir las indicaciones?',
        options: ['Ir con {acompañante}', 'Recibir indicaciones'],
      },
      route: {
        text: '{nombre}, soy {acompañante}. Vamos a la cancha que confirmaste en recepción.',
        options: [],
      },
      arrival: {
        text: 'Aquí está tu cancha, {nombre}. Que disfrutes el día en el club.',
        options: ['Entendido'],
      },
      exit: {
        text: '{nombre}, ¿ya terminaste tu visita? Podemos confirmar tu salida.',
        options: ['Sí, terminé', 'Todavía no'],
      },
      farewell: {
        text: 'Gracias por venir, {nombre}. Esperamos que vuelvas pronto.',
        options: ['Listo'],
      },
    },
  },
  GUEST: {
    destination: 'Terraza',
    escort: 'R2',
    address: 'tu',
    phases: {
      greeting: {
        text: 'Hola, {nombre}, bienvenida. {anfitrión} indicó que te gusta el agua aromática. ¿Quieres una o prefieres otra bebida?',
        options: ['Agua aromática', 'Otra bebida', 'Nada por ahora'],
        afterChoice: 'Anotado. Te indicaremos dónde recibirla.',
      },
      destination: {
        text: '{anfitrión} indicó que te espera en la terraza. ¿Quieres que te acompañemos hasta allí?',
        options: ['Sí, acompáñame', 'Prefiero esperar aquí'],
      },
      assignment: {
        text: '{acompañante} puede acompañarte a la terraza. ¿Quieres ir con él?',
        options: ['Sí, con {acompañante}', 'Prefiero ir con una persona del equipo'],
      },
      route: {
        text: '{nombre}, seguimos hacia la terraza, el punto que acordaste con {anfitrión}.',
        options: [],
      },
      arrival: {
        text: 'Esta es la terraza, {nombre}. Si {anfitrión} no está aquí, podemos contactarla. Que disfrutes el día en el club.',
        options: ['Contactar a {anfitrión}', 'Entendido'],
      },
      exit: {
        text: '{nombre}, gracias por visitarnos. ¿Te gustaría conocer cómo hacerte miembro? Si quieres, podemos ayudarte con la inscripción.',
        options: ['Quiero saber más', 'No, gracias'],
      },
      farewell: {
        text: 'Gracias por venir, {nombre}. Esperamos que hayas disfrutado la visita y que vuelvas pronto.',
        options: ['Listo'],
      },
    },
  },
  STAFF: {
    destination: 'Operaciones',
    escort: null,
    address: 'tu',
    phases: {
      greeting: {
        text: 'Hola, {nombre}. Buen día. ¿Quieres consultar en privado un resumen rápido de tu agenda de hoy?',
        options: ['Verlo en mi teléfono', 'Ahora no'],
      },
      destination: {
        // The meeting detail is private: the kiosk only says the summary went to the phone.
        text: 'Te envié el resumen a tu teléfono. ¿Necesitas ayuda para llegar o sigues por tu cuenta?',
        privateText:
          'Tienes una reunión hoy a las 7 p. m. en operaciones. ¿Necesitas ayuda para llegar o sigues por tu cuenta?',
        options: ['Sigo por mi cuenta', 'Necesito ayuda'],
      },
      assignment: {
        text: 'Perfecto, {nombre}. Puedes continuar. Si necesitas orientación, estamos aquí.',
        options: [],
      },
      route: {
        text: 'Operaciones queda por el corredor de servicio. ¿Necesitas alguna otra indicación?',
        options: [],
      },
      arrival: {
        text: 'Que tengas un gran día de trabajo, {nombre}.',
        options: ['Entendido'],
      },
      exit: {
        text: '{nombre}, ¿terminaste tu visita de hoy? Si quieres, puedes contarnos cómo te fue con la orientación.',
        options: ['Sí, terminé', 'Todavía no'],
      },
      farewell: {
        text: 'Nos vemos pronto, {nombre}. Gracias por tu trabajo de hoy.',
        options: ['Listo'],
      },
    },
  },
  EXTERNAL: {
    destination: 'Recepción de proveedores',
    escort: 'Sara',
    address: 'usted',
    phases: {
      greeting: {
        text: 'Buenos días, {nombre}. Bienvenida. Su visita de mantenimiento está registrada para hoy.',
        options: [],
      },
      destination: {
        text: 'El responsable de su servicio indicó recepción de proveedores como punto de presentación. Vamos a confirmar que la esperan allí.',
        options: ['Sí, vamos', 'Necesito ayuda en recepción'],
      },
      assignment: {
        text: '{acompañante} la acompañará al punto autorizado para su servicio.',
        options: ['Entendido'],
      },
      route: {
        text: '{nombre}, por aquí está el punto de presentación. Espere la confirmación del responsable antes de entrar al área de trabajo.',
        options: [],
      },
      arrival: {
        text: 'Aquí está recepción de proveedores. Que tenga un gran día de trabajo.',
        options: ['Entendido'],
      },
      exit: {
        text: '{nombre}, vamos a confirmar su salida. Si lo desea, puede comentar cómo fue la orientación.',
        options: ['Sí, terminé', 'Todavía no'],
      },
      farewell: {
        text: 'Gracias por su visita y por su aporte al club, {nombre}. Que tenga un buen día.',
        options: ['Listo'],
      },
    },
  },
};

/** Key of the ten official visit phases (design-system `VISIT_PHASES`) for each spoken phase. */
export const PHASE_TO_STEP: Record<OrientationPhase | 'feedback', string> = {
  greeting: 'welcome',
  destination: 'destination',
  assignment: 'assignment',
  route: 'escort',
  arrival: 'arrival',
  exit: 'exit',
  feedback: 'feedback',
  farewell: 'farewell',
};
