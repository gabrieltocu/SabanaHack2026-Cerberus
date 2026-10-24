import { render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { RobotSesionCard, type EstadoSesionRobot } from '@/features/club/concierge/RobotStatus';

const sesion: EstadoSesionRobot = {
  desactualizada: false,
  sesion: {
    robot: 'robot-entrada',
    sesion_id: 's-17',
    secuencia: 17,
    fase: 'acompanando',
    persona_id: 'p-28',
    nombre: 'Laura Díaz',
    categoria: 'VIP',
    metodo: 'rostro',
    confianza: 0.94,
    mensaje: 'Te acompaño al Lounge VIP.',
    actualizado_at: '2026-10-24T14:32:00-05:00',
  },
};

test('muestra la sesión del robot con la fase, persona, método y mensaje actuales', async () => {
  await render(<RobotSesionCard datos={sesion} ahora={Date.parse('2026-10-24T14:32:00-05:00')} />);

  expect(screen.getByRole('heading', { name: 'Acompañando' })).toBeTruthy();
  expect(screen.getByText('Laura Díaz')).toBeTruthy();
  expect(screen.getByText(/VIP · Rostro · 94 %/)).toBeTruthy();
  expect(screen.getByText('Te acompaño al Lounge VIP.')).toBeTruthy();
  expect(screen.getByText(/Actualizado/)).toBeTruthy();
  expect(screen.queryByText('p-28')).toBeNull();
});

test('indica sesión desactualizada y vacío sin inventar una actividad', async () => {
  const { rerender } = await render(
    <RobotSesionCard
      datos={{ desactualizada: true, sesion: sesion.sesion }}
      ahora={Date.parse('2026-10-24T14:32:00-05:00')}
    />,
  );
  expect(screen.getByText(/datos desactualizados/i)).toBeTruthy();

  await rerender(
    <RobotSesionCard
      datos={{ desactualizada: false, sesion: null }}
      ahora={Date.parse('2026-10-24T14:32:00-05:00')}
    />,
  );
  expect(screen.getByText('Sin sesión activa')).toBeTruthy();
  expect(screen.queryByText('Laura Díaz')).toBeNull();
  await rerender(
    <RobotSesionCard
      datos={null}
      error
      sinConexion
      ahora={Date.parse('2026-10-24T14:32:00-05:00')}
    />,
  );
  expect(screen.getByText('Sin conexión con la sesión del robot.')).toBeTruthy();
});
