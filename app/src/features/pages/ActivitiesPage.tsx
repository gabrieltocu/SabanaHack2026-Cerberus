import { clientFor, useApi } from '../data/api';
import { clockOf, longDateLabel, toActivities } from '../data/view';
import { ActivitiesScreen } from '../screens/ActivitiesScreen';

/** `/actividades`: the day's activities as the API lists them, dated by the demo clock. */
export function ActivitiesPage({ onBack }: { onBack: () => void }) {
  const clock = useApi(() => clientFor().getHealth(), [], { pollMs: 0 });
  const activities = useApi(() => clientFor().listActivities(), [], { pollMs: 0 });
  const loading = !activities.data && !activities.error;
  return (
    <ActivitiesScreen
      activities={toActivities(activities.data?.items ?? [])}
      dateLabel={clock.data ? longDateLabel(clockOf(clock.data).day) : ''}
      status={loading ? 'loading' : 'ready'}
      {...(activities.error && !activities.data ? { errorCode: activities.error } : {})}
      onRetry={() => void activities.refresh()}
      onBack={onBack}
    />
  );
}
