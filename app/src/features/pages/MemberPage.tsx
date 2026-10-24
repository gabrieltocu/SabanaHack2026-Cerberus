import { Screen } from '../../design-system';
import { clientFor, errorCode, useApi } from '../data/api';
import {
  MEMBER_NAMES,
  clockOf,
  memberId,
  shortName,
  toActivities,
  toInvitationSummary,
  toVisitSummary,
} from '../data/view';
import { MemberScreen, type MemberCardKey } from '../screens/MemberScreen';
import { CATEGORY_LABEL } from '../shared/labels';
import { ErrorNotice } from '../shared/notices';
import type { MemberView } from '../types';

export type MemberPageProps = {
  /** Directory id of the member (`V-201`, `V-202`); anything else falls back to the first. */
  perfil?: string;
  onInvite: (hostId: string) => void;
  onViewActivities: () => void;
  onOpenPass: (href: string) => void;
};

/** `/socio`: the member's real day. Each card loads and fails on its own. */
export function MemberPage({ perfil, onInvite, onViewActivities, onOpenPass }: MemberPageProps) {
  const id = memberId(perfil);
  // Static data loads once; only the visit and the invitations follow other tabs every 3 s.
  const once = { pollMs: 0 };
  const clock = useApi(() => clientFor(id).getHealth(), [id], once);
  const person = useApi(() => clientFor(id).getPerson(id), [id], once);
  const invitations = useApi(() => clientFor(id).listInvitations({ hostId: id }), [id]);
  const activities = useApi(() => clientFor(id).listActivities(), [id], once);
  const visits = useApi(() => clientFor(id).listVisits({ limit: 200 }), [id]);
  const mine = visits.data?.items.find((v) => v.visitor.personId === id);
  // Who walks the visit is looked up only when there is one.
  const ownerId = mine?.ownerId ?? undefined;
  const owner = useApi(
    async () => (ownerId ? clientFor(id).getPerson(ownerId) : undefined),
    [id, ownerId],
    once,
  );

  if (person.error && !person.data) {
    return (
      <Screen>
        <ErrorNotice code={person.error} onRetry={() => void person.refresh()} />
      </Screen>
    );
  }

  const tier = person.data?.membership?.tier;
  const destination = person.data?.defaultDestination;
  const member: MemberView = {
    profile: {
      id,
      name: person.data ? shortName(person.data) : (MEMBER_NAMES[id] ?? ''),
      roleLabel: '',
      ...(tier ? { category: tier } : {}),
      href: '',
    },
    badgeLabel: tier ? CATEGORY_LABEL[tier] : '',
    today: destination ? `Tu destino habitual: ${destination}` : 'Sin destino registrado',
    ...(mine
      ? { visit: toVisitSummary(mine, owner.data ? shortName(owner.data) : undefined) }
      : {}),
    invitations: (invitations.data?.items ?? []).map(toInvitationSummary),
  };
  const retry: Record<MemberCardKey, () => Promise<void>> = {
    visit: visits.refresh,
    invitations: invitations.refresh,
    activities: activities.refresh,
  };
  // A card shows its error only when it has nothing older to show.
  const errors: Partial<Record<MemberCardKey, string>> = {
    ...(visits.error && !visits.data ? { visit: visits.error } : {}),
    ...(invitations.error && !invitations.data ? { invitations: invitations.error } : {}),
    ...(activities.error && !activities.data ? { activities: activities.error } : {}),
  };

  return (
    <MemberScreen
      key={id}
      member={member}
      activities={toActivities(activities.data?.items ?? [])}
      hour={clock.data ? clockOf(clock.data).hour : 10}
      status={person.loading && !person.data ? 'loading' : 'ready'}
      errors={errors}
      onRetry={(card) => void retry[card]()}
      onInvite={() => onInvite(id)}
      onViewActivities={onViewActivities}
      onOpenPass={(i) => onOpenPass(`/pase/${i.token}`)}
      onCancelInvitation={async (i) => {
        try {
          await clientFor(id).cancelInvitation(i.id);
          return undefined;
        } catch (e) {
          return errorCode(e);
        } finally {
          void Promise.all([invitations.refresh(), visits.refresh()]);
        }
      }}
      onSubmitFeedback={async (v) => {
        if (!mine) return undefined;
        try {
          await clientFor(id).submitFeedback(mine.id, {
            ...(v.robot !== undefined ? { robotRating: v.robot } : {}),
            ...(v.club !== undefined ? { clubRating: v.club } : {}),
            ...(v.comment ? { clubComment: v.comment } : {}),
          });
          return undefined;
        } catch (e) {
          return errorCode(e);
        }
      }}
    />
  );
}
