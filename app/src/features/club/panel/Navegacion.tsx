// Navigation of the web panel: section list (grouped), sidebar item, user card and the phone's "Más" menu.
import { View } from 'react-native';

import { Icon, Text, Touchable, colors, fonts, space, type IconName } from '../../../design-system';
import type { Seccion } from './format';
import { Iniciales, LINEA_SUAVE } from './ui';

export type Grupo = 'Operación' | 'Registros';

export const SECCIONES: readonly {
  clave: Seccion;
  etiqueta: string;
  icono: IconName;
  grupo: Grupo;
  /** Lives in the phone's bottom bar (max 4 + "Más"); the rest go under "Más". */
  principal?: boolean;
}[] = [
  {
    clave: 'resumen',
    etiqueta: 'Resumen',
    icono: 'grid-outline',
    grupo: 'Operación',
    principal: true,
  },
  {
    clave: 'cola',
    etiqueta: 'Cola de atención',
    icono: 'hourglass-outline',
    grupo: 'Operación',
    principal: true,
  },
  {
    clave: 'equipo',
    etiqueta: 'Equipo',
    icono: 'people-circle-outline',
    grupo: 'Operación',
    principal: true,
  },
  { clave: 'visitas', etiqueta: 'Visitas', icono: 'people-outline', grupo: 'Operación' },
  {
    clave: 'eventos',
    etiqueta: 'Eventos del robot',
    icono: 'calendar-outline',
    grupo: 'Operación',
  },
  { clave: 'robot', etiqueta: 'Robot R1', icono: 'hardware-chip-outline', grupo: 'Operación' },
  {
    clave: 'alertas',
    etiqueta: 'Alertas',
    icono: 'notifications-outline',
    grupo: 'Registros',
    principal: true,
  },
  { clave: 'historial', etiqueta: 'Historial', icono: 'time-outline', grupo: 'Registros' },
  { clave: 'evaluaciones', etiqueta: 'Evaluaciones', icono: 'star-outline', grupo: 'Registros' },
  {
    clave: 'registros',
    etiqueta: 'Registros y permisos',
    icono: 'shield-checkmark-outline',
    grupo: 'Registros',
  },
];

export const GRUPOS: readonly Grupo[] = ['Operación', 'Registros'];

export const TITULOS: Record<Seccion | 'mas', { titulo: string; sub: string }> = {
  resumen: { titulo: 'Resumen general', sub: 'Visión en tiempo real de la actividad en el club.' },
  visitas: { titulo: 'Visitas', sub: 'Invitaciones programadas para el día.' },
  alertas: { titulo: 'Alertas', sub: 'Avisos que necesitan a una persona. Solo lectura.' },
  robot: { titulo: 'Robot R1', sub: 'Estado de la recepción automática.' },
  equipo: {
    titulo: 'Equipo',
    sub: 'Robots y edecanes del turno, con la visita que atiende cada uno.',
  },
  cola: {
    titulo: 'Cola de atención',
    sub: 'Personas que esperan acompañante. Se actualiza cada 5 segundos.',
  },
  eventos: { titulo: 'Eventos e invitados especiales', sub: 'Reservas del robot por horario.' },
  registros: {
    titulo: 'Registros y permisos',
    sub: 'Quién puede entrar, qué invitaciones hay y a dónde.',
  },
  evaluaciones: {
    titulo: 'Evaluaciones e informes',
    sub: 'Cómo califican los visitantes al robot y al club.',
  },
  historial: { titulo: 'Historial', sub: 'Visitas cerradas e incidencias del día.' },
  mas: { titulo: 'Más', sub: 'Otras secciones del panel.' },
};

export function ItemLateral({
  icono,
  etiqueta,
  activo,
  contador,
  unidad = 'abiertas',
  onPress,
}: {
  icono: IconName;
  etiqueta: string;
  activo?: boolean;
  contador?: number;
  unidad?: string;
  onPress: () => void;
}) {
  return (
    <Touchable
      role="tab"
      label={contador ? `${etiqueta}, ${contador} ${unidad}` : etiqueta}
      onPress={onPress}
      accessibilityState={{ selected: !!activo }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 44,
        paddingHorizontal: space[3],
        // Active: soft surface, ink text, gold icon and a gold bar on the left.
        borderLeftWidth: 3,
        borderLeftColor: activo ? colors.gold : 'transparent',
        backgroundColor: activo || pressed ? colors.sage : 'transparent',
      })}
    >
      <Icon name={icono} size={20} color={activo ? colors.gold : colors.ink} />
      <Text
        variant="label"
        style={{ flex: 1, fontFamily: activo ? fonts.bodyStrong : fonts.bodyMedium }}
      >
        {etiqueta}
      </Text>
      {contador ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            paddingHorizontal: 6,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.forest,
          }}
        >
          <Text
            style={{
              color: colors.goldOnDark,
              fontSize: 12,
              lineHeight: 16,
              fontFamily: fonts.bodyStrong,
            }}
          >
            {contador}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
}

export function Usuario({ nombre, rol }: { nombre: string; rol: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <Iniciales nombre={nombre} />
      <View>
        <Text variant="label">{nombre.split(' ')[0]}</Text>
        <Text variant="caption" tone="muted">
          {rol}
        </Text>
      </View>
    </View>
  );
}

/** Phone menu behind the "Más" tab: the sections that do not fit in the bottom bar. */
export function MenuMas({ onElegir }: { onElegir: (s: Seccion) => void }) {
  return (
    <View style={{ gap: space[4] }}>
      {GRUPOS.map((g) => (
        <View key={g}>
          <Text variant="eyebrow" tone="muted" style={{ paddingBottom: space[1] }}>
            {g.toUpperCase()}
          </Text>
          {SECCIONES.filter((s) => s.grupo === g && !s.principal).map((s) => (
            <Touchable
              key={s.clave}
              label={s.etiqueta}
              onPress={() => onElegir(s.clave)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                minHeight: 52,
                borderBottomWidth: 1,
                borderBottomColor: LINEA_SUAVE,
                backgroundColor: pressed ? colors.sage : 'transparent',
              })}
            >
              <Icon name={s.icono} size={22} color={colors.ink} />
              <Text variant="label" style={{ flex: 1, fontSize: 16 }}>
                {s.etiqueta}
              </Text>
              <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
            </Touchable>
          ))}
        </View>
      ))}
    </View>
  );
}
