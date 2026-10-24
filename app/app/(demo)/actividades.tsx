import { useRouter } from 'expo-router';

import { ActivitiesPage } from '@/features/pages/ActivitiesPage';

export default function Activities() {
  const router = useRouter();
  return (
    <ActivitiesPage onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
  );
}
