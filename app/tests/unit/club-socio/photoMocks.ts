// Shared stand-ins for expo-image-picker and expo-image-manipulator (loaded with jest.mock factories).
export const picker = {
  perm: jest.fn(),
  camera: jest.fn(),
  gallery: jest.fn(),
};
export const manipulator = { save: jest.fn(), manipulate: jest.fn() };

export const pickerModule = () => ({
  CameraType: { front: 'front', back: 'back' },
  requestCameraPermissionsAsync: () => picker.perm(),
  launchCameraAsync: (o: unknown) => picker.camera(o),
  launchImageLibraryAsync: (o: unknown) => picker.gallery(o),
});

export const manipulatorModule = () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (uri: string, o: unknown) => {
      manipulator.manipulate(uri, o);
      return { renderAsync: async () => ({ saveAsync: manipulator.save }) };
    },
  },
});

/** A small JPEG that "compresses" to `bytes` and is picked from the gallery or camera. */
export function pickPhoto(bytes = 100 * 1024) {
  manipulator.save.mockResolvedValue({ uri: 'file://small.jpg' });
  const real = globalThis.fetch;
  globalThis.fetch = (async (uri: string) => ({
    blob: async () => ({ size: uri === 'file://small.jpg' ? bytes : 1 }),
  })) as unknown as typeof fetch;
  picker.gallery.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://big.jpg' }] });
  picker.perm.mockResolvedValue({ granted: true, canAskAgain: true });
  picker.camera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://big.jpg' }] });
  return () => {
    globalThis.fetch = real;
  };
}
