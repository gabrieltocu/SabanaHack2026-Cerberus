import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { Linking } from 'react-native';

import { createClubClient } from '@/features/club/client';
import { NewInvitationScreen } from '@/features/club/socio/NewInvitationScreen';
import { CONSENTIMIENTO } from '@/features/club/socio/model';
import { manipulator, pickPhoto, picker } from './photoMocks';
import { fakeApi, inv, renderSocio } from './support';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('./routerMock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-image-picker', () => require('./photoMocks').pickerModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-image-manipulator', () => require('./photoMocks').manipulatorModule());

const btn = (name: string) => screen.getByRole('button', { name });

async function llenar() {
  await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Laura');
  await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Díaz');
  await fireEvent.press(screen.getByRole('radio', { name: 'Señora' }));
}

const api = (extra: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({
    'POST /invitaciones': { status: 201, body: inv({ id: 'i9' }) },
    'GET /invitaciones': { body: { items: [] } },
    'PUT /invitaciones/i9/foto': { body: inv({ id: 'i9', foto_estado: 'PENDIENTE' }) },
    ...extra,
  });

beforeEach(() => jest.clearAllMocks());

describe('NewInvitationScreen', () => {
  it('crea una invitación sin foto y avisa que el robot pedirá un QR', async () => {
    const a = api();
    const onCreada = jest.fn();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={onCreada} />, a);
    expect(screen.getByText('El robot le pedirá un QR.')).toBeTruthy();
    expect(screen.getByText('Agregar foto')).toBeTruthy();
    await llenar();
    await fireEvent.press(btn('Más detalles'));
    await fireEvent.changeText(screen.getByLabelText('Nota (opcional)'), 'Viene con su esposo');
    await fireEvent.press(screen.getByRole('radio', { name: 'Lounge VIP' }));
    await fireEvent.press(btn('Enviar invitación'));
    await waitFor(() => expect(onCreada).toHaveBeenCalledWith('i9', undefined));
    const post = a.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      nombre: 'Laura',
      apellido: 'Díaz',
      trato: 'senora',
      fecha: '2026-10-23',
      hora_desde: '15:30',
      hora_hasta: '17:30',
      lugar: 'Lounge VIP',
      nota: 'Viene con su esposo',
      documento: null,
      preferencias_bebida: [],
      asistencia: [],
      punto_encuentro: null,
    });
    expect(a.calls.some((c) => c.path.endsWith('/foto'))).toBe(false);
  });

  it('muestra los errores del formulario y no llama a la API', async () => {
    const a = api();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, a);
    await fireEvent.press(btn('Enviar invitación'));
    expect(await screen.findByText('Escribe el nombre.')).toBeTruthy();
    expect(screen.getByText('Escribe el apellido.')).toBeTruthy();
    expect(screen.getByText('Elige cómo tratarlo.')).toBeTruthy();
    expect(screen.getByText('Revisa los campos marcados.')).toBeTruthy();
    expect(a.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('valida que hasta sea posterior a desde y que la fecha no sea pasada', async () => {
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, api());
    await llenar();
    await fireEvent.changeText(screen.getByLabelText('Hasta'), '1500');
    await fireEvent.press(btn('Más detalles'));
    await fireEvent.changeText(screen.getByLabelText('Fecha'), '2026-10-22');
    await fireEvent.press(btn('Enviar invitación'));
    expect(await screen.findByText('La hora final debe ser después de la inicial.')).toBeTruthy();
    expect(screen.getByText('Usa una fecha de hoy en adelante (AAAA-MM-DD).')).toBeTruthy();
  });

  it('lo opcional queda plegado en «Más detalles» y se abre solo si un campo oculto falla', async () => {
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, api());
    expect(screen.queryByLabelText('Nota (opcional)')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Agua' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Más detalles' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ expanded: false }),
    );
    // the required fields and the photo box are always in view
    for (const campo of ['Nombre', 'Apellido', 'Desde', 'Hasta']) {
      expect(screen.getByLabelText(campo)).toBeTruthy();
    }
    expect(screen.getByText('Agregar foto')).toBeTruthy();
    await llenar();
    await fireEvent.press(btn('Más detalles'));
    await fireEvent.changeText(screen.getByLabelText('Fecha'), '2026-10-22');
    await fireEvent.press(btn('Más detalles'));
    await fireEvent.press(btn('Enviar invitación'));
    // the date error keeps its section open even after folding it
    expect(await screen.findByText('Usa una fecha de hoy en adelante (AAAA-MM-DD).')).toBeTruthy();
    expect(screen.getByLabelText('Fecha')).toBeTruthy();
  });

  it('elegir un día rápido llena la fecha', async () => {
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, api());
    await fireEvent.press(screen.getByRole('radio', { name: 'Mañana' }));
    await fireEvent.press(btn('Más detalles'));
    expect(screen.getByLabelText('Fecha').props.value).toBe('2026-10-24');
  });

  it('con foto exige la autorización: botón deshabilitado y mensaje hasta marcarla', async () => {
    const restore = pickPhoto(250 * 1024);
    const a = api();
    const onCreada = jest.fn();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={onCreada} />, a);
    await llenar();
    await fireEvent.press(btn('Galería'));
    expect(await screen.findByLabelText('Vista previa de la foto del invitado')).toBeTruthy();
    expect(screen.getByText('250 KB')).toBeTruthy();
    expect(manipulator.manipulate).toHaveBeenCalledWith('file://big.jpg', { maxWidth: 720 });
    expect(manipulator.save).toHaveBeenCalledWith({ compress: 0.6, format: 'jpeg' });
    expect(screen.queryByText('El robot le pedirá un QR.')).toBeNull();
    expect(screen.getByText(CONSENTIMIENTO)).toBeTruthy();
    expect(screen.getByText('Marca la autorización para usar la foto.')).toBeTruthy();
    expect(btn('Enviar invitación')).toBeDisabled();

    await fireEvent.press(screen.getByRole('checkbox', { name: CONSENTIMIENTO }));
    expect(btn('Enviar invitación')).toBeEnabled();
    expect(screen.queryByText('Marca la autorización para usar la foto.')).toBeNull();
    await fireEvent.press(btn('Enviar invitación'));
    await waitFor(() => expect(onCreada).toHaveBeenCalledWith('i9', undefined));
    const put = a.calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/invitaciones/i9/foto');
    expect(put.body).toBeInstanceOf(FormData);
    restore();
  });

  it('quitar la foto devuelve el aviso del QR; una foto nueva pide autorización otra vez', async () => {
    const restore = pickPhoto();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, api());
    await fireEvent.press(btn('Cámara frontal'));
    await screen.findByLabelText('Vista previa de la foto del invitado');
    expect(picker.camera).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'front' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: CONSENTIMIENTO }));
    await fireEvent.press(btn('Cámara frontal'));
    await screen.findByLabelText('Vista previa de la foto del invitado');
    expect(screen.getByRole('checkbox', { name: CONSENTIMIENTO })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
    await fireEvent.press(btn('Quitar foto'));
    expect(screen.getByText('El robot le pedirá un QR.')).toBeTruthy();
    expect(btn('Enviar invitación')).toBeEnabled();
    restore();
  });

  it('sin permiso de cámara explica qué hacer y ofrece abrir ajustes', async () => {
    pickPhoto();
    picker.perm.mockResolvedValue({ granted: false, canAskAgain: false });
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, api());
    await fireEvent.press(btn('Cámara frontal'));
    expect(await screen.findByText(/Sin permiso de cámara/)).toBeTruthy();
    await fireEvent.press(btn('Abrir ajustes'));
    expect(open).toHaveBeenCalled();
    expect(btn('Galería')).toBeEnabled();
    open.mockRestore();
  });

  it('si la compresión falla muestra el motivo y se puede seguir sin foto', async () => {
    pickPhoto();
    manipulator.save.mockRejectedValue(new Error('x'));
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, api());
    await fireEvent.press(btn('Galería'));
    expect(await screen.findByText('No se pudo completar. Intenta de nuevo.')).toBeTruthy();
    expect(btn('Enviar invitación')).toBeEnabled();
  });

  it('muestra el detalle de la API (limite_invitaciones) y conserva lo escrito', async () => {
    const a = api({
      'POST /invitaciones': {
        status: 409,
        body: {
          error: 'limite_invitaciones',
          detalle: 'Alcanzaste el límite de 3 invitaciones activas.',
        },
      },
    });
    const onCreada = jest.fn();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={onCreada} />, a);
    await llenar();
    await fireEvent.press(btn('Enviar invitación'));
    expect(await screen.findByText('Alcanzaste el límite de 3 invitaciones activas.')).toBeTruthy();
    expect(onCreada).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre').props.value).toBe('Laura');
  });

  it('si la foto no sube, la invitación queda creada y se pasa el motivo al detalle', async () => {
    const restore = pickPhoto();
    const a = api({
      'PUT /invitaciones/i9/foto': {
        status: 413,
        body: { error: 'foto_muy_grande', detalle: 'La foto supera los 600 KB. Comprímela.' },
      },
    });
    const onCreada = jest.fn();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={onCreada} />, a);
    await llenar();
    await fireEvent.press(btn('Galería'));
    await screen.findByLabelText('Vista previa de la foto del invitado');
    await fireEvent.press(screen.getByRole('checkbox', { name: CONSENTIMIENTO }));
    await fireEvent.press(btn('Enviar invitación'));
    await waitFor(() =>
      expect(onCreada).toHaveBeenCalledWith('i9', 'La foto supera los 600 KB. Comprímela.'),
    );
    restore();
  });

  it('sin conexión muestra el mensaje de red', async () => {
    const a = fakeApi({});
    const down = createClubClient('http://club.test', (async () => {
      throw new TypeError('red');
    }) as unknown as typeof fetch);
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, {
      ...a,
      client: down,
    });
    await llenar();
    await fireEvent.press(btn('Enviar invitación'));
    expect(await screen.findByText(/Sin conexión/)).toBeTruthy();
  });

  it('el botón Volver llama a onBack', async () => {
    const onBack = jest.fn();
    await renderSocio(<NewInvitationScreen onBack={onBack} onCreada={jest.fn()} />, api());
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalled();
  });
});
