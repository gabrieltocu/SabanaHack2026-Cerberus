import { useLocalSearchParams, useRouter } from 'expo-router';

import { MemberPage } from '@/features/pages/MemberPage';

export default function Member() {
  const router = useRouter();
  const { perfil } = useLocalSearchParams<{ perfil?: string }>();
  return (
    <MemberPage
      perfil={perfil}
      onInvite={(id) => router.push(`/socio/invitar?perfil=${id}`)}
      onViewActivities={() => router.push('/actividades')}
      onOpenPass={(href) => router.push(href)}
    />
  );
}
