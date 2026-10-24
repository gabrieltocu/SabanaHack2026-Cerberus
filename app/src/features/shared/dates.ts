// Display helpers for civil dates (`AAAA-MM-DD`). Table-based on purpose: Intl output differs
// between engines, and the demo needs identical text in the browser and in tests.
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/** `2026-10-24` -> `sáb 24 oct 2026`. Returns the input unchanged if it is not a civil date. */
export function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS[weekday]} ${d} ${MONTHS[mo - 1]} ${y}`;
}

/** Greeting by hour in America/Bogota: from 12:00 «tardes», from 18:00 «noches». */
export function greetingFor(hour: number): string {
  if (hour >= 18) return 'Buenas noches';
  if (hour >= 12) return 'Buenas tardes';
  return 'Buenos días';
}

const DAYS_LONG = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** `2026-10-24` -> `sábado 24 de octubre`, for screen-reader announcements. */
export function spokenDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS_LONG[weekday]} ${d} de ${MONTHS_LONG[mo - 1]}`;
}
