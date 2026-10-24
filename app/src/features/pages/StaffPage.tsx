import type { Person, Visit } from '../../infrastructure/contracts';
import { clientFor, useApi } from '../data/api';
import { VISIT_LABEL, clockOf, firstName, permitDayName, timeLabel, weekdayOf } from '../data/view';
import { StaffScreen, type StaffCardKey } from '../screens/StaffScreen';

/** Staff member of the demo (docs/api/CONTRACT.md §3). */
const STAFF_ID = 'V-204';

const isOpen = (v: Visit) => v.state !== 'CLOSED' && v.state !== 'FAILED';

export type StaffPageProps = { onViewActivities: () => void };

/** `/personal`: Mario's private shift, his own entry and the external workers of the day. */
export function StaffPage({ onViewActivities }: StaffPageProps) {
  const once = { pollMs: 0 };
  const clock = useApi(() => clientFor(STAFF_ID).getHealth(), [], once);
  const person = useApi(() => clientFor(STAFF_ID).getPerson(STAFF_ID), [], once);
  const externals = useApi(() => clientFor(STAFF_ID).listPeople({ role: 'EXTERNAL' }), [], once);
  const visits = useApi(() => clientFor(STAFF_ID).listVisits({ limit: 200 }), []);

  const day = clock.data ? clockOf(clock.data).day : undefined;
  const me: Person | undefined = person.data;
  const shift = me?.staff?.shifts.find((s) => s.date === day);
  const open = (visits.data?.items ?? []).filter(isOpen);
  const mine = open.find((v) => v.visitor.personId === STAFF_ID);
  const visitStatusOf = (id: string) => {
    const v = open.find((x) => x.visitor.personId === id);
    return v ? { visitStatus: VISIT_LABEL[v.state].label } : {};
  };

  const failed = (q: { error?: string; data?: unknown }) => (q.data ? undefined : q.error);
  const errors: Partial<Record<StaffCardKey, string>> = {
    ...(failed(person)
      ? { agenda: failed(person) as string, shift: failed(person) as string }
      : {}),
    // A staff member without a shift today is not a failure of the service: the card says so.
    ...(me && day && !shift && !failed(person) ? { shift: 'STAFF_SHIFT_INACTIVE' } : {}),
    ...(failed(visits) ? { entry: failed(visits) as string } : {}),
    ...(failed(externals) ? { providers: failed(externals) as string } : {}),
  };
  const department = me?.staff?.department ?? '';
  const retry: Record<StaffCardKey, () => Promise<void>> = {
    agenda: person.refresh,
    shift: person.refresh,
    entry: visits.refresh,
    providers: externals.refresh,
  };

  return (
    <StaffScreen
      name={me ? firstName(me.displayName) : 'Mario'}
      reference={STAFF_ID}
      day={day ? weekdayOf(day) : ''}
      agenda={
        shift
          ? [
              {
                id: 'shift-start',
                time: timeLabel(shift.from),
                dateTime: shift.from,
                title: 'Inicio de turno',
                place: department,
              },
              {
                id: 'shift-end',
                time: timeLabel(shift.to),
                dateTime: shift.to,
                title: 'Fin de turno',
                place: department,
              },
            ]
          : []
      }
      shiftLabel={
        shift
          ? `${department} · turno de ${timeLabel(shift.from)} a ${timeLabel(shift.to)}`
          : department
      }
      providers={(externals.data?.items ?? []).map((p) => ({
        id: p.id,
        name: firstName(p.displayName),
        service: p.external?.company ?? '',
        permittedDay: day && p.external ? permitDayName(p.external.permit, day) : '',
        ...visitStatusOf(p.id),
      }))}
      {...visitStatusOf(STAFF_ID)}
      // ponytail: the contract does not record the robot's private summary; an orientation under
      // way is the closest signal. Add a field to the visit if the summary must be exact.
      summaryReceived={mine?.state === 'ORIENTING' || mine?.state === 'IN_PROGRESS'}
      status={(person.loading && !me) || (clock.loading && !clock.data) ? 'loading' : 'ready'}
      errors={errors}
      onRetry={(card) => void retry[card]()}
      onViewActivities={onViewActivities}
    />
  );
}
