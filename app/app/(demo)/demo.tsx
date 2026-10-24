import { useRouter } from 'expo-router';

import { HomeScreen } from '@/features/screens/HomeScreen';

export default function Home() {
  const router = useRouter();
  return <HomeScreen onNavigate={(href) => router.push(href)} />;
}
