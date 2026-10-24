// Seed padron (fictitious). Socios come from the club roster, there is no public sign-up.
import { hashPassword } from './auth';
import type { Usuario } from './types';

/** Initial demo password for every seeded account (document it; rotate in a real club). */
export const DEMO_CLAVE = 'nclub-demo-2026';

const base = { clave_hash: '', activo: true } as const;

export const isSabanaDataSource = () => process.env.CERBERUS_DATA_SOURCE === 'sabana';

let cache: Usuario[] | undefined;
let cacheKey = '';
export function usuarios(): Usuario[] {
  const sabana = isSabanaDataSource();
  const clave = sabana ? process.env.CERBERUS_TEAM_PASSWORD : DEMO_CLAVE;
  if (!clave) throw new Error('CERBERUS_TEAM_PASSWORD es obligatorio en modo sabana.');
  const key = `${sabana ? 'sabana' : 'legacy'}:${clave}`;
  if (cache && key === cacheKey) return cache;
  const socios: Omit<Usuario, 'clave_hash'>[] = sabana
    ? (
        [
          ['u-gabriel', 'gabriel', 'Gabriel', 'VIP'],
          ['u-vale', 'vale', 'Vale', 'VIP'],
          ['u-andres', 'andres', 'Andres', 'REGULAR'],
          ['u-thomas', 'thomas', 'Thomas', 'REGULAR'],
        ] as const
      ).map(([id, persona_id, nombre, nivel]) => ({
        ...base,
        id,
        rol: 'SOCIO' as const,
        persona_id,
        nombre,
        apellido: '',
        trato: 'senor' as const,
        email: `${persona_id}@nclub.demo`,
        activo: persona_id !== 'vale',
        nivel: persona_id === 'vale' ? null : nivel,
        accion: null,
        destino: persona_id === 'vale' ? null : nivel === 'VIP' ? 'VIP' : null,
      }))
    : [
        {
          ...base,
          id: 'u-sofia',
          rol: 'SOCIO',
          persona_id: 'sofia',
          nombre: 'Sofia',
          apellido: 'Restrepo',
          trato: 'senora',
          email: 'sofia@nclub.demo',
          nivel: 'VIP',
          accion: 'empresarial',
          destino: 'VIP',
        },
        {
          ...base,
          id: 'u-andres',
          rol: 'SOCIO',
          persona_id: 'andres',
          nombre: 'Andres',
          apellido: 'Mejia',
          trato: 'senor',
          email: 'andres@nclub.demo',
          nivel: 'REGULAR',
          accion: 'familiar',
          destino: null,
        },
        {
          ...base,
          id: 'u-camila',
          rol: 'SOCIO',
          persona_id: 'camila',
          nombre: 'Camila',
          apellido: 'Torres',
          trato: 'senora',
          email: 'camila@nclub.demo',
          nivel: 'REGULAR',
          accion: 'familiar',
          destino: null,
        },
      ];
  const staff: Omit<Usuario, 'clave_hash'>[] = sabana
    ? [
        {
          ...base,
          id: 'u-natalia',
          rol: 'CONCIERGE',
          persona_id: null,
          nombre: 'Concierge',
          apellido: '',
          trato: 'senora',
          email: 'concierge@nclub.demo',
          nivel: null,
          accion: null,
          destino: null,
        },
        {
          ...base,
          id: 'u-luciana',
          rol: 'ADMIN',
          persona_id: null,
          nombre: 'Administración',
          apellido: '',
          trato: 'senora',
          email: 'admin@nclub.demo',
          nivel: null,
          accion: null,
          destino: null,
        },
        {
          ...base,
          id: 'u-mateo',
          rol: 'EDECAN',
          persona_id: null,
          nombre: 'Edecán',
          apellido: '',
          trato: 'senor',
          email: 'edecan@nclub.demo',
          nivel: null,
          accion: null,
          destino: null,
        },
        {
          ...base,
          id: 'u-marta',
          rol: 'PERSONAL',
          persona_id: null,
          nombre: 'Personal',
          apellido: '',
          trato: 'senora',
          email: 'personal@nclub.demo',
          nivel: null,
          accion: null,
          destino: null,
        },
      ]
    : [
        {
          ...base,
          id: 'u-natalia',
          rol: 'CONCIERGE',
          persona_id: null,
          nombre: 'Natalia',
          apellido: 'Rios',
          trato: 'senora',
          email: 'concierge@nclub.demo',
          nivel: null,
          accion: null,
          destino: null,
        },
        {
          ...base,
          id: 'u-luciana',
          rol: 'ADMIN',
          persona_id: null,
          nombre: 'Luciana',
          apellido: 'Vargas',
          trato: 'senora',
          email: 'admin@nclub.demo',
          nivel: null,
          accion: null,
          destino: null,
        },
        {
          ...base,
          id: 'u-mateo',
          rol: 'EDECAN',
          persona_id: null,
          nombre: 'Mateo',
          apellido: 'Gil',
          trato: 'senor',
          email: 'edecan@nclub.demo',
          nivel: null,
          accion: null,
          destino: null,
        },
        {
          ...base,
          id: 'u-marta',
          rol: 'PERSONAL',
          persona_id: 'marta',
          nombre: 'Marta',
          apellido: 'Ruiz',
          trato: 'senora',
          email: 'personal@nclub.demo',
          nivel: null,
          accion: null,
          destino: null,
        },
      ];
  const passwordHash = hashPassword(clave);
  const seeded = [...socios, ...staff].map((u) => ({ ...u, clave_hash: passwordHash }));
  cache = seeded;
  cacheKey = key;
  return seeded;
}

export const usuarioPorId = (id: string) => usuarios().find((u) => u.id === id);
export const socioPorPersona = (personaId: string) =>
  usuarios().find((u) => u.rol === 'SOCIO' && u.persona_id === personaId);

/** Shifts and work orders: seed only, same shape as the robot's registros/turnos.json, ordenes.json. */
export const TURNOS = {
  marta: {
    nombre: 'Marta',
    apellido: 'Ruiz',
    trato: 'senora',
    area: 'cocina',
    inicio: '09:00',
    fin: '17:00',
  },
};
export const ORDENES = {
  'OT-1042': {
    persona: 'luis',
    nombre: 'Luis',
    apellido: 'Pena',
    trato: 'senor',
    empresa: 'Climatec',
    motivo: 'mantenimiento',
    supervisor: 'Jorge',
    area: 'mantenimiento',
    lugar: 'EXTERNO',
  },
};

/** Default invitation limits per level (configurable). */
export const LIMITE_ACTIVAS = { VIP: 10, REGULAR: 3 } as const;
export const LUGARES = ['INVITADO', 'Sala de anfitriones', 'Lounge VIP', 'Terraza', 'Restaurante'];

/** Activities every day without any gets (fictitious); `lugar` are rooms of the club. */
export const ACTIVIDADES_BASE = [
  {
    nombre: 'Cata de vinos',
    descripcion: 'Cuatro etiquetas con maridaje de quesos, guiada por el sommelier.',
    lugar: 'Salón principal',
    hora_desde: '18:00',
    hora_hasta: '19:30',
    cupo: 20,
    robot_puede_ofrecer: true,
  },
  {
    nombre: 'Clase de yoga',
    descripcion: 'Sesión suave al aire libre, todos los niveles.',
    lugar: 'Terraza',
    hora_desde: '07:00',
    hora_hasta: '08:00',
    cupo: 15,
    robot_puede_ofrecer: true,
  },
  {
    nombre: 'Torneo de squash',
    descripcion: 'Eliminación directa entre socios, categoría libre.',
    lugar: 'Cancha de squash',
    hora_desde: '15:00',
    hora_hasta: '18:00',
    cupo: 16,
    robot_puede_ofrecer: false,
  },
  {
    nombre: 'Brunch familiar',
    descripcion: 'Buffet con estación infantil y música en vivo.',
    lugar: 'Restaurante',
    hora_desde: '10:00',
    hora_hasta: '13:00',
    cupo: null,
    robot_puede_ofrecer: true,
  },
];

/** Meetings (fictitious, repeated every day) per role for GET /me/agenda. */
export const REUNIONES = {
  PERSONAL: [
    { titulo: 'Briefing de cocina', lugar: 'Cocina', hora_desde: '08:45', hora_hasta: '09:00' },
    { titulo: 'Inventario de despensa', lugar: 'Bodega', hora_desde: '14:00', hora_hasta: '14:30' },
  ],
  EDECAN: [
    {
      titulo: 'Repaso de protocolo',
      lugar: 'Sala de anfitriones',
      hora_desde: '09:30',
      hora_hasta: '10:00',
    },
    { titulo: 'Entrega de turno', lugar: 'Recepción', hora_desde: '16:30', hora_hasta: '17:00' },
  ],
  CONCIERGE: [
    {
      titulo: 'Reunión de coordinación',
      lugar: 'Oficina de concierge',
      hora_desde: '08:30',
      hora_hasta: '09:00',
    },
    {
      titulo: 'Revisión de eventos del club',
      lugar: 'Oficina de concierge',
      hora_desde: '15:30',
      hora_hasta: '16:00',
    },
  ],
} as const;

/** Robots of the reception team (bookings and coverage). */
export const ROBOTS = ['x2-1', 'x2-2'];
