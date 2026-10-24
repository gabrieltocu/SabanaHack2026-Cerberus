import { Text as RNText, View } from 'react-native';

import { Icon, colors, fonts } from '../../../design-system';
import { coloresAvatar, iniciales, type Categoria } from '../categorias';

/** Initials on a soft square. Never a photo: the club's faces stay with the robot. */
export function Avatar({
  nombre,
  categoria,
  size = 48,
}: {
  nombre?: string | null;
  categoria?: Categoria;
  size?: number;
}) {
  const c = coloresAvatar(categoria);
  const letras = iniciales(nombre);
  return (
    <View
      aria-hidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.bg,
      }}
    >
      {letras ? (
        <RNText
          style={{
            fontFamily: fonts.bodyStrong,
            fontSize: Math.round(size * 0.36),
            lineHeight: Math.round(size * 0.5),
            color: c.fg,
          }}
        >
          {letras}
        </RNText>
      ) : (
        <Icon name="person-outline" size={Math.round(size * 0.5)} color={colors.ink} />
      )}
    </View>
  );
}
