// Data model of the club API (robot team contract §5). Instants are ISO with -05:00.
import type { Rol } from './auth';

export type Trato = 'senor' | 'senora';
export type Nivel = 'VIP' | 'REGULAR';

export interface Usuario {
  id: string;
  rol: Rol;
  /** Socios: same id the robot's face gallery uses (`sofia`, `andres`). */
  persona_id: string | null;
  nombre: string;
  apellido: string;
  trato: Trato;
  email: string;
  clave_hash: string;
  nivel: Nivel | null;
  accion: 'familiar' | 'empresarial' | null;
  destino: string | null;
  activo: boolean;
}

export type EstadoInvitacion = 'PROGRAMADA' | 'LLEGO' | 'SALIO' | 'CANCELADA' | 'VENCIDA';
export type FotoEstado = 'NINGUNA' | 'PENDIENTE' | 'LISTA' | 'RECHAZADA';

export interface Invitacion {
  id: string;
  persona_id: string; // inv-xxxxxxxx
  anfitrion_id: string; // usuario.id
  nombre: string;
  apellido: string;
  trato: Trato;
  documento: string | null;
  fecha: string; // YYYY-MM-DD (Bogotá)
  hora_desde: string; // HH:MM
  hora_hasta: string;
  lugar: string;
  nota: string | null;
  estado: EstadoInvitacion;
  foto_estado: FotoEstado;
  foto_motivo: string | null;
  consentimiento_at: string | null;
  creada_at: string;
  /** v3 (optional on records stored before v3; read with `?? []` / `?? null`). */
  preferencias_bebida?: string[];
  asistencia?: string[];
  punto_encuentro?: string | null;
  /** Photo of the guest's ID card (front), kept encrypted until the visit ends. */
  documento_foto?: 'NINGUNA' | 'GUARDADA';
}

export type Severidad = 'info' | 'atencion' | 'urgente';
export type EstadoEvento = 'NUEVO' | 'ATENDIDO' | 'RESUELTO';

export interface Evento {
  seq: number;
  id: string; // uuid from the robot
  ts: string;
  tipo: string;
  categoria: string | null;
  persona_id: string | null;
  nombre: string | null;
  anfitrion_id: string | null;
  destino: string | null;
  avisar: string[];
  severidad: Severidad;
  requiere_atencion: boolean;
  motivo: string | null;
  evidencia: Record<string, unknown> | null;
  estado: EstadoEvento;
  atendido_por: string | null;
  atendido_at: string | null;
  nota: string | null;
}

export type EstadoConfirmacion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA';

export interface Confirmacion {
  id: string;
  anfitrion_id: string;
  visitante_desc: string;
  evento_id: string | null;
  estado: EstadoConfirmacion;
  creada_at: string;
  vence_at: string;
  respondida_at: string | null;
}

export type EstadoRobot = 'ok' | 'acompanando' | 'sin_servicio';

export interface RobotEstado {
  en_linea: boolean;
  ultimo_latido: string | null;
  robot: string | null;
  estado: EstadoRobot | null;
  detalle: string | null;
}

/** GET /panel/resumen: metrics of one day for the web panel (ADMIN and CONCIERGE). */
export interface PanelResumen {
  fecha: string;
  kpis: {
    visitas_hoy: number; // LLEGADA events of the day
    visitantes_vip: number; // LLEGADA events with categoria VIP
    invitaciones_activas: number; // invitations of the day in PROGRAMADA or LLEGO
    alertas_abiertas: number; // events that need attention and are still NUEVO
    atencion_promedio_min: number | null; // mean minutes from ts to atendido_at
  };
  /** LLEGADA events per hour 6..22 (America/Bogota), split by family. */
  flujo_por_hora: { hora: number; socios: number; invitados: number; personal: number }[];
  /** LLEGADA events of the day by categoria. */
  por_categoria: Record<'VIP' | 'REGULAR' | 'INVITADO' | 'PERSONAL' | 'EXTERNO', number>;
  robot: RobotEstado;
  /** Latest 10 events of the day, newest first. */
  actividad: Pick<Evento, 'id' | 'ts' | 'tipo' | 'categoria' | 'nombre' | 'destino' | 'estado'>[];
}

// ---------------------------------------------------------------------------------------------
// v3: visit context shared by robots and humans, operations and administration.
// "Llegar al destino cierra el acompañamiento; salir del club cierra la visita."
// ---------------------------------------------------------------------------------------------

export type Categoria = 'VIP' | 'REGULAR' | 'INVITADO' | 'PERSONAL' | 'EXTERNO';

/** GET/PATCH /me/perfil. The photo itself lives at PUT/GET/DELETE /me/foto. */
export interface Perfil {
  usuario_id: string;
  preferencias_bebida: string[];
  /** e.g. 'silla_ruedas', 'movilidad_reducida', 'visual', 'auditiva', 'acompanante'. */
  asistencia: string[];
  nota_asistencia: string | null;
  foto_estado: FotoEstado;
  foto_motivo: string | null;
  consentimiento_foto_at?: string | null;
}

export type EstadoVisita = 'EN_RECEPCION' | 'ACOMPANANDO' | 'EN_RELEVO' | 'EN_DESTINO' | 'CERRADA';

export interface Acompanante {
  tipo: 'ROBOT' | 'HUMANO';
  id: string; // robot id ('x2-1') or usuario.id
  nombre: string;
}

export interface PasoVisita {
  ts: string;
  tipo:
    | 'LLEGADA'
    | 'ASIGNADO'
    | 'RELEVO_SOLICITADO'
    | 'RELEVO_ACEPTADO'
    | 'ENTREGA_CONFIRMADA'
    | 'AYUDA'
    | 'EN_DESTINO'
    | 'ENCUENTRO'
    | 'INCIDENCIA'
    | 'SALIDA';
  actor: string; // usuario.id, robot id or 'invitado'
  detalle: string | null;
}

export interface Visita {
  id: string; // vis-xxxxxxxx
  persona_id: string | null;
  nombre: string;
  categoria: Categoria;
  invitacion_id: string | null;
  anfitrion_id: string | null; // usuario.id
  actividad_id: string | null;
  destino: string;
  punto_encuentro: string | null;
  /** Free text the host shares ("Terraza, mesa 4"), only if they choose to. */
  ubicacion_anfitrion: string | null;
  permisos: string[];
  asistencia: string[];
  preferencias_bebida: string[];
  acompanante: Acompanante | null;
  estado: EstadoVisita;
  inicio: string;
  fin: string | null;
  cierre: 'SALIDA' | null;
  recorrido: PasoVisita[];
}

export type EstadoTarea = 'ABIERTA' | 'ACEPTADA' | 'RECHAZADA' | 'COMPLETADA' | 'CANCELADA';

export interface Tarea {
  id: string;
  tipo: 'ACOMPANAR' | 'RELEVO' | 'AYUDA';
  visita_id: string;
  nombre_visitante: string;
  prioridad: 'normal' | 'alta' | 'urgente';
  punto_encuentro: string;
  motivo: string | null;
  /** usuario.id of the edecán who must (or did) take it; null = anyone. */
  asignada_a: string | null;
  estado: EstadoTarea;
  creada_at: string;
  aceptada_at: string | null;
  rechazos: string[]; // usuario.id
}

export type EstadoEquipo =
  'DISPONIBLE' | 'ASIGNADO' | 'ACOMPANANDO' | 'REGRESANDO' | 'CARGANDO' | 'FUERA_DE_SERVICIO';

export interface MiembroEquipo {
  id: string;
  tipo: 'ROBOT' | 'HUMANO';
  nombre: string;
  estado: EstadoEquipo;
  visita_id: string | null;
  detalle: string | null;
  actualizado_at: string | null;
}

export interface ColaItem {
  visita_id: string | null;
  tarea_id: string | null;
  nombre: string;
  categoria: Categoria;
  prioridad: Tarea['prioridad'];
  motivo: string | null;
  punto_encuentro: string | null;
  espera_min: number;
}

export interface Incidencia {
  id: string;
  tipo: 'FALLA_ROBOT' | 'CONEXION' | 'RUTA_BLOQUEADA' | 'ASISTENCIA' | 'OTRA';
  descripcion: string;
  lugar: string | null;
  visita_id: string | null;
  reportada_por: string; // usuario.id or robot id
  estado: 'ABIERTA' | 'RESUELTA';
  creada_at: string;
  resuelta_at: string | null;
}

export interface Evaluacion {
  id: string;
  visita_id: string | null;
  autor: string | null; // usuario.id, 'invitado' or robot id
  robot: number; // 1..5
  club: number; // 1..5
  comentario: string | null;
  /** Voice comment transcribed by the robot (optional). */
  transcripcion: string | null;
  creada_at: string;
}

/** GET /evaluaciones. `puntos_clave`: most repeated meaningful words of the day's comments. */
export interface ResumenEvaluaciones {
  items: Evaluacion[];
  promedio_robot: number | null;
  promedio_club: number | null;
  puntos_clave: string[];
}

export interface Actividad {
  id: string;
  nombre: string;
  descripcion: string | null;
  lugar: string;
  fecha: string;
  hora_desde: string;
  hora_hasta: string;
  cupo: number | null;
  inscritos: string[]; // usuario.id or visita.id
  /** The robot may offer it to visitors. */
  robot_puede_ofrecer: boolean;
}

export interface OrdenServicio {
  id: string; // OT-xxxx
  persona: string; // persona_id of the external worker (robot gallery / QR)
  nombre: string;
  apellido: string;
  trato: Trato;
  empresa: string;
  trabajo: string;
  solicitado_por: string;
  responsable: string;
  area: string;
  fecha: string;
  hora_desde: string;
  hora_hasta: string;
  punto_presentacion: string;
  estado: 'PROGRAMADA' | 'EN_CURSO' | 'TERMINADA' | 'CANCELADA';
}

export interface ItemAgenda {
  id: string;
  tipo: 'TURNO' | 'REUNION' | 'SERVICIO' | 'RECORDATORIO';
  titulo: string;
  lugar: string | null;
  fecha: string;
  hora_desde: string;
  hora_hasta: string | null;
  nota: string | null;
}

export interface ReservaRobot {
  id: string;
  evento: string;
  fecha: string;
  hora_desde: string;
  hora_hasta: string;
  robot: string;
  lugar: string;
  /** Another robot or a human keeps reception covered meanwhile. */
  cobertura_recepcion: boolean;
  creada_por: string;
}

export interface SolicitudMembresia {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  interes: 'individual' | 'familiar' | 'empresarial';
  mensaje: string | null;
  estado: 'NUEVA' | 'CONTACTADA';
  creada_at: string;
}

/** GET /pase?qr=<payload>: what a guest without an account sees from their signed QR. */
export interface PaseVista {
  invitacion: Pick<
    Invitacion,
    | 'id'
    | 'persona_id'
    | 'nombre'
    | 'apellido'
    | 'trato'
    | 'fecha'
    | 'hora_desde'
    | 'hora_hasta'
    | 'lugar'
    | 'estado'
  > & { punto_encuentro: string | null };
  anfitrion: { nombre: string; apellido: string };
  visita: Visita | null;
  actividades: Actividad[];
}

/** GET /qr/verificar result for edecanes and concierge. */
export interface QrVerificado {
  valido: boolean;
  motivo: string | null; // 'firma_invalida' | 'vencido' | ...
  tipo: string | null;
  persona_id: string | null;
  nombre: string | null;
  invitacion: Invitacion | null;
  visita: Visita | null;
}

/** GET /admin/registros. */
export interface RegistrosAdmin {
  usuarios: Omit<Usuario, 'clave_hash'>[];
  invitaciones_por_estado: Record<EstadoInvitacion, number>;
  servicios: OrdenServicio[];
  destinos: string[];
}
