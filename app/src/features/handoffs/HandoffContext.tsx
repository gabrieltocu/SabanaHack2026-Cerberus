import { View } from 'react-native';
import { StatusChip, Card, Text, space, useBreakpoint } from '../../design-system';
import { CATEGORY_LABEL } from '../shared/labels';
import type { HandoffContextData } from '../types';

function Row({ label, children }: { label: string; children: string }) {
  return (
    <View style={{ gap: 2, flexBasis: 240, flexGrow: 1 }}>
      <Text variant="eyebrow" tone="muted">
        {label}
      </Text>
      <Text>{children}</Text>
    </View>
  );
}

/**
 * What the attendant receives so the visitor does not have to repeat anything: who, where to,
 * what they are allowed, what they asked for and how far the visit got. Nothing beyond that.
 */
export function HandoffContext({ context }: { context: HandoffContextData }) {
  const { isTablet } = useBreakpoint();
  return (
    <Card variant="soft" role="region" accessibilityLabel="Contexto de la visita">
      <Text variant="h3">Contexto de la visita</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Text variant="label">
          {context.reference
            ? `${context.visitorName} · ${context.reference}`
            : context.visitorName}
        </Text>
        <StatusChip kind={context.category} label={CATEGORY_LABEL[context.category]} />
      </View>
      <View style={{ flexDirection: isTablet ? 'row' : 'column', flexWrap: 'wrap', gap: space[4] }}>
        <Row label="Destino confirmado">{context.destination}</Row>
        <Row label="Permisos vigentes">{context.permissions.join(', ')}</Row>
        <Row label="Preferencias">
          {context.preferences.length ? context.preferences.join(', ') : 'Ninguna registrada'}
        </Row>
        {context.lastPoint ? <Row label="Último punto confirmado">{context.lastPoint}</Row> : null}
        <Row label="Avance">{context.progress}</Row>
      </View>
    </Card>
  );
}
