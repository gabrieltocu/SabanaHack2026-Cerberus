import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Divider, Text, space } from '../../design-system';
import { Heading } from './Heading';

/** Back link, optional eyebrow and the page title (which takes focus when the page opens). */
export function PageHeader({
  title,
  eyebrow,
  backLabel,
  onBack,
  children,
}: {
  title: string;
  eyebrow?: string;
  backLabel?: string;
  onBack?: () => void;
  children?: ReactNode;
}) {
  return (
    <View style={{ gap: space[3] }}>
      {backLabel && onBack ? (
        // The ghost button carries its own padding: pull it back so the arrow aligns with the title.
        <View style={{ marginLeft: -space[4] }}>
          <Button label={`← ${backLabel}`} variant="ghost" size="sm" onPress={onBack} />
        </View>
      ) : null}
      {eyebrow ? (
        <Text variant="eyebrow" tone="muted">
          {eyebrow}
        </Text>
      ) : null}
      <Divider variant="accent" />
      <Heading variant="h1" focusKey={title}>
        {title}
      </Heading>
      {children}
    </View>
  );
}
