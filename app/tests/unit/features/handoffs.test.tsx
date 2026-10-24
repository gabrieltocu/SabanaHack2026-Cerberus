import { fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import type { HandoffState } from '@/domain/entities/visit';
import { HANDOFF_CONTEXT, HANDOFF_TASK } from '@/features/demo/fixtures';
import { HandoffContext } from '@/features/handoffs/HandoffContext';
import { HandoffTaskCard, type HandoffTaskCardProps } from '@/features/handoffs/HandoffTaskCard';
import { withRole } from './withRole';

const card = (state: HandoffState, extra: Partial<HandoffTaskCardProps> = {}) => {
  const handlers = {
    onAccept: jest.fn(),
    onReject: jest.fn(),
    onReceiveContext: jest.fn(),
    onConfirm: jest.fn(),
    onGoToVisit: jest.fn(),
    onRefresh: jest.fn(),
    onRequestAgain: jest.fn(),
  };
  const ui = (
    <HandoffTaskCard
      task={{ ...HANDOFF_TASK, state }}
      context={HANDOFF_CONTEXT}
      {...handlers}
      {...extra}
    />
  );
  return { ui, handlers };
};

describe('HandoffContext', () => {
  it('lists what the attendant needs and nothing else', async () => {
    await render(<HandoffContext context={HANDOFF_CONTEXT} />);
    expect(screen.getByText('Contexto de la visita')).toBeTruthy();
    expect(screen.getByText('Andrés · V-201')).toBeTruthy();
    expect(screen.getByText('Socio VIP')).toBeTruthy();
    expect(screen.getByText('Salón reservado')).toBeTruthy();
    expect(screen.getByText('Membresía VIP vigente, Reserva del salón confirmada')).toBeTruthy();
    expect(screen.getByText('Café')).toBeTruthy();
    expect(screen.getByText('Pasillo principal')).toBeTruthy();
    expect(screen.getByText('Acompañando, pasillo')).toBeTruthy();
  });

  it('copes with no reference, no last point and no preferences', async () => {
    await render(
      <HandoffContext
        context={{
          ...HANDOFF_CONTEXT,
          reference: undefined,
          lastPoint: undefined,
          preferences: [],
        }}
      />,
    );
    expect(screen.getByText('Andrés')).toBeTruthy();
    expect(screen.getByText('Ninguna registrada')).toBeTruthy();
    expect(screen.queryByText('Último punto confirmado')).toBeNull();
  });
});

describe('HandoffTaskCard', () => {
  it('REQUESTED shows the task, who is still responsible, and accept / reject', async () => {
    const { ui, handlers } = card('REQUESTED');
    await render(ui);
    expect(screen.getByText('Relevo solicitado')).toBeTruthy();
    expect(screen.getByLabelText('Relevo solicitado, Andrés, Solicitado')).toBeTruthy();
    expect(screen.getByText('Andrés · Socio VIP')).toBeTruthy();
    expect(screen.getByText('De: R2 → A: Sofía')).toBeTruthy();
    expect(screen.getByText('Destino: Salón reservado')).toBeTruthy();
    expect(screen.getByText('Último punto confirmado: Pasillo principal')).toBeTruthy();
    expect(screen.getByText('Motivo: Falla de R2')).toBeTruthy();
    expect(screen.getByText('Solicitado 10:15 · Vence 10:25')).toBeTruthy();
    expect(
      screen.getByText(
        'R2 sigue siendo el responsable de la visita hasta que confirmes el relevo.',
      ),
    ).toBeTruthy();
    // The context only appears once the relief is accepted.
    expect(screen.queryByText('Contexto de la visita')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar relevo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Rechazar' }));
    expect(handlers.onAccept).toHaveBeenCalledTimes(1);
    expect(handlers.onReject).toHaveBeenCalledTimes(1);
  });

  it('ACCEPTED shows the context and «Recibí el contexto»', async () => {
    const { ui, handlers } = card('ACCEPTED', { notice: 'Aceptaste el relevo.' });
    await render(ui);
    expect(screen.getByText('Contexto de la visita')).toBeTruthy();
    expect(screen.getByText('Aceptaste el relevo.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceptar relevo' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Recibí el contexto' }));
    expect(handlers.onReceiveContext).toHaveBeenCalledTimes(1);
  });

  it('confirming asks first and says what it implies; «Todavía no» changes nothing', async () => {
    const { ui, handlers } = card('CONTEXT_TRANSFERRED');
    await render(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar relevo' }));
    expect(screen.getByText('¿Ya estás con Andrés?')).toBeTruthy();
    expect(
      screen.getByText('Al confirmar serás la responsable de esta visita. R2 queda liberado.'),
    ).toBeTruthy();
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Todavía no' }));
    expect(screen.queryByText('¿Ya estás con Andrés?')).toBeNull();
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar relevo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Sí, asumo la visita' }));
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('CONFIRMED completes the four steps and leads to the visit', async () => {
    const { ui, handlers } = card('CONFIRMED', {
      notice: 'Eres la responsable de la visita de Andrés.',
    });
    await render(ui);
    expect(screen.getByText('Eres la responsable de la visita de Andrés.')).toBeTruthy();
    expect(screen.queryByText(/sigue siendo el responsable/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ir a la visita en curso' }));
    expect(handlers.onGoToVisit).toHaveBeenCalledTimes(1);
  });

  it('shows the four steps with the current one marked', async () => {
    const { ui } = card('ACCEPTED');
    await render(ui);
    expect(withRole('list', 'Avance del relevo')).toHaveLength(1);
    expect(screen.getByLabelText('Paso 2 de 4: Aceptado, en curso')).toBeTruthy();
    expect(screen.getByLabelText('Paso 1 de 4: Solicitado, completado')).toBeTruthy();
  });

  it.each([
    ['accept', 'REQUESTED', 'Aceptando…'],
    ['context', 'ACCEPTED', 'Recibiendo…'],
    ['confirm', 'CONTEXT_TRANSFERRED', 'Confirmando…'],
  ] as const)(
    'while %s is in flight the button reads as a gerund and is locked',
    async (busy, state, label) => {
      const { ui, handlers } = card(state, { busy });
      await render(ui);
      const button = screen.getByRole('button', { name: label });
      expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
      await fireEvent.press(button);
      expect(Object.values(handlers).every((h) => h.mock.calls.length === 0)).toBe(true);
      if (state === 'REQUESTED') {
        expect(
          screen.getByRole('button', { name: 'Rechazar' }).props.accessibilityState,
        ).toMatchObject({
          disabled: true,
        });
      }
    },
  );

  it('HANDOFF_ALREADY_ACCEPTED says another team member won and offers a refresh, not the action', async () => {
    const { ui, handlers } = card('REQUESTED', { errorCode: 'HANDOFF_ALREADY_ACCEPTED' });
    await render(ui);
    expect(screen.getByText('Otra persona del equipo ya aceptó este relevo.')).toBeTruthy();
    expect(screen.getByText('Código: HANDOFF_ALREADY_ACCEPTED')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceptar relevo' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Actualizar lista' }));
    expect(handlers.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('without a refresh handler the lost race simply has no action', async () => {
    const { ui } = card('REQUESTED', {
      errorCode: 'HANDOFF_ALREADY_ACCEPTED',
      onRefresh: undefined,
    });
    await render(ui);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('EXPIRED says the visit stays with whoever had it and offers to ask again', async () => {
    const { ui, handlers } = card('EXPIRED');
    await render(ui);
    expect(
      screen.getByText(
        'La solicitud de relevo venció sin aceptación. La visita sigue a cargo de quien la tenía.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Código: HANDOFF_EXPIRED')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceptar relevo' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Solicitar de nuevo' }));
    expect(handlers.onRequestAgain).toHaveBeenCalledTimes(1);
  });

  it('CANCELLED is stated and has no actions', async () => {
    const { ui } = card('CANCELLED');
    await render(ui);
    expect(screen.getByText('Este relevo fue cancelado.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Contexto de la visita')).toBeNull();
  });

  it('shows a stated error for an expired card only once', async () => {
    const { ui } = card('EXPIRED', { errorCode: 'HANDOFF_EXPIRED' });
    await render(ui);
    expect(screen.getAllByText('Código: HANDOFF_EXPIRED')).toHaveLength(1);
  });

  it('does not tag a real task as simulated', async () => {
    await render(
      <HandoffTaskCard
        task={{ ...HANDOFF_TASK, simulated: false, reason: 'Batería baja' }}
        onAccept={jest.fn()}
        onReceiveContext={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByText('Motivo: Batería baja')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull();
  });
});
