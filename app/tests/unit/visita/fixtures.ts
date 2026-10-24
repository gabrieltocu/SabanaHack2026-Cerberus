import type { PaseVista, Visita } from '@/club/types';

export const visita = (o: Partial<Visita> = {}): Visita => ({
  id: 'vis-1',
  persona_id: 'inv-1',
  nombre: 'Laura Díaz',
  categoria: 'INVITADO',
  invitacion_id: 'i1',
  anfitrion_id: 'u-sofia',
  actividad_id: null,
  destino: 'Terraza',
  punto_encuentro: null,
  ubicacion_anfitrion: null,
  permisos: [],
  asistencia: [],
  preferencias_bebida: [],
  acompanante: { tipo: 'ROBOT', id: 'x2-1', nombre: 'Robot R1' },
  estado: 'ACOMPANANDO',
  inicio: '2026-10-24T15:05:00-05:00',
  fin: null,
  cierre: null,
  recorrido: [],
  ...o,
});

export const pase = (o: Partial<PaseVista> = {}): PaseVista => ({
  invitacion: {
    id: 'i1',
    persona_id: 'inv-1',
    nombre: 'Laura',
    apellido: 'Díaz',
    trato: 'senora',
    fecha: '2026-10-24',
    hora_desde: '15:00',
    hora_hasta: '20:00',
    lugar: 'Terraza',
    estado: 'PROGRAMADA',
    punto_encuentro: null,
  },
  anfitrion: { nombre: 'Sofía', apellido: 'Restrepo' },
  visita: null,
  actividades: [],
  ...o,
});
