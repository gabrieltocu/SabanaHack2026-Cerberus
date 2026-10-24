// Fixed demo data for a self-hosted server: three invitations for today (Bogotá) with constant ids,
// so the robot's queries return the same values on every start. Socios come from seed.ts.
import type { KeyValueStore } from '../infrastructure/stores/types';
import { bogotaHoy } from './invitaciones';
import { isoBogota } from './qr';
import { getInvitacion, insertInvitacion, updateInvitacion } from './repo';
import type { Invitacion } from './types';

type Fija = Pick<
  Invitacion,
  'id' | 'nombre' | 'apellido' | 'trato' | 'anfitrion_id' | 'hora_desde' | 'hora_hasta' | 'lugar'
>;

export const FIJAS: Fija[] = [
  {
    id: 'inv-00000001',
    nombre: 'Laura',
    apellido: 'Diaz',
    trato: 'senora',
    anfitrion_id: 'u-andres',
    hora_desde: '00:00',
    hora_hasta: '23:59',
    lugar: 'INVITADO',
  },
  {
    id: 'inv-00000002',
    nombre: 'Pedro',
    apellido: 'Gomez',
    trato: 'senor',
    anfitrion_id: 'u-sofia',
    hora_desde: '00:00',
    hora_hasta: '23:59',
    lugar: 'Lounge VIP',
  },
  {
    id: 'inv-00000003',
    nombre: 'Ana',
    apellido: 'Vélez',
    trato: 'senora',
    anfitrion_id: 'u-camila',
    hora_desde: '00:00',
    hora_hasta: '23:59',
    lugar: 'Terraza',
  },
];

/**
 * Creates the fixed invitations if missing, and puts them back to their fixed values when the
 * stored ones are from another day. Within the same day it never touches them (idempotent).
 */
export async function sembrarFijos(store: KeyValueStore, now: Date): Promise<void> {
  const hoy = bogotaHoy(now);
  for (const f of FIJAS) {
    const inv: Invitacion = {
      ...f,
      persona_id: f.id,
      documento: null,
      fecha: hoy,
      nota: null,
      estado: 'PROGRAMADA',
      foto_estado: 'NINGUNA',
      foto_motivo: null,
      consentimiento_at: null,
      creada_at: isoBogota(now),
    };
    const actual = await getInvitacion(store, f.id);
    if (!actual) await insertInvitacion(store, inv);
    else if (actual.fecha !== hoy) await updateInvitacion(store, f.id, () => inv);
  }
}
