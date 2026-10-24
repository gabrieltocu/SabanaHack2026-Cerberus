import { useRouter } from 'expo-router';

import { ActivitiesScreen } from '@/features/club/socio/ActivitiesScreen';
import { RUTAS } from '@/features/club/socio/nav';

export default function Actividades() {
  const router = useRouter();
  return (
    <ActivitiesScreen onAbrir={(id, fecha) => router.push(RUTAS.actividad(id, fecha) as never)} />
  );
}
