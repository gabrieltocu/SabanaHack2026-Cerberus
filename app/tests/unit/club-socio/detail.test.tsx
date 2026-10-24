import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { Platform, Share } from 'react-native';

import { InvitationDetailScreen } from '@/features/club/socio/InvitationDetailScreen';
import type { Invitacion } from '@/club/types';
import { pickPhoto } from './photoMocks';
import { router } from './routerMock';
import { fakeApi, inv, renderSocio, type Reply } from './support';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('./routerMock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-image-picker', () => require('./photoMocks').pickerModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-image-manipulator', () => require('./photoMocks').manipulatorModule());

const QR = 'NCLUB1|INVITADO|inv-1|Laura Díaz|1798000000|abc';
const btn = (name: string) => screen.getByRole('button', { name });

/** The invitation lives in `state`, so PATCH/PUT/DELETE answers can change what GET returns. */
function api(inicial: Partial<Invitacion> = {}, extra: Record<string, Reply> = {}) {
  let actual = inv(inicial);
  const set = (p: Partial<Invitacion>) => {
    actual = { ...actual, ...p };
    return { body: actual };
  };
  return fakeApi({
    'GET /invitaciones/i1': () => ({ body: { ...actual, qr_payload: QR } }),
    'GET /invitaciones': { body: { items: [] } },
    'PATCH /invitaciones/i1': () => set({ nombre: 'Laurita' }),
    'DELETE /invitaciones/i1': () => set({ estado: 'CANCELADA' }),
    'PUT /invitaciones/i1/foto': () => set({ foto_estado: 'PENDIENTE', foto_motivo: null }),
    'DELETE /invitaciones/i1/foto': () => set({ foto_estado: 'NINGUNA' }),
    ...extra,
  });
}

const abrir = async (
  a: ReturnType<typeof api>,
  props: { creada?: boolean; fotoError?: string } = {},
) => {
  const onBack = jest.fn();
  await renderSocio(<InvitationDetailScreen id="i1" onBack={onBack} {...props} />, a);
  await screen.findByRole('heading', { name: 'Laura Díaz' });
  return onBack;
};
const menu = async (item: string) => {
  await fireEvent.press(btn('Más acciones'));
  await fireEvent.press(screen.getByRole('link', { name: item }));
};

beforeEach(() => jest.clearAllMocks());

describe('InvitationDetailScreen', () => {
  it('programada sin foto: una línea, QR, compartir y sin etiquetas de estado', async () => {
    await abrir(api({ nota: 'Viene con su esposo' }));
    expect(screen.getByText('Mañana · 10:00 a 12:00 · Sala de anfitriones')).toBeTruthy();
    expect(screen.queryByText('Programada')).toBeNull();
    expect(screen.queryByText('Sin foto')).toBeNull();
    expect(screen.getByRole('img', { name: /Código QR de la invitación/ })).toBeTruthy();
    expect(btn('Compartir pase')).toBeEnabled();
    expect(btn('Agregar foto')).toBeTruthy();
    // the note and the rest of the optional data fold away
    expect(screen.queryByText('Viene con su esposo')).toBeNull();
    await fireEvent.press(btn('Ver detalles'));
    expect(screen.getByText('Viene con su esposo')).toBeTruthy();
    // edit and cancel live in the menu
    await fireEvent.press(btn('Más acciones'));
    expect(screen.getByRole('link', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cancelar invitación' })).toBeTruthy();
  });

  it.each([
    ['PENDIENTE', /Procesando/],
    ['LISTA', /Lista\. El robot reconocerá a tu invitado al llegar\./],
    ['RECHAZADA', /No sirvió para reconocerlo\./],
  ] as const)(
    'foto %s: su estado se dice con una frase y se puede quitar',
    async (foto_estado, texto) => {
      await abrir(api({ foto_estado }));
      expect(screen.getByText(texto)).toBeTruthy();
      expect(btn('Quitar foto')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Agregar foto' })).toBeNull();
    },
  );

  it('actualiza una foto en proceso cuando el robot termina, sin recargar la pantalla', async () => {
    let reads = 0;
    await abrir(
      api(
        {},
        {
          'GET /invitaciones/i1': () => ({
            body: { ...inv({ foto_estado: reads++ ? 'LISTA' : 'PENDIENTE' }), qr_payload: QR },
          }),
        },
      ),
    );
    expect(screen.getByText(/Procesando/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Procesando/)).toBeNull(), { timeout: 4500 });
    expect(screen.getByRole('heading', { name: 'Laura Díaz' })).toBeTruthy();
  });

  it('foto rechazada muestra el motivo y «Subir otra» en el menú', async () => {
    await abrir(api({ foto_estado: 'RECHAZADA', foto_motivo: 'No se ve el rostro.' }));
    expect(screen.getByText('No se ve el rostro.')).toBeTruthy();
    await fireEvent.press(btn('Más acciones'));
    expect(screen.getByRole('link', { name: 'Subir otra' })).toBeTruthy();
  });

  it('subir otra foto: pide autorización, sube multipart y pasa a Procesando', async () => {
    const restore = pickPhoto();
    const a = api({ foto_estado: 'RECHAZADA', foto_motivo: 'Borrosa.' });
    await abrir(a);
    await menu('Subir otra');
    expect(btn('Subir foto')).toBeDisabled();
    await fireEvent.press(btn('Galería'));
    await screen.findByLabelText('Vista previa de la foto del invitado');
    expect(btn('Subir foto')).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(btn('Subir foto'));
    await screen.findByText('Foto enviada. El robot la está procesando.');
    const put = a.calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toBeInstanceOf(FormData);
    expect(screen.getByText(/Procesando/)).toBeTruthy();
    expect(screen.queryByText('Borrosa.')).toBeNull();
    restore();
  });

  it('«Ahora no» cierra el selector de foto', async () => {
    await abrir(api());
    await fireEvent.press(btn('Agregar foto'));
    expect(btn('Subir foto')).toBeTruthy();
    await fireEvent.press(btn('Ahora no'));
    expect(screen.queryByRole('button', { name: 'Subir foto' })).toBeNull();
    expect(btn('Agregar foto')).toBeTruthy();
  });

  it('quitar la foto vuelve a ofrecer «Agregar foto»', async () => {
    const a = api({ foto_estado: 'LISTA' });
    await abrir(a);
    await fireEvent.press(btn('Quitar foto'));
    await screen.findByText('Foto quitada. El robot le pedirá un QR.');
    expect(btn('Agregar foto')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).toBeNull();
  });

  it('muestra el error de la API al subir una foto muy grande', async () => {
    const restore = pickPhoto();
    const a = api(
      {},
      {
        'PUT /invitaciones/i1/foto': {
          status: 413,
          body: { error: 'foto_muy_grande', detalle: 'La foto supera los 600 KB. Comprímela.' },
        },
      },
    );
    await abrir(a);
    await fireEvent.press(btn('Agregar foto'));
    await fireEvent.press(btn('Galería'));
    await screen.findByLabelText('Vista previa de la foto del invitado');
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(btn('Subir foto'));
    expect(await screen.findByText('La foto supera los 600 KB. Comprímela.')).toBeTruthy();
    restore();
  });

  it('Compartir pase comparte un enlace a la experiencia del invitado', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await abrir(api());
    await fireEvent.press(btn('Compartir pase'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const { message } = share.mock.calls[0]![0] as { message: string };
    expect(message).toMatch(
      /^Te invito a N Club el sáb 24 oct 2026 de 10:00 a 12:00\. Muestra este pase al robot: https:\/\/n-club-five\.vercel\.app\/visita\?qr=NCLUB1/,
    );
    expect(message).toContain(`/visita?qr=${encodeURIComponent(QR)}`);
    share.mockRestore();
  });

  it('en web sin navigator.share copia el enlace y lo dice', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    const writeText = jest.fn().mockResolvedValue(undefined);
    (globalThis.navigator as unknown as Record<string, unknown>).clipboard = { writeText };
    await abrir(api());
    await fireEvent.press(btn('Compartir pase'));
    expect(await screen.findByText(/Enlace copiado/)).toBeTruthy();
    expect(writeText.mock.calls[0]![0]).toContain('/visita?qr=NCLUB1');
    delete (globalThis.navigator as unknown as Record<string, unknown>).clipboard;
    os.restore();
  });

  it('cancelar pide confirmación: «No, mantener» no cancela, «Sí, cancelar» sí', async () => {
    const a = api();
    await abrir(a);
    await menu('Cancelar invitación');
    expect(await screen.findByText('¿Cancelar esta invitación?')).toBeTruthy();
    expect(screen.getByText('Laura ya no podrá entrar con este QR.')).toBeTruthy();
    await fireEvent.press(btn('No, mantener'));
    expect(a.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await menu('Cancelar invitación');
    await fireEvent.press(btn('Sí, cancelar'));
    await screen.findByText('Invitación cancelada.');
    expect(a.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    expect(screen.getByLabelText('Estado: Invitación cancelada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Compartir pase' })).toBeNull();
    await fireEvent.press(btn('Más acciones'));
    expect(screen.queryByRole('link', { name: 'Editar' })).toBeNull();
  });

  it('editar: carga los datos, guarda con PATCH y vuelve al detalle', async () => {
    const a = api();
    await abrir(a);
    await menu('Editar');
    expect(screen.getByLabelText('Nombre').props.value).toBe('Laura');
    expect(screen.getByLabelText('Desde').props.value).toBe('10:00');
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Laurita');
    await fireEvent.press(btn('Guardar cambios'));
    await screen.findByText('Cambios guardados.');
    const patch = a.calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toMatchObject({
      nombre: 'Laurita',
      fecha: '2026-10-24',
      hora_hasta: '12:00',
    });
    expect(screen.getByRole('heading', { name: 'Laurita Díaz' })).toBeTruthy();
  });

  it('editar: error estado_no_editable por su detalle; Volver descarta', async () => {
    const a = api(
      {},
      {
        'PATCH /invitaciones/i1': {
          status: 409,
          body: { error: 'estado_no_editable', detalle: 'La invitación ya no se puede editar.' },
        },
      },
    );
    await abrir(a);
    await menu('Editar');
    await fireEvent.press(btn('Guardar cambios'));
    expect(await screen.findByText('La invitación ya no se puede editar.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(await screen.findByRole('heading', { name: 'Laura Díaz' })).toBeTruthy();
  });

  it('editar con datos inválidos muestra los errores sin llamar a la API', async () => {
    const a = api();
    await abrir(a);
    await menu('Editar');
    await fireEvent.changeText(screen.getByLabelText('Hasta'), '0900');
    await fireEvent.press(btn('Guardar cambios'));
    expect(await screen.findByText('La hora final debe ser después de la inicial.')).toBeTruthy();
    expect(a.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('llegó: ya no se edita ni se cambia la foto, pero se sigue viendo el QR', async () => {
    await abrir(api({ estado: 'LLEGO' }));
    expect(screen.getByLabelText('Estado: Ya llegó')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Agregar foto' })).toBeNull();
    await fireEvent.press(btn('Más acciones'));
    expect(screen.queryByRole('link', { name: 'Editar' })).toBeNull();
    expect(screen.getByRole('img', { name: /Código QR de la invitación/ })).toBeTruthy();
  });

  it.each([
    ['SALIO', 'Ya salió'],
    ['VENCIDA', 'Invitación vencida'],
  ] as const)('%s: se dice en una frase y no hay QR ni compartir', async (estado, frase) => {
    await abrir(api({ estado }));
    expect(screen.getByLabelText(`Estado: ${frase}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Compartir pase' })).toBeNull();
    expect(screen.queryByRole('img', { name: /Código QR/ })).toBeNull();
  });

  it('avisa si viene de crear, y si la foto no pudo subirse', async () => {
    await abrir(api(), { creada: true, fotoError: 'La foto supera los 600 KB.' });
    expect(screen.getByText('Invitación creada')).toBeTruthy();
    expect(screen.getByText('La foto no se pudo subir')).toBeTruthy();
    expect(
      screen.getByText(/La foto supera los 600 KB\. Puedes subirla desde aquí\./),
    ).toBeTruthy();
  });

  it('sin qr_payload dice que el QR no está disponible', async () => {
    const a = api({}, { 'GET /invitaciones/i1': { body: inv() } });
    await abrir(a);
    expect(screen.getByText('El QR no está disponible por ahora.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Compartir pase' })).toBeNull();
  });

  it('error al cargar: reintentar vuelve a pedirla; 401 ofrece entrar de nuevo', async () => {
    let falla = true;
    const a = api(
      {},
      {
        'GET /invitaciones/i1': () =>
          falla
            ? { status: 500, body: { error: 'x', detalle: 'El servidor falló.' } }
            : { body: { ...inv(), qr_payload: QR } },
      },
    );
    await renderSocio(<InvitationDetailScreen id="i1" onBack={jest.fn()} />, a);
    expect(await screen.findByText('El servidor falló.')).toBeTruthy();
    falla = false;
    await fireEvent.press(btn('Reintentar'));
    expect(await screen.findByRole('heading', { name: 'Laura Díaz' })).toBeTruthy();
  });

  it('401: sesión vencida', async () => {
    const a = api(
      {},
      { 'GET /invitaciones/i1': { status: 401, body: { error: 'token_vencido', detalle: 'x' } } },
    );
    await renderSocio(<InvitationDetailScreen id="i1" onBack={jest.fn()} />, a);
    expect(await screen.findByText('Tu sesión venció')).toBeTruthy();
    await fireEvent.press(btn('Entrar de nuevo'));
    expect(router.replace).toHaveBeenCalledWith('/entrar');
  });
});
