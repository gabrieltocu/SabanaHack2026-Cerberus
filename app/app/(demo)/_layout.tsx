import { Slot } from 'expo-router';

import { DemoFrame } from '@/features/shared/DemoRibbon';

// Every demonstration route sits under the fixed ribbon. `/design` stays outside on purpose.
export default function DemoLayout() {
  return (
    <DemoFrame>
      <Slot />
    </DemoFrame>
  );
}
