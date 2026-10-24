import { useMemo } from 'react';
import { SectionList, RefreshControl, View } from 'react-native';

import type { Evento } from '../../../club/types';
import {
  EmptyState,
  ErrorState,
  MobileHeader,
  Skeleton,
  Text,
  colors,
  space,
} from '../../../design-system';
import { PERSONAS_DEMO } from '../demo';
import { categoriaDe } from '../categorias';
import { horaBogota, llegadasDelDia, metodoTexto } from '../eventos';
import { useFeed } from '../feed';
import { Avatar } from '../ui/Avatar';
import { useHoy } from '../ui/visible';
import { Fila, Textos } from '../ui/lux';
import { LISTA } from './AlertasScreen';

function Llegada({ e }: { e: Evento }) {
  const cat = categoriaDe(e.categoria, e.tipo);
  const metodo = metodoTexto(e);
  const nombre = e.nombre ?? 'Persona sin identificar';
  const detalle = [metodo, e.destino].filter(Boolean).join(' · ');
  return (
    <View
      accessible
      accessibilityLabel={`${horaBogota(e.ts)}, ${nombre}${detalle ? `, ${detalle}` : ''}`}
      style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      <Fila>
        <Avatar nombre={e.nombre} categoria={cat} size={40} />
        <Textos titulo={nombre} detalle={detalle} />
        <Text variant="label">{horaBogota(e.ts)}</Text>
      </Fila>
    </View>
  );
}

export function LlegadasScreen() {
  const feed = useFeed();
  const dia = useHoy();
  const llegadas = useMemo(() => llegadasDelDia(feed.eventos, dia), [feed.eventos, dia]);
  const grupos = useMemo(() => {
    const porSocio = new Map<string, { titulo: string; vip: boolean; data: Evento[] }>();
    for (const e of llegadas) {
      const socio = e.anfitrion_id ? PERSONAS_DEMO[e.anfitrion_id] : null;
      const esSocio = e.categoria === 'VIP' || e.categoria === 'REGULAR';
      const clave = e.anfitrion_id || (esSocio ? e.persona_id || e.nombre || e.id : 'otras');
      const grupo = porSocio.get(clave) ?? {
        titulo: socio
          ? `Socio · ${socio.nombre}`
          : e.anfitrion_id
            ? 'Socio por confirmar'
            : esSocio
              ? `Socio · ${e.nombre || 'Sin identificar'}`
              : 'Otras llegadas',
        vip: socio?.nivel === 'VIP' || e.categoria === 'VIP',
        data: [],
      };
      grupo.data.push(e);
      porSocio.set(clave, grupo);
    }
    return [...porSocio.values()].sort((a, b) => Number(b.vip) - Number(a.vip));
  }, [llegadas]);
  const sinDatos = feed.eventos.length === 0;
  return (
    <View role="main" style={{ flex: 1, backgroundColor: colors.bg }}>
      <MobileHeader title="Llegadas de hoy" />
      {feed.cargando ? (
        <View style={{ padding: space[4], gap: space[3], ...LISTA }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={84} label={i === 0 ? 'Cargando llegadas' : undefined} />
          ))}
        </View>
      ) : feed.error && sinDatos ? (
        <View style={{ padding: space[4], ...LISTA }}>
          <ErrorState
            title={feed.sinConexion ? 'Sin conexión' : 'No pudimos cargar las llegadas'}
            description={feed.error.detalle}
            onRetry={() => void feed.recargar()}
          />
        </View>
      ) : (
        <SectionList
          sections={grupos}
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingTop: space[3], paddingBottom: space[1] }}>
              <Text variant="label" tone="muted">
                {section.titulo}
              </Text>
            </View>
          )}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: space[4], gap: space[2], flexGrow: 1, ...LISTA }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void feed.recargar()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="Aún no llega nadie"
              description="Cada persona que el robot reconozca hoy se verá aquí al instante."
            />
          }
          renderItem={({ item }) => <Llegada e={item} />}
        />
      )}
    </View>
  );
}
