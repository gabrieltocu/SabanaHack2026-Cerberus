import { MembershipScreen, ProfileChipsScreen, ProfileInfoScreen } from './AccountScreens';
import { MyPhotoScreen } from './MyPhotoScreen';
import type { Seccion } from './nav';

/** The Perfil sub-screen for `/app/socio/cuenta/<seccion>`. */
export function AccountSection({
  seccion,
  onBack,
  onAbrir,
}: {
  seccion: Seccion;
  onBack: () => void;
  onAbrir?: (seccion: Seccion) => void;
}) {
  switch (seccion) {
    case 'info':
      return <ProfileInfoScreen onBack={onBack} />;
    case 'foto':
      return <MyPhotoScreen onBack={onBack} />;
    case 'bebidas':
    case 'asistencia':
      return <ProfileChipsScreen tipo={seccion} onBack={onBack} />;
    case 'membresia':
      return <MembershipScreen onBack={onBack} onAbrir={onAbrir} />;
  }
}
