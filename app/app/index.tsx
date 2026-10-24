import { Redirect } from 'expo-router';

// The app opens on the N Club welcome; the five-visitor demo selector lives at /demo.
export default function Index() {
  return <Redirect href="/entrar" />;
}
