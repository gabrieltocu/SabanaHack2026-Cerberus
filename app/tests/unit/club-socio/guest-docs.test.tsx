import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import { InvitationDetailScreen } from '@/features/club/socio/InvitationDetailScreen';
import { NewInvitationScreen } from '@/features/club/socio/NewInvitationScreen';
import { TEXTOS_CEDULA } from '@/features/club/socio/ui/PhotoField';
import type { Invitacion } from '@/club/types';
import { picker, pickPhoto } from './photoMocks';
import { fakeApi, inv, renderSocio, visita, type Reply } from './support';

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

describe('Registrar invitados: bebidas, asistencia, punto de encuentro y cédula', () => {
  const api = (extra: Record<string, Reply> = {}) =>
    fakeApi({
      'POST /invitaciones': { status: 201, body: inv({ id: 'i9' }) },
      'GET /invitaciones': { body: { items: [] } },
      'PUT /invitaciones/i9/documento': { body: inv({ id: 'i9', documento_foto: 'GUARDADA' }) },
      ...extra,
    });
  const llenar = async () => {
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Laura');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Díaz');
    await fireEvent.press(screen.getByRole('radio', { name: 'Señora' }));
    // bebidas, asistencia, punto de encuentro y cédula viven en «Más detalles»
    await fireEvent.press(btn('Más detalles'));
  };

  it('manda bebidas, asistencia, punto de encuentro y el número de cédula en la creación', async () => {
    const a = api();
    const onCreada = jest.fn();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={onCreada} />, a);
    await llenar();
    await fireEvent.press(screen.getByRole('radio', { name: 'Lobby' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Agua' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Silla de ruedas' }));
    await fireEvent.changeText(screen.getByLabelText('Número de cédula (opcional)'), '1020-304050');
    await fireEvent.press(btn('Enviar invitación'));
    await waitFor(() => expect(onCreada).toHaveBeenCalledWith('i9', undefined));
    expect(a.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      punto_encuentro: 'Lobby',
      preferencias_bebida: ['Agua'],
      asistencia: ['silla_ruedas'],
      documento: '1020304050',
    });
    expect(a.calls.some((c) => c.path.endsWith('/documento'))).toBe(false);
  });

  it('la foto de la cédula usa la cámara trasera, exige número y autorización, y se sube tras crear', async () => {
    const restore = pickPhoto(300 * 1024);
    const a = api();
    const onCreada = jest.fn();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={onCreada} />, a);
    await llenar();
    await fireEvent.press(btn('Cámara trasera'));
    await screen.findByLabelText('Vista previa de la cédula');
    expect(picker.camera).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'back' }));
    const consentir = screen.getByRole('checkbox', { name: TEXTOS_CEDULA.consentimiento });
    expect(btn('Enviar invitación')).toBeDisabled();
    await fireEvent.press(consentir);
    // photo without number: the form does not go out
    await fireEvent.press(btn('Enviar invitación'));
    expect(await screen.findByText('Escribe el número de la cédula.')).toBeTruthy();
    expect(a.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText('Número de cédula (opcional)'), '1020304050');
    await fireEvent.press(btn('Enviar invitación'));
    await waitFor(() => expect(onCreada).toHaveBeenCalledWith('i9', undefined));
    const put = a.calls.find((c) => c.path === '/invitaciones/i9/documento')!;
    expect(put.method).toBe('PUT');
    const form = put.body as FormData;
    expect(form.get('numero')).toBe('1020304050');
    expect(form.get('consentimiento')).toBe('true');
    expect(form.get('foto')).toBeTruthy();
    restore();
  });

  it('si la cédula no sube, la invitación queda creada y el detalle recibe el motivo', async () => {
    const restore = pickPhoto();
    const a = api({
      'PUT /invitaciones/i9/documento': {
        status: 413,
        body: { error: 'foto_muy_grande', detalle: 'La foto supera los 600 KB.' },
      },
    });
    const onCreada = jest.fn();
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={onCreada} />, a);
    await llenar();
    await fireEvent.press(btn('Galería (cédula)'));
    await screen.findByLabelText('Vista previa de la cédula');
    await fireEvent.press(screen.getByRole('checkbox', { name: TEXTOS_CEDULA.consentimiento }));
    await fireEvent.changeText(screen.getByLabelText('Número de cédula (opcional)'), '1020304050');
    await fireEvent.press(btn('Enviar invitación'));
    await waitFor(() =>
      expect(onCreada).toHaveBeenCalledWith('i9', 'Cédula: La foto supera los 600 KB.'),
    );
    restore();
  });

  it('rechaza un número con símbolos de más o demasiado corto', async () => {
    await renderSocio(<NewInvitationScreen onBack={jest.fn()} onCreada={jest.fn()} />, api());
    await llenar();
    await fireEvent.changeText(screen.getByLabelText('Número de cédula (opcional)'), '123');
    await fireEvent.press(btn('Enviar invitación'));
    expect(
      await screen.findByText('Revisa el número: solo letras y números, de 5 a 15.'),
    ).toBeTruthy();
  });
});

describe('Detalle de invitación: fotos reales, cédula y visita', () => {
  function api(inicial: Partial<Invitacion> = {}, extra: Record<string, Reply> = {}) {
    let actual = inv({ id: 'i1', ...inicial });
    const set = (p: Partial<Invitacion>) => {
      actual = { ...actual, ...p };
      return { body: actual };
    };
    return conFoto(
      fakeApi({
        'GET /invitaciones/i1': () => ({ body: { ...actual, qr_payload: 'NCLUB1|x' } }),
        'GET /invitaciones': { body: { items: [] } },
        'DELETE /invitaciones/i1/documento': () => set({ documento_foto: 'NINGUNA' }),
        ...extra,
      }),
    );
  }
  const abrir = async (a: ReturnType<typeof api>, props: { onVerVisita?: () => void } = {}) => {
    await renderSocio(<InvitationDetailScreen id="i1" onBack={jest.fn()} {...props} />, a);
    await screen.findByRole('heading', { name: 'Laura Díaz' });
  };

  const abrirMenu = async (item: string) => {
    await fireEvent.press(btn('Más acciones'));
    await fireEvent.press(screen.getByRole('link', { name: item }));
  };

  it('Detalles incluye punto de encuentro, bebidas y asistencia', async () => {
    await abrir(
      api({
        punto_encuentro: 'Lobby',
        preferencias_bebida: ['Agua', 'Chai'],
        asistencia: ['visual'],
      }),
    );
    expect(screen.queryByText('Lobby')).toBeNull();
    await fireEvent.press(btn('Ver detalles'));
    expect(screen.getByText('Lobby')).toBeTruthy();
    expect(screen.getByText('Agua, Chai')).toBeTruthy();
    expect(screen.getByText('Apoyo visual')).toBeTruthy();
  });

  it('muestra la foto real del invitado cuando está lista, y no la pide si no hay', async () => {
    const a = api({ foto_estado: 'LISTA' });
    await abrir(a);
    await waitFor(() => expect(a.foto).toHaveBeenCalledWith('/invitaciones/i1/foto'));
    await abrirMenu('Cambiar foto');
    expect(await screen.findByLabelText('Foto de Laura Díaz')).toBeTruthy();
    const b = api({ foto_estado: 'NINGUNA' });
    await abrir(b);
    expect(b.foto).not.toHaveBeenCalled();
  });

  it('Cédula: muestra número y foto guardada; permite quitarla', async () => {
    const a = api({ documento: '1020304050', documento_foto: 'GUARDADA' });
    await abrir(a);
    await abrirMenu('Cédula');
    expect(await screen.findByLabelText('Foto del frente de la cédula del invitado')).toBeTruthy();
    expect(a.foto).toHaveBeenCalledWith('/invitaciones/i1/documento');
    expect(screen.getByText('Número 1020304050 · foto guardada.')).toBeTruthy();
    await fireEvent.press(btn('Quitar foto'));
    expect(await screen.findByText('Foto de la cédula quitada.')).toBeTruthy();
    expect(a.calls.some((c) => c.method === 'DELETE' && c.path.endsWith('/documento'))).toBe(true);
    expect(screen.getByText('Número 1020304050.')).toBeTruthy();
  });

  it('Cédula: reemplazar pide número, foto y autorización', async () => {
    const restore = pickPhoto();
    const a = api(
      { documento: '1020304050', documento_foto: 'GUARDADA' },
      { 'PUT /invitaciones/i1/documento': { body: inv({ documento_foto: 'GUARDADA' }) } },
    );
    await abrir(a);
    await abrirMenu('Cédula');
    await fireEvent.press(await screen.findByRole('button', { name: 'Reemplazar foto' }));
    await fireEvent.press(btn('Galería (cédula)'));
    await screen.findByLabelText('Vista previa de la cédula');
    expect(btn('Guardar cédula')).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: TEXTOS_CEDULA.consentimiento }));
    await fireEvent.press(btn('Guardar cédula'));
    expect(await screen.findByText(/Cédula guardada/)).toBeTruthy();
    const put = a.calls.find((c) => c.method === 'PUT')!;
    expect((put.body as FormData).get('numero')).toBe('1020304050');
    restore();
  });

  it('Cédula: con el invitado ya dentro no se puede cambiar', async () => {
    await abrir(api({ estado: 'LLEGO', documento_foto: 'GUARDADA', documento: '1020304050' }));
    await abrirMenu('Cédula');
    expect(
      await screen.findByText(/no se puede cambiar una vez que el invitado llegó/),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reemplazar foto' })).toBeNull();
  });

  it('si el invitado llegó, ofrece el acompañamiento de su visita', async () => {
    const onVerVisita = jest.fn();
    await abrir(
      api(
        { estado: 'LLEGO' },
        { 'GET /visitas': { body: { items: [visita({ id: 'v7', invitacion_id: 'i1' })] } } },
      ),
      { onVerVisita },
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Ver acompañamiento' }));
    expect(onVerVisita).toHaveBeenCalledWith('v7');
  });
});
