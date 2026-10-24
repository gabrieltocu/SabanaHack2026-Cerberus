import { useRouter } from 'expo-router';

import { RUTAS, volver } from '@/features/club/socio/nav';
import { NoticesScreen } from '@/features/club/socio/NoticesScreen';

export default function Avisos() {
  const router = useRouter();
  return <NoticesScreen onBack={() => volver(router, RUTAS.inicio)} />;
}
