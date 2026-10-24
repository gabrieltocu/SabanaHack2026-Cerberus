import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import {
  MembershipScreen,
  ProfileChipsScreen,
  ProfileInfoScreen,
} from '@/features/club/socio/AccountScreens';
import { MyPhotoScreen } from '@/features/club/socio/MyPhotoScreen';
import { pickPhoto } from './photoMocks';
import { ANDRES, SOFIA, fakeApi, inv, perfil, renderSocio, type Reply } from './support';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('./routerMock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-image-picker', () => require('./photoMocks').pickerModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-image-manipulator', () => require('./photoMocks').manipulatorModule());

const btn = (name: string) => screen.getByRole('button', { name });

/** `foto()` needs Blob + FileReader of a browser; the tests only need a URI back. */
function conFoto(a: ReturnType<typeof fakeApi>) {
  const foto = jest.fn().mockResolvedValue('file://foto-de-prueba.jpg');
  return { ...a, client: { ...a.client, foto } as typeof a.client, foto };
}

const api = (extra: Record<string, Reply> = {}) =>
  fakeApi({
    'GET /me/perfil': { body: perfil() },
    'GET /invitaciones': { body: { items: [inv(), inv({ id: 'i2', estado: 'LLEGO' })] } },
    ...extra,
  });

beforeEach(() => jest.clearAllMocks());

describe('Mis datos', () => {
  it('muestra los datos del socio y dice cómo cambiarlos', async () => {
    await renderSocio(<ProfileInfoScreen onBack={jest.fn()} />, api());
    expect(screen.getAllByText('Sofia Restrepo').length).toBeGreaterThan(0);
    expect(screen.getByText('sofia@nclub.demo')).toBeTruthy();
    expect(screen.getByText('Señora')).toBeTruthy();
    expect(screen.getByText('Socia VIP')).toBeTruthy();
    expect(screen.getByText('Acción empresarial')).toBeTruthy();
    expect(screen.getByText(/escríbele al concierge/)).toBeTruthy();
  });
});

describe('Preferencias de bebidas', () => {
  it('marca, añade «Otra» y guarda solo lo que cambió', async () => {
    const a = api({
      'PATCH /me/perfil': { body: perfil({ preferencias_bebida: ['Café', 'Té', 'Chai latte'] }) },
    });
    await renderSocio(<ProfileChipsScreen tipo="bebidas" onBack={jest.fn()} />, a);
    const cafe = await screen.findByRole('checkbox', { name: 'Café' });
    expect(cafe).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
    expect(btn('Guardar')).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Té' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Otra' }));
    await fireEvent.changeText(screen.getByLabelText('Escribe otra opción'), 'Chai latte');
    await fireEvent.press(btn('Añadir'));
    expect(screen.getByRole('checkbox', { name: 'Chai latte' })).toBeTruthy();
    expect(btn('Guardar')).toBeEnabled();
    await fireEvent.press(btn('Guardar'));
    expect(await screen.findByText('Guardado')).toBeTruthy();
    const patch = a.calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toEqual({ preferencias_bebida: ['Café', 'Té', 'Chai latte'] });
    expect(btn('Guardar')).toBeDisabled();
  });

  it('un error de la API se dice y se puede reintentar', async () => {
    const a = api({ 'PATCH /me/perfil': { status: 500, body: { error: 'x', detalle: 'Falló.' } } });
    await renderSocio(<ProfileChipsScreen tipo="bebidas" onBack={jest.fn()} />, a);
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Agua' }));
    await fireEvent.press(btn('Guardar'));
    expect(await screen.findByText('Falló.')).toBeTruthy();
    expect(btn('Guardar')).toBeEnabled();
  });
});

describe('Necesidades de asistencia', () => {
  it('guarda las necesidades y la nota para el equipo', async () => {
    const a = api({
      'PATCH /me/perfil': {
        body: perfil({ asistencia: ['silla_ruedas'], nota_asistencia: 'Entrada por rampa' }),
      },
    });
    await renderSocio(<ProfileChipsScreen tipo="asistencia" onBack={jest.fn()} />, a);
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Silla de ruedas' }));
    await fireEvent.changeText(
      screen.getByLabelText('Nota para el equipo (opcional)'),
      'Entrada por rampa',
    );
    await fireEvent.press(btn('Guardar'));
    expect(await screen.findByText('Guardado')).toBeTruthy();
    expect(a.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      asistencia: ['silla_ruedas'],
      nota_asistencia: 'Entrada por rampa',
    });
  });
});

describe('Membresía', () => {
  it('nivel, límite de invitados activos y beneficios de la API', async () => {
    const a = api({
      'GET /membresia/info': {
        body: {
          niveles: [
            { nivel: 'REGULAR', beneficios: ['Otro'], invitados_activos: 3 },
            { nivel: 'VIP', beneficios: ['Reserva de robot'], invitados_activos: 10 },
          ],
        },
      },
    });
    await renderSocio(<MembershipScreen onBack={jest.fn()} />, a);
    expect(await screen.findByText('Reserva de robot')).toBeTruthy();
    expect(screen.queryByText('Otro')).toBeNull();
    expect(
      await screen.findByLabelText(/Tarjeta de socio:.*2 de 10 invitados activos/),
    ).toBeTruthy();
    expect(screen.getByText('Socia VIP')).toBeTruthy();
    expect(screen.queryByText('MEMBRESÍA VIP')).toBeNull();
  });

  it('regular: límite de 3 y su propia orientación; «Mis datos» abre esa sección', async () => {
    const onAbrir = jest.fn();
    await renderSocio(<MembershipScreen onBack={jest.fn()} onAbrir={onAbrir} />, api(), ANDRES);
    expect(
      await screen.findByLabelText(/Tarjeta de socio:.*2 de 3 invitados activos/),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Tarjeta de socio:.*El robot te orienta/)).toBeTruthy();
    expect(screen.getByText('Socio regular')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Mis datos' }));
    expect(onAbrir).toHaveBeenCalledWith('info');
  });

  it('si la API falla muestra el beneficio de su nivel y reintentar', async () => {
    await renderSocio(<MembershipScreen onBack={jest.fn()} />, api());
    expect((await screen.findAllByText(/El robot avisa a concierge/)).length).toBe(2);
    expect(btn('Reintentar')).toBeTruthy();
  });
});

describe('Mi foto para reconocimiento', () => {
  it('con la foto lista la muestra y permite cambiarla o quitarla', async () => {
    const a = conFoto(
      api({
        'GET /me/perfil': { body: perfil({ foto_estado: 'LISTA' }) },
        'DELETE /me/foto': { body: perfil({ foto_estado: 'NINGUNA' }) },
      }),
    );
    await renderSocio(<MyPhotoScreen onBack={jest.fn()} />, a);
    expect(await screen.findByLabelText('Tu foto para reconocimiento')).toBeTruthy();
    expect(a.foto).toHaveBeenCalledWith('/me/foto');
    expect(screen.getByText('Lista. El robot te reconocerá al llegar.')).toBeTruthy();
    await fireEvent.press(btn('Quitar foto'));
    await fireEvent.press(screen.getByRole('button', { name: 'Sí, quitar' }));
    expect(await screen.findByText(/Foto quitada/)).toBeTruthy();
    expect(a.calls.some((c) => c.method === 'DELETE' && c.path === '/me/foto')).toBe(true);
    expect(await screen.findByText(/Sin foto\. Con ella, el robot te reconoce/)).toBeTruthy();
  });

  it('subir exige el consentimiento y manda foto + consentimiento', async () => {
    const restore = pickPhoto(200 * 1024);
    const a = conFoto(
      api({
        'GET /me/perfil': { body: perfil() },
        'PUT /me/foto': { body: perfil({ foto_estado: 'PENDIENTE' }) },
      }),
    );
    await renderSocio(<MyPhotoScreen onBack={jest.fn()} />, a);
    await fireEvent.press(await screen.findByRole('button', { name: 'Galería' }));
    expect(await screen.findByLabelText('Vista previa de tu foto')).toBeTruthy();
    expect(btn('Guardar foto')).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(btn('Guardar foto')).toBeEnabled();
    await fireEvent.press(btn('Guardar foto'));
    expect(await screen.findByText(/El robot la está procesando/)).toBeTruthy();
    const put = a.calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/me/foto');
    expect((put.body as FormData).get('consentimiento')).toBe('true');
    expect(screen.getAllByText(/Procesando/).length).toBeGreaterThan(0);
    restore();
  });

  it('rechazada: muestra el motivo y deja subir otra', async () => {
    await renderSocio(
      <MyPhotoScreen onBack={jest.fn()} />,
      conFoto(
        api({
          'GET /me/perfil': {
            body: perfil({ foto_estado: 'RECHAZADA', foto_motivo: 'Salió borrosa.' }),
          },
        }),
      ),
    );
    expect(await screen.findByText('Salió borrosa.')).toBeTruthy();
    expect(btn('Galería')).toBeTruthy();
    expect(SOFIA.nombre).toBe('Sofia');
  });

  it('sin conexión al cargar el perfil ofrece reintentar', async () => {
    await renderSocio(<MyPhotoScreen onBack={jest.fn()} />, fakeApi({}));
    await waitFor(() => expect(btn('Reintentar')).toBeTruthy());
  });
});
