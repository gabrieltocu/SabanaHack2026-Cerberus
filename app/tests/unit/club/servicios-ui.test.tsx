import { fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { ServiciosScreen } from '@/features/club/personal/ServiciosScreen';

const mockClient = {
  servicios: jest.fn(),
  personasServicio: jest.fn(),
  crearServicio: jest.fn(),
  editarServicio: jest.fn(),
  logout: jest.fn(),
};

jest.mock('@/features/club/session', () => ({
  useSession: () => ({ client: mockClient, logout: mockClient.logout }),
}));
jest.mock('@/features/club/edecan/Guardia', () => ({ useAvisar: () => jest.fn() }));
jest.mock('@/features/club/ui/visible', () => ({
  useHoy: () => '2026-10-24',
  usePantallaActiva: () => true,
}));

async function abrirFormulario() {
  await render(<ServiciosScreen />);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Registrar visita de servicio' }),
  );
}

async function completarDatos() {
  for (const [label, value] of [
    ['Empresa', 'Climatec'],
    ['Apellido del trabajador', 'Pena'],
    ['Trabajo a realizar', 'Revisión del aire'],
    ['Solicitado por', 'Natalia'],
    ['Responsable en el club', 'Marta'],
    ['Área', 'Mantenimiento'],
    ['Desde', '11:00'],
    ['Hasta', '13:00'],
    ['Punto de presentación', 'Recepción'],
  ] as const) {
    await fireEvent.changeText(screen.getByLabelText(label), value);
  }
  await fireEvent.press(screen.getByRole('radio', { name: 'Señor' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.servicios.mockResolvedValue([]);
  mockClient.personasServicio.mockResolvedValue([{ id: 'persona-interna-1', nombre: 'Luis' }]);
  mockClient.crearServicio.mockResolvedValue({});
});

test('seleccionar una persona registrada precarga su nombre y envía la referencia', async () => {
  await abrirFormulario();
  await fireEvent.press(await screen.findByRole('radio', { name: 'Luis' }));
  expect(screen.getByLabelText('Nombre del trabajador').props.value).toBe('Luis');
  await completarDatos();
  await fireEvent.press(screen.getByRole('button', { name: 'Registrar' }));

  expect(mockClient.crearServicio).toHaveBeenCalledWith(
    expect.objectContaining({ nombre: 'Luis', apellido: 'Pena', persona_id: 'persona-interna-1' }),
  );
});

test('la opción predeterminada crea un trabajador nuevo sin persona_id', async () => {
  await abrirFormulario();
  await fireEvent.changeText(screen.getByLabelText('Nombre del trabajador'), 'Ana');
  await completarDatos();
  await fireEvent.press(screen.getByRole('button', { name: 'Registrar' }));

  expect(mockClient.crearServicio).toHaveBeenCalledTimes(1);
  expect(mockClient.crearServicio.mock.calls[0][0]).not.toHaveProperty('persona_id');
});

test('si falla la lista, muestra reintento y permite seguir con un trabajador nuevo', async () => {
  mockClient.personasServicio
    .mockRejectedValueOnce(new Error('fallo de red'))
    .mockResolvedValueOnce([]);
  await abrirFormulario();

  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText('Empresa')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Reintentar carga de personas' }));
  expect(await screen.findByRole('radio', { name: 'Crear como trabajador nuevo' })).toBeTruthy();
});
