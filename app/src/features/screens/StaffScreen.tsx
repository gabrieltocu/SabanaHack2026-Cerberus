import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  AppShell,
  Avatar,
  EmptyState,
  IconButton,
  ListRow,
  radii,
  useInsets,
  type TabItem,
  Button,
  Card,
  Skeleton,
  StatusChip,
  Text,
  space,
} from '../../design-system';
import { messageFor } from '../messages';
import { ORIENTATION } from '../orientation/copy';
import { TimeText } from '../shared/TimeText';
import { ErrorNotice, Notice } from '../shared/notices';

const tabs: readonly TabItem[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline' },
  { key: 'agenda', label: 'Agenda', icon: 'calendar-outline' },
  { key: 'messages', label: 'Mensajes', icon: 'chatbox-outline' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline' },
];

export type StaffCardKey = 'agenda' | 'shift' | 'entry' | 'providers';

export type StaffScreenProps = {
  name: string;
  reference: string;
  /** Weekday of the simulated date, lowercase: `sábado`. Decides who is authorised today. */
  day: string;
  agenda: readonly { id: string; time: string; dateTime: string; title: string; place: string }[];
  shiftLabel: string;
  providers: readonly {
    id: string;
    name: string;
    service: string;
    permittedDay: string;
    /** State of the provider's visit today, when she is already in the club. */
    visitStatus?: string;
  }[];
  /** Visit state when the entry is already open (e.g. «En curso»). */
  visitStatus?: string;
  /** The robot sent the private summary to this phone. */
  summaryReceived?: boolean;
  status?: 'ready' | 'loading';
  /** Failure confined to one card (`STAFF_SHIFT_INACTIVE` goes to the shift card). */
  errors?: Partial<Record<StaffCardKey, string>>;
  onRetry?: (card: StaffCardKey) => void;
  onViewActivities: () => void;
};

/** `/personal`: private agenda and shift for staff, read-only list of today's authorised providers. */
export function StaffScreen({
  name,
  reference,
  day,
  agenda,
  shiftLabel,
  providers,
  visitStatus,
  summaryReceived = false,
  status = 'ready',
  errors = {},
  onRetry,
  onViewActivities,
}: StaffScreenProps) {
  const [tab, setTab] = useState('home');
  const insets = useInsets();
  const department = shiftLabel.split(' · ')[0];
  const loading = status === 'loading';
  const retry = (c: StaffCardKey) => (onRetry ? () => onRetry(c) : undefined);
  const skeleton = (
    <View style={{ gap: space[3] }} accessibilityLabel="Cargando">
      <Skeleton height={20} width="60%" />
      <Skeleton height={16} />
    </View>
  );
  const cardBody = (key: StaffCardKey, body: () => ReactNode) =>
    loading ? (
      skeleton
    ) : errors[key] ? (
      <ErrorNotice code={errors[key]} onRetry={retry(key)} />
    ) : (
      body()
    );

  return (
    <AppShell tabs={{ items: tabs, activeKey: tab, onSelect: setTab }}>
      <View role="main" style={{ flex: 1, minHeight: 0 }}>
        <View
          style={{
            paddingTop: insets.top + space[5],
            paddingHorizontal: space[4],
            paddingBottom: space[5],
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
          }}
        >
          <Avatar name={name} tone="sage" />
          <View style={{ flex: 1, gap: space[1] }}>
            <Text variant="h3" level={1}>{`Hola, ${name}`}</Text>
            <Text
              variant="caption"
              tone="muted"
            >{`Personal del club${department ? ` · ${department}` : ''}`}</Text>
          </View>
          <IconButton
            icon="notifications-outline"
            label="Ver mensajes"
            onPress={() => setTab('messages')}
          />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: space[4],
            paddingBottom: space[6],
            gap: space[4],
          }}
        >
          {tab === 'agenda' ? (
            <>
              <Card
                role="region"
                accessibilityLabel="Mi agenda de hoy"
                style={{ borderRadius: radii.xl, padding: space[4], boxShadow: 'none' }}
              >
                <Text variant="h3">Mi agenda de hoy</Text>
                <Text variant="caption" tone="muted">
                  Solo tú ves esto
                </Text>
                {cardBody('agenda', () =>
                  agenda.length === 0 ? (
                    <Text tone="muted">No tienes eventos hoy.</Text>
                  ) : (
                    <View role="list" style={{ gap: space[3] }}>
                      {agenda.map((e) => (
                        <View key={e.id} role="listitem">
                          <Text>
                            <TimeText variant="label">{e.time}</TimeText>
                            {` · ${e.title} · ${e.place}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ),
                )}
                {summaryReceived ? (
                  <View style={{ gap: space[2] }}>
                    <Notice>Resumen recibido desde recepción.</Notice>
                    <Text tone="muted">{ORIENTATION.STAFF.phases.destination.privateText}</Text>
                  </View>
                ) : null}
              </Card>

              <Button label="Ver actividades de hoy" fullWidth onPress={onViewActivities} />
              <Text variant="caption" tone="muted">
                El resumen de agenda del robot no registra tu asistencia laboral.
              </Text>
            </>
          ) : null}
          {tab === 'home' ? (
            <>
              <Card
                role="region"
                accessibilityLabel="Mi turno"
                style={{ borderRadius: radii.xl, padding: space[4], boxShadow: 'none' }}
              >
                <Text variant="h3">Mi turno</Text>
                <Text variant="caption" tone="muted">
                  Hoy
                </Text>
                {cardBody('shift', () => (
                  <>
                    <Text>{shiftLabel}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                      <StatusChip kind="success" label="En turno" />
                      <StatusChip kind="STAFF" label="Credencial vigente" />
                    </View>
                  </>
                ))}
              </Card>

              <Card
                role="region"
                accessibilityLabel="Mi ingreso de hoy"
                style={{ borderRadius: radii.xl, padding: space[4], boxShadow: 'none' }}
              >
                <Text variant="h3">Mi ingreso de hoy</Text>
                {cardBody('entry', () => (
                  <>
                    <Text tone="muted">
                      Cuando llegues, el robot de recepción confirmará tu credencial y te saludará.
                      Si no necesitas ayuda, sigues por tu cuenta.
                    </Text>
                    {visitStatus ? (
                      <View style={{ gap: space[2] }}>
                        <StatusChip kind="info" label={visitStatus} />
                        <Text>{ORIENTATION.STAFF.destination}</Text>
                      </View>
                    ) : null}
                  </>
                ))}
              </Card>

              <Card
                role="region"
                accessibilityLabel="Proveedores autorizados hoy"
                style={{ borderRadius: radii.xl, padding: space[4], boxShadow: 'none' }}
              >
                <Text variant="h3">Proveedores autorizados hoy</Text>
                {cardBody('providers', () =>
                  providers.length === 0 ? (
                    <Text tone="muted">No hay proveedores autorizados para hoy.</Text>
                  ) : (
                    <View role="list" style={{ gap: space[4] }}>
                      {providers.map((p) => {
                        const allowed = p.permittedDay === day;
                        return (
                          <View
                            key={p.id}
                            role="listitem"
                            style={{
                              flexDirection: 'row',
                              gap: space[3],
                              alignItems: 'flex-start',
                            }}
                          >
                            <Avatar name={p.name} tone={allowed ? 'sage' : 'gold'} />
                            <View style={{ flex: 1, gap: space[1] }}>
                              <Text variant="label">{`${p.name} · ${p.service}`}</Text>
                              <StatusChip
                                kind={allowed ? 'success' : 'danger'}
                                label={allowed ? 'Autorizada hoy' : 'No autorizada hoy'}
                              />
                              {p.visitStatus ? (
                                <Text
                                  variant="caption"
                                  tone="muted"
                                >{`En el club · ${p.visitStatus}`}</Text>
                              ) : null}
                              {allowed ? null : (
                                <Text variant="caption" tone="muted">
                                  {`${messageFor('EXTERNAL_DAY_NOT_ALLOWED', { día: day })} Código: EXTERNAL_DAY_NOT_ALLOWED`}
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ),
                )}
              </Card>
              {summaryReceived ? <Notice>Resumen recibido desde recepción.</Notice> : null}
              <ListRow
                icon="calendar-outline"
                title="Mi agenda de hoy"
                description="Turno y actividades"
                onPress={() => setTab('agenda')}
              />
            </>
          ) : null}
          {tab === 'messages' ? (
            <>
              <Text variant="h2">Mensajes</Text>
              {summaryReceived ? (
                <Card>
                  <Notice>Resumen recibido desde recepción.</Notice>
                  <Text>{ORIENTATION.STAFF.phases.destination.privateText}</Text>
                </Card>
              ) : (
                <EmptyState
                  title="Sin mensajes nuevos"
                  description="Los avisos de recepción aparecerán aquí."
                />
              )}
            </>
          ) : null}
          {tab === 'profile' ? (
            <>
              <Text variant="h2">Mi perfil</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  paddingVertical: space[3],
                }}
              >
                <Avatar name={name} tone="sage" size={64} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="h3">{name}</Text>
                  <Text tone="muted">Personal del club</Text>
                  <Text variant="caption" tone="muted">
                    {reference}
                  </Text>
                </View>
              </View>
              <ListRow
                icon="id-card-outline"
                title="Información laboral"
                description={shiftLabel || 'Sin turno para hoy'}
                onPress={() => setTab('home')}
              />
              <ListRow icon="calendar-outline" title="Mi agenda" onPress={() => setTab('agenda')} />
              <ListRow
                icon="notifications-outline"
                title="Mensajes de recepción"
                onPress={() => setTab('messages')}
              />
            </>
          ) : null}
        </ScrollView>
      </View>
    </AppShell>
  );
}
