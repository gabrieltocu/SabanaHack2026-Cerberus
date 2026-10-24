// Pantalla 5: actividades del día que vienen en el pase. El invitado las ve; no se inscribe.
import { View } from 'react-native';
import { EmptyState, Text, space } from '../../design-system';
import type { Actividad, PaseVista } from '../../club/types';
import { horaCorta } from './pase';
import { Cuerpo, Encabezado, FINA } from './ui';

const hora = (fecha: string, hhmm: string) => {
  const ms = Date.parse(`${fecha}T${hhmm}:00-05:00`);
  return Number.isNaN(ms) ? hhmm : horaCorta(ms);
};

function Detalle({ a, inscrito }: { a: Actividad; inscrito: boolean }) {
  return (
    <View
      style={{
        paddingVertical: space[4],
        gap: space[1],
        borderBottomWidth: 1,
        borderBottomColor: FINA,
      }}
    >
      <Text variant="caption" tone="muted">
        {`${hora(a.fecha, a.hora_desde)} – ${hora(a.fecha, a.hora_hasta)} · ${a.lugar}`}
      </Text>
      <Text variant="label" style={{ fontSize: 17, lineHeight: 24 }}>
        {a.nombre}
      </Text>
      {a.descripcion ? (
        <Text tone="muted" style={{ fontSize: 15, lineHeight: 22 }}>
          {a.descripcion}
        </Text>
      ) : null}
      {inscrito ? <Text variant="label">Inscrito</Text> : null}
    </View>
  );
}

export function Actividades({ p }: { p: PaseVista }) {
  const id = p.visita?.id;
  return (
    <>
      <Encabezado titulo="Actividades" subtitulo="Hoy en el club" />
      <Cuerpo>
        {p.actividades.length === 0 ? (
          <EmptyState
            title="Hoy no hay actividades abiertas"
            description="Si quieres hacer algo especial durante tu visita, pregúntale al robot o a tu anfitrión."
          />
        ) : (
          <View>
            {p.actividades.map((a) => (
              <Detalle key={a.id} a={a} inscrito={!!id && a.inscritos.includes(id)} />
            ))}
          </View>
        )}
      </Cuerpo>
    </>
  );
}
