import { Stack } from 'expo-router';

import { colors } from '@/design-system';
import { SocioStackShell } from '@/features/club/socio/SocioTabs';
import { SocioGate } from '@/features/club/socio/SocioGate';

// Socio area: session gate, then a stack holding the tabs and the full-screen forms.
// (SDK 58 tabs cannot host undeclared routes: they redirect to the first tab.)
export default function SocioLayout() {
  return (
    <SocioGate>
      <SocioStackShell>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
        />
      </SocioStackShell>
    </SocioGate>
  );
}
