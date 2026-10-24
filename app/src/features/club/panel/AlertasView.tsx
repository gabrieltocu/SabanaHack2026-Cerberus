import { useCallback } from 'react';
import { View } from 'react-native';

import type { Evento } from '../../../club/types';
import {
  ErrorState,
  Icon,
  Skeleton,
  StatusChip,
  Text,
  colors,
  space,
} from '../../../design-system';
import {
  historial,
  horaBogota,
  ordenarAlertas,
  resumenEvidencia,
  SEVERIDAD_TEXTO,
} from '../eventos';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { CHIP_EVENTO, SONDEO_MS, tipoTexto } from './format';
import { BarraConLeyenda } from './Graficas';
import { partesEventos } from './partes';
import { Iniciales, Panel, Vacio, filaTabla } from './ui';

/** Alerts that need a person: open ones first, then the closed ones. Read-only. */
export function AlertasView() {
  const { client } = useSession();
  const cargar = useCallback(() => client.eventos(0, true).then((r) => r.items), [client]);
  const { datos, error, recargar } = useRecurso(cargar, {
    activo: usePantallaActiva(),
    cadaMs: SONDEO_MS,
  });
  if (datos === null) {
    return error ? (
      <ErrorState
        title="No pudimos cargar las alertas"
        description={error.detalle}
        onRetry={() => void recargar()}
      />
    ) : (
      <Skeleton height={240} label="Cargando alertas" />
    );
  }
  const filas = [...ordenarAlertas(datos), ...historial(datos)];
  return (
    <Panel titulo="Avisos del robot">
      {filas.length === 0 ? (
        <Vacio
          titulo="Sin alertas"
          detalle="Cuando el robot necesite a una persona, aparecerá aquí."
        />
      ) : (
        <View style={{ gap: space[4] }}>
          <BarraConLeyenda
            partes={partesEventos(filas.map((e) => e.estado))}
            descripcion={`Estado de los avisos: ${filas.length} en total`}
          />
          <View>
            {filas.map((e, i) => (
              <Fila key={e.id} e={e} ultima={i === filas.length - 1} />
            ))}
          </View>
        </View>
      )}
    </Panel>
  );
}

function Fila({ e, ultima }: { e: Evento; ultima: boolean }) {
  const chip = CHIP_EVENTO[e.estado];
  const detalle = [e.motivo, resumenEvidencia(e.evidencia)].filter(Boolean).join(' · ');
  return (
    <View style={filaTabla(ultima)}>
      <Iniciales nombre={e.nombre} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {e.nombre ?? 'Sin identificar'}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={3}>
          {tipoTexto(e.tipo)}
          {e.destino ? ` · ${e.destino}` : ''}
          {detalle ? ` · ${detalle}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <Icon
            name={e.severidad === 'urgente' ? 'alert-circle-outline' : 'information-circle-outline'}
            size={14}
            color={e.severidad === 'urgente' ? colors.danger : colors.muted}
          />
          <Text variant="caption" tone={e.severidad === 'urgente' ? 'danger' : 'muted'}>
            {SEVERIDAD_TEXTO[e.severidad]} · {horaBogota(e.ts)}
          </Text>
        </View>
      </View>
      <StatusChip kind={chip.kind} label={chip.label} />
    </View>
  );
}
