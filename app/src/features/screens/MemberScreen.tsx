import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, Screen, Skeleton, Text, space } from '../../design-system';
import { Grid } from '../shared/Grid';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Heading } from '../shared/Heading';
import { greetingFor } from '../shared/dates';
import { ErrorNotice, Notice } from '../shared/notices';
import type { Activity, InvitationStatus, InvitationSummary, MemberView } from '../types';
import { FeedbackForm, type FeedbackValues } from '../visits/FeedbackForm';

export type MemberCardKey = 'visit' | 'invitations' | 'activities';

export type MemberScreenProps = {
  member: MemberView;
  activities: readonly Activity[];
  /** Hour of the simulated clock in America/Bogota (0–23): picks «Buenos días / tardes / noches». */
  hour: number;
  status?: 'ready' | 'loading';
  /** A failure confined to one card, so the rest of the page stays useful. */
  errors?: Partial<Record<MemberCardKey, string>>;
  onRetry?: (card: MemberCardKey) => void;
  /** Success line shown in the invitations card after coming back from creating one. */
  invitationNotice?: string;
  onInvite: () => void;
  onViewActivities: () => void;
  /** Sends the rating; may resolve with the stable error code when the service refuses. */
  onSubmitFeedback?: (values: FeedbackValues) => void | Promise<string | void>;
  /** Cancels an invitation; resolves with the stable error code when it does not proceed. */
  onCancelInvitation?: (invitation: InvitationSummary) => Promise<string | undefined>;
  onOpenPass?: (invitation: InvitationSummary) => void;
};

const INVITATION_BADGE: Record<
  InvitationStatus,
  { label: string; kind: 'success' | 'neutral' | 'warning' | 'danger' }
> = {
  ACTIVE: { label: 'Vigente', kind: 'success' },
  USED: { label: 'Usada', kind: 'neutral' },
  EXPIRED: { label: 'Vencida', kind: 'warning' },
  CANCELLED: { label: 'Cancelada', kind: 'danger' },
};

/** `/socio`: the member's day at a glance. Greeting first, then visit, invitations, activities. */
export function MemberScreen({
  member,
  activities,
  hour,
  status = 'ready',
  errors = {},
  onRetry,
  invitationNotice,
  onInvite,
  onViewActivities,
  onSubmitFeedback,
  onCancelInvitation,
  onOpenPass,
}: MemberScreenProps) {
  const { profile, visit, invitations } = member;
  const [rating, setRating] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState<InvitationSummary>();
  const [cancelResult, setCancelResult] = useState<{ code?: string; notice?: string }>({});
  const loading = status === 'loading';
  const needsFeedback = visit?.closed === true && !visit.feedbackSent;

  const retry = (card: MemberCardKey) => (onRetry ? () => onRetry(card) : undefined);
  const skeleton = (
    <View style={{ gap: space[3] }} accessibilityLabel="Cargando">
      <Skeleton height={20} width="60%" />
      <Skeleton height={16} />
      <Skeleton height={16} width="80%" />
    </View>
  );

  return (
    <Screen>
      <View style={{ gap: space[3] }}>
        <Heading variant="h1" focusKey="socio">
          {`${greetingFor(hour)}, ${profile.name}`}
        </Heading>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}
        >
          <Badge kind={profile.category ?? 'REGULAR'} label={member.badgeLabel} />
          <Text variant="label" tone="muted">
            {profile.id}
          </Text>
        </View>
      </View>

      <Button label="Invitar a alguien" size="lg" onPress={onInvite} />

      <Grid>
        <Card>
          <Text variant="h3">Tu visita de hoy</Text>
          {loading ? (
            skeleton
          ) : errors.visit ? (
            <ErrorNotice code={errors.visit} onRetry={retry('visit')} />
          ) : (
            <>
              <Text>{member.today}</Text>
              {visit && !visit.closed ? (
                <View style={{ gap: space[2] }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: space[2],
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Badge kind={visit.statusKind} label={visit.statusLabel} />
                  </View>
                  {visit.responsible ? <Text>{visit.responsible}</Text> : null}
                </View>
              ) : (
                <Text tone="muted">
                  No tienes una visita en curso. Cuando llegues al club, el robot de recepción te
                  reconocerá.
                </Text>
              )}
            </>
          )}
        </Card>

        <Card>
          <Text variant="h3">Mis invitaciones</Text>
          {loading ? (
            skeleton
          ) : errors.invitations ? (
            <ErrorNotice code={errors.invitations} onRetry={retry('invitations')} />
          ) : (
            <>
              {invitationNotice ? <Notice>{invitationNotice}</Notice> : null}
              {invitations.length === 0 ? (
                <Text tone="muted">Aún no has invitado a nadie.</Text>
              ) : (
                <View role="list" style={{ gap: space[3] }}>
                  {invitations.map((i) => (
                    <View key={i.id} role="listitem" style={{ gap: space[1] }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          gap: space[3],
                        }}
                      >
                        <Text variant="label">{i.guestName}</Text>
                        <Badge
                          kind={INVITATION_BADGE[i.status].kind}
                          label={INVITATION_BADGE[i.status].label}
                        />
                      </View>
                      <Text
                        variant="caption"
                        tone="muted"
                      >{`${i.dateLabel} · ${i.meetingPoint}`}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                        {onOpenPass && i.token ? (
                          <Button
                            label="Ver pase"
                            accessibilityLabel={`Ver pase de ${i.guestName}`}
                            variant="ghost"
                            size="sm"
                            onPress={() => onOpenPass(i)}
                          />
                        ) : null}
                        {onCancelInvitation && i.status === 'ACTIVE' ? (
                          <Button
                            label="Cancelar"
                            accessibilityLabel={`Cancelar invitación de ${i.guestName}`}
                            variant="secondary"
                            size="sm"
                            onPress={() => setCancelling(i)}
                          />
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {cancelResult.notice ? <Notice>{cancelResult.notice}</Notice> : null}
              {cancelResult.code ? <ErrorNotice code={cancelResult.code} /> : null}
            </>
          )}
        </Card>

        <Card>
          <Text variant="h3">Hoy en el club</Text>
          {loading ? (
            skeleton
          ) : errors.activities ? (
            <ErrorNotice code={errors.activities} onRetry={retry('activities')} />
          ) : activities.length === 0 ? (
            <Text tone="muted">Hoy no hay actividades registradas.</Text>
          ) : (
            <View role="list" style={{ gap: space[3] }}>
              {activities.slice(0, 3).map((a) => (
                <View key={a.id} role="listitem" style={{ gap: 2 }}>
                  <Text variant="label">{a.name}</Text>
                  <Text variant="caption" tone="muted">
                    {`${a.place} · ${a.time}`}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <Button label="Ver actividades" variant="secondary" onPress={onViewActivities} />
        </Card>

        {needsFeedback ? (
          <Card>
            <Text variant="h3">¿Cómo te fue hoy?</Text>
            {rating ? (
              <>
                <Text tone="muted">
                  Si quieres, cuéntanos cómo te fue con el servicio de los robots y con los
                  servicios del club.
                </Text>
                <FeedbackForm
                  submitLabel="Enviar evaluación"
                  skipLabel="Prefiero no evaluar"
                  sent={feedbackSent}
                  submitting={sending}
                  errorCode={feedbackError}
                  onSubmit={async (v) => {
                    setSending(true);
                    setFeedbackError(undefined);
                    const code = await onSubmitFeedback?.(v);
                    setSending(false);
                    if (code) setFeedbackError(code);
                    else setFeedbackSent(true);
                  }}
                  onSkip={() => setRating(false)}
                />
              </>
            ) : (
              <Button label="Evaluar mi visita" onPress={() => setRating(true)} />
            )}
          </Card>
        ) : null}
      </Grid>

      <ConfirmDialog
        visible={cancelling !== undefined}
        title={`¿Cancelar la invitación de ${cancelling?.guestName ?? ''}?`}
        body="El pase dejará de valer y no se puede reactivar."
        cancelLabel="Mantenerla"
        confirmLabel="Cancelar invitación"
        danger
        onCancel={() => setCancelling(undefined)}
        onConfirm={async () => {
          const target = cancelling;
          setCancelling(undefined);
          if (!target || !onCancelInvitation) return;
          const code = await onCancelInvitation(target);
          setCancelResult(
            code ? { code } : { notice: `Invitación de ${target.guestName} cancelada.` },
          );
        }}
      />
    </Screen>
  );
}
