import { useLocalSearchParams } from 'expo-router';

import { AttendantScreen } from '@/features/screens/AttendantScreen';

// `?perfil=U-01` opens the panel as another attendant (Sara, Ramiro); Sofía is the default.
export default function Attendant() {
  const { perfil } = useLocalSearchParams<{ perfil?: string }>();
  return <AttendantScreen actorId={perfil && /^U-0[1-3]$/.test(perfil) ? perfil : undefined} />;
}
