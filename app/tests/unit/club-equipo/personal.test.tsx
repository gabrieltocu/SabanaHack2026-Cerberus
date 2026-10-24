/* eslint-disable @typescript-eslint/no-require-imports -- route modules are loaded lazily for renderRouter */
// Club staff app through the real routes with a fake v3 club API.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { tokenStore } from '@/features/club/client';
import { AHORA, HOY, crearApi } from './fake';

let mockFetch: typeof fetch;
jest.mock('@/features/club/client', () => {
  const actual = jest.requireActual('@/features/club/client');
  return {
    ...actual,
    club: actual.createClubClient('http://t/api', (...a: Parameters<typeof fetch>) =>
      mockFetch(...a),
    ),
  };
});

const rutas = () => ({
  '(club)/_layout': require('../../../app/(club)/_layout').default,
  '(club)/entrar': () => <Text>PANTALLA ENTRAR</Text>,
  '(club)/app/edecan/index': () => <Text>INICIO EDECAN</Text>,
  '(club)/app/personal/_layout': require('../../../app/(club)/app/personal/_layout').default,
  '(club)/app/personal/index': require('../../../app/(club)/app/personal/index').default,
  '(club)/app/personal/agenda': require('../../../app/(club)/app/personal/agenda').default,
  '(club)/app/personal/reportar': require('../../../app/(club)/app/personal/reportar').default,
  '(club)/app/personal/actividades': require('../../../app/(club)/app/personal/actividades')
    .default,
  '(club)/app/personal/perfil': require('../../../app/(club)/app/personal/perfil').default,
});

let api: ReturnType<typeof crearApi>;
beforeEach(async () => {
  jest.useFakeTimers({ now: AHORA });
  api = crearApi();
  mockFetch = api.fetchFake;
  await tokenStore.set('T-u-marta');
});
afterEach(() => jest.useRealTimers());

const abrir = async (url = '/app/personal/agenda') => {
  await renderRouter(rutas(), { initialUrl: url });
};
const boton = (name: string) => screen.findByRole('button', { name });
const llamadas = (method: string, path: string) =>
  api.s.llamadas.filter((l) => l.method === method && l.path === path);
const MANANA = '2026-10-25';

it('un edecán que entra aquí va a su app', async () => {
  await tokenStore.set('T-u-mateo');
  await abrir();
  expect(await screen.findByText('INICIO EDECAN')).toBeOnTheScreen();
});

describe('agenda', () => {
  const item = (o: object) => ({
    id: 'x',
    tipo: 'REUNION',
    titulo: 'Reunión',
    lugar: null,
    fecha: HOY,
    hora_desde: '09:00',
    hora_hasta: null,
    nota: null,
    ...o,
  });

  it('ordena el día por hora y cambia a mañana', async () => {
    api.s.agenda = [
      item({
        id: 'b',
        tipo: 'SERVICIO',
        titulo: 'Aires en Sala B',
        lugar: 'Sala B',
        hora_desde: '14:00',
        hora_hasta: '16:00',
      }),
      item({
        id: 'a',
        tipo: 'TURNO',
        titulo: 'Turno de operaciones',
        hora_desde: '08:00',
        hora_hasta: '17:00',
      }),
      item({ id: 'c', titulo: 'Reunión con proveedores', fecha: MANANA }),
    ] as never;
    await abrir();
    expect(await screen.findByText('Turno de operaciones')).toBeOnTheScreen();
    const titulos = screen
      .getAllByText(/^(Turno de operaciones|Aires en Sala B)$/)
      .map((t) => t.props.children);
    expect(titulos).toEqual(['Turno de operaciones', 'Aires en Sala B']);
    expect(screen.getByText('Servicio · Sala B')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Mañana' }));
    expect(await screen.findByText('Reunión con proveedores')).toBeOnTheScreen();
    expect(llamadas('GET', '/me/agenda').some((l) => l.query === `?fecha=${MANANA}`)).toBe(true);
  });

  it('crea un recordatorio validando la hora y lo borra', async () => {
    await abrir();
    expect(await screen.findByText('No tienes nada agendado hoy.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Nuevo recordatorio' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Escribe qué quieres recordar.')).toBeOnTheScreen();
    expect(screen.getByText('Escribe la hora como 09:30.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Recordatorio'), 'Llamar a mantenimiento');
    await fireEvent.changeText(screen.getByLabelText('Hora'), '1430');
    expect(screen.getByLabelText('Hora').props.value).toBe('14:30');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(llamadas('POST', '/me/agenda')).toHaveLength(1));
    expect(llamadas('POST', '/me/agenda')[0]!.body).toEqual({
      titulo: 'Llamar a mantenimiento',
      fecha: HOY,
      hora_desde: '14:30',
    });
    expect(await screen.findByText('Llamar a mantenimiento')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Borrar recordatorio Llamar a mantenimiento' }),
    );
    await waitFor(() => expect(llamadas('DELETE', '/me/agenda/n3')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Llamar a mantenimiento')).toBeNull());
  });

  it('solo los recordatorios se pueden borrar', async () => {
    api.s.agenda = [item({ id: 'a', tipo: 'TURNO', titulo: 'Turno de tarde' })] as never;
    await abrir();
    await screen.findByText('Turno de tarde');
    expect(screen.queryByRole('button', { name: /Borrar recordatorio/ })).toBeNull();
  });
});

describe('órdenes', () => {
  it('registra una visita de servicio con todos los campos y la lista como orden de hoy', async () => {
    await abrir('/app/personal');
    expect(await screen.findByText('No hay órdenes para hoy.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Registrar visita de servicio' }));
    await fireEvent.press(await boton('Registrar'));
    expect(screen.getByText('Escribe la empresa.')).toBeOnTheScreen();
    expect(screen.getByText('Elige el trato.')).toBeOnTheScreen();
    expect(llamadas('POST', '/servicios')).toHaveLength(0);

    const campos: [string, string][] = [
      ['Empresa', 'Mantenimientos Andinos'],
      ['Nombre del trabajador', 'Laura'],
      ['Apellido del trabajador', 'Pérez'],
      ['Trabajo a realizar', 'Revisión de aires'],
      ['Solicitado por', 'Marta Ruiz'],
      ['Responsable en el club', 'Carlos Mendoza'],
      ['Área', 'Operaciones'],
      ['Desde', '0800'],
      ['Hasta', '1200'],
      ['Punto de presentación', 'Recepción'],
    ];
    for (const [label, valor] of campos)
      await fireEvent.changeText(screen.getByLabelText(label), valor);
    await fireEvent.press(screen.getByRole('radio', { name: 'Señora' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(llamadas('POST', '/servicios')).toHaveLength(1));
    expect(llamadas('POST', '/servicios')[0]!.body).toEqual({
      empresa: 'Mantenimientos Andinos',
      nombre: 'Laura',
      apellido: 'Pérez',
      trato: 'senora',
      trabajo: 'Revisión de aires',
      solicitado_por: 'Marta Ruiz',
      responsable: 'Carlos Mendoza',
      area: 'Operaciones',
      fecha: HOY,
      hora_desde: '08:00',
      hora_hasta: '12:00',
      punto_presentacion: 'Recepción',
    });

    expect(await screen.findByText('Revisión de aires')).toBeOnTheScreen();
    expect(screen.getByText('Recepción · 08:00')).toBeOnTheScreen();
    // Poca información: sin etiqueta de estado ni prioridades.
    expect(screen.queryByText('Programada')).toBeNull();
    expect(screen.queryByText(/Alta|Media|Baja/)).toBeNull();
  });

  const orden = () => ({
    id: 'OT-0009',
    persona: 'p-1',
    nombre: 'Laura',
    apellido: 'Pérez',
    trato: 'senora',
    empresa: 'Mantenimientos Andinos',
    trabajo: 'Revisión de aires',
    solicitado_por: 'Marta Ruiz',
    responsable: 'Carlos Mendoza',
    area: 'Operaciones',
    fecha: HOY,
    hora_desde: '08:00',
    hora_hasta: '12:00',
    punto_presentacion: 'Recepción',
    estado: 'PROGRAMADA',
  });

  it('Tomar pasa la orden a en curso y Terminar la cierra', async () => {
    api.s.servicios = [orden()] as never;
    await abrir('/app/personal');
    await fireEvent.press(await boton('Tomar Revisión de aires'));
    await waitFor(() => expect(llamadas('PATCH', '/servicios/OT-0009')).toHaveLength(1));
    expect(llamadas('PATCH', '/servicios/OT-0009')[0]!.body).toEqual({ estado: 'EN_CURSO' });
    await fireEvent.press(await boton('Terminar Revisión de aires'));
    await waitFor(() => expect(llamadas('PATCH', '/servicios/OT-0009')).toHaveLength(2));
    expect(llamadas('PATCH', '/servicios/OT-0009')[1]!.body).toEqual({ estado: 'TERMINADA' });
    await waitFor(() => expect(screen.queryByText('Revisión de aires')).toBeNull());
  });

  it('el detalle muestra la empresa y deja cancelar la orden', async () => {
    api.s.servicios = [orden()] as never;
    await abrir('/app/personal');
    await fireEvent.press(await boton('Detalle de Revisión de aires'));
    expect(screen.getByText('Mantenimientos Andinos · Laura Pérez')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Cancelada' }));
    await waitFor(() => expect(llamadas('PATCH', '/servicios/OT-0009')).toHaveLength(1));
    expect(llamadas('PATCH', '/servicios/OT-0009')[0]!.body).toEqual({ estado: 'CANCELADA' });
  });

  it('las órdenes de otros días no aparecen en «de hoy»', async () => {
    api.s.servicios = [{ ...orden(), fecha: MANANA }] as never;
    await abrir('/app/personal');
    expect(await screen.findByText('No hay órdenes para hoy.')).toBeOnTheScreen();
  });
});

describe('reportar', () => {
  it('envía el tipo y lo que pasó sin pedir nada más', async () => {
    await abrir('/app/personal/reportar');
    await fireEvent.press(await boton('Enviar'));
    expect(screen.getByText('Elige qué pasó.')).toBeOnTheScreen();
    expect(screen.getByText('Cuéntanos qué pasó.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Robot' }));
    await fireEvent.changeText(screen.getByLabelText('¿Qué pasó?'), 'El robot no responde');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(llamadas('POST', '/incidencias')).toHaveLength(1));
    expect(llamadas('POST', '/incidencias')[0]!.body).toEqual({
      tipo: 'FALLA_ROBOT',
      descripcion: 'El robot no responde',
    });
  });
});

describe('actividades', () => {
  const cata = {
    id: 'a1',
    nombre: 'Cata de vinos',
    descripcion: null,
    lugar: 'Salón Principal',
    fecha: HOY,
    hora_desde: '19:00',
    hora_hasta: '21:00',
    cupo: 20,
    inscritos: ['u-1', 'u-2'],
    robot_puede_ofrecer: true,
  };

  it('lista las del día con cupo y marca del robot; las de mañana aparecen al cambiar', async () => {
    api.s.actividades = [
      cata,
      {
        ...cata,
        id: 'a2',
        nombre: 'Yoga',
        fecha: MANANA,
        cupo: null,
        inscritos: [],
        robot_puede_ofrecer: false,
      },
    ];
    await abrir('/app/personal/actividades');
    expect(await screen.findByText('Cata de vinos')).toBeOnTheScreen();
    expect(screen.getByText('2 de 20 inscritos')).toBeOnTheScreen();
    expect(screen.getByText('El robot la ofrece')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Mañana' }));
    expect(await screen.findByText('Yoga')).toBeOnTheScreen();
    expect(screen.getByText('0 inscritos')).toBeOnTheScreen();
  });

  it('crea una actividad', async () => {
    await abrir('/app/personal/actividades');
    await fireEvent.press(await screen.findByRole('button', { name: 'Nueva actividad' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
    expect(screen.getByText('Escribe el nombre.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Taller de café');
    await fireEvent.changeText(screen.getByLabelText('Lugar'), 'Terraza');
    await fireEvent.changeText(screen.getByLabelText('Desde'), '1000');
    await fireEvent.changeText(screen.getByLabelText('Hasta'), '1100');
    await fireEvent.changeText(screen.getByLabelText('Cupo (opcional)'), '1a2');
    expect(screen.getByLabelText('Cupo (opcional)').props.value).toBe('12');
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'El robot puede ofrecerla a los visitantes' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Crear actividad' }));
    await waitFor(() => expect(llamadas('POST', '/actividades')).toHaveLength(1));
    expect(llamadas('POST', '/actividades')[0]!.body).toEqual({
      nombre: 'Taller de café',
      descripcion: null,
      lugar: 'Terraza',
      fecha: HOY,
      hora_desde: '10:00',
      hora_hasta: '11:00',
      cupo: 12,
      robot_puede_ofrecer: true,
    });
    expect(await screen.findByText('Taller de café')).toBeOnTheScreen();
  });

  it('edita y borra con confirmación', async () => {
    api.s.actividades = [cata];
    await abrir('/app/personal/actividades');
    await fireEvent.press(await screen.findByRole('button', { name: 'Editar Cata de vinos' }));
    expect(screen.getByLabelText('Nombre').props.value).toBe('Cata de vinos');
    await fireEvent.changeText(screen.getByLabelText('Lugar'), 'Bodega');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(llamadas('PATCH', '/actividades/a1')).toHaveLength(1));
    expect(llamadas('PATCH', '/actividades/a1')[0]!.body).toMatchObject({
      lugar: 'Bodega',
      cupo: 20,
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Borrar Cata de vinos' }));
    expect(llamadas('DELETE', '/actividades/a1')).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar borrar Cata de vinos' }));
    await waitFor(() => expect(llamadas('DELETE', '/actividades/a1')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Cata de vinos')).toBeNull());
  });
});

describe('perfil', () => {
  it('muestra el rol y no ofrece el selector de estado del edecán', async () => {
    await abrir('/app/personal/perfil');
    expect(await screen.findByText('Marta Ruiz')).toBeOnTheScreen();
    expect(screen.getByText('Personal del club')).toBeOnTheScreen();
    expect(screen.queryByText('Mi estado')).toBeNull();
    await act(async () => void (await jest.advanceTimersByTimeAsync(10)));
  });
});
