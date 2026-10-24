// Civil dates and clock times in Bogotá (UTC-5, no daylight saving). The API sends ISO instants with -05:00.
import { dateLabel, spokenDate } from '../../shared/dates';

const BOGOTA_MS = 5 * 3_600_000;
const bogota = (now: Date) => new Date(now.getTime() - BOGOTA_MS).toISOString();

/** `AAAA-MM-DD` in Bogotá for the given instant. */
export const hoyBogota = (now: Date) => bogota(now).slice(0, 10);

/** `HH:MM` in Bogotá for the given instant. */
export const horaBogota = (now: Date) => bogota(now).slice(11, 16);

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `HH:MM` out of an ISO instant (already -05:00); other offsets go through Date. */
export function horaDe(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*-05:00$/.test(ts)) return ts.slice(11, 16);
  const t = new Date(ts);
  return Number.isNaN(t.getTime()) ? '' : horaBogota(t);
}

/** Today, tomorrow and the next days as quick picks for the date field. */
export function fechasRapidas(hoy: string, cuantas = 5) {
  return Array.from({ length: cuantas }, (_, n) => {
    const value = addDays(hoy, n);
    const label =
      n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : dateLabel(value).split(' ').slice(0, 2).join(' ');
    return { value, label };
  });
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (t: number) => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;

/** Next half hour and two hours later, clamped so that `hasta > desde` always holds. */
export function horasPorDefecto(now: Date) {
  const [h, m] = horaBogota(now).split(':').map(Number) as [number, number];
  const start = Math.min(h * 60 + (m < 30 ? 30 : 60), 22 * 60);
  return { desde: hhmm(start), hasta: hhmm(Math.min(start + 120, 23 * 60 + 30)) };
}

/** Types `1030` and gets `10:30`: keeps digits, inserts the colon. */
export function formatoHora(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

export const esHora = (s: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
};

export const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** `3 h 12 min`, `45 min`; `null` once the instant has passed. */
export function faltan(hasta: string, ahora: Date): string | null {
  const min = Math.floor((Date.parse(hasta) - ahora.getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return null;
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/** `Hoy`, `Mañana`, the weekday within the week (`Domingo`) or `24 oct` further away. */
export function diaFrase(fecha: string, hoy: string): string {
  const dias = Math.round((Date.parse(fecha) - Date.parse(hoy)) / 86_400_000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  if (dias > 1 && dias < 7) {
    const d = spokenDate(fecha).split(' ')[0] ?? '';
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  return dateLabel(fecha).split(' ').slice(1, 3).join(' ');
}
