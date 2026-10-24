import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Icon, Text, Touchable, colors, space, type IconName } from '@/design-system';
import { Datos, Encabezado, FINA, type FilaDato } from './ui';
import { horarioTexto, validezTexto, type Visita } from './visita';

export type VisitaSection = 'inicio' | 'mapa' | 'mensajes' | 'perfil';
export type VisitaNavigation = {
  section?: VisitaSection;
  onExit?: () => void;
  /** Abre «Hazte socio» (información e inscripción de membresía). */
  onMembership?: () => void;
};
type PaseVisita = Extract<Visita, { clase: 'pase' }>;

/** Plano orientativo del club: el destino lleva el borde dorado; la recepción, el bloque negro. */
export function PlanoClub({
  destino,
  piso,
  origen,
}: {
  destino: string;
  piso: string;
  origen: string;
}) {
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        {['Salón principal', 'Terraza']
          .filter((s) => s !== destino)
          .map((s) => (
            <View
              key={s}
              style={{
                flex: 1,
                minHeight: 96,
                borderWidth: 1,
                borderColor: colors.border,
                padding: space[3],
                justifyContent: 'center',
                gap: space[2],
              }}
            >
              <Icon name="business-outline" size={22} color={colors.ink} />
              <Text variant="label">{s}</Text>
            </View>
          ))}
      </View>
      <View style={{ alignItems: 'center' }}>
        <Icon name="arrow-up-outline" size={22} color={colors.ink} />
      </View>
      <View
        style={{
          padding: space[5],
          minHeight: 104,
          gap: space[2],
          borderWidth: 1,
          borderColor: colors.gold,
        }}
      >
        <Icon name="location-outline" size={22} color={colors.gold} />
        <Text variant="h3">{destino}</Text>
        <Text variant="caption" tone="muted">{`Tu destino · Piso ${piso}`}</Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Icon name="arrow-up-outline" size={22} color={colors.ink} />
      </View>
      <View style={{ backgroundColor: colors.ink, padding: space[4], gap: space[1] }}>
        <Text variant="label" style={{ color: colors.goldOnDark }}>
          {origen}
        </Text>
        <Text variant="caption" tone="mutedOnDark">
          Estás aquí
        </Text>
      </View>
    </View>
  );
}

export function VisitaSections({
  v,
  now,
  section,
  onExit,
  onMembership,
}: {
  v: PaseVisita;
  now: number;
  section: Exclude<VisitaSection, 'inicio'>;
  onExit?: () => void;
  onMembership?: () => void;
}) {
  const [ruta, setRuta] = useState(false);
  const [leidos, setLeidos] = useState<string[]>([]);
  const externo = v.tipo === 'externo';
  const destino = (externo ? v.datos.area : v.datos.lugar) ?? 'Recepción';
  const piso = /(?:piso|nivel)\s*(-?\d+)/i.exec(destino)?.[1] ?? '1';
  const responsable = externo ? v.datos.supervisor : v.datos.anfitrion;
  const pasos = [
    externo
      ? 'Anúnciate en recepción de proveedores.'
      : 'Muestra tu pase en la recepción principal.',
    externo
      ? 'Espera la confirmación de tu supervisor antes de continuar.'
      : 'Sigue el pasillo central desde recepción.',
    `Dirígete a ${destino}, piso ${piso}, con el acompañamiento del equipo del club.`,
  ];
  const avisos: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'person-outline',
      title: responsable
        ? `${externo ? 'Tu supervisor' : 'Te invita'} ${responsable}`
        : 'Tu visita',
      text: externo
        ? [v.datos.empresa, v.datos.orden].filter(Boolean).join(' · ') ||
          'Consulta con tu responsable en recepción.'
        : `Te esperamos en ${destino}.`,
    },
    {
      icon: 'time-outline',
      title: externo ? 'Horario autorizado' : 'Horario de tu visita',
      text: horarioTexto(v.vigencia),
    },
    { icon: 'location-outline', title: externo ? 'Área de trabajo' : 'Tu destino', text: destino },
    {
      icon: 'qr-code-outline',
      title: 'Muestra tu QR al robot',
      text:
        v.vigencia.estado === 'vigente'
          ? 'El robot te recibirá en la entrada. Validará tu pase al llegar.'
          : 'Consulta la vigencia de tu pase en Inicio antes de presentarte.',
    },
  ];
  const filas: FilaDato[] = [
    { icon: 'time-outline', etiqueta: 'Vigencia del pase', valor: validezTexto(v.vigencia, now) },
    ...(responsable
      ? [
          {
            icon: 'person-outline' as const,
            etiqueta: externo ? 'Supervisor' : 'Anfitrión',
            valor: responsable,
          },
        ]
      : []),
    ...(externo && v.datos.empresa
      ? [{ icon: 'business-outline' as const, etiqueta: 'Empresa', valor: v.datos.empresa }]
      : []),
    ...(externo && v.datos.orden
      ? [
          {
            icon: 'document-text-outline' as const,
            etiqueta: 'Orden de trabajo',
            valor: v.datos.orden,
          },
        ]
      : []),
    {
      icon: 'location-outline',
      etiqueta: externo ? 'Área autorizada' : 'Sala',
      valor: destino,
    },
  ];
  return (
    <>
      <Encabezado
        titulo={
          section === 'mapa' ? 'Mapa del club' : section === 'mensajes' ? 'Mensajes' : 'Mi perfil'
        }
        subtitulo={section === 'mapa' ? 'Tu recorrido desde recepción' : undefined}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: space[4],
          paddingBottom: space[6],
          gap: space[5],
        }}
      >
        {section === 'mapa' ? (
          <>
            <PlanoClub
              destino={destino}
              piso={piso}
              origen={externo ? 'Recepción de proveedores' : 'Recepción principal'}
            />
            <View style={{ gap: space[4] }}>
              <Button label="Cómo llegar" fullWidth onPress={() => setRuta(!ruta)} />
              {ruta
                ? pasos.map((paso, i) => (
                    <Text key={paso}>
                      {`${i + 1}. `}
                      <Text>{paso}</Text>
                    </Text>
                  ))
                : null}
            </View>
          </>
        ) : section === 'mensajes' ? (
          <View>
            {avisos.map((aviso, i) => (
              <Touchable
                key={aviso.title}
                label={`${aviso.title}. ${aviso.text}. ${leidos.includes(aviso.title) ? 'Leído' : 'No leído'}`}
                onPress={() => setLeidos([...leidos, aviso.title])}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
                  paddingVertical: space[4],
                  flexDirection: 'row',
                  gap: space[3],
                  borderBottomWidth: i === avisos.length - 1 ? 0 : 1,
                  borderBottomColor: FINA,
                })}
              >
                <Icon name={aviso.icon} size={20} color={colors.gold} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="label">{aviso.title}</Text>
                  <Text variant="caption" tone="muted">
                    {aviso.text}
                  </Text>
                </View>
                {!leidos.includes(aviso.title) ? (
                  <View
                    accessibilityLabel="No leído"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: colors.gold,
                      marginTop: space[2],
                    }}
                  />
                ) : null}
              </Touchable>
            ))}
          </View>
        ) : (
          <>
            <Text variant="display" level={2}>
              {v.pase.nombre}
            </Text>
            <Datos filas={filas} />
            {onMembership && !externo ? (
              <Touchable
                label="Membresía. Conoce los niveles y pide información"
                onPress={onMembership}
                style={{
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: FINA,
                }}
              >
                <Icon name="ribbon-outline" size={22} color={colors.gold} />
                <Text variant="label" style={{ flex: 1 }}>
                  Membresía
                </Text>
                <Icon name="chevron-forward-outline" size={20} color={colors.ink} />
              </Touchable>
            ) : null}
            <Button label="Salir de la visita" variant="secondary" fullWidth onPress={onExit} />
          </>
        )}
      </ScrollView>
    </>
  );
}
