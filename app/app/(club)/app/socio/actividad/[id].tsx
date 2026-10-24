import { useLocalSearchParams, useRouter } from 'expo-router';

import { ActivityDetailScreen } from '@/features/club/socio/ActivityDetailScreen';
import { RUTAS, volver } from '@/features/club/socio/nav';

export default function Actividad() {
  const router = useRouter();
  const { id, fecha } = useLocalSearchParams<{ id: string; fecha: string }>();
  return (
    <ActivityDetailScreen
      key={id}
      id={id}
      fecha={fecha}
      onBack={() => volver(router, RUTAS.actividades)}
    />
  );
}
