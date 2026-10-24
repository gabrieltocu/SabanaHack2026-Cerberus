import { fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import {
  RobotTelemetryCard,
  type EstadoTelemetriaRobot,
} from '@/features/club/concierge/RobotTelemetry';
import type { TelemetriaVista } from '@/club/telemetria';

const ahora = Date.parse('2026-10-24T14:32:00-05:00');
const estado: TelemetriaVista = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  robot: 'juan',
  origen: 'real',
  tipo: 'estado',
  observado_at: '2026-10-24T14:31:58-05:00',
  recibido_at: '2026-10-24T14:31:59-05:00',
  mensaje: 'Telemetría recibida',
  datos: { bateria_pct: 72, fsm: 3, sistema_txt: 'Listo' },
};
const datos: EstadoTelemetriaRobot = { estado, eventos: [], desactualizada: false };

const evento = (i: number, patch: Partial<TelemetriaVista> = {}): TelemetriaVista => ({
  id: `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
  robot: 'juan',
  origen: i % 2 ? 'simulacion' : 'real',
  tipo: i === 1 ? 'obstaculo' : 'voz',
  observado_at: '2026-10-24T14:31:00-05:00',
  recibido_at: '2026-10-24T14:31:01-05:00',
  mensaje: `Evento ${i}`,
  ...patch,
});

test('muestra modo real, estado conocido y origen explícito por evento', async () => {
  await render(<RobotTelemetryCard datos={{ ...datos, eventos: [evento(1)] }} ahora={ahora} />);

  expect(screen.getByText(/Robot físico/)).toBeTruthy();
  expect(screen.getByText('Controlador en marcha')).toBeTruthy();
  expect(screen.getByText('Evento 1')).toBeTruthy();
  expect(screen.getAllByText(/Simulación/).length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Alerta del robot')).toBeTruthy();
});

test('muestra modo simulado, código desconocido y alerta de origen independiente', async () => {
  const estadoSim = { ...estado, origen: 'simulacion' as const, datos: { fsm: 88 } };
  await render(
    <RobotTelemetryCard
      datos={{ estado: estadoSim, eventos: [evento(2, { origen: 'real' })], desactualizada: false }}
      ahora={ahora}
    />,
  );

  expect(screen.getByText(/Simulación/)).toBeTruthy();
  expect(screen.getByText('Estado 88')).toBeTruthy();
  expect(screen.getByText(/Robot físico/)).toBeTruthy();
  expect(screen.queryByText(/batería/i)).toBeNull();
});

test('traduce los estados estables y de modo seguro', async () => {
  const { rerender } = await render(
    <RobotTelemetryCard
      datos={{ ...datos, estado: { ...estado, datos: { fsm: 2 } } }}
      ahora={ahora}
    />,
  );
  expect(screen.getByText('Estable')).toBeTruthy();
  await rerender(
    <RobotTelemetryCard
      datos={{ ...datos, estado: { ...estado, datos: { fsm: 4 } } }}
      ahora={ahora}
    />,
  );
  expect(screen.getByText('Modo seguro')).toBeTruthy();
});

test('no inventa estado ni batería cuando la instantánea está vacía', async () => {
  await render(
    <RobotTelemetryCard
      datos={{ estado: null, eventos: [], desactualizada: true }}
      ahora={ahora}
    />,
  );

  expect(screen.getByText('Esperando telemetría del robot.')).toBeTruthy();
  expect(screen.queryByText(/batería|estable|modo seguro|controlador en marcha/i)).toBeNull();
});

test('oculta batería ausente y marca datos vencidos o error conservando la última lectura', async () => {
  const { rerender } = await render(
    <RobotTelemetryCard
      datos={{ ...datos, estado: { ...estado, datos: { sistema_txt: 'Listo' } } }}
      ahora={ahora}
    />,
  );
  expect(screen.queryByText(/batería/i)).toBeNull();

  await rerender(
    <RobotTelemetryCard datos={datos} ahora={Date.parse('2026-10-24T14:32:15-05:00') + 1} />,
  );
  expect(screen.getByText(/telemetría desactualizada/i)).toBeTruthy();

  await rerender(<RobotTelemetryCard datos={{ ...datos, desactualizada: true }} ahora={ahora} />);
  expect(screen.getByText(/telemetría desactualizada/i)).toBeTruthy();
  expect(screen.getByText('Controlador en marcha')).toBeTruthy();

  await rerender(<RobotTelemetryCard datos={datos} error ahora={ahora} />);
  expect(screen.getByText(/No se pudo actualizar/i)).toBeTruthy();
  expect(screen.getByText('Controlador en marcha')).toBeTruthy();
});

test('amplía el historial gradualmente hasta mostrar los 100 eventos del servidor', async () => {
  await render(
    <RobotTelemetryCard
      datos={{ ...datos, eventos: Array.from({ length: 100 }, (_, i) => evento(i + 1)) }}
      ahora={ahora}
    />,
  );

  expect(screen.getByText('Evento 1')).toBeTruthy();
  expect(screen.getByText('Evento 8')).toBeTruthy();
  expect(screen.queryByText('Evento 9')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver más eventos' }));
  expect(screen.getByText('Evento 16')).toBeTruthy();
  for (let i = 0; i < 11; i += 1) {
    await fireEvent.press(screen.getByRole('button', { name: 'Ver más eventos' }));
  }
  expect(screen.getByText('Evento 100')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Ver más eventos' })).toBeNull();
});
