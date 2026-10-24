import { useCallback, useMemo } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';

import type { Invitacion } from '../../../club/types';
import {
  EmptyState,
  ErrorState,
  MobileHeader,
  Skeleton,
  Text,
  colors,
  space,
} from '../../../design-system';
import { CATEGORIAS } from '../categorias';
import { agruparEsperados } from '../eventos';
import { useFeed } from '../feed';
import { useSession } from '../session';
import { Avatar } from '../ui/Avatar';
import { useRecurso } from '../ui/useRecurso';
import { useHoy, usePantallaActiva } from '../ui/visible';
import { Fila, Textos } from '../ui/lux';
import { LISTA } from './AlertasScreen';

// Only what changes the doorman's job: a plain phrase, nothing for who simply has not arrived.
const ESTADO: Record<string, string> = {
  LLEGO: 'Ya llegó',
  SALIO: 'Salió',
  VENCIDA: 'No llegó',
};

function FilaInvitado({ inv }: { inv: Invitacion }) {
  const estado = ESTADO[inv.estado];
  return (
    <Fila>
      <Avatar nombre={`${inv.nombre} ${inv.apellido}`} categoria={CATEGORIAS.INVITADO} size={40} />
      <Textos
        titulo={`${inv.nombre} ${inv.apellido}`}
        detalle={`${inv.hora_desde} – ${inv.hora_hasta}${inv.lugar ? ` · ${inv.lugar}` : ''}`}
      />
      {estado ? (
        <Text variant="caption" tone="muted">
          {estado}
        </Text>
      ) : null}
    </Fila>
  );
}

export function EsperadosScreen() {
  const { client } = useSession();
  const feed = useFeed();
  const activa = usePantallaActiva();
  const dia = useHoy();
  const cargar = useCallback(() => client.listarInvitaciones({ fecha: dia }), [client, dia]);
  const { datos, cargando, error, recargar, sinConexion } = useRecurso(cargar, {
    activo: activa,
    // A new alert or arrival can change who is inside: reload when the feed moves.
    clave: feed.ultimoSeq,
  });
  const grupos = useMemo(() => agruparEsperados(datos ?? []), [datos]);

  return (
    <View role="main" style={{ flex: 1, backgroundColor: colors.bg }}>
      <MobileHeader title="Esperados hoy" />
      {cargando ? (
        <View style={{ padding: space[4], gap: space[3], ...LISTA }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={80} label={i === 0 ? 'Cargando invitados' : undefined} />
          ))}
        </View>
      ) : error && datos === null ? (
        <View style={{ padding: space[4], ...LISTA }}>
          <ErrorState
            title={sinConexion ? 'Sin conexión' : 'No pudimos cargar los invitados'}
            description={error.detalle}
            onRetry={() => void recargar()}
          />
        </View>
      ) : (
        <SectionList
          contentInsetAdjustmentBehavior="automatic"
          sections={grupos.map((g) => ({ g, data: g.items }))}
          keyExtractor={(inv) => inv.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: space[4], flexGrow: 1, ...LISTA }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void recargar()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="Nadie esperado hoy"
              description="Las invitaciones que los socios creen para hoy aparecerán aquí."
            />
          }
          renderSectionHeader={({ section: { g } }) => (
            <View style={{ paddingTop: space[4], paddingBottom: space[2] }}>
              <Text variant="eyebrow" tone="muted" role="heading">
                {`SOCIO · ${g.nombre.toUpperCase()}`}
              </Text>
            </View>
          )}
          renderItem={({ item, index }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                marginTop: index ? -1 : 0,
              }}
            >
              <FilaInvitado inv={item} />
            </View>
          )}
        />
      )}
    </View>
  );
}
