import { useLocalSearchParams } from 'expo-router';

import { PassPage } from '@/features/pages/PassPage';

export default function Pass() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PassPage token={token ?? ''} />;
}
