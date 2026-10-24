import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AccountSection } from '@/features/club/socio/AccountSection';
import { RUTAS, SECCIONES, volver, type Seccion } from '@/features/club/socio/nav';

export default function Cuenta() {
  const router = useRouter();
  const { seccion } = useLocalSearchParams<{ seccion: string }>();
  if (!SECCIONES.includes(seccion as Seccion)) return <Redirect href={RUTAS.perfil} />;
  return (
    <AccountSection
      seccion={seccion as Seccion}
      onBack={() => volver(router, RUTAS.perfil)}
      onAbrir={(otra) => router.push(RUTAS.cuenta(otra) as never)}
    />
  );
}
