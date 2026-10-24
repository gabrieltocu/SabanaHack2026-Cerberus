import { useRouter } from 'expo-router';

import { StaffPage } from '@/features/pages/StaffPage';

export default function Staff() {
  const router = useRouter();
  return <StaffPage onViewActivities={() => router.push('/actividades')} />;
}
