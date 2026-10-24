// Piezas compartidas de las pantallas del invitado con QR: listas con separador fino, avisos y esqueleto.
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Button,
  Icon,
  Logo,
  Skeleton,
  Text,
  Touchable,
  colors,
  fonts,
  space,
  type IconName,
} from '../../design-system';

/** Línea negra de 1 px del skin N Club Luxury. */
export const FINA = colors.border;

/** Título de pantalla: Geist en negrita, sin adornos (el serif queda para saludos y nombres). */
export function Encabezado({
  titulo,
  subtitulo,
  onBack,
}: {
  titulo: string;
  subtitulo?: string;
  onBack?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingHorizontal: space[4],
        paddingTop: space[4],
        paddingBottom: space[3],
        minHeight: 56,
      }}
    >
      {onBack ? (
        <Touchable
          label="Volver"
          onPress={onBack}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevron-back-outline" size={22} color={colors.ink} />
        </Touchable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          level={1}
          style={{ fontFamily: fonts.bodyStrong, fontSize: 20, lineHeight: 26, color: colors.ink }}
        >
          {titulo}
        </Text>
        {subtitulo ? (
          <Text variant="caption" tone="muted">
            {subtitulo}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Cabecera de marca del pase: el sello con la palabra N CLUB y una línea dorada debajo. */
export function Marca() {
  return (
    <View style={{ paddingHorizontal: space[4], paddingTop: space[4], gap: space[3] }}>
      <View aria-hidden>
        <Logo size={32} wordmark="row" />
      </View>
      <View aria-hidden style={{ height: 1, backgroundColor: colors.gold, opacity: 0.6 }} />
    </View>
  );
}

/** Cuerpo desplazable; `pie` queda fijo abajo, en la zona del pulgar. */
export function Cuerpo({ children, pie }: { children: ReactNode; pie?: ReactNode }) {
  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space[4],
          paddingTop: space[4],
          paddingBottom: space[6],
          gap: space[5],
        }}
      >
        {children}
      </ScrollView>
      {pie ? (
        <View
          style={{
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            backgroundColor: colors.ivory,
            borderTopWidth: 1,
            borderTopColor: FINA,
          }}
        >
          {pie}
        </View>
      ) : null}
    </>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[3] }}>
      <Text style={{ fontFamily: fonts.bodyStrong, fontSize: 16, lineHeight: 22 }}>{titulo}</Text>
      {children}
    </View>
  );
}

/** Saludo en Bodoni, centrado: «Bienvenida, / Laura». */
export function Saludo({ saludo, nombre }: { saludo: string; nombre: string }) {
  return (
    <Text variant="display" level={1} align="center">
      {`${saludo},\n${nombre}`}
    </Text>
  );
}

/** QR con marco dorado recto sobre fondo blanco. */
export function MarcoQr({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        alignSelf: 'center',
        padding: space[3],
        borderWidth: 1,
        borderColor: colors.gold,
        backgroundColor: colors.white,
      }}
    >
      {children}
    </View>
  );
}

export type FilaDato = { icon: IconName; etiqueta: string; valor: string };

/** Lista de datos: ícono dorado, etiqueta pequeña y valor, separados por una línea negra fina. */
export function Datos({ filas }: { filas: readonly FilaDato[] }) {
  return (
    <View>
      {filas.map((f, i) => (
        <View
          key={f.etiqueta}
          style={{
            flexDirection: 'row',
            gap: space[3],
            alignItems: 'flex-start',
            paddingVertical: space[3],
            borderBottomWidth: i === filas.length - 1 ? 0 : 1,
            borderBottomColor: FINA,
          }}
        >
          <Icon name={f.icon} size={20} color={colors.gold} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" tone="muted">
              {f.etiqueta}
            </Text>
            <Text variant="label" selectable>
              {f.valor}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const tonos = {
  success: { borde: colors.gold, fg: 'default', icon: 'checkmark-circle-outline' },
  warning: { borde: colors.ink, fg: 'default', icon: 'alert-circle-outline' },
  danger: { borde: colors.danger, fg: 'danger', icon: 'alert-circle-outline' },
} as const;

/** Aviso anunciado por los lectores de pantalla: cambio de acompañante, ayuda enviada, sin conexión. */
export function Nota({
  tono,
  titulo,
  icon,
  children,
}: {
  tono: keyof typeof tonos;
  titulo: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  const t = tonos[tono];
  return (
    <View
      role="status"
      accessibilityLiveRegion="polite"
      style={{
        borderWidth: 1,
        borderColor: t.borde,
        padding: space[4],
        gap: space[3],
        flexDirection: 'row',
        alignItems: 'flex-start',
      }}
    >
      <Icon
        name={icon ?? t.icon}
        size={22}
        color={tono === 'danger' ? colors.danger : colors.gold}
      />
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="label" tone={t.fg}>
          {titulo}
        </Text>
        {children ? <Text style={{ fontSize: 15, lineHeight: 22 }}>{children}</Text> : null}
      </View>
    </View>
  );
}

/** Esqueleto con la forma de la pantalla mientras llega el pase. */
export function Cargando() {
  return (
    <>
      <Marca />
      <View
        accessibilityLabel="Cargando tu visita"
        role="progressbar"
        style={{ paddingHorizontal: space[4], paddingTop: space[5], gap: space[5] }}
      >
        <Skeleton height={96} />
        <Skeleton height={260} />
      </View>
    </>
  );
}

/** Enlace malo, vencido o sin red: qué pasó y qué hacer. */
export function ErrorDelPase({
  titulo,
  texto,
  onReintentar,
}: {
  titulo: string;
  texto: string;
  onReintentar?: () => void;
}) {
  return (
    <>
      <Marca />
      <View style={{ paddingHorizontal: space[4], paddingTop: space[5], gap: space[4] }}>
        <View
          role="alert"
          style={{
            borderWidth: 1,
            borderColor: colors.danger,
            padding: space[5],
            gap: space[2],
          }}
        >
          <Text variant="label" tone="danger">
            {titulo}
          </Text>
          <Text>{texto}</Text>
        </View>
        {onReintentar ? (
          <Button label="Reintentar" size="lg" fullWidth onPress={onReintentar} />
        ) : null}
      </View>
    </>
  );
}
