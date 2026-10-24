// Pases sin cuenta (invitado y trabajador externo): lectura del payload firmado del robot
// (`NCLUB1|tipo|persona_id|nombre|exp|firma`) y reloj de Bogotá. Funciones puras, sin React.

export type PaseTipo = 'socio' | 'invitado' | 'personal' | 'externo';
const TIPOS: readonly string[] = ['socio', 'invitado', 'personal', 'externo'];

export type Pase = {
  tipo: PaseTipo;
  personaId: string;
  nombre: string;
  /** Vencimiento en segundos Unix. */
  venceUnix: number;
  firma: string;
};

const MAX_PAYLOAD = 240;

/**
 * Valida solo la forma. La firma NO se verifica aquí (el secreto es del robot): la pantalla
 * dice que el robot validará el pase al llegar.
 */
export function parsePase(p: string | null | undefined): Pase | null {
  if (!p || p.length > MAX_PAYLOAD) return null;
  const partes = p.split('|');
  if (partes.length !== 6) return null;
  const [version, tipo, personaId, nombre, exp, firma] = partes as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== 'NCLUB1' || !TIPOS.includes(tipo)) return null;
  if (!personaId.trim() || !nombre.trim()) return null;
  if (!/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{20}$/i.test(firma)) return null;
  return {
    tipo: tipo as PaseTipo,
    personaId,
    nombre: nombre.trim(),
    venceUnix: Number(exp),
    firma,
  };
}

// --- Reloj de Bogotá (UTC-5 todo el año, sin horario de verano) ---

const BOGOTA_MS = 5 * 3600_000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const bogota = (ms: number) => new Date(ms - BOGOTA_MS);

// Espacios duros: «p. m.» y la hora no se parten entre renglones.
const horaTexto = (h: number, min: string) =>
  `${h % 12 || 12}:${min}\u00a0${h < 12 ? 'a.\u00a0m.' : 'p.\u00a0m.'}`;

/** `6:00 p. m.` */
export function horaCorta(ms: number): string {
  const d = bogota(ms);
  return horaTexto(d.getUTCHours(), String(d.getUTCMinutes()).padStart(2, '0'));
}

/** `sáb 24 oct 2026` */
export function fechaCorta(ms: number): string {
  const d = bogota(ms);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `YYYY-MM-DD` de Bogotá. */
export const diaBogota = (ms: number) => bogota(ms).toISOString().slice(0, 10);

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** `14:00` → `2:00 p. m.`; `undefined` si el valor del enlace no es una hora. */
export function horaDeTexto(valor: string | undefined): string | undefined {
  const m = HHMM.exec(valor ?? '');
  return m ? horaTexto(Number(m[1]), m[2]!) : undefined;
}

const instante = (fecha: string, valor: string | undefined): number | undefined => {
  const m = HHMM.exec(valor ?? '');
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return undefined;
  const ms = Date.parse(`${fecha}T${m[1]!.padStart(2, '0')}:${m[2]}:00-05:00`);
  return Number.isNaN(ms) ? undefined : ms;
};

export type EstadoPase = {
  estado: 'vigente' | 'aun-no' | 'vencido';
  /** Inicio del horario (ms), si el enlace lo trae. */
  inicioMs?: number;
  /** Fin efectivo: el menor entre el vencimiento firmado y `hasta`. */
  finMs: number;
};

/**
 * Vigencia local del pase: el vencimiento firmado manda; `fecha`/`desde`/`hasta` (hora de
 * Bogotá, del enlace) acotan el horario. El robot decide igual al llegar.
 */
export function estadoPase(
  pase: Pase,
  now: number,
  ventana: { fecha?: string; desde?: string; hasta?: string } = {},
): EstadoPase {
  const vence = pase.venceUnix * 1000;
  const fecha = ventana.fecha ?? diaBogota(vence);
  const inicioMs = instante(fecha, ventana.desde);
  const hastaMs = instante(fecha, ventana.hasta);
  const finMs = hastaMs === undefined ? vence : Math.min(vence, hastaMs);
  if (now >= finMs) return { estado: 'vencido', inicioMs, finMs };
  if (inicioMs !== undefined && now < inicioMs) return { estado: 'aun-no', inicioMs, finMs };
  return { estado: 'vigente', inicioMs, finMs };
}

/** Texto del enlace acotado y en una línea: lo escribe quien armó el enlace, no se confía. */
export function limpiar(texto: string | undefined, max = 80): string | undefined {
  return texto?.replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
}

/** Iniciales para el avatar: primera letra de las dos primeras palabras. */
export function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

// --- Ejemplos de demostración (sin `p`) ---

export type VisitaParams = {
  tipo?: string;
  p?: string;
  lugar?: string;
  anfitrion?: string;
  fecha?: string;
  desde?: string;
  hasta?: string;
  orden?: string;
  empresa?: string;
  area?: string;
  supervisor?: string;
  motivo?: string;
  /** `f` o `m`: solo para el trato («Invitada», «Bienvenida»). */
  genero?: string;
};

const HORA = 3600_000;
const hhmm = (ms: number) => {
  const d = bogota(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * Datos ficticios con un pase vigente ahora mismo: vence en 4 h a la hora en punto (sin pasar
 * de las 23:59 de hoy). La firma es de relleno: el QR de ejemplo no abre nada.
 */
export function ejemplo(tipo: 'invitado' | 'externo', now: number): VisitaParams {
  const finDia = Date.parse(`${diaBogota(now)}T23:59:00-05:00`);
  const exp = Math.min(Math.ceil(now / HORA) * HORA + 4 * HORA, finDia);
  const base = { fecha: diaBogota(now), hasta: hhmm(exp) };
  const firma = '0'.repeat(20);
  if (tipo === 'invitado') {
    return {
      ...base,
      tipo,
      p: `NCLUB1|invitado|EJ-INV-01|Laura Díaz|${Math.floor(exp / 1000)}|${firma}`,
      lugar: 'Sala de anfitriones',
      anfitrion: 'Sofía',
      genero: 'f',
    };
  }
  const desde = Math.min(Math.floor(now / HORA) * HORA, exp - 60_000);
  return {
    ...base,
    desde: hhmm(desde),
    tipo,
    p: `NCLUB1|externo|EJ-EXT-01|Luis Peña|${Math.floor(exp / 1000)}|${firma}`,
    orden: 'OT-1042',
    empresa: 'Climatec',
    area: 'Cuarto de máquinas, nivel -1',
    supervisor: 'Jorge',
    motivo: 'Mantenimiento del aire acondicionado',
  };
}
