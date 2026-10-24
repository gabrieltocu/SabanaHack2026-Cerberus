// Charts that more than one section of the panel shows, built from API data.
import { View } from 'react-native';

import type { Evaluacion, MiembroEquipo, Visita } from '../../../club/types';
import { space } from '../../../design-system';
import { BarraApilada100, Columnas, Leyenda, LeyendaPartes, SERIE, type Parte } from './Charts';
import { distribucion, indiceMaximo, maximoEscala } from './escalas';
import { partesEquipo, partesVisitas } from './partes';

const SERIES_EVAL = [
  { texto: 'Robot', color: SERIE.tinta },
  { texto: 'Club', color: SERIE.claro },
];

/** How many ratings each score from 1 to 5 got, robot and club side by side. */
export function DistribucionEvaluaciones({ items }: { items: readonly Evaluacion[] }) {
  const robot = distribucion(items.map((e) => e.robot));
  const club = distribucion(items.map((e) => e.club));
  return (
    <View style={{ gap: space[3] }}>
      <Leyenda items={SERIES_EVAL} />
      <Columnas
        columnas={[1, 2, 3, 4, 5].map((n, i) => ({
          id: String(n),
          etiqueta: String(n),
          valores: [robot[i]!, club[i]!],
        }))}
        series={SERIES_EVAL}
        modo="agrupado"
        max={maximoEscala(Math.max(0, ...robot, ...club))}
        alto={140}
        etiquetaX={(i) => String(i + 1)}
        destacar={indiceMaximo(robot)}
        valores
        descripcion={`Evaluaciones del 1 al 5: ${items.length} ${items.length === 1 ? 'respuesta' : 'respuestas'}`}
      />
    </View>
  );
}

/** A 100 % bar with its legend (counts and shares) under it. */
export function BarraConLeyenda({
  partes,
  descripcion,
}: {
  partes: readonly Parte[];
  descripcion: string;
}) {
  return (
    <View style={{ gap: space[4] }}>
      <BarraApilada100 partes={partes} descripcion={descripcion} />
      <LeyendaPartes partes={partes} />
    </View>
  );
}

export const BarraVisitas = ({ visitas }: { visitas: readonly Visita[] }) => (
  <BarraConLeyenda
    partes={partesVisitas(visitas)}
    descripcion={`Estado de las visitas: ${visitas.length} en total`}
  />
);

/** Team by state as a thin 100 % bar; with `leyenda`, a legend with the counts under it. */
export function BarraEquipo({
  equipo,
  leyenda = false,
}: {
  equipo: readonly MiembroEquipo[];
  leyenda?: boolean;
}) {
  const partes = partesEquipo(equipo);
  return (
    <View style={{ gap: space[2] }}>
      <BarraApilada100
        compacta
        partes={partes}
        descripcion={`Equipo en turno: ${equipo.length} personas y robots`}
      />
      {leyenda ? (
        <Leyenda
          items={partes.map((p) => ({ color: p.color, texto: p.texto, valor: String(p.valor) }))}
        />
      ) : null}
    </View>
  );
}
