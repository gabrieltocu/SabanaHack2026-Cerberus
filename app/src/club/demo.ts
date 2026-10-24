// POST /demo/sembrar: fills TODAY with ficticious operation data so a demo has something to show.
import { sembrarVisitas } from './visitas';
// Idempotent per day. Events go through the same insertion the robot uses (`insertarEvento`).
import { randomUUID } from 'node:crypto';

import type { KeyValueStore } from '../infrastructure/stores/types';
import type { Route } from './app';
import { listarActividades } from './actividades';
import { eventoKey, insertarEvento, type EventoEntrada } from './eventos';
import { json } from './http';
import { bogotaHoy } from './invitaciones';
import { guardarSolicitud } from './membresia';
import { isoBogota } from './qr';
import { guardarReserva } from './reservas';
import { heartbeatKey } from './robot';
import { insertInvitacion, K, update } from './repo';
import { crearOrden } from './servicios';
import type { Evento, Invitacion, Trato } from './types';

const ORDENES_DEMO = [
  [
    'Hernando',
    'Salas',
    'senor',
    'Climatec',
    'Mantenimiento del aire acondicionado',
    'Mateo Gil',
    'mantenimiento',
    '09:00',
    '12:00',
    'Recepción',
  ],
  [
    'Rosa',
    'Camargo',
    'senora',
    'Aseo Total',
    'Limpieza profunda de la terraza',
    'Marta Ruiz',
    'aseo',
    '14:00',
    '17:00',
    'Entrada de servicio',
  ],
  [
    'Ivan',
    'Lozano',
    'senor',
    'Jardines del Sur',
    'Poda de jardines',
    'Marta Ruiz',
    'jardineria',
    '07:00',
    '10:00',
    'Entrada de servicio',
  ],
] as const;

// [anfitrión, nombre, apellido, trato, lugar, hora_desde, bebidas, asistencia, punto de encuentro]
const INVITADOS_DEMO = [
  [
    'u-sofia',
    'Camilo',
    'Duarte',
    'senor',
    'Lounge VIP',
    '11:00',
    ['café americano', 'agua con gas'],
    [],
    'Entrada principal',
  ],
  [
    'u-sofia',
    'Isabel',
    'Montoya',
    'senora',
    'Terraza',
    '12:00',
    ['té verde'],
    ['movilidad_reducida'],
    'Entrada principal',
  ],
  [
    'u-andres',
    'Felipe',
    'Navarro',
    'senor',
    'Sala de anfitriones',
    '09:00',
    ['jugo de naranja'],
    [],
    'Recepción',
  ],
  [
    'u-andres',
    'Daniela',
    'Pardo',
    'senora',
    'Restaurante',
    '13:00',
    ['limonada'],
    ['acompanante'],
    'Recepción',
  ],
  ['u-camila', 'Julian', 'Ospina', 'senor', 'Restaurante', '12:00', ['agua'], [], 'Parqueadero'],
  [
    'u-camila',
    'Marcela',
    'Ortiz',
    'senora',
    'Terraza',
    '10:00',
    ['café con leche'],
    ['visual'],
    'Entrada principal',
  ],
] as const;

const PERSONA_ANFITRION = {
  'u-sofia': 'sofia',
  'u-andres': 'andres',
  'u-camila': 'camila',
} as const;

export async function sembrarDemo(store: KeyValueStore, now: Date, creador: string) {
  const hoy = bogotaHoy(now);
  const actividades = await listarActividades(store, hoy);

  const ordenes = [];
  for (const [
    nombre,
    apellido,
    trato,
    empresa,
    trabajo,
    responsable,
    area,
    desde,
    hasta,
    punto,
  ] of ORDENES_DEMO) {
    ordenes.push(
      await crearOrden(store, {
        nombre,
        apellido,
        trato,
        empresa,
        trabajo,
        responsable,
        area,
        solicitado_por: 'Luciana Vargas',
        fecha: hoy,
        hora_desde: desde,
        hora_hasta: hasta,
        punto_presentacion: punto,
      }),
    );
  }

  await guardarReserva(store, {
    evento: 'Cata de vinos',
    fecha: hoy,
    hora_desde: '18:00',
    hora_hasta: '19:30',
    robot: 'x2-1',
    lugar: 'Salón principal',
    cobertura_recepcion: true,
    creada_por: creador,
  });
  await guardarReserva(store, {
    evento: 'Brunch familiar',
    fecha: hoy,
    hora_desde: '10:00',
    hora_hasta: '13:00',
    robot: 'x2-2',
    lugar: 'Restaurante',
    cobertura_recepcion: false,
    creada_por: creador,
  });

  const creada_at = isoBogota(now);
  await guardarSolicitud(store, {
    nombre: 'Valentina Cruz',
    email: 'valentina.cruz@example.com',
    telefono: '3000000001',
    interes: 'familiar',
    mensaje: 'Quisiera conocer el club con mi familia.',
    estado: 'NUEVA',
    creada_at,
  });
  await guardarSolicitud(store, {
    nombre: 'Camilo Rojas',
    email: 'camilo.rojas@example.com',
    telefono: null,
    interes: 'empresarial',
    mensaje: 'Buscamos una acción para seis colaboradores.',
    estado: 'NUEVA',
    creada_at,
  });

  const invitaciones: Invitacion[] = [];
  for (const [
    anfitrion,
    nombre,
    apellido,
    trato,
    lugar,
    desde,
    bebidas,
    asistencia,
    punto,
  ] of INVITADOS_DEMO) {
    const inv: Invitacion = {
      id: randomUUID(),
      persona_id: `inv-${randomUUID().slice(0, 8)}`,
      anfitrion_id: anfitrion,
      nombre,
      apellido,
      trato: trato as Trato,
      documento: null,
      fecha: hoy,
      hora_desde: desde,
      hora_hasta: '21:00',
      lugar,
      nota: null,
      estado: 'PROGRAMADA',
      foto_estado: 'NINGUNA',
      foto_motivo: null,
      consentimiento_at: null,
      creada_at,
      preferencias_bebida: [...bebidas],
      asistencia: [...asistencia],
      punto_encuentro: punto,
      documento_foto: 'NINGUNA',
    };
    await insertInvitacion(store, inv);
    invitaciones.push(inv);
  }

  // Ten events from 08:00 to now (or the last hours when it is still early), oldest first.
  const dia0 = Date.parse(`${hoy}T00:00:00-05:00`);
  let ini = dia0 + 8 * 3600_000;
  if (now.getTime() - ini < 30 * 60_000) ini = Math.max(dia0, now.getTime() - 3 * 3600_000);
  const base = {
    avisar: ['concierge'] as EventoEntrada['avisar'],
    severidad: 'info' as const,
    requiere_atencion: false,
    evidencia: { metodo: 'rostro', confianza: 0.9 },
  };
  const invitado = (i: number): Partial<EventoEntrada> => ({
    tipo: 'LLEGADA',
    categoria: 'INVITADO',
    persona_id: invitaciones[i]!.persona_id,
    nombre: `${invitaciones[i]!.nombre} ${invitaciones[i]!.apellido}`,
    anfitrion_id:
      PERSONA_ANFITRION[invitaciones[i]!.anfitrion_id as keyof typeof PERSONA_ANFITRION],
    destino: invitaciones[i]!.lugar,
    avisar: ['anfitrion', 'concierge'],
    motivo: 'en la agenda de hoy',
  });
  const socio = (
    persona: string,
    nombre: string,
    categoria: 'VIP' | 'REGULAR',
    destino: string,
  ): Partial<EventoEntrada> => ({
    tipo: 'LLEGADA',
    categoria,
    persona_id: persona,
    nombre,
    destino,
    motivo: 'socio reconocido',
  });
  const parciales: Partial<EventoEntrada>[] = [
    {
      tipo: 'LLEGADA',
      categoria: 'PERSONAL',
      persona_id: 'marta',
      nombre: 'Marta Ruiz',
      destino: 'Cocina',
      motivo: 'inicio de turno',
    },
    {
      tipo: 'LLEGADA',
      categoria: 'EXTERNO',
      persona_id: ordenes[0]!.persona,
      nombre: `${ordenes[0]!.nombre} ${ordenes[0]!.apellido}`,
      destino: 'Recepción',
      avisar: ['supervisor', 'mantenimiento'],
      motivo: `orden ${ordenes[0]!.id}`,
    },
    socio('sofia', 'Sofia Restrepo', 'VIP', 'Lounge VIP'),
    socio('andres', 'Andres Mejia', 'REGULAR', 'Terraza'),
    invitado(2),
    {
      tipo: 'IMPREVISTO',
      nombre: null,
      avisar: ['mantenimiento', 'concierge'],
      severidad: 'atencion',
      requiere_atencion: true,
      motivo: 'Batería baja en x2-1',
      evidencia: { bateria: 12 },
    },
    invitado(0),
    socio('camila', 'Camila Torres', 'REGULAR', 'Restaurante'),
    {
      tipo: 'ESCALADO_RECEPCION',
      nombre: 'Visitante sin registro',
      destino: 'Recepción',
      avisar: ['concierge', 'seguridad'],
      severidad: 'urgente',
      requiere_atencion: true,
      motivo: 'No aparece en la agenda ni en la galería',
    },
    invitado(4),
  ];
  for (const [i, p] of parciales.entries()) {
    const ts = new Date(ini + ((now.getTime() - ini) * i) / (parciales.length - 1));
    const r = await insertarEvento(store, {
      ...base,
      categoria: null,
      persona_id: null,
      nombre: null,
      anfitrion_id: null,
      destino: null,
      ...p,
      id: randomUUID(),
      ts: isoBogota(ts),
    } as EventoEntrada);
    if ('seq' in r && (i === 4 || i === 5)) {
      // Attended by the concierge three minutes later (never in the future).
      const atendido_at = isoBogota(new Date(Math.min(ts.getTime() + 3 * 60_000, now.getTime())));
      await update<Evento>(store, eventoKey(r.seq), (e) => ({
        ...e!,
        estado: 'ATENDIDO',
        atendido_por: 'u-natalia',
        atendido_at,
      }));
    }
  }

  await update(store, heartbeatKey, () => ({
    robot: 'x2-1',
    estado: 'ok',
    detalle: 'Recepción',
    ultimo_latido: isoBogota(now),
  }));

  await sembrarVisitas(store, now);

  return {
    ya_sembrado: false,
    actividades: actividades.length,
    ordenes: ordenes.length,
    reservas: 2,
    solicitudes: 2,
    invitaciones: invitaciones.length,
    eventos: parciales.length,
  };
}

export const demoRoutes: Route[] = [
  {
    method: 'POST',
    path: '/demo/sembrar',
    auth: ['ADMIN'],
    handler: async (ctx) => {
      // The marker is taken first: a repeated or concurrent call never seeds twice.
      // ponytail: if seeding fails midway the day counts as seeded; delete the `club:demo:<fecha>` key to retry.
      if (
        (await ctx.store.compareAndSet(K.demo(bogotaHoy(ctx.now)), 0, ctx.now.toISOString())) ===
        null
      ) {
        return json(200, { ya_sembrado: true });
      }
      return json(201, await sembrarDemo(ctx.store, ctx.now, ctx.user!.id));
    },
  },
];
