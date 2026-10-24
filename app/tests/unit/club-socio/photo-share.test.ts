import { Platform, Share } from 'react-native';

import { compartir } from '@/features/club/socio/share';
import {
  MAX_FOTO_BYTES,
  comprimirFoto,
  elegirFoto,
  formularioFoto,
} from '@/features/club/socio/photo';

const mockSave = jest.fn();
const mockManipulate = jest.fn((_uri: string, _opts: unknown) => ({
  renderAsync: async () => ({ saveAsync: mockSave }),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: (uri: string, opts: unknown) => mockManipulate(uri, opts) },
}));

const mockCamPerm = jest.fn();
const mockCam = jest.fn();
const mockGal = jest.fn();
jest.mock('expo-image-picker', () => ({
  CameraType: { front: 'front', back: 'back' },
  requestCameraPermissionsAsync: () => mockCamPerm(),
  launchCameraAsync: (o: unknown) => mockCam(o),
  launchImageLibraryAsync: (o: unknown) => mockGal(o),
}));

const KB = 1024;
/** `fetch(uri).blob().size` per saved file. */
let sizes: Record<string, number> = {};
const realFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  sizes = {};
  globalThis.fetch = (async (uri: string) => ({
    blob: async () => ({ size: sizes[uri] ?? 1 }),
  })) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('comprimirFoto', () => {
  it('reduce a 720 px de ancho y JPEG con calidad 0.6', async () => {
    sizes['out.jpg'] = 300 * KB;
    mockSave.mockResolvedValue({ uri: 'out.jpg' });
    expect(await comprimirFoto('file://grande.jpg')).toEqual({ uri: 'out.jpg', bytes: 300 * KB });
    expect(mockManipulate).toHaveBeenCalledWith('file://grande.jpg', { maxWidth: 720 });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith({ compress: 0.6, format: 'jpeg' });
  });

  it('baja la calidad hasta que cabe en 600 KB', async () => {
    mockSave
      .mockResolvedValueOnce({ uri: 'a' })
      .mockResolvedValueOnce({ uri: 'b' })
      .mockResolvedValueOnce({ uri: 'c' });
    sizes = { a: 900 * KB, b: 700 * KB, c: MAX_FOTO_BYTES };
    expect((await comprimirFoto('u')).uri).toBe('c');
    expect(mockSave.mock.calls.map((c) => (c[0] as { compress: number }).compress)).toEqual([
      0.6, 0.45, 0.3,
    ]);
  });

  it('si aún excede, prueba una imagen más angosta y luego falla con foto_muy_grande', async () => {
    mockSave.mockResolvedValue({ uri: 'z' });
    sizes = { z: 2000 * KB };
    await expect(comprimirFoto('u')).rejects.toMatchObject({ code: 'foto_muy_grande' });
    expect(mockManipulate).toHaveBeenLastCalledWith('u', { maxWidth: 480 });
  });
});

describe('elegirFoto', () => {
  beforeEach(() => {
    mockSave.mockResolvedValue({ uri: 'ok.jpg' });
    sizes['ok.jpg'] = 100 * KB;
  });

  it('en web abre el selector frontal sin esperar permisos nativos', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    mockCam.mockResolvedValue({ canceled: true, assets: null });
    try {
      const result = elegirFoto('camara');
      expect(mockCam).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'front' }));
      expect(mockCamPerm).not.toHaveBeenCalled();
      expect(await result).toEqual({ estado: 'cancelada' });
    } finally {
      os.restore();
    }
  });

  it('cámara frontal con permiso', async () => {
    mockCamPerm.mockResolvedValue({ granted: true, canAskAgain: true });
    mockCam.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://cam.jpg' }] });
    const r = await elegirFoto('camara');
    expect(r).toEqual({ estado: 'ok', foto: { uri: 'ok.jpg', bytes: 100 * KB } });
    expect(mockCam).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'front' }));
  });

  it('sin permiso de cámara avisa si se puede volver a preguntar', async () => {
    mockCamPerm.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await elegirFoto('camara')).toEqual({ estado: 'permiso', puedePreguntar: false });
    expect(mockCam).not.toHaveBeenCalled();
  });

  it('galería sin pedir permiso; cancelar no devuelve foto', async () => {
    mockGal.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await elegirFoto('galeria')).toEqual({ estado: 'cancelada' });
    mockGal.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://g.jpg' }] });
    expect((await elegirFoto('galeria')).estado).toBe('ok');
    expect(mockCamPerm).not.toHaveBeenCalled();
  });
});

describe('formularioFoto', () => {
  const append = jest.spyOn(FormData.prototype, 'append');
  beforeEach(() => append.mockClear());

  it('en nativo envía {uri, name, type} y consentimiento=true', async () => {
    await formularioFoto({ uri: 'file://x.jpg', bytes: 1 });
    expect(append).toHaveBeenNthCalledWith(1, 'foto', {
      uri: 'file://x.jpg',
      name: 'foto.jpg',
      type: 'image/jpeg',
    });
    expect(append).toHaveBeenNthCalledWith(2, 'consentimiento', 'true');
  });

  it('en web envía un Blob como foto.jpg', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    const blob = new Blob(['x']);
    globalThis.fetch = (async () => ({ blob: async () => blob })) as unknown as typeof fetch;
    await formularioFoto({ uri: 'blob:x', bytes: 1 });
    expect(append).toHaveBeenNthCalledWith(1, 'foto', blob, 'foto.jpg');
    expect(append).toHaveBeenNthCalledWith(2, 'consentimiento', 'true');
    os.restore();
  });
});

describe('compartir', () => {
  const nav = () => globalThis.navigator as unknown as Record<string, unknown>;
  afterEach(() => {
    delete nav().share;
    delete nav().clipboard;
  });

  it('en nativo usa la hoja de compartir', async () => {
    const spy = jest
      .spyOn(Share, 'share')
      .mockResolvedValueOnce({ action: Share.sharedAction, activityType: undefined })
      .mockResolvedValueOnce({ action: Share.dismissedAction, activityType: undefined })
      .mockRejectedValueOnce(new Error('x'));
    expect(await compartir('hola')).toBe('compartido');
    expect(spy).toHaveBeenCalledWith({ message: 'hola' });
    expect(await compartir('hola')).toBe('cancelado');
    expect(await compartir('hola')).toBe('fallo');
    spy.mockRestore();
  });

  describe('en web', () => {
    let os: { restore(): void };
    beforeEach(() => {
      os = jest.replaceProperty(Platform, 'OS', 'web');
    });
    afterEach(() => os.restore());

    it('usa navigator.share cuando existe', async () => {
      nav().share = jest.fn().mockResolvedValue(undefined);
      expect(await compartir('hola')).toBe('compartido');
      expect(nav().share).toHaveBeenCalledWith({ text: 'hola' });
    });

    it('cancelar el diálogo no es un error', async () => {
      nav().share = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
      expect(await compartir('hola')).toBe('cancelado');
    });

    it('copia el texto si no hay navigator.share', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      nav().clipboard = { writeText };
      expect(await compartir('hola')).toBe('copiado');
      expect(writeText).toHaveBeenCalledWith('hola');
    });

    it('si compartir falla (no cancelado) intenta copiar y, sin portapapeles, falla', async () => {
      nav().share = jest.fn().mockRejectedValue(new Error('boom'));
      expect(await compartir('hola')).toBe('fallo');
    });
  });
});
