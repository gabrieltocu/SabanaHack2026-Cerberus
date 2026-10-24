import { fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import * as QRCode from 'qrcode';
import { PASSES } from '@/features/demo/fixtures';
import { MEETING_POINTS } from '@/features/pages/InvitePage';
import { InvitationForm, type InvitationFormProps } from '@/features/invitations/InvitationForm';
import { PassCard } from '@/features/invitations/PassCard';
import { QrCode } from '@/features/invitations/QrCode';
import { withRole } from './withRole';

describe('QrCode', () => {
  it('draws a real code: modules exist, the image has an accessible label and the code is readable', async () => {
    expect(QRCode.create('demo-tomas').modules.size).toBeGreaterThan(0);
    await render(<QrCode value="demo-tomas" />);
    expect(
      screen.getByRole('img', { name: 'Código QR de tu pase. Muéstralo en recepción.' }),
    ).toBeTruthy();
    expect(screen.getByText('Código: demo-tomas')).toBeTruthy();
    const paths = screen.container.queryAll((n) => typeof n.props?.d === 'string');
    expect(paths).toHaveLength(1);
    expect((paths[0]?.props.d as string).length).toBeGreaterThan(50);
  });

  it('accepts its own label and can hide the printed code', async () => {
    await render(
      <QrCode value="otro-codigo" accessibilityLabel="QR de prueba" size={120} showCode={false} />,
    );
    expect(screen.getByRole('img', { name: 'QR de prueba' })).toBeTruthy();
    expect(screen.queryByText(/Código:/)).toBeNull();
  });

  it('encodes different values differently', async () => {
    await render(<QrCode value="uno-uno-uno" />);
    const a = screen.container.queryAll((n) => typeof n.props?.d === 'string')[0]?.props.d;
    await screen.unmount();
    await render(<QrCode value="dos-dos-dos" />);
    const b = screen.container.queryAll((n) => typeof n.props?.d === 'string')[0]?.props.d;
    expect(a).not.toBe(b);
  });
});

describe('PassCard', () => {
  const valid = PASSES['demo-valentina']!;

  it('shows a valid pass with its details, the QR and the simulation seal', async () => {
    await render(<PassCard pass={valid} onFullScreen={jest.fn()} onCopy={jest.fn()} />);
    expect(screen.getByText('Hola, Valentina')).toBeTruthy();
    expect(screen.getByText('Vigente')).toBeTruthy();
    expect(screen.getByText('Invitación de Camila')).toBeTruthy();
    expect(screen.getByText('Punto de encuentro: Terraza')).toBeTruthy();
    expect(screen.getByText('Válido el sáb 24 oct 2026')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR de tu pase/ })).toBeTruthy();
    expect(screen.getByText('Código QR del pase')).toBeTruthy();
    expect(
      screen.getByText('Preséntalo en recepción. El robot lo leerá y confirmará tu visita.'),
    ).toBeTruthy();
    expect(screen.getByText('¿Sin teléfono o sin QR?')).toBeTruthy();
    expect(
      screen.getByText(
        'Este pase se valida en recepción. Una captura de pantalla no es suficiente por sí sola.',
      ),
    ).toBeTruthy();
    expect(
      withRole('status').some((n) =>
        /Pase vigente para el sábado 24 de octubre/.test(JSON.stringify(n.props.children)),
      ),
    ).toBe(true);
  });

  it('runs full screen and copy through callbacks', async () => {
    const onFullScreen = jest.fn();
    const onCopy = jest.fn();
    await render(
      <PassCard pass={valid} onFullScreen={onFullScreen} onCopy={onCopy} copied offline />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar a pantalla completa' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Copiar enlace' }));
    expect(onFullScreen).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Enlace copiado.')).toBeTruthy();
    expect(screen.getByText('Sin conexión: la validez se comprobará en recepción.')).toBeTruthy();
  });

  it('offers no buttons that were not wired', async () => {
    await render(<PassCard pass={valid} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the preview variant leaves out help text and actions but keeps the seal', async () => {
    await render(<PassCard pass={valid} variant="preview" onFullScreen={jest.fn()} />);
    expect(screen.getByText('Código QR del pase')).toBeTruthy();
    expect(screen.queryByText('¿Sin teléfono o sin QR?')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    [
      'demo-futuro',
      'Aún no válido',
      'Este pase aún no es válido. Será válido el dom 25 oct 2026.',
      'QR_NOT_YET_VALID',
    ],
    [
      'demo-vencido',
      'Vencido',
      'Este pase venció. Pide a tu anfitrión que te envíe uno nuevo.',
      'QR_EXPIRED',
    ],
    [
      'demo-usado',
      'Usado',
      'Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.',
      'QR_ALREADY_USED',
    ],
    ['demo-cancelado', 'Cancelado', 'Tu anfitrión canceló esta invitación.', 'QR_REVOKED'],
  ])('%s replaces card and QR with its explanation', async (token, badge, message, code) => {
    await render(<PassCard pass={PASSES[token]!} onFullScreen={jest.fn()} />);
    expect(screen.getByText(badge)).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByText(`Código: ${code}`)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Hola, Valentina')).toBeNull();
    expect(screen.getByText('¿Sin teléfono o sin QR?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mostrar a pantalla completa' })).toBeNull();
  });

  it('a pass that does not exist reads as «No válido», not as a crash', async () => {
    await render(<PassCard pass={{ ...valid, token: '', status: 'NOT_FOUND', guestName: '' }} />);
    expect(screen.getByText('No válido')).toBeTruthy();
    expect(screen.getByText('No encontramos este pase.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('InvitationForm', () => {
  const setup = (extra: Partial<InvitationFormProps> = {}) => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const ui = (
      <InvitationForm
        today="2026-10-24"
        meetingPoints={MEETING_POINTS}
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...extra}
      />
    );
    return { ui, onSubmit, onCancel };
  };
  const name = () => screen.getByLabelText('Nombre de tu invitado');
  const date = () => screen.getByLabelText('Fecha de la visita');

  it('has a visible label, hint and default for every field', async () => {
    const { ui } = setup();
    await render(ui);
    expect(screen.getByText('Nombre de tu invitado (obligatorio)')).toBeTruthy();
    expect(screen.getByText('Solo el nombre de pila basta.')).toBeTruthy();
    expect(screen.getByText('Fecha de la visita (obligatorio)')).toBeTruthy();
    expect(date().props.value).toBe('2026-10-24');
    expect(
      screen.getByText('El pase solo vale ese día. Formato AAAA-MM-DD, hasta 30 días desde hoy.'),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Terraza' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByText('Bebida preferida (opcional)')).toBeTruthy();
    expect(screen.getByText('El robot se lo ofrecerá, sin darlo por hecho.')).toBeTruthy();
  });

  it('does not nag while typing but validates when leaving a field', async () => {
    const { ui } = setup();
    await render(ui);
    await fireEvent.changeText(name(), 'A');
    expect(screen.queryByText('Escribe el nombre de tu invitado.')).toBeNull();
    await fireEvent(name(), 'blur');
    expect(screen.getByText('Escribe el nombre de tu invitado.')).toBeTruthy();
    await fireEvent.changeText(date(), '2026-13-40');
    await fireEvent(date(), 'blur');
    expect(screen.getByText('Elige una fecha desde hoy en adelante.')).toBeTruthy();
  });

  it('on submit with errors it blocks, counts the fields and keeps what was typed', async () => {
    const { ui, onSubmit } = setup();
    await render(ui);
    await fireEvent.changeText(date(), '2020-01-01');
    await fireEvent.press(screen.getByRole('button', { name: 'Crear invitación' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Hay 2 campos por corregir.')).toBeTruthy();
    expect(screen.getByText('Escribe el nombre de tu invitado.')).toBeTruthy();
    expect(screen.getByText('Elige una fecha desde hoy en adelante.')).toBeTruthy();
    expect(date().props.value).toBe('2020-01-01');
    await fireEvent.changeText(date(), '2026-10-24');
    expect(screen.getByText('Hay 1 campo por corregir.')).toBeTruthy();
  });

  it('submits trimmed values with the chosen meeting point, drink and photo', async () => {
    const { ui, onSubmit } = setup();
    await render(ui);
    await fireEvent.changeText(name(), '  Valentina ');
    await fireEvent.changeText(date(), '2026-10-31');
    await fireEvent.press(screen.getByRole('radio', { name: 'Salón reservado' }));
    await fireEvent.changeText(
      screen.getByLabelText('Bebida preferida (opcional)'),
      ' agua aromática ',
    );
    await fireEvent(screen.getByLabelText('Foto del invitado'), 'valueChange', true);
    expect(screen.getByLabelText('Avatar del invitado')).toBeTruthy();
    expect(screen.getByText('Valentina · sáb 31 oct 2026 · Salón reservado')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Crear invitación' }));
    expect(onSubmit).toHaveBeenCalledWith({
      guestName: 'Valentina',
      date: '2026-10-31',
      meetingPoint: 'Salón reservado',
      drink: 'agua aromática',
      photo: true,
    });
  });

  it('locks the form and says what it is doing while submitting', async () => {
    const { ui, onSubmit } = setup({ submitting: true, initialValues: { guestName: 'Ana' } });
    await render(ui);
    const button = screen.getByRole('button', { name: 'Creando invitación…' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(name().props.editable).toBe(false);
    await fireEvent.press(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server failure above the button and keeps the data', async () => {
    const { ui } = setup({
      errorCode: 'INVITATION_DUPLICATE',
      initialValues: { guestName: 'Ana' },
    });
    await render(ui);
    expect(
      screen.getByText('Ya existe una invitación para este invitado en esa fecha.'),
    ).toBeTruthy();
    expect(screen.getByText('Código: INVITATION_DUPLICATE')).toBeTruthy();
    expect(name().props.value).toBe('Ana');
  });

  it('cancels at once when nothing was typed', async () => {
    const { ui, onCancel } = setup();
    await render(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding typed data', async () => {
    const { ui, onCancel } = setup();
    await render(ui);
    await fireEvent.changeText(name(), 'Valentina');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('¿Descartar la invitación?')).toBeTruthy();
    expect(screen.getByText('Se perderán los datos escritos.')).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByText('¿Descartar la invitación?')).toBeNull();
    expect(name().props.value).toBe('Valentina');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Descartar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('with no meeting points says so and cannot be submitted', async () => {
    const { ui, onSubmit } = setup({ meetingPoints: [] });
    await render(ui);
    expect(screen.getByText('No hay puntos de encuentro configurados.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Crear invitación' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
