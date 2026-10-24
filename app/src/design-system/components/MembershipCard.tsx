import { View, type ViewProps } from 'react-native';
import { colors, fonts, space } from '../tokens';
import { Text } from './Text';

export type MembershipCardProps = Omit<ViewProps, 'children'> & {
  name: string;
  /** «Socio VIP», «Socia regular». */
  tierLabel: string;
  /** Directory id or member number, printed small. */
  memberId?: string;
  /** Already formatted: «Vigente hasta dic 2026». */
  validity?: string;
  /** Wordmark at the top-left. */
  brand?: string;
};

/** Black card with a gold hairline and square corners: the member's digital card. Decorative N watermark. */
export function MembershipCard({
  name,
  tierLabel,
  memberId,
  validity,
  brand = 'N Club',
  style,
  ...rest
}: MembershipCardProps) {
  return (
    <View
      accessible
      accessibilityLabel={`Tarjeta de socio: ${name}, ${tierLabel}${validity ? `, ${validity}` : ''}`}
      {...rest}
      style={[
        {
          backgroundColor: colors.forest,
          padding: space[5],
          minHeight: 176,
          justifyContent: 'space-between',
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.gold,
        },
        style,
      ]}
    >
      <Text
        aria-hidden
        accessible={false}
        style={{
          position: 'absolute',
          right: -8,
          bottom: -44,
          fontFamily: fonts.display,
          fontSize: 190,
          lineHeight: 210,
          color: colors.gold,
          opacity: 0.14,
        }}
      >
        N
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3" tone="onDark">
          {brand}
        </Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.gold,
            paddingHorizontal: space[3],
            paddingVertical: 2,
          }}
        >
          <Text variant="label" tone="onDark">
            {tierLabel}
          </Text>
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="title" tone="onDark">
          {name}
        </Text>
        {memberId || validity ? (
          <Text variant="caption" tone="mutedOnDark">
            {[memberId, validity].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
