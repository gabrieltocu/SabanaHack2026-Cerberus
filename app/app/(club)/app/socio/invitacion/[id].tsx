import { useLocalSearchParams, useRouter } from 'expo-router';

import { InvitationDetailScreen } from '@/features/club/socio/InvitationDetailScreen';
import { RUTAS, volver } from '@/features/club/socio/nav';

export default function Detalle() {
  const router = useRouter();
  const { id, creada, fotoError } = useLocalSearchParams<{
    id: string;
    creada?: string;
    fotoError?: string;
  }>();
  return (
    <InvitationDetailScreen
      key={id}
      id={id}
      creada={creada === '1'}
      fotoError={fotoError}
      onBack={() => volver(router, RUTAS.invitados)}
      onVerVisita={(visitaId) => router.push(RUTAS.visita(visitaId) as never)}
    />
  );
}
