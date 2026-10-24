import { useRouter } from 'expo-router';

import { MyQrScreen } from '@/features/club/socio/MyQrScreen';
import { RUTAS, volver } from '@/features/club/socio/nav';

export default function MiQr() {
  const router = useRouter();
  return <MyQrScreen onBack={() => volver(router, RUTAS.inicio)} />;
}
