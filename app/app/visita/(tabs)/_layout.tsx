import { useGlobalSearchParams } from 'expo-router';
import { AppTabsLayout } from '@/design-system/AppTabsLayout';
import { tabsDemo, tabsQr } from '@/features/visita/tabs';

export default function VisitaTabs() {
  const params = useGlobalSearchParams();
  return <AppTabsLayout tabs={params.qr ? tabsQr : tabsDemo} keepParams={Object.keys(params)} />;
}
