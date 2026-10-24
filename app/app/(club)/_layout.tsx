import { Slot } from 'expo-router';

import { SessionProvider } from '@/features/club/session';

// Every N Club route (login, socio and concierge apps) shares one session.
export default function ClubLayout() {
  return (
    <SessionProvider>
      <Slot />
    </SessionProvider>
  );
}
