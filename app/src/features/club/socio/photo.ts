// Photos of people and ID cards: pick (front or rear camera, or gallery), shrink to a JPEG <= 600 KB,
// build the upload form.
import {
  CameraType,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { ClubApiError } from '../client';

export const MAX_FOTO_BYTES = 600 * 1024;
export const FOTO_ANCHO = 720;
/** An ID card needs more pixels than a face to stay legible. */
export const DOCUMENTO_ANCHO = 1000;
/** Qualities tried in order until the file fits. */
export const FOTO_CALIDADES = [0.6, 0.45, 0.3] as const;
const ANCHO_MINIMO = 480;

export interface FotoLista {
  uri: string;
  bytes: number;
}

export type Eleccion =
  | { estado: 'ok'; foto: FotoLista }
  | { estado: 'cancelada' }
  | { estado: 'permiso'; puedePreguntar: boolean };

async function pesoDe(uri: string): Promise<number> {
  return (await (await fetch(uri)).blob()).size;
}

async function intentar(uri: string, ancho: number, calidades: readonly number[]) {
  const ref = await ImageManipulator.manipulate(uri, { maxWidth: ancho }).renderAsync();
  for (const compress of calidades) {
    const out = await ref.saveAsync({ compress, format: SaveFormat.JPEG });
    const bytes = await pesoDe(out.uri);
    if (bytes <= MAX_FOTO_BYTES) return { uri: out.uri, bytes };
  }
  return null;
}

/** 720 px wide, JPEG quality 0.6; lower quality and then a narrower image if it still exceeds 600 KB. */
export async function comprimirFoto(uri: string, ancho = FOTO_ANCHO): Promise<FotoLista> {
  const foto =
    (await intentar(uri, ancho, FOTO_CALIDADES)) ?? (await intentar(uri, ANCHO_MINIMO, [0.3]));
  if (!foto)
    throw new ClubApiError(0, 'foto_muy_grande', 'La foto pesa demasiado. Prueba con otra.');
  return foto;
}

export interface OpcionesFoto {
  /** Which camera "camara" opens: the front one for faces, the rear one for ID cards. */
  camara?: 'front' | 'back';
  ancho?: number;
}

export async function elegirFoto(
  origen: 'camara' | 'galeria',
  { camara = 'front', ancho }: OpcionesFoto = {},
): Promise<Eleccion> {
  const opciones = { mediaTypes: ['images' as const], quality: 0.8 };
  if (origen === 'camara' && Platform.OS !== 'web') {
    const permiso = await requestCameraPermissionsAsync();
    if (!permiso.granted) return { estado: 'permiso', puedePreguntar: permiso.canAskAgain };
  }
  // The gallery needs no permission: the system picker hands over only what the person selects.
  const r =
    origen === 'camara'
      ? await launchCameraAsync({
          ...opciones,
          cameraType: camara === 'back' ? CameraType.back : CameraType.front,
        })
      : await launchImageLibraryAsync(opciones);
  const asset = r.canceled ? undefined : r.assets[0];
  if (!asset) return { estado: 'cancelada' };
  return { estado: 'ok', foto: await comprimirFoto(asset.uri, ancho) };
}

/** Native sends `{ uri, name, type }`; the browser needs a real Blob. `extra` adds text fields. */
export async function formularioFoto(
  foto: FotoLista,
  extra: Record<string, string> = {},
): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    form.append('foto', await (await fetch(foto.uri)).blob(), 'foto.jpg');
  } else {
    form.append('foto', { uri: foto.uri, name: 'foto.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  form.append('consentimiento', 'true');
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}
