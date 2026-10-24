import { useRouter } from 'expo-router';

import { NewInvitationScreen } from '@/features/club/socio/NewInvitationScreen';
import { RUTAS, volver } from '@/features/club/socio/nav';

export default function Nueva() {
  const router = useRouter();
  return (
    <NewInvitationScreen
      onBack={() => volver(router, RUTAS.invitados)}
      onCreada={(id, fotoError) =>
        router.replace(
          RUTAS.detalle(id, { creada: '1', ...(fotoError ? { fotoError } : null) }) as never,
        )
      }
    />
  );
}
