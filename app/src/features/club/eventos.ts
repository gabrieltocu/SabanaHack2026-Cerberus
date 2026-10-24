// Pure helpers for the concierge feed: ordering, merging, Bogotá time and plain-language
// evidence. No React, no fetch: all of it is unit-tested.
import type { Evento, Invitacion, Nivel, Severidad } from '../../club/types';
import { PERSONAS_DEMO } from './demo';

const BOGOTA_MS = -5 * 3_600_000; // Colombia has no daylight saving time.
const pad = (n: number) => String(n).padStart(2, '0');
const bogota = (ms: number) => new Date(ms + BOGOTA_MS);

/** "14:05" in Bogotá; "--:--" when the instant is not a date. */
export function horaBogota(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '--:--';
  const d = bogota(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "YYYY-MM-DD" in Bogotá for an ISO instant or epoch milliseconds. */
export function diaBogota(t: string | number): string {
  const d = bogota(typeof t === 'number' ? t : Date.parse(t));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Union by event id (a newer copy replaces the old one), ordered by seq. */
export function unirEventos(actuales: Evento[], nuevos: Evento[]): Evento[] {
  if (nuevos.length === 0) return actuales;
  const porId = new Map(actuales.map((e) => [e.id, e]));
  for (const e of nuevos) porId.set(e.id, e);
  return [...porId.values()].sort((a, b) => a.seq - b.seq);
}

const PESO: Record<Severidad, number> = { urgente: 0, atencion: 1, info: 2 };

/** Alerts still open: pending first (urgent, attention, info; newest first), then attended. */
export function ordenarAlertas(eventos: Evento[]): Evento[] {
  const rango = (e: Evento) => (e.estado === 'NUEVO' ? PESO[e.severidad] : 3);
  return eventos
    .filter((e) => e.requiere_atencion && e.estado !== 'RESUELTO')
    .sort((a, b) => rango(a) - rango(b) || b.seq - a.seq);
}

/** Closed alerts, newest first. */
export const historial = (eventos: Evento[]) =>
  eventos
    .filter((e) => e.requiere_atencion && e.estado === 'RESUELTO')
    .sort((a, b) => b.seq - a.seq);

export const pendientes = (eventos: Evento[]) =>
  eventos.filter((e) => e.requiere_atencion && e.estado === 'NUEVO').length;

/** Arrivals of the given Bogotá day, newest first. */
export function llegadasDelDia(eventos: Evento[], dia: string): Evento[] {
  return eventos
    .filter((e) => e.tipo === 'LLEGADA' && diaBogota(e.ts) === dia)
    .sort((a, b) => b.seq - a.seq);
}

const AVISO_A: Record<string, string> = { concierge: 'Concierge', seguridad: 'Seguridad' };

/** "para: …" of an event: who was notified, leaving out the host (it is the usual case). */
export function paraQuien(e: Pick<Evento, 'avisar'>): string | null {
  const otros = e.avisar
    .filter((a) => !/^anfitri[oó]n(:|$)/i.test(a.trim()))
    .map((a) => PERSONAS_DEMO[a]?.nombre ?? AVISO_A[a.toLowerCase()] ?? a);
  return otros.length ? otros.join(', ') : null;
}

/** Who attended/resolved, in words after "por": "ti" for the signed-in user. */
export function atendidoPorTexto(e: Pick<Evento, 'atendido_por'>, yoId?: string): string | null {
  if (!e.atendido_por) return null;
  if (e.atendido_por === yoId) return 'ti';
  return PERSONAS_DEMO[e.atendido_por]?.nombre ?? 'el concierge';
}

const clean = (v: unknown) =>
  typeof v === 'string' ? v.trim().toLowerCase().replace(/[_-]+/g, ' ') : '';

const METODOS: Record<string, string> = {
  rostro: 'Rostro',
  cara: 'Rostro',
  facial: 'Rostro',
  qr: 'Pase QR',
  pase: 'Pase QR',
  documento: 'Documento',
  manual: 'Manual',
};

/** How the person was identified ("Rostro", "Pase QR"…); null when the robot did not say. */
export function metodoTexto(e: Pick<Evento, 'evidencia'>): string | null {
  const m = clean(e.evidencia?.metodo);
  if (!m) return null;
  return METODOS[m] ?? m.charAt(0).toUpperCase() + m.slice(1);
}

const VEREDICTOS: Record<string, string> = {
  'no coincide': 'rostro no coincide',
  coincide: 'rostro coincide',
  dudoso: 'rostro dudoso',
  'sin rostro': 'no se vio el rostro',
};
const PASES: Record<string, string> = {
  vencido: 'pase vencido',
  vigente: 'pase vigente',
  valido: 'pase vigente',
  invalido: 'pase no válido',
  revocado: 'pase cancelado',
  ninguno: 'sin pase',
};

/**
 * Evidence of an event in short phrases for the concierge, e.g.
 * ["rostro no coincide", "2 reintentos", "pase vencido"]. Unknown values are kept readable.
 */
export function frasesEvidencia(evidencia: Evento['evidencia']): string[] {
  if (!evidencia) return [];
  const out: string[] = [];
  const veredicto = clean(evidencia.veredicto);
  if (veredicto) out.push(VEREDICTOS[veredicto] ?? veredicto);
  const reintentos = Number(evidencia.reintentos);
  if (Number.isFinite(reintentos) && reintentos > 0) {
    out.push(`${reintentos} ${reintentos === 1 ? 'reintento' : 'reintentos'}`);
  }
  const pase = clean(evidencia.pase);
  if (pase) out.push(PASES[pase] ?? `pase ${pase}`);
  const confianza = Number(evidencia.confianza ?? evidencia.cos);
  const hay = evidencia.confianza != null || evidencia.cos != null;
  if (hay && Number.isFinite(confianza)) {
    const pct = Math.round(Math.min(Math.max(confianza, 0), 1) * 100);
    out.push(`parecido ${pct} %`);
  }
  return out;
}

/** One line: "Rostro no coincide · 2 reintentos · pase vencido". */
export function resumenEvidencia(evidencia: Evento['evidencia']): string {
  const f = frasesEvidencia(evidencia).join(' · ');
  return f.charAt(0).toUpperCase() + f.slice(1);
}

export const SEVERIDAD_TEXTO: Record<Severidad, string> = {
  urgente: 'Urgente',
  atencion: 'Atención',
  info: 'Informativo',
};

/** Hosts' groups for "Esperados": VIP hosts first, then by name; cancelled ones are left out. */
export interface GrupoEsperados {
  anfitrionId: string;
  nombre: string;
  nivel: Nivel | null;
  items: Invitacion[];
}

export function agruparEsperados(invitaciones: Invitacion[]): GrupoEsperados[] {
  const grupos = new Map<string, GrupoEsperados>();
  for (const inv of invitaciones) {
    if (inv.estado === 'CANCELADA') continue;
    const g = grupos.get(inv.anfitrion_id) ?? {
      anfitrionId: inv.anfitrion_id,
      nombre: PERSONAS_DEMO[inv.anfitrion_id]?.nombre ?? 'Socio',
      nivel: PERSONAS_DEMO[inv.anfitrion_id]?.nivel ?? null,
      items: [],
    };
    g.items.push(inv);
    grupos.set(inv.anfitrion_id, g);
  }
  const vip = (g: GrupoEsperados) => (g.nivel === 'VIP' ? 0 : 1);
  return [...grupos.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.hora_desde.localeCompare(b.hora_desde)) }))
    .sort((a, b) => vip(a) - vip(b) || a.nombre.localeCompare(b.nombre, 'es'));
}

/** "hace 12 s", "hace 3 min", "hace 2 h". */
export function haceCuanto(desdeMs: number, ahoraMs: number): string {
  const s = Math.max(0, Math.round((ahoraMs - desdeMs) / 1000));
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}
