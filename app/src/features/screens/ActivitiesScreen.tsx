import { View } from 'react-native';
import { Button, Card, EmptyState, Screen, Skeleton, Text, space } from '../../design-system';
import { Grid } from '../shared/Grid';
import { PageHeader } from '../shared/PageHeader';
import { TimeText } from '../shared/TimeText';
import { ErrorNotice, Notice } from '../shared/notices';
import type { Activity } from '../types';

export type ActivitiesScreenProps = {
  activities: readonly Activity[];
  /** Simulated date, already formatted: «Sábado 24 oct 2026». */
  dateLabel: string;
  /** `kiosk`: arrived from the robot's destination question, where «Ir ahí» sets the destination. */
  mode?: 'browse' | 'kiosk';
  status?: 'ready' | 'loading';
  errorCode?: string;
  onRetry?: () => void;
  onBack: () => void;
  onGo?: (activity: Activity) => void;
  /** Destination confirmed from the kiosk (G6). */
  notice?: string;
};

/** `/actividades`: today's activities loaded by authorised staff. Internal staff events never appear. */
export function ActivitiesScreen({
  activities,
  dateLabel,
  mode = 'browse',
  status = 'ready',
  errorCode,
  onRetry,
  onBack,
  onGo,
  notice,
}: ActivitiesScreenProps) {
  const kiosk = mode === 'kiosk';
  return (
    <Screen>
      <PageHeader title="Hoy en el club" eyebrow={dateLabel} backLabel="Volver" onBack={onBack} />
      {notice ? <Notice>{notice}</Notice> : null}
      {status === 'loading' ? (
        <Grid>
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton height={22} width="60%" />
              <Skeleton height={16} />
            </Card>
          ))}
        </Grid>
      ) : errorCode ? (
        <ErrorNotice code={errorCode} onRetry={onRetry} />
      ) : activities.length === 0 ? (
        <EmptyState
          title="Hoy no hay actividades registradas."
          actionLabel={kiosk ? 'Volver' : undefined}
          onAction={kiosk ? onBack : undefined}
        />
      ) : (
        <View role="list">
          <Grid minWidth={340}>
            {activities.map((a) => (
              <Card key={a.id} role="listitem">
                <Text variant="h3">{a.name}</Text>
                <Text>{a.place}</Text>
                <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
                  <TimeText variant="label">{a.time}</TimeText>
                  {a.capacity ? (
                    <Text variant="label" tone="muted">
                      {a.capacity}
                    </Text>
                  ) : null}
                </View>
                {kiosk && onGo ? (
                  <Button
                    label="Ir ahí"
                    accessibilityLabel={`Ir a ${a.name}`}
                    onPress={() => onGo(a)}
                  />
                ) : null}
              </Card>
            ))}
          </Grid>
        </View>
      )}
      <View style={{ gap: space[2] }}>
        <Text variant="caption" tone="muted">
          Las actividades las carga el personal autorizado del club.
        </Text>
      </View>
    </Screen>
  );
}
