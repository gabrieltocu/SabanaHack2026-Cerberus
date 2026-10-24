import { useRouter } from 'expo-router';

import { useSession } from '@/features/club/session';
import { RUTAS } from '@/features/club/socio/nav';
import { ProfileScreen } from '@/features/club/socio/ProfileScreen';

export default function Perfil() {
  const router = useRouter();
  const { logout } = useSession();
  return (
    <ProfileScreen
      onQr={() => router.push(RUTAS.qr)}
      onAbrir={(seccion) => router.push(RUTAS.cuenta(seccion) as never)}
      // The session must forget the user too, or /entrar sends them straight back here.
      onSalir={async () => {
        await logout();
        router.replace(RUTAS.entrar);
      }}
    />
  );
}
