import { useCallback } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type { Invitacion } from '../../../club/types';
import { ErrorState, Skeleton, StatusChip, Text, space } from '../../../design-system';
import { PERSONAS_DEMO } from '../demo';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { CHIP_INVITACION, ESCRITORIO_MIN, SONDEO_MS } from './format';
import { BarraConLeyenda } from './Graficas';
import { cuentaInvitaciones, partesInvitaciones } from './partes';
import { CabeceraTabla, Iniciales, Panel, Vacio, filaTabla } from './ui';

/** Invitations of the chosen day, read-only. */
export function VisitasView({ fecha }: { fecha: string }) {
  const { client } = useSession();
  const escritorio = useWindowDimensions().width >= ESCRITORIO_MIN;
  const cargar = useCallback(() => client.listarInvitaciones({ fecha }), [client, fecha]);
  const { datos, error, recargar } = useRecurso(cargar, {
    activo: usePantallaActiva(),
    cadaMs: SONDEO_MS,
    clave: fecha,
  });
  if (datos === null) {
    return error ? (
      <ErrorState
        title="No pudimos cargar las visitas"
        description={error.detalle}
        onRetry={() => void recargar()}
      />
    ) : (
      <Skeleton height={240} label="Cargando visitas" />
    );
  }
  const items = [...datos].sort((a, b) => a.hora_desde.localeCompare(b.hora_desde));
  return (
    <Panel titulo="Invitaciones del día">
      {items.length === 0 ? (
        <Vacio titulo="Sin visitas programadas" detalle="No hay invitaciones para este día." />
      ) : (
        <View style={{ gap: space[4] }}>
          <BarraConLeyenda
            partes={partesInvitaciones(cuentaInvitaciones(items.map((v) => v.estado)))}
            descripcion={`Estado de las invitaciones: ${items.length} en total`}
          />
          <View>
            {escritorio ? (
              <CabeceraTabla
                cols={[
                  { t: 'Invitado', flex: 3 },
                  { t: 'Anfitrión', flex: 2.4 },
                  { t: 'Horario', flex: 1.6 },
                  { t: 'Lugar', flex: 2 },
                  { t: 'Estado', flex: 1.6 },
                ]}
              />
            ) : null}
            {items.map((v, i) => (
              <Fila key={v.id} v={v} escritorio={escritorio} ultima={i === items.length - 1} />
            ))}
          </View>
        </View>
      )}
    </Panel>
  );
}

function Fila({ v, escritorio, ultima }: { v: Invitacion; escritorio: boolean; ultima: boolean }) {
  const nombre = `${v.nombre} ${v.apellido}`.trim();
  const anfitrion = PERSONAS_DEMO[v.anfitrion_id]?.nombre ?? 'Socio';
  const chip = CHIP_INVITACION[v.estado];
  const horario = `${v.hora_desde} – ${v.hora_hasta}`;
  const quien = (
    <View
      style={{
        flex: escritorio ? 3 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
      }}
    >
      <Iniciales nombre={nombre} />
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {nombre}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {escritorio ? 'Invitado' : `${horario} · ${v.lugar} · con ${anfitrion}`}
        </Text>
      </View>
    </View>
  );
  const estado = <StatusChip kind={chip.kind} label={chip.label} />;
  return escritorio ? (
    <View style={filaTabla(ultima)}>
      {quien}
      <Text variant="label" tone="muted" numberOfLines={1} style={{ flex: 2.4 }}>
        {anfitrion}
      </Text>
      <Text variant="label" tone="muted" style={{ flex: 1.6 }}>
        {horario}
      </Text>
      <Text variant="label" tone="muted" numberOfLines={1} style={{ flex: 2 }}>
        {v.lugar}
      </Text>
      <View style={{ flex: 1.6 }}>{estado}</View>
    </View>
  ) : (
    <View style={filaTabla(ultima)}>
      {quien}
      {estado}
    </View>
  );
}
