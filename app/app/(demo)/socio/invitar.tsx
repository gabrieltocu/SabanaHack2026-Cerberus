import { useLocalSearchParams, useRouter } from 'expo-router';

import { InvitePage } from '@/features/pages/InvitePage';

export default function Invite() {
  const router = useRouter();
  const { perfil } = useLocalSearchParams<{ perfil?: string }>();
  return (
    <InvitePage
      perfil={perfil}
      onBack={() => router.back()}
      onOpenPass={(href) => router.push(href)}
    />
  );
}
