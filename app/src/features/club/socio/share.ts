import { Platform, Share } from 'react-native';

import type { Invitacion } from '../../../club/types';
import { dateLabel } from '../../shared/dates';
import { copyText } from '../../shared/clipboard';

export type ResultadoCompartir = 'compartido' | 'copiado' | 'cancelado' | 'fallo';

const PROD_ORIGIN = 'https://n-club-five.vercel.app';
const enc = encodeURIComponent;

/** Link to the guest's pass page: the signed QR is the credential (`/visita?qr=`). */
export function enlaceInvitacion(
  codigo: string,
  origen: string = Platform.OS === 'web'
    ? ((globalThis as { location?: { origin?: string } }).location?.origin ?? PROD_ORIGIN)
    : PROD_ORIGIN,
) {
  return `${origen}/visita?qr=${enc(codigo)}`;
}

export const mensajeInvitacion = (
  inv: Pick<Invitacion, 'fecha' | 'hora_desde' | 'hora_hasta'>,
  enlace: string,
) =>
  `Te invito a N Club el ${dateLabel(inv.fecha)} de ${inv.hora_desde} a ${inv.hora_hasta}. Muestra este pase al robot: ${enlace}`;

/** Native share sheet; in the browser `navigator.share` when it exists, otherwise copy the text. */
export async function compartir(texto: string): Promise<ResultadoCompartir> {
  try {
    if (Platform.OS !== 'web') {
      const r = await Share.share({ message: texto });
      return r.action === Share.dismissedAction ? 'cancelado' : 'compartido';
    }
    const nav = (globalThis as { navigator?: { share?: (d: { text: string }) => Promise<void> } })
      .navigator;
    if (nav?.share) {
      try {
        await nav.share({ text: texto });
        return 'compartido';
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return 'cancelado';
      }
    }
    return (await copyText(texto)) ? 'copiado' : 'fallo';
  } catch {
    return 'fallo';
  }
}
