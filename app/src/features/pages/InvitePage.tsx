import { Screen } from '../../design-system';
import { clientFor, errorCode, useApi } from '../data/api';
import { MEMBER_NAMES, clockOf, memberId, shortName, toPassView } from '../data/view';
import { InviteScreen } from '../screens/InviteScreen';
import { copyText } from '../shared/clipboard';
import { ErrorNotice } from '../shared/notices';

/** Meeting points the club offers; the API takes free text, so the list lives with the form. */
export const MEETING_POINTS = ['Terraza', 'Salón reservado', 'Cancha de tenis'] as const;

export type InvitePageProps = {
  /** Directory id of the host (`V-201`, `V-202`); anything else falls back to the first. */
  perfil?: string;
  onBack: () => void;
  onOpenPass: (href: string) => void;
};

/** `/socio/invitar`: creates the invitation through the API and keeps the typed data on errors. */
export function InvitePage({ perfil, onBack, onOpenPass }: InvitePageProps) {
  const hostId = memberId(perfil);
  const clock = useApi(() => clientFor(hostId).getHealth(), [hostId], { pollMs: 0 });
  const person = useApi(() => clientFor(hostId).getPerson(hostId), [hostId], { pollMs: 0 });
  const href = (token: string) => `/pase/${token}`;

  if (clock.error && !clock.data) {
    return (
      <Screen width="narrow">
        <ErrorNotice code={clock.error} onRetry={() => void clock.refresh()} />
      </Screen>
    );
  }

  return (
    <InviteScreen
      key={hostId}
      today={clock.data ? clockOf(clock.data).day : ''}
      meetingPoints={MEETING_POINTS}
      loading={!clock.data}
      onBack={onBack}
      onOpenPass={(token) => onOpenPass(href(token))}
      onCopyLink={(token) => copyText(`${globalThis.location?.origin ?? ''}${href(token)}`)}
      onCreate={async (values) => {
        try {
          const api = clientFor(hostId);
          const created = await api.createInvitation({
            hostId,
            guest: { fullName: values.guestName, ...(values.drink ? { note: values.drink } : {}) },
            meetingPoint: values.meetingPoint,
            date: values.date,
          });
          return {
            pass: toPassView(
              created,
              person.data ? shortName(person.data) : (MEMBER_NAMES[hostId] ?? ''),
            ),
          };
        } catch (e) {
          return { errorCode: errorCode(e) };
        }
      }}
    />
  );
}
