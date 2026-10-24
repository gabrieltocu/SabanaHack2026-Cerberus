import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text, colors, fonts, space } from '../../../design-system';
import type { Actividad } from '../../../club/types';
import { cupoTexto, horario, inscrito, porHora, terminada } from './actividades';
import { fechasRapidas, hoyBogota } from './dates';
import { useCarga, useWhileFocused } from './hooks';
import { useSocio } from './SocioContext';
import { Grupo } from './ui/Fila';
import { Frame } from './ui/Frame';
import { Opciones } from './ui/Opciones';
import { Cargando, Fallo, Vacio } from './ui/States';

/** One activity of the day: hours on the left, name, place and seats; a chip when enrolled. */
export function FilaActividad({
  a,
  yo,
  ahora,
  primero,
  onPress,
}: {
  a: Actividad;
  yo: boolean;
  ahora: Date;
  primero: boolean;
  onPress: () => void;
}) {
  const fin = terminada(a, ahora);
  return (
    <Pressable
      role="link"
      accessibilityLabel={`${a.nombre}, ${horario(a)}, ${a.lugar}, ${yo ? 'inscrito' : cupoTexto(a)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[3],
        borderTopWidth: primero ? 0 : 1,
        borderTopColor: colors.border,
        backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
        opacity: fin ? 0.6 : 1,
      })}
    >
      <View style={{ width: 56 }}>
        <Text style={{ fontFamily: fonts.bodyStrong, fontSize: 15, lineHeight: 21 }}>
          {a.hora_desde}
        </Text>
        <Text variant="caption" tone="muted">
          {a.hora_hasta}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 }}
          numberOfLines={1}
        >
          {a.nombre}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {`${a.lugar} · ${cupoTexto(a)}`}
        </Text>
      </View>
      {yo ? <Icon name="checkmark-circle-outline" size={20} color={colors.gold} /> : null}
      <Icon name="chevron-forward-outline" size={18} color={colors.text} />
    </Pressable>
  );
}

/** Actividades del club: pick the day, see the list, open one to enrol or cancel. */
export function ActivitiesScreen({ onAbrir }: { onAbrir: (id: string, fecha: string) => void }) {
  const { client, usuario, ahora } = useSocio();
  const hoy = hoyBogota(ahora());
  const [fecha, setFecha] = useState(hoy);
  const load = useCallback(() => client.actividades(fecha), [client, fecha]);
  const { carga, recargar } = useCarga(load, false);
  // Loads on focus and when the day changes; seats change while the socio is elsewhere.
  useWhileFocused(recargar);
  return (
    <Frame title="Agenda" onRefresh={() => void recargar()} refreshing={false}>
      <Opciones label="Día" options={fechasRapidas(hoy, 4)} value={fecha} onChange={setFecha} />
      {carga.estado === 'cargando' ? <Cargando filas={3} label="Cargando actividades" /> : null}
      {carga.estado === 'error' ? (
        <Fallo error={carga.error} onRetry={() => void recargar()} />
      ) : null}
      {carga.estado === 'lista' ? (
        carga.datos.length ? (
          <Grupo>
            {[...carga.datos].sort(porHora).map((a, i) => (
              <FilaActividad
                key={a.id}
                a={a}
                yo={inscrito(a, usuario.id)}
                ahora={ahora()}
                primero={i === 0}
                onPress={() => onAbrir(a.id, fecha)}
              />
            ))}
          </Grupo>
        ) : (
          <Vacio texto="No hay actividades este día. Prueba con otro." icon="calendar-outline" />
        )
      ) : null}
    </Frame>
  );
}
