import { useCallback } from 'react';

import type { MiembroEquipo, Visita } from '../../../club/types';
import { StatusChip } from '../../../design-system';
import { haceCuanto } from '../eventos';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { CHIP_EQUIPO, SONDEO_COLA_MS, tipoEquipo } from './format';
import { BarraEquipo } from './Graficas';
import { Cargable, Panel, Quien, Tabla, Vacio, useEscritorio } from './ui';

type Datos = { equipo: MiembroEquipo[]; visitas: Record<string, Visita> };

/** The visit a member is attending, in words: "Andrés Ramírez · Sala Ejecutiva". */
export function atiende(m: MiembroEquipo, visitas: Record<string, Visita>): string {
  const v = m.visita_id ? visitas[m.visita_id] : undefined;
  if (v) return `${v.nombre} · ${v.destino}`;
  return m.detalle ?? '—';
}

const ORDEN = [
  'ACOMPANANDO',
  'ASIGNADO',
  'REGRESANDO',
  'DISPONIBLE',
  'CARGANDO',
  'FUERA_DE_SERVICIO',
];

/** Robots and people of the floor with their state and the visit they attend. Live (5 s). */
export function EquipoView() {
  const { client } = useSession();
  const escritorio = useEscritorio();
  const cargar = useCallback(async (): Promise<Datos> => {
    const [equipo, visitas] = await Promise.all([
      client.equipo(),
      // Names of the visits are a nicety: the team list must survive without them.
      client.visitas().catch(() => [] as Visita[]),
    ]);
    return { equipo, visitas: Object.fromEntries(visitas.map((v) => [v.id, v])) };
  }, [client]);
  const recurso = useRecurso(cargar, { activo: usePantallaActiva(), cadaMs: SONDEO_COLA_MS });
  return (
    <Cargable
      recurso={recurso}
      etiqueta="Cargando equipo"
      errorTitulo="No pudimos cargar el equipo"
    >
      {({ equipo, visitas }) => {
        const filas = [...equipo].sort((a, b) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado));
        const libres = equipo.filter((m) => m.estado === 'DISPONIBLE').length;
        return (
          <Panel titulo={`Equipo · ${libres} de ${equipo.length} disponibles`}>
            {filas.length === 0 ? (
              <Vacio
                titulo="Aún no hay equipo en el turno"
                detalle="Los robots y edecanes aparecen aquí cuando se conectan."
              />
            ) : (
              <>
                <BarraEquipo equipo={equipo} leyenda />
                <Tabla
                  filas={filas}
                  escritorio={escritorio}
                  id={(m) => m.id}
                  cols={[
                    {
                      t: 'Nombre',
                      flex: 3,
                      ver: (m) => (
                        <Quien nombre={m.nombre} icono={icono(m)} sub={tipoEquipo(m.tipo)} />
                      ),
                    },
                    { t: 'Estado', flex: 2, ver: (m) => <Estado m={m} /> },
                    { t: 'Atiende a', flex: 3.4, ver: (m) => atiende(m, visitas) },
                    {
                      t: 'Actualizado',
                      flex: 1.4,
                      ver: (m) =>
                        m.actualizado_at
                          ? haceCuanto(Date.parse(m.actualizado_at), Date.now())
                          : '—',
                    },
                  ]}
                  movil={(m) => (
                    <>
                      <Quien
                        grow
                        nombre={m.nombre}
                        icono={icono(m)}
                        sub={[tipoEquipo(m.tipo), atiende(m, visitas)]
                          .filter((t) => t !== '—')
                          .join(' · ')}
                      />
                      <Estado m={m} />
                    </>
                  )}
                />
              </>
            )}
          </Panel>
        );
      }}
    </Cargable>
  );
}

const icono = (m: MiembroEquipo) =>
  m.tipo === 'ROBOT' ? ('hardware-chip-outline' as const) : undefined;

function Estado({ m }: { m: MiembroEquipo }) {
  const c = CHIP_EQUIPO[m.estado];
  return <StatusChip kind={c.kind} label={c.label} icon={c.icono} />;
}
