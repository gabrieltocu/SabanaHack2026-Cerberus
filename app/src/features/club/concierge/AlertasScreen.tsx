import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import type { Evento } from '../../../club/types';
import {
  Button,
  EmptyState,
  ErrorState,
  MobileHeader,
  Skeleton,
  Text,
  Touchable,
  colors,
  space,
} from '../../../design-system';
import { categoriaDe } from '../categorias';
import { atendidoPorTexto, historial, horaBogota, ordenarAlertas } from '../eventos';
import { useFeed } from '../feed';
import { useSession } from '../session';
import { Avatar } from '../ui/Avatar';
import { Destacado, Fila, Textos } from '../ui/lux';
import { RobotStatus } from './RobotStatus';
import { DetalleAlerta } from './DetalleAlerta';

/** Phone column of the lists: full width, centred and capped on wide windows. */
export const LISTA = { width: '100%', maxWidth: 600, alignSelf: 'center' } as const;

const nombreDe = (e: Evento) => e.nombre ?? 'Persona sin identificar';

/** The most urgent pending alert: who needs attention, why, and the button to take it. */
function Urgente({
  e,
  ocupado,
  onDetalle,
  onAtender,
}: {
  e: Evento;
  ocupado: boolean;
  onDetalle: () => void;
  onAtender: () => void;
}) {
  const nombre = nombreDe(e);
  return (
    <Destacado>
      <Touchable
        label={`Ver detalle de ${nombre}`}
        onPress={onDetalle}
        style={{ gap: space[1], minHeight: 44, justifyContent: 'center' }}
      >
        <Text variant="label" style={{ fontSize: 17, lineHeight: 24 }}>
          {`${nombre} necesita atención`}
        </Text>
        <Text tone="muted" style={{ fontSize: 15 }}>
          {e.motivo || 'El robot pide que alguien revise.'}
        </Text>
      </Touchable>
      <Button
        label="Atender"
        fullWidth
        loading={ocupado}
        accessibilityLabel={`Atender a ${nombre}`}
        onPress={onAtender}
      />
    </Destacado>
  );
}

/** One row: who and when; the button on the right takes the alert if nobody has. */
function FilaAviso({
  e,
  yoId,
  ocupado,
  onDetalle,
  onAtender,
}: {
  e: Evento;
  yoId?: string;
  ocupado: boolean;
  onDetalle: () => void;
  onAtender: () => void;
}) {
  const nombre = nombreDe(e);
  const nuevo = e.estado === 'NUEVO';
  const hora = e.atendido_at && !nuevo ? e.atendido_at : e.ts;
  const detalle = nuevo
    ? horaBogota(e.ts)
    : `${e.estado === 'RESUELTO' ? 'Resuelta' : 'Atendida'} por ${atendidoPorTexto(e, yoId)} · ${horaBogota(hora)}`;
  return (
    <Fila>
      <Touchable
        label={`Ver detalle de ${nombre}`}
        onPress={onDetalle}
        style={{
          flex: 1,
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
        }}
      >
        <Avatar nombre={e.nombre} categoria={categoriaDe(e.categoria, e.tipo)} size={40} />
        <Textos titulo={nombre} detalle={detalle} />
      </Touchable>
      {nuevo ? (
        <Button
          label="Atender"
          variant="secondary"
          size="sm"
          loading={ocupado}
          accessibilityLabel={`Atender a ${nombre}`}
          onPress={onAtender}
        />
      ) : null}
    </Fila>
  );
}

export function AlertasScreen() {
  const feed = useFeed();
  const { client, usuario } = useSession();
  const [verHistorial, setVerHistorial] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const abiertas = useMemo(() => ordenarAlertas(feed.eventos), [feed.eventos]);
  const cerradas = useMemo(() => historial(feed.eventos), [feed.eventos]);
  const lista = verHistorial ? cerradas : abiertas;
  const urgente = !verHistorial && abiertas[0]?.estado === 'NUEVO' ? abiertas[0] : null;
  const filas = urgente ? lista.slice(1) : lista;
  const abierta = feed.eventos.find((e) => e.id === seleccion) ?? null;

  const ejecutar = useCallback(
    async (e: Evento, accion: () => Promise<Evento>, ok: string) => {
      setOcupado(e.id);
      try {
        feed.actualizar(await accion());
        feed.avisar('ok', ok);
        return true;
      } catch (err) {
        feed.avisar('error', feed.mensajeDe(err));
        return false;
      } finally {
        setOcupado(null);
      }
    },
    [feed],
  );
  const atender = (e: Evento) => ejecutar(e, () => client.atenderEvento(e.id), 'Alerta atendida');
  const resolver = async (e: Evento, nota: string) => {
    if (await ejecutar(e, () => client.resolverEvento(e.id, nota), 'Alerta resuelta')) {
      setSeleccion(null);
    }
  };

  if (abierta)
    return (
      <DetalleAlerta
        key={seleccion ?? 'cerrado'}
        evento={abierta}
        atendidoPor={abierta ? atendidoPorTexto(abierta, usuario?.id) : null}
        ocupado={ocupado !== null}
        onCerrar={() => setSeleccion(null)}
        onAtender={(e) => void atender(e)}
        onResolver={(e, nota) => void resolver(e, nota)}
      />
    );

  const sinDatos = feed.eventos.length === 0;
  return (
    <View role="main" style={{ flex: 1, backgroundColor: colors.bg }}>
      <MobileHeader title="Recepción" />
      <RobotStatus />
      {feed.cargando ? (
        <View style={{ padding: space[4], gap: space[3], ...LISTA }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} label={i === 0 ? 'Cargando avisos' : undefined} />
          ))}
        </View>
      ) : feed.error && sinDatos ? (
        <View style={{ padding: space[4], ...LISTA }}>
          <ErrorState
            title={feed.sinConexion ? 'Sin conexión' : 'No pudimos cargar los avisos'}
            description={feed.error.detalle}
            onRetry={() => void feed.recargar()}
          />
        </View>
      ) : (
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          data={filas}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: space[4], gap: space[4], flexGrow: 1, ...LISTA }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void feed.recargar()}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            urgente ? (
              <Urgente
                e={urgente}
                ocupado={ocupado === urgente.id}
                onDetalle={() => setSeleccion(urgente.id)}
                onAtender={() => void atender(urgente)}
              />
            ) : undefined
          }
          ListEmptyComponent={
            urgente ? undefined : verHistorial ? (
              <EmptyState
                title="Historial vacío"
                description="Las alertas que resuelvas quedarán guardadas aquí."
              />
            ) : (
              <EmptyState
                title="Sin alertas por ahora"
                description="Cuando el robot necesite a alguien, aparecerá aquí y el teléfono vibrará."
              />
            )
          }
          renderItem={({ item, index }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                marginTop: index ? -1 : 0,
              }}
            >
              <FilaAviso
                e={item}
                yoId={usuario?.id}
                ocupado={ocupado === item.id}
                onDetalle={() => setSeleccion(item.id)}
                onAtender={() => void atender(item)}
              />
            </View>
          )}
          ListFooterComponent={
            <Button
              label={verHistorial ? 'Volver a la cola' : 'Ver historial'}
              variant="ghost"
              fullWidth
              onPress={() => setVerHistorial((v) => !v)}
            />
          }
        />
      )}
    </View>
  );
}
