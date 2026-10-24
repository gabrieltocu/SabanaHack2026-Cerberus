import { useRef, useState } from 'react';
import { DATA_MODE, clientFor, errorCode, useApi } from '../data/api';
import { clockOf, firstName, longDateLabel, toProfiles } from '../data/view';
import { ARRIVING_VISITORS, SIMULATED_DATES } from '../demo/fixtures';
import { ProfileSelector } from '../demo/ProfileSelector';

export const DEFAULT_DATE = SIMULATED_DATES[0]?.value ?? '2026-10-24';

/** Host of the sample invitation that `POST /demo/reset` leaves active (docs/api/CONTRACT.md §4); it lists its own. */
const SAMPLE_HOST = 'V-209';

const withDate = (href: string, date: string) =>
  date === DEFAULT_DATE ? href : `${href}${href.includes('?') ? '&' : '?'}fecha=${date}`;

/**
 * `/`: cover and profile selector, loaded from the API. The simulated date is the demo clock:
 * changing it resets the demo at 09:00 of that day, and it travels to the next route as `?fecha=`.
 */
export function HomeScreen({ onNavigate }: { onNavigate: (href: string) => void }) {
  const people = useApi(() => clientFor().listPeople(), [], { pollMs: 0 });
  const health = useApi(() => clientFor().getHealth(), [], { pollMs: 0 });
  const visits = useApi(() => clientFor().listVisits({ limit: 200 }), []);
  // The API seeds the sample invitation before answering anything; its host reads its own.
  const sample = useApi(() => clientFor(SAMPLE_HOST).listInvitations({ hostId: SAMPLE_HOST }), []);
  const [notice, setNotice] = useState<string>();
  const [failure, setFailure] = useState<string>();
  // One reset at a time: a second press (or another date) while one is in flight does nothing.
  const [resetting, setResetting] = useState(false);
  const inFlight = useRef(false);

  const clock = health.data ? clockOf(health.data) : undefined;
  const date = clock && SIMULATED_DATES.some((d) => d.value === clock.day) ? clock.day : undefined;
  const refreshAll = () => Promise.all([health, visits, sample, people].map((q) => q.refresh()));

  const reset = async (now: string | undefined, done: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setResetting(true);
    setFailure(undefined);
    setNotice(undefined);
    try {
      await clientFor().resetDemo(now ? { now } : undefined);
      await refreshAll();
      setNotice(done);
    } catch (e) {
      setFailure(errorCode(e));
    } finally {
      inFlight.current = false;
      setResetting(false);
    }
  };

  const invitation = sample.data?.items[0];
  // «En curso»: an expected guest (the sample invitation) has not arrived yet.
  const open = visits.data?.items.filter(
    (v) => !['EXPECTED', 'CLOSED', 'FAILED'].includes(v.state),
  );
  const info = [
    DATA_MODE === 'api'
      ? `Modo API · almacenamiento: ${health.data?.storage ?? '…'}`
      : `Datos en este navegador · almacenamiento: ${health.data?.storage ?? '…'}`,
    ...(clock ? [`Fecha de trabajo: ${longDateLabel(clock.day)}`] : []),
  ];

  return (
    <ProfileSelector
      status={people.data ? 'ready' : people.error ? 'error' : 'loading'}
      onRetry={() => void people.refresh()}
      profiles={toProfiles(people.data?.items ?? [])}
      onSelect={(p) => onNavigate(withDate(p.href, date ?? DEFAULT_DATE))}
      onEnter={() => onNavigate('/entrar?cuenta=concierge@nclub.demo')}
      onBack={() => onNavigate('/entrar')}
      arriving={ARRIVING_VISITORS}
      samplePass={
        invitation
          ? {
              title: `${firstName(invitation.guest.fullName)} · pase de invitado`,
              onOpen: () => onNavigate(`/pase/${invitation.qr.token}`),
            }
          : undefined
      }
      dates={SIMULATED_DATES}
      date={date ?? ''}
      onDateChange={(v) => {
        const label = SIMULATED_DATES.find((d) => d.value === v)?.label ?? v;
        void reset(`${v}T09:00:00-05:00`, `Fecha de trabajo: ${label}.`);
      }}
      onReset={() => void reset(undefined, 'Datos reiniciados.')}
      busy={resetting}
      notice={notice}
      errorCode={failure}
      infoLines={info}
      activeVisits={open?.length ?? 0}
      onOpenDesign={() => onNavigate('/design')}
    />
  );
}
