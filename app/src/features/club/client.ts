// Client for the club API (socio and concierge apps). Same paths as the robot team's contract.
import type { TelemetriaVista } from '../../club/telemetria';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type {
  Actividad,
  Confirmacion,
  EstadoEquipo,
  Evaluacion,
  Evento,
  Incidencia,
  Invitacion,
  ItemAgenda,
  MiembroEquipo,
  ColaItem,
  OrdenServicio,
  PanelResumen,
  PaseVista,
  Perfil,
  QrVerificado,
  RegistrosAdmin,
  ReservaRobot,
  ResumenEvaluaciones,
  RobotEstado,
  SolicitudMembresia,
  Tarea,
  Usuario,
  Visita,
} from '../../club/types';

export type UsuarioPublico = Omit<Usuario, 'clave_hash'>;
export type InvitacionConQr = Invitacion & { qr_payload?: string };
export type FaseSesionRobot =
  | 'esperando'
  | 'identificando'
  | 'reintento'
  | 'qr'
  | 'confirmacion'
  | 'orientando'
  | 'acompanando'
  | 'destino'
  | 'recepcion'
  | 'salida';
export interface SesionRobot {
  robot: string;
  sesion_id: string;
  secuencia: number;
  fase: FaseSesionRobot;
  persona_id?: string;
  nombre?: string;
  categoria?: string;
  metodo?: string;
  confianza?: number;
  mensaje?: string;
  actualizado_at: string;
}
export interface EstadoSesionRobot {
  sesion: SesionRobot | null;
  desactualizada: boolean;
}
export interface EstadoTelemetriaRobot {
  estado: TelemetriaVista | null;
  eventos: TelemetriaVista[];
  desactualizada: boolean;
}
export interface NuevaInvitacion {
  nombre: string;
  apellido: string;
  trato: 'senor' | 'senora';
  documento?: string | null;
  fecha: string;
  hora_desde: string;
  hora_hasta: string;
  lugar?: string;
  nota?: string | null;
  preferencias_bebida?: string[];
  asistencia?: string[];
  punto_encuentro?: string | null;
}

type Items<T> = { items: T[] };

export class ClubApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detalle: string,
  ) {
    super(detalle);
  }
}

const PROD = 'https://n-club-five.vercel.app/api';
export const CLUB_API_URL =
  process.env.EXPO_PUBLIC_CLUB_API_URL ?? (Platform.OS === 'web' ? '/api' : PROD);

const TOKEN_KEY = 'nclub.token';
let memoryToken: string | null = null;

/** Token storage: Keychain/Keystore on native, sessionStorage on web (cleared with the tab). */
export const tokenStore = {
  async get(): Promise<string | null> {
    if (memoryToken) return memoryToken;
    try {
      memoryToken =
        Platform.OS === 'web'
          ? (globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? null)
          : ((await SecureStore.getItemAsync(TOKEN_KEY)) ?? null);
    } catch {
      memoryToken = null;
    }
    return memoryToken;
  },
  async set(token: string | null): Promise<void> {
    memoryToken = token;
    try {
      if (Platform.OS === 'web') {
        if (token) globalThis.sessionStorage?.setItem(TOKEN_KEY, token);
        else globalThis.sessionStorage?.removeItem(TOKEN_KEY);
      } else if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // memory copy still works for this session
    }
  },
};

type Fetch = typeof fetch;

export function createClubClient(base = CLUB_API_URL, fetchImpl: Fetch = (...a) => fetch(...a)) {
  async function call<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
    const token = await tokenStore.get();
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      });
    } catch {
      throw new ClubApiError(0, 'sin_conexion', 'Sin conexión. Revisa tu red e intenta de nuevo.');
    }
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const e = (data ?? {}) as { error?: string; detalle?: string };
      if (res.status === 401) await tokenStore.set(null);
      throw new ClubApiError(res.status, e.error ?? 'error', e.detalle ?? 'No se pudo completar.');
    }
    return data as T;
  }

  return {
    async login(email: string, clave: string) {
      const r = await call<{ token: string; usuario: UsuarioPublico }>('POST', '/auth/login', {
        email,
        clave,
      });
      await tokenStore.set(r.token);
      return r.usuario;
    },
    logout: () => tokenStore.set(null),
    me: () => call<UsuarioPublico>('GET', '/me'),
    // Socio
    crearInvitacion: (b: NuevaInvitacion) => call<InvitacionConQr>('POST', '/invitaciones', b),
    listarInvitaciones: (q: { fecha?: string; estado?: string } = {}) =>
      call<{ items: Invitacion[] } | Invitacion[]>('GET', `/invitaciones${qs(q)}`).then((r) =>
        Array.isArray(r) ? r : r.items,
      ),
    invitacion: (id: string) => call<InvitacionConQr>('GET', `/invitaciones/${enc(id)}`),
    editarInvitacion: (id: string, b: Partial<NuevaInvitacion>) =>
      call<Invitacion>('PATCH', `/invitaciones/${enc(id)}`, b),
    cancelarInvitacion: (id: string) => call<Invitacion>('DELETE', `/invitaciones/${enc(id)}`),
    subirFoto: (id: string, foto: FormData) =>
      call<Invitacion>('PUT', `/invitaciones/${enc(id)}/foto`, foto),
    quitarFoto: (id: string) => call<Invitacion>('DELETE', `/invitaciones/${enc(id)}/foto`),
    qrPngUrl: (id: string) => `${base}/invitaciones/${enc(id)}/qr.png`,
    confirmacionesPendientes: () =>
      call<{ items: Confirmacion[] } | Confirmacion[]>('GET', '/confirmaciones/pendientes').then(
        (r) => (Array.isArray(r) ? r : r.items),
      ),
    responderConfirmacion: (id: string, aprueba: boolean) =>
      call<Confirmacion>('POST', `/confirmaciones/${enc(id)}/responder`, { aprueba }),
    miQr: () => call<{ qr_payload: string; vence_at: string }>('GET', '/me/qr'),
    // Feed (concierge: all; socio: own)
    eventos: (despuesDe = 0, soloAtencion = false) =>
      call<{ items: Evento[]; ultimo_seq: number } | Evento[]>(
        'GET',
        `/eventos${qs({ despues_de: String(despuesDe), solo_atencion: soloAtencion ? 'true' : undefined })}`,
      ).then((r) =>
        Array.isArray(r)
          ? { items: r, ultimo_seq: r.reduce((m, e) => Math.max(m, e.seq), despuesDe) }
          : r,
      ),
    atenderEvento: (id: string) => call<Evento>('POST', `/eventos/${enc(id)}/atender`),
    resolverEvento: (id: string, nota: string) =>
      call<Evento>('POST', `/eventos/${enc(id)}/resolver`, { nota }),
    robotEstado: () => call<RobotEstado>('GET', '/robot/estado'),
    robotSesion: () => call<EstadoSesionRobot>('GET', '/robot/sesion'),
    robotTelemetria: () => call<EstadoTelemetriaRobot>('GET', '/robot/telemetria'),
    panelResumen: (fecha?: string) => call<PanelResumen>('GET', `/panel/resumen${qs({ fecha })}`),

    // v3 · photos. Images need the token, so `foto()` downloads them and returns a local URI
    // (blob: on web, data: on native) that <Image source={{ uri }}> can show.
    foto: (path: string) => descargar(path),
    subirDocumento: (id: string, form: FormData) =>
      call<Invitacion>('PUT', `/invitaciones/${enc(id)}/documento`, form),
    quitarDocumento: (id: string) =>
      call<Invitacion>('DELETE', `/invitaciones/${enc(id)}/documento`),
    perfil: () => call<Perfil>('GET', '/me/perfil'),
    editarPerfil: (
      b: Partial<Pick<Perfil, 'preferencias_bebida' | 'asistencia' | 'nota_asistencia'>>,
    ) => call<Perfil>('PATCH', '/me/perfil', b),
    subirMiFoto: (form: FormData) => call<Perfil>('PUT', '/me/foto', form),
    quitarMiFoto: () => call<Perfil>('DELETE', '/me/foto'),

    // v3 · visits, escort and handoffs
    visitas: (q: { estado?: string; fecha?: string } = {}) =>
      call<Items<Visita>>('GET', `/visitas${qs(q)}`).then((r) => r.items),
    visita: (id: string) => call<Visita>('GET', `/visitas/${enc(id)}`),
    crearVisita: (b: {
      invitacion_id?: string;
      nombre?: string;
      categoria?: Visita['categoria'];
      destino?: string;
      persona_id?: string;
    }) => call<Visita>('POST', '/visitas', b),
    asignarAcompanante: (id: string, acompanante_id: string) =>
      call<Visita>('POST', `/visitas/${enc(id)}/asignar`, { acompanante_id }),
    pedirAyuda: (id: string, motivo: string) =>
      call<Tarea>('POST', `/visitas/${enc(id)}/ayuda`, { motivo }),
    pedirRelevo: (id: string, motivo: string, a?: string) =>
      call<Tarea>('POST', `/visitas/${enc(id)}/relevo`, { motivo, a }),
    recibirVisita: (id: string) => call<Visita>('POST', `/visitas/${enc(id)}/recibir`),
    confirmarLlegada: (id: string) => call<Visita>('POST', `/visitas/${enc(id)}/llegada`),
    cerrarVisita: (id: string) => call<Visita>('POST', `/visitas/${enc(id)}/salida`),
    compartirEncuentro: (
      id: string,
      b: { punto_encuentro?: string | null; ubicacion_anfitrion?: string | null },
    ) => call<Visita>('PATCH', `/visitas/${enc(id)}/encuentro`, b),
    evaluarVisita: (
      id: string,
      b: { robot: number; club: number; comentario?: string; transcripcion?: string },
    ) => call<Evaluacion>('POST', `/visitas/${enc(id)}/evaluacion`, b),
    tareas: (estado?: string) =>
      call<Items<Tarea>>('GET', `/tareas${qs({ estado })}`).then((r) => r.items),
    aceptarTarea: (id: string) => call<Tarea>('POST', `/tareas/${enc(id)}/aceptar`),
    rechazarTarea: (id: string, motivo: string) =>
      call<Tarea>('POST', `/tareas/${enc(id)}/rechazar`, { motivo }),
    verificarQr: (payload: string) => call<QrVerificado>('POST', '/qr/verificar', { payload }),

    // v3 · coordination
    equipo: () => call<Items<MiembroEquipo>>('GET', '/equipo').then((r) => r.items),
    miEstado: (estado: EstadoEquipo, detalle?: string) =>
      call<MiembroEquipo>('PATCH', '/me/estado', { estado, detalle }),
    cola: () => call<Items<ColaItem>>('GET', '/cola').then((r) => r.items),
    incidencias: (estado?: string) =>
      call<Items<Incidencia>>('GET', `/incidencias${qs({ estado })}`).then((r) => r.items),
    reportarIncidencia: (
      b: Pick<Incidencia, 'tipo' | 'descripcion'> & { lugar?: string; visita_id?: string },
    ) => call<Incidencia>('POST', '/incidencias', b),
    resolverIncidencia: (id: string) =>
      call<Incidencia>('POST', `/incidencias/${enc(id)}/resolver`),
    evaluaciones: (fecha?: string) =>
      call<ResumenEvaluaciones>('GET', `/evaluaciones${qs({ fecha })}`),

    // v3 · activities, services, agenda, robot bookings, administration
    actividades: (fecha?: string) =>
      call<Items<Actividad>>('GET', `/actividades${qs({ fecha })}`).then((r) => r.items),
    crearActividad: (b: Omit<Actividad, 'id' | 'inscritos'>) =>
      call<Actividad>('POST', '/actividades', b),
    editarActividad: (id: string, b: Partial<Omit<Actividad, 'id' | 'inscritos'>>) =>
      call<Actividad>('PATCH', `/actividades/${enc(id)}`, b),
    borrarActividad: (id: string) => call<{ ok: true }>('DELETE', `/actividades/${enc(id)}`),
    inscribirme: (id: string) => call<Actividad>('POST', `/actividades/${enc(id)}/inscripcion`),
    desinscribirme: (id: string) =>
      call<Actividad>('DELETE', `/actividades/${enc(id)}/inscripcion`),
    servicios: (fecha?: string) =>
      call<Items<OrdenServicio>>('GET', `/servicios${qs({ fecha })}`).then((r) => r.items),
    personasServicio: () =>
      call<Items<{ id: string; nombre: string }>>('GET', '/servicios/personas').then(
        (r) => r.items,
      ),
    crearServicio: (
      b: Omit<OrdenServicio, 'id' | 'persona' | 'estado'> & { persona_id?: string },
    ) => call<OrdenServicio>('POST', '/servicios', b),
    editarServicio: (id: string, b: Partial<Omit<OrdenServicio, 'id' | 'persona'>>) =>
      call<OrdenServicio>('PATCH', `/servicios/${enc(id)}`, b),
    agenda: (fecha?: string) =>
      call<Items<ItemAgenda>>('GET', `/me/agenda${qs({ fecha })}`).then((r) => r.items),
    crearRecordatorio: (b: { titulo: string; fecha: string; hora_desde: string; nota?: string }) =>
      call<ItemAgenda>('POST', '/me/agenda', b),
    borrarRecordatorio: (id: string) => call<{ ok: true }>('DELETE', `/me/agenda/${enc(id)}`),
    reservasRobot: (fecha?: string) =>
      call<Items<ReservaRobot>>('GET', `/reservas-robot${qs({ fecha })}`).then((r) => r.items),
    reservarRobot: (b: Omit<ReservaRobot, 'id' | 'creada_por'>) =>
      call<ReservaRobot>('POST', '/reservas-robot', b),
    cancelarReserva: (id: string) => call<{ ok: true }>('DELETE', `/reservas-robot/${enc(id)}`),
    registrosAdmin: () => call<RegistrosAdmin>('GET', '/admin/registros'),
    solicitudesMembresia: () =>
      call<Items<SolicitudMembresia>>('GET', '/membresia/solicitudes').then((r) => r.items),

    // v3 · public (no account): the guest's signed QR is the credential
    pase: (qr: string) => call<PaseVista>('GET', `/pase${qs({ qr })}`),
    evaluarConPase: (qr: string, b: { robot: number; club: number; comentario?: string }) =>
      call<Evaluacion>('POST', `/pase/evaluacion${qs({ qr })}`, b),
    pedirAyudaConPase: (qr: string, motivo: string) =>
      call<Tarea>('POST', `/pase/ayuda${qs({ qr })}`, { motivo }),
    membresiaInfo: () =>
      call<{ niveles: { nivel: string; beneficios: string[]; invitados_activos: number }[] }>(
        'GET',
        '/membresia/info',
      ),
    solicitarMembresia: (b: Omit<SolicitudMembresia, 'id' | 'estado' | 'creada_at'>) =>
      call<SolicitudMembresia>('POST', '/membresia/solicitudes', b),
  };

  /** GET an image with the token; returns a URI an <Image> can show without headers. */
  async function descargar(path: string): Promise<string> {
    const token = await tokenStore.get();
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
    } catch {
      throw new ClubApiError(0, 'sin_conexion', 'Sin conexión. Revisa tu red e intenta de nuevo.');
    }
    if (!res.ok)
      throw new ClubApiError(res.status, 'foto_no_disponible', 'La foto no está disponible.');
    const blob = await res.blob();
    if (Platform.OS === 'web') return URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () =>
        reject(new ClubApiError(0, 'foto_no_disponible', 'La foto no está disponible.'));
      r.readAsDataURL(blob);
    });
  }
}

export type ClubClient = ReturnType<typeof createClubClient>;
export const club = createClubClient();

const enc = encodeURIComponent;
function qs(q: Record<string, string | undefined>) {
  const p = Object.entries(q).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return p.length ? `?${new URLSearchParams(p).toString()}` : '';
}
