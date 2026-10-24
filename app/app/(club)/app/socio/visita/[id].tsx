import { useLocalSearchParams, useRouter } from 'expo-router';

import { RUTAS, volver } from '@/features/club/socio/nav';
import { VisitFollowScreen } from '@/features/club/socio/VisitFollowScreen';

export default function Visita() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VisitFollowScreen key={id} id={id} onBack={() => volver(router, RUTAS.invitados)} />;
}
