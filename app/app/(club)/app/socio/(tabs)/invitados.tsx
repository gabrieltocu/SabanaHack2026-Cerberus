import { useRouter } from 'expo-router';

import { GuestsScreen } from '@/features/club/socio/GuestsScreen';
import { RUTAS } from '@/features/club/socio/nav';

export default function Invitados() {
  const router = useRouter();
  return (
    <GuestsScreen
      onInvitar={() => router.push(RUTAS.nueva)}
      onAbrir={(id) => router.push(RUTAS.detalle(id) as never)}
      onAbrirVisita={(id) => router.push(RUTAS.visita(id) as never)}
    />
  );
}
