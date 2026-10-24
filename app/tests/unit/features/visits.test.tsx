import { fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { FeedbackForm, MAX_COMMENT } from '@/features/visits/FeedbackForm';

const score = (group: string, label: string) =>
  screen.getByRole('radio', { name: `${group}: ${label}` });

describe('FeedbackForm', () => {
  it('has two 1–5 scales and an optional comment with a counter', async () => {
    await render(<FeedbackForm onSubmit={jest.fn()} onSkip={jest.fn()} />);
    expect(screen.getByText('Servicio de los robots')).toBeTruthy();
    expect(screen.getByText('Servicios del club')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    expect(score('Servicio de los robots', '1 · Muy malo')).toBeTruthy();
    expect(score('Servicios del club', '5 · Muy bueno')).toBeTruthy();
    expect(screen.getByText('Comentario (opcional)')).toBeTruthy();
    expect(screen.getByText(`0/${MAX_COMMENT}`)).toBeTruthy();
  });

  it('asks for at least one rating before sending', async () => {
    const onSubmit = jest.fn();
    await render(<FeedbackForm onSubmit={onSubmit} onSkip={jest.fn()} />);
    expect(screen.getByText('Elige al menos una calificación para enviar.')).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Enviar' });
    expect(send.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(send);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the ratings and the trimmed comment', async () => {
    const onSubmit = jest.fn();
    await render(
      <FeedbackForm onSubmit={onSubmit} onSkip={jest.fn()} submitLabel="Enviar evaluación" />,
    );
    await fireEvent.press(score('Servicio de los robots', '5 · Muy bueno'));
    await fireEvent.press(score('Servicios del club', '3'));
    expect(score('Servicio de los robots', '5 · Muy bueno').props.accessibilityState).toMatchObject(
      { checked: true },
    );
    await fireEvent.changeText(screen.getByLabelText('Comentario (opcional)'), '  Todo bien  ');
    expect(screen.getByText('13/500')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar evaluación' }));
    expect(onSubmit).toHaveBeenCalledWith({ robot: 5, club: 3, comment: 'Todo bien' });
  });

  it('allows rating only one thing, with no empty comment', async () => {
    const onSubmit = jest.fn();
    await render(<FeedbackForm onSubmit={onSubmit} onSkip={jest.fn()} />);
    await fireEvent.press(score('Servicios del club', '4'));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(onSubmit).toHaveBeenCalledWith({ club: 4 });
  });

  it('lets people not take part, without changing anything else', async () => {
    const onSkip = jest.fn();
    await render(<FeedbackForm onSubmit={jest.fn()} onSkip={onSkip} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Prefiero no participar' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('uses its own wording for the visit page', async () => {
    await render(
      <FeedbackForm onSubmit={jest.fn()} onSkip={jest.fn()} skipLabel="Prefiero no evaluar" />,
    );
    expect(screen.getByRole('button', { name: 'Prefiero no evaluar' })).toBeTruthy();
  });

  it('thanks and locks the form once sent', async () => {
    const onSkip = jest.fn();
    await render(<FeedbackForm onSubmit={jest.fn()} onSkip={onSkip} sent />);
    expect(screen.getByText('Gracias. Tu evaluación quedó registrada.')).toBeTruthy();
    expect(screen.getByLabelText('Comentario (opcional)').props.editable).toBe(false);
    await fireEvent.press(score('Servicios del club', '4'));
    expect(score('Servicios del club', '4').props.accessibilityState).toMatchObject({
      checked: false,
      disabled: true,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Prefiero no participar' }));
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('shows the busy state while sending', async () => {
    await render(<FeedbackForm onSubmit={jest.fn()} onSkip={jest.fn()} submitting />);
    expect(
      screen.getByRole('button', { name: 'Enviando…' }).props.accessibilityState,
    ).toMatchObject({ busy: true });
  });

  it('explains a failure and keeps what was typed', async () => {
    await render(
      <FeedbackForm onSubmit={jest.fn()} onSkip={jest.fn()} errorCode="FEEDBACK_ALREADY_SENT" />,
    );
    expect(screen.getByText('Ya enviaste tu evaluación de esta visita.')).toBeTruthy();
    expect(screen.getByText('Código: FEEDBACK_ALREADY_SENT')).toBeTruthy();
  });
});
