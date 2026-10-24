// Pure math of the panel charts: axis scale, stacking, 100 % parts, cumulative sums, distribution.
// No React here so the scale and the stacked sums can be tested on their own.

/** Round step sizes above 5: 10, 20, 25, 50, 100, 200, 250, 500... */
const pasoRedondo = (minimo: number) => {
  for (let p = 10; ; p *= 10) {
    const hallado = [p, 2 * p, 2.5 * p, 5 * p].find((x) => x >= minimo);
    if (hallado) return hallado;
  }
};

/**
 * Top of an axis: `pasos` equal steps of a whole, round size (1 to 5, then 10, 20, 25, 50...), at
 * least `pasos` high, so every gridline label is a whole number and none is an odd fraction.
 */
export const maximoEscala = (max: number, pasos = 4) => {
  const minimo = Math.ceil(Math.max(0, max) / pasos);
  return pasos * (minimo <= 5 ? Math.max(1, minimo) : pasoRedondo(minimo));
};

/** Gridline values from 0 to the top, evenly spaced: [0, 2, 4, 6, 8] for max 8 and 4 steps. */
export const marcas = (max: number, pasos = 4) =>
  Array.from({ length: pasos + 1 }, (_, i) => (max / pasos) * i);

/** Pixel heights of the segments of one stacked column, in series order (first = bottom). */
export const alturasApiladas = (valores: readonly number[], max: number, alto: number) =>
  valores.map((v) => (max > 0 ? (Math.max(0, v) / max) * alto : 0));

export const suma = (valores: readonly number[]) => valores.reduce((s, v) => s + v, 0);

/** Index of the first highest value, or -1 when everything is 0 (nothing to highlight). */
export const indiceMaximo = (valores: readonly number[]) => {
  const max = Math.max(0, ...valores);
  return max > 0 ? valores.indexOf(max) : -1;
};

/** Shares of a total for a 100 % bar; they add up to 1 (all 0 when there is nothing). */
export function proporciones(valores: readonly number[]): number[] {
  const total = suma(valores);
  return valores.map((v) => (total > 0 ? v / total : 0));
}

/** Running total: [1, 0, 3] -> [1, 1, 4]. */
export const acumulado = (valores: readonly number[]) =>
  valores.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], []);

/** How many ratings fall on each score from `desde` to `hasta` (ignores anything outside). */
export const distribucion = (notas: readonly number[], desde = 1, hasta = 5) =>
  Array.from(
    { length: hasta - desde + 1 },
    (_, i) => notas.filter((n) => Math.round(n) === desde + i).length,
  );

/** Average of the ratings, or null with none. */
export const promedio = (notas: readonly number[]) =>
  notas.length === 0 ? null : suma(notas) / notas.length;

/** Points of a straight-segment line inside a box; y grows downwards, 0 sits on the floor. */
export function puntosLinea(valores: readonly number[], ancho: number, alto: number, max: number) {
  const n = valores.length;
  return valores.map((v, i) => ({
    x: n > 1 ? (i / (n - 1)) * ancho : ancho / 2,
    y: max > 0 ? alto - (Math.max(0, v) / max) * alto : alto,
  }));
}
