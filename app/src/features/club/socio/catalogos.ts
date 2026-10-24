// Options the socio picks from for drinks and assistance. Anything outside the list is "Otra".
export interface Opcion {
  value: string;
  label: string;
}

/** Stored as the label itself: the robot and the edecán read it as written. */
export const BEBIDAS: readonly Opcion[] = [
  'Agua',
  'Café',
  'Té',
  'Jugo natural',
  'Vino',
  'Cerveza',
  'Cóctel',
  'Sin alcohol',
].map((b) => ({ value: b, label: b }));

/** Codes follow the API contract (`Perfil.asistencia`). */
export const ASISTENCIA: readonly Opcion[] = [
  { value: 'silla_ruedas', label: 'Silla de ruedas' },
  { value: 'movilidad_reducida', label: 'Movilidad reducida' },
  { value: 'visual', label: 'Apoyo visual' },
  { value: 'auditiva', label: 'Apoyo auditivo' },
  { value: 'acompanante', label: 'Viene con acompañante' },
];

/** The catalogue label, or the free text as the socio wrote it. */
export const etiqueta = (catalogo: readonly Opcion[], value: string) =>
  catalogo.find((o) => o.value === value)?.label ?? value;

export const resumenLista = (
  catalogo: readonly Opcion[],
  valores: readonly string[] | undefined,
) => (valores?.length ? valores.map((v) => etiqueta(catalogo, v)).join(', ') : '');

/** Meeting points offered for a guest (the free text field accepts others). */
export const PUNTOS_ENCUENTRO = ['Recepción', 'Lobby', 'Entrada principal', 'Parqueadero'] as const;
