import { useCallback } from 'react';
import { View } from 'react-native';

import type { Evaluacion } from '../../../club/types';
import { Icon, StatusChip, Text, colors, space } from '../../../design-system';
import { horaBogota } from '../eventos';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { SONDEO_MS, mediaTexto } from './format';
import { DistribucionEvaluaciones } from './Graficas';
import { Cargable, Cifra, Panel, Tabla, Vacio, useEscritorio } from './ui';

/** Five stars, filled up to the rating; the number is always written too. */
function Estrellas({ n, etiqueta }: { n: number; etiqueta: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${etiqueta}: ${n} de 5`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon
          key={i}
          name={i <= n ? 'star' : 'star-outline'}
          size={14}
          color={i <= n ? colors.gold : colors.borderStrong}
        />
      ))}
    </View>
  );
}

const texto = (e: Evaluacion) => e.comentario ?? e.transcripcion;

/** Averages, key points and the comments (typed or transcribed from voice) of the chosen day. */
export function EvaluacionesView({ fecha }: { fecha: string }) {
  const { client } = useSession();
  const escritorio = useEscritorio();
  const recurso = useRecurso(
    useCallback(() => client.evaluaciones(fecha), [client, fecha]),
    {
      activo: usePantallaActiva(),
      cadaMs: SONDEO_MS,
      clave: fecha,
    },
  );
  return (
    <Cargable
      recurso={recurso}
      etiqueta="Cargando evaluaciones"
      errorTitulo="No pudimos cargar las evaluaciones"
      alto={320}
    >
      {(r) => {
        const items = [...r.items].sort((a, b) => b.creada_at.localeCompare(a.creada_at));
        return (
          <View style={{ gap: space[5] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
              <Cifra
                etiqueta="Promedio del robot"
                valor={mediaTexto(r.promedio_robot)}
                nota="de 5"
              />
              <Cifra etiqueta="Promedio del club" valor={mediaTexto(r.promedio_club)} nota="de 5" />
              <Cifra etiqueta="Evaluaciones" valor={String(items.length)} nota="del día" />
            </View>
            {r.puntos_clave.length > 0 ? (
              <View style={{ gap: space[2] }}>
                <Text variant="label">Lo que más se repite</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                  {r.puntos_clave.map((p) => (
                    <StatusChip key={p} kind="info" label={p} />
                  ))}
                </View>
              </View>
            ) : null}
            <Panel titulo="Calificaciones" nota="Cuántas veces recibió cada nota, de 1 a 5">
              {items.length === 0 ? (
                <Vacio titulo="Sin evaluaciones este día" />
              ) : (
                <DistribucionEvaluaciones items={items} />
              )}
            </Panel>
            <Panel titulo="Comentarios">
              {items.length === 0 ? (
                <Vacio
                  titulo="Sin evaluaciones este día"
                  detalle="Los visitantes califican al terminar su visita."
                />
              ) : (
                <Tabla
                  filas={items}
                  escritorio={escritorio}
                  id={(e) => e.id}
                  cols={[
                    { t: 'Hora', flex: 1, ver: (e) => horaBogota(e.creada_at) },
                    {
                      t: 'Robot',
                      flex: 1.4,
                      ver: (e) => <Estrellas n={e.robot} etiqueta="Robot" />,
                    },
                    { t: 'Club', flex: 1.4, ver: (e) => <Estrellas n={e.club} etiqueta="Club" /> },
                    { t: 'Comentario', flex: 6, ver: (e) => <Comentario e={e} /> },
                  ]}
                  movil={(e) => (
                    <View style={{ flex: 1, gap: space[1] }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                        <Text variant="caption" tone="muted">
                          {horaBogota(e.creada_at)}
                        </Text>
                        <Estrellas n={e.robot} etiqueta="Robot" />
                        <Estrellas n={e.club} etiqueta="Club" />
                      </View>
                      <Comentario e={e} />
                    </View>
                  )}
                />
              )}
            </Panel>
          </View>
        );
      }}
    </Cargable>
  );
}

function Comentario({ e }: { e: Evaluacion }) {
  const t = texto(e);
  if (!t) return <Text tone="muted">Sin comentario</Text>;
  return (
    <View style={{ gap: 2 }}>
      <Text variant="label">{t}</Text>
      {e.comentario === null && e.transcripcion ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="mic-outline" size={13} color={colors.muted} />
          <Text variant="caption" tone="muted">
            Transcripción de voz
          </Text>
        </View>
      ) : null}
    </View>
  );
}
