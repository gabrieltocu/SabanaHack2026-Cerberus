import { Image, View } from 'react-native';

import { Text, colors, fonts } from '../../../../design-system';

/**
 * The person's photo when the API has one (`uri` from `useFoto`), otherwise their initials in
 * Bodoni on a soft square. `anillo` adds the gold ring of the big avatar (detail, profile).
 */
export function Avatar({
  nombre,
  apellido,
  size = 48,
  uri,
  anillo = false,
}: {
  nombre: string;
  apellido?: string;
  size?: number;
  uri?: string | null;
  anillo?: boolean;
}) {
  const iniciales = `${nombre[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase();
  const cuerpo = uri ? (
    <Image
      source={{ uri }}
      aria-hidden
      accessible={false}
      style={{ width: size, height: size, backgroundColor: colors.surfaceSoft }}
    />
  ) : (
    <View
      aria-hidden
      accessible={false}
      style={{
        width: size,
        height: size,
        backgroundColor: colors.surfaceSoft,
        borderWidth: 1,
        borderColor: colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontFamily: fonts.display,
          fontSize: size * 0.4,
          lineHeight: size * 0.5,
        }}
      >
        {iniciales}
      </Text>
    </View>
  );
  if (!anillo) return cuerpo;
  return (
    <View
      aria-hidden
      accessible={false}
      style={{ padding: 4, borderWidth: 1, borderColor: colors.gold }}
    >
      {cuerpo}
    </View>
  );
}
