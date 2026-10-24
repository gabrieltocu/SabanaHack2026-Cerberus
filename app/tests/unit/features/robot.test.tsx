import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import type { Category } from '@/domain/entities/types';
import { FACES, orientationVars } from '@/features/demo/fixtures';
import { ORIENTATION } from '@/features/orientation/copy';
import { ClassificationResult } from '@/features/robot/ClassificationResult';
import { Farewell } from '@/features/robot/Farewell';
import { KioskFrame } from '@/features/robot/KioskFrame';
import { KioskWelcome } from '@/features/robot/KioskWelcome';
import { OrientationView } from '@/features/robot/OrientationView';
import { PresenterDrawer } from '@/features/robot/PresenterDrawer';
import { RecognitionPanel } from '@/features/robot/RecognitionPanel';
import { RobotFailureBanner, type FailureStage } from '@/features/robot/RobotFailureBanner';
import type { ClassificationView } from '@/features/types';
import { withRole } from './withRole';

const CATEGORIES: Category[] = ['VIP', 'REGULAR', 'GUEST', 'STAFF', 'EXTERNAL'];
const NAMES: Record<Category, string> = {
  VIP: 'Andrés',
  REGULAR: 'Camila',
  GUEST: 'Valentina',
  STAFF: 'Mario',
  EXTERNAL: 'Laura',
};

describe('KioskFrame', () => {
  it('names who speaks, shows the connection and always offers help', async () => {
    const onHelp = jest.fn();
    await render(
      <KioskFrame robotLabel="Robot R1 · Recepción" onHelp={onHelp}>
        <></>
      </KioskFrame>,
    );
    expect(screen.getByLabelText('Robot R1 · Recepción')).toBeTruthy();
    expect(screen.getByLabelText('Conectado')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Necesito ayuda' }));
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it('says so when there is no connection', async () => {
    await render(
      <KioskFrame robotLabel="Robot R2 · Acompañando" online={false} onHelp={jest.fn()}>
        <></>
      </KioskFrame>,
    );
    expect(screen.getByLabelText('Sin conexión')).toBeTruthy();
    expect(screen.getByText('Sin conexión')).toBeTruthy();
  });
});

describe('PresenterDrawer', () => {
  it('is closed by default, tagged as simulation, and opens on demand', async () => {
    await render(
      <PresenterDrawer>
        <Text>contenido del cajón</Text>
      </PresenterDrawer>,
    );
    expect(screen.queryByText('contenido del cajón')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Operación' });
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(toggle);
    expect(screen.getByText('contenido del cajón')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Operación' }).props.accessibilityState,
    ).toMatchObject({
      expanded: true,
    });
  });
});

describe('KioskWelcome', () => {
  it('greets without a name and offers start and QR', async () => {
    const onStart = jest.fn();
    const onQr = jest.fn();
    await render(<KioskWelcome onStart={onStart} onQr={onQr} />);
    expect(screen.getByRole('heading', { name: 'Bienvenido a N Club' })).toBeTruthy();
    expect(screen.getByText('Soy el robot de recepción.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Comenzar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Tengo un código QR' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onQr).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state with no buttons', async () => {
    await render(<KioskWelcome onStart={jest.fn()} onQr={jest.fn()} loading />);
    expect(screen.getByText('Preparando al robot…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Comenzar' })).toBeNull();
  });
});

describe('RecognitionPanel', () => {
  it('labels the camera and the face result as simulated and offers every face', async () => {
    const onSimulate = jest.fn();
    const onUseQr = jest.fn();
    await render(
      <RecognitionPanel status="ready" faces={FACES} onSimulate={onSimulate} onUseQr={onUseQr} />,
    );
    expect(screen.getByText('Rostro a reconocer')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Vista de la cámara' })).toBeTruthy();
    expect(
      screen.getByText(/Bienvenido\. Voy a confirmar tu visita\. Si lo necesitas/),
    ).toBeTruthy();
    for (const face of FACES) {
      expect(screen.getByRole('button', { name: face.label })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Camila · miembro' }));
    expect(onSimulate).toHaveBeenCalledWith('camila');
    await fireEvent.press(screen.getByRole('button', { name: 'Usar mi QR' }));
    expect(onUseQr).toHaveBeenCalledTimes(1);
  });

  it('while loading announces the wait and locks the face buttons', async () => {
    const onSimulate = jest.fn();
    await render(
      <RecognitionPanel
        status="loading"
        faces={FACES}
        onSimulate={onSimulate}
        onUseQr={jest.fn()}
      />,
    );
    expect(screen.getByText('Confirmando tu visita…')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Andrés · miembro' }));
    expect(onSimulate).not.toHaveBeenCalled();
  });
});

describe('ClassificationResult', () => {
  const noop = jest.fn();
  const handlers = { onConfirm: noop, onReject: noop, onUseQr: noop, onHelp: noop };

  it('CONFIRMED asks «¿eres tú?» with the evidence as one quiet line and no category label', async () => {
    const onConfirm = jest.fn();
    const onReject = jest.fn();
    const result: ClassificationView = {
      state: 'CONFIRMED',
      name: 'Andrés',
      category: 'VIP',
      evidence: 'Membresía vigente',
    };
    await render(
      <ClassificationResult
        {...handlers}
        result={result}
        simulated
        onConfirm={onConfirm}
        onReject={onReject}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Andrés, ¿eres tú?' })).toBeTruthy();
    expect(screen.getByText('Membresía vigente')).toBeTruthy();
    expect(screen.queryByText('Socio VIP')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar y notificar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Más opciones' }));
    await fireEvent.press(screen.getByRole('button', { name: 'No soy yo' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('locks the buttons while busy', async () => {
    await render(
      <ClassificationResult
        {...handlers}
        result={{
          state: 'CONFIRMED',
          name: 'Camila',
          category: 'REGULAR',
          evidence: 'Membresía vigente',
        }}
        busy
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Confirmar y notificar' }).props.accessibilityState,
    ).toMatchObject({
      busy: true,
    });
  });

  it('MANUAL_REVIEW explains and offers the QR and asking for help', async () => {
    const onUseQr = jest.fn();
    const onHelp = jest.fn();
    await render(
      <ClassificationResult
        {...handlers}
        result={{ state: 'MANUAL_REVIEW', code: 'RECOGNITION_UNKNOWN' }}
        onUseQr={onUseQr}
        onHelp={onHelp}
        simulated
      />,
    );
    expect(screen.getByRole('heading', { name: 'No pude confirmar tu identidad' })).toBeTruthy();
    expect(
      screen.getByText(
        'No pude confirmar tu identidad. Podemos usar tu QR o pedir apoyo a recepción.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Código: RECOGNITION_UNKNOWN')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Usar mi QR' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir ayuda' }));
    expect(onUseQr).toHaveBeenCalledTimes(1);
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it('asks for the pass when a face has no invitation behind it', async () => {
    await render(
      <ClassificationResult
        {...handlers}
        result={{ state: 'MANUAL_REVIEW', code: 'ACCESS_DENIED_NO_EVIDENCE' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Necesito tu pase' })).toBeTruthy();
    expect(screen.getByText(/Muéstrame tu QR o pide apoyo en recepción/)).toBeTruthy();
  });

  it('sends evidence that does not match to reception, with no QR option', async () => {
    const onHelp = jest.fn();
    await render(
      <ClassificationResult
        {...handlers}
        onHelp={onHelp}
        result={{ state: 'MANUAL_REVIEW', code: 'CLASSIFICATION_MANUAL_REVIEW' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Recepción puede ayudarte' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Usar mi QR' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Avisar a recepción' }));
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it('DENIED explains with respect, in usted for the external worker, and offers reception', async () => {
    await render(
      <ClassificationResult
        {...handlers}
        result={{ state: 'DENIED', code: 'EXTERNAL_DAY_NOT_ALLOWED', vars: { día: 'martes' } }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No puedo confirmar su visita hoy' })).toBeTruthy();
    expect(
      screen.getByText('Su permiso de acceso aplica los sábados y hoy es martes.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Avisar a recepción' })).toBeTruthy();
  });

  it('DENIED for a member says so with the catalog text', async () => {
    await render(
      <ClassificationResult
        {...handlers}
        result={{ state: 'DENIED', code: 'MEMBERSHIP_NOT_ACTIVE' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No puedo confirmar tu visita' })).toBeTruthy();
    expect(
      screen.getByText('No encuentro una membresía vigente. Recepción puede ayudarte.'),
    ).toBeTruthy();
  });

  it('falls back safely for a code it does not know', async () => {
    const { rerender } = await render(
      <ClassificationResult {...handlers} result={{ state: 'DENIED', code: 'CODIGO_NUEVO' }} />,
    );
    expect(screen.getByRole('button', { name: 'Avisar a recepción' })).toBeTruthy();
    await rerender(
      <ClassificationResult
        {...handlers}
        result={{ state: 'MANUAL_REVIEW', code: 'CODIGO_NUEVO' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Usar mi QR' })).toBeTruthy();
    expect(
      screen.getByText('No pudimos completar la acción. No se hizo ningún cambio.'),
    ).toBeTruthy();
  });

  it('shows the confirmation instead of asking again once reception was notified', async () => {
    await render(
      <ClassificationResult
        {...handlers}
        notified
        result={{ state: 'MANUAL_REVIEW', code: 'RECOGNITION_UNKNOWN' }}
      />,
    );
    expect(
      screen.getByText('Aviso enviado a recepción. Una persona del equipo viene en camino.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pedir ayuda' })).toBeNull();
  });
});

describe('OrientationView', () => {
  const view = (category: Category, phase: Parameters<typeof OrientationView>[0]['phase']) => (
    <OrientationView
      category={category}
      phase={phase}
      vars={orientationVars(category, NAMES[category])}
      onChoose={jest.fn()}
      onContinue={jest.fn()}
    />
  );

  it('speaks a different greeting, destination and escort for each of the five categories', async () => {
    const greetings: string[] = [];
    const destinations: string[] = [];
    for (const category of CATEGORIES) {
      await render(view(category, 'greeting'));
      greetings.push(screen.getByRole('heading').props.children as string);
      await screen.unmount();
      await render(view(category, 'assignment'));
      expect(screen.getByText('Destino registrado')).toBeTruthy();
      destinations.push(ORIENTATION[category].destination);
      expect(screen.getByText(ORIENTATION[category].destination)).toBeTruthy();
      const escort = ORIENTATION[category].escort;
      if (escort) expect(screen.getByText(new RegExp(`^${escort} te acompaña`))).toBeTruthy();
      else expect(screen.queryByText(/te acompaña/)).toBeNull();
      await screen.unmount();
    }
    expect(new Set(greetings).size).toBe(5);
    expect(new Set(destinations).size).toBe(5);
  });

  it('greets by name in quotes and offers the documented answers', async () => {
    const onChoose = jest.fn();
    await render(
      <OrientationView
        category="VIP"
        phase="greeting"
        vars={orientationVars('VIP', 'Andrés')}
        onChoose={onChoose}
      />,
    );
    expect(
      screen.getByRole('heading', {
        name: '“Andrés, bienvenido. ¿Te apetece un café, como tienes registrado, o prefieres otra cosa?”',
      }),
    ).toBeTruthy();
    for (const name of ['Café', 'Otra bebida', 'Nada por ahora']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Café' }));
    expect(onChoose).toHaveBeenCalledWith('Café');
  });

  it('after answering the greeting shows the offer line and moves on with «Continuar»', async () => {
    const onContinue = jest.fn();
    await render(
      <OrientationView
        category="VIP"
        phase="greeting"
        greetingAnswer="Café"
        vars={orientationVars('VIP', 'Andrés')}
        onChoose={jest.fn()}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText('Anotado. Te indicaremos dónde recibirla.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Café' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('fills the escort into the answer buttons', async () => {
    await render(view('VIP', 'assignment'));
    expect(screen.getByRole('button', { name: 'Sí, con R2' })).toBeTruthy();
    expect(screen.getByText('R2 te acompaña · robot de acompañamiento')).toBeTruthy();
  });

  it('marks the guest escort as a team member when it is a person', async () => {
    await render(view('REGULAR', 'assignment'));
    expect(screen.getByText('Sara te acompaña · persona del equipo')).toBeTruthy();
  });

  it('shows the three-point route with the current step on the route and arrival phases', async () => {
    await render(view('VIP', 'route'));
    expect(withRole('list', 'Ruta')).toHaveLength(1);
    expect(withRole('listitem')).toHaveLength(3);
    expect(screen.getByText('✓ Recepción')).toBeTruthy();
    expect(screen.getByText('● Pasillo')).toBeTruthy();
    expect(screen.getAllByText('Salón reservado')).toHaveLength(2);
    expect(
      screen.getByText('Sin tiempos estimados: el recorrido avanza paso a paso.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    await screen.unmount();
    await render(view('VIP', 'arrival'));
    expect(screen.getByText('● Salón reservado')).toBeTruthy();
  });

  it('lets phases without answers advance with «Continuar» (formal external greeting)', async () => {
    const onContinue = jest.fn();
    await render(
      <OrientationView
        category="EXTERNAL"
        phase="greeting"
        vars={orientationVars('EXTERNAL', 'Laura')}
        onChoose={jest.fn()}
        onContinue={onContinue}
      />,
    );
    expect(
      screen.getByRole('heading', { name: /Su visita de mantenimiento está registrada para hoy/ }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('keeps the staff meeting off the kiosk', async () => {
    await render(view('STAFF', 'destination'));
    expect(
      screen.getByRole('heading', {
        name: '“Te envié el resumen a tu teléfono. ¿Necesitas ayuda para llegar o sigues por tu cuenta?”',
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/reunión/)).toBeNull();
  });

  it('asks for feedback with the shared prompt', async () => {
    await render(view('GUEST', 'feedback'));
    expect(
      screen.getByRole('heading', { name: /cuéntanos cómo te fue con el servicio de los robots/ }),
    ).toBeTruthy();
  });

  it('shows where the visit is and opens the ten phases on demand', async () => {
    await render(view('VIP', 'destination'));
    const toggle = screen.getByRole('button', { name: 'Fases de la visita' });
    expect(screen.getByText(/Paso 4 de 10: Destino y necesidades/)).toBeTruthy();
    expect(withRole('list', 'Fases de la visita')).toHaveLength(0);
    await fireEvent.press(toggle);
    expect(withRole('list', 'Fases de la visita')).toHaveLength(1);
    expect(withRole('listitem')).toHaveLength(10);
  });
});

describe('RobotFailureBanner', () => {
  const stages: [FailureStage, string][] = [
    ['REQUESTED', 'Tengo un inconveniente. Voy a pedir ayuda para que puedas continuar.'],
    ['ACCEPTED', 'Soy Sofía, voy a ayudarte. ¿Estás junto al robot?'],
    ['CONTEXT_TRANSFERRED', 'Ya tengo tu destino. Continuaremos desde aquí.'],
    ['CONFIRMED', 'Yo sigo contigo; nuestro equipo revisará el robot.'],
    [
      'EXPIRED',
      'Seguimos buscando a una persona del equipo. Puedes mostrar tu QR o pedir ayuda en recepción.',
    ],
  ];

  it.each(stages)('says what is happening at %s and keeps a way out', async (stage, text) => {
    const onShowQr = jest.fn();
    await render(<RobotFailureBanner stage={stage} attendantName="Sofía" onShowQr={onShowQr} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tengo un inconveniente' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar mi QR' }));
    expect(onShowQr).toHaveBeenCalledTimes(1);
  });

  it('is announced as an alert and tracks the relief in order', async () => {
    await render(
      <RobotFailureBanner stage="ACCEPTED" attendantName="Sofía" onShowQr={jest.fn()} />,
    );
    expect(withRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText('Ayuda solicitada, hecho')).toBeTruthy();
    expect(screen.getByLabelText('Sofía va hacia ti, ahora')).toBeTruthy();
    expect(screen.getByLabelText('Sofía ya tiene tu destino')).toBeTruthy();
  });

  it('uses a generic name until an attendant takes the relief', async () => {
    await render(<RobotFailureBanner stage="REQUESTED" onShowQr={jest.fn()} />);
    expect(screen.getByText('Una persona del equipo va hacia ti')).toBeTruthy();
  });
});

describe('Farewell', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('says goodbye in the category register with a visible countdown', async () => {
    await render(<Farewell category="EXTERNAL" vars={{ nombre: 'Laura' }} onDone={jest.fn()} />);
    expect(
      screen.getByRole('heading', {
        name: '“Gracias por su visita y por su aporte al club, Laura. Que tenga un buen día.”',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Volviendo al inicio en 15 s')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({
      now: 15,
      max: 15,
    });
  });

  it('returns by itself after the countdown', async () => {
    const onDone = jest.fn();
    await render(
      <Farewell category="VIP" vars={{ nombre: 'Andrés' }} onDone={onDone} seconds={3} />,
    );
    for (let i = 0; i < 2; i++) await act(async () => jest.advanceTimersByTime(1000));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Volviendo al inicio en 1 s')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalled();
  });

  it('returns at once with «Listo»', async () => {
    const onDone = jest.fn();
    await render(<Farewell category="GUEST" vars={{ nombre: 'Valentina' }} onDone={onDone} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
