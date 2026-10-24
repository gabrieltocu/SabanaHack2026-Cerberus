import { useGlobalSearchParams, useRouter } from 'expo-router';
import { club } from '../club/client';
import { Membresia } from './Membresia';
import { usePaseOpcional } from './PaseContext';
import { VisitaApi, type ApiSection } from './VisitaApi';
import { VisitaPage } from './VisitaPage';
import type { VisitaSection } from './VisitaSections';

export type RutaSection = VisitaSection | ApiSection | 'membresia';

const RUTAS: Record<ApiSection | 'membresia', string> = {
  inicio: '/visita',
  pase: '/visita/pase',
  mapa: '/visita/mapa',
  actividades: '/visita/actividades',
  acompanamiento: '/visita/acompanamiento',
  perfil: '/visita/perfil',
  membresia: '/visita/membresia',
};

export function VisitaRoute({ section = 'inicio' }: { section?: RutaSection }) {
  const raw = useGlobalSearchParams();
  const router = useRouter();
  const pase = usePaseOpcional();
  const params = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const ir = (s: ApiSection | 'membresia') =>
    router.navigate({ pathname: RUTAS[s], params } as never);
  const salir = () => router.replace('/entrar');

  if (section === 'membresia') {
    return (
      <Membresia
        client={pase?.client ?? club}
        nombreInicial={pase?.datos?.invitacion.nombre}
        onBack={() => (router.canGoBack() ? router.back() : ir('inicio'))}
      />
    );
  }
  if (params.qr) {
    return (
      <VisitaApi section={section === 'mensajes' ? 'inicio' : section} ir={ir} onExit={salir} />
    );
  }
  // Demostración (`?tipo=`, `?p=`): las pantallas que dependen de la API vuelven al inicio.
  const demo: VisitaSection =
    section === 'mapa' || section === 'mensajes' || section === 'perfil' ? section : 'inicio';
  return (
    <VisitaPage
      params={params}
      section={demo}
      onMembership={() => ir('membresia')}
      onExit={salir}
    />
  );
}
