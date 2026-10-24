import { useRouter } from 'expo-router';

import { HomeScreen } from '@/features/club/socio/HomeScreen';
import { RUTAS } from '@/features/club/socio/nav';

export default function Inicio() {
  const router = useRouter();
  return (
    <HomeScreen
      onInvitar={() => router.push(RUTAS.nueva)}
      onAbrir={(id) => router.push(RUTAS.detalle(id) as never)}
      onVerAvisos={() => router.push(RUTAS.avisos)}
      onVerQr={() => router.push(RUTAS.qr)}
      onVerVisita={(id) => router.push(RUTAS.visita(id) as never)}
    />
  );
}
