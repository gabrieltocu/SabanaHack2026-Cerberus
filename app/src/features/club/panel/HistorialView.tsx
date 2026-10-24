import { useCallback, useState } from 'react';
import { View } from 'react-native';

import type { Incidencia, MiembroEquipo, Visita } from '../../../club/types';
import { StatusChip, Text, colors, space } from '../../../design-system';
import { PERSONAS_DEMO } from '../demo';
import { diaBogota, horaBogota } from '../eventos';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { LINEA, Bloque, Cargable, Panel, Quien, Tabla, Vacio, useEscritorio } from './ui';
import {
  PASO_TEXTO,
  SONDEO_MS,
  duracionTexto,
  minutosEntre,
  protagonistas,
  tipoTexto,
} from './format';
import { BarrasHorizontales } from './Charts';
import { indiceMaximo, maximoEscala } from './escalas';

type Datos = {
  visitas: Visita[];
  incidencias: Incidencia[];
  /** id -> name of robots and people of the team, to read the trail. */
  nombres: Record<string, string>;
};

const TIPO_INCIDENCIA: Record<Incidencia['tipo'], string> = {
  FALLA_ROBOT: 'Falla del robot',
  CONEXION: 'Conexión',
  RUTA_BLOQUEADA: 'Ruta bloqueada',
  ASISTENCIA: 'Asistencia',
  OTRA: 'Otra',
};

/** Who is behind an id of the trail: a user, a robot of the team or the guest. */
const nombreDe = (id: string | null, nombres: Record<string, string>) =>
  !id ? '—' : id === 'invitado' ? 'El invitado' : (nombres[id] ?? PERSONAS_DEMO[id]?.nombre ?? id);

/** Closed visits of the day with who attended, handed over and received; incidents below. */
export function HistorialView({ fecha }: { fecha: string }) {
  const { client } = useSession();
  const escritorio = useEscritorio();
  const [abierta, setAbierta] = useState<string | null>(null);
  const cargar = useCallback(async (): Promise<Datos> => {
    const [visitas, incidencias, equipo] = await Promise.all([
      client.visitas({ estado: 'CERRADA', fecha }),
      client.incidencias(),
      client.equipo().catch(() => [] as MiembroEquipo[]),
    ]);
    return {
      visitas,
      incidencias: incidencias.filter((i) => diaBogota(i.creada_at) === fecha),
      nombres: Object.fromEntries(equipo.map((m) => [m.id, m.nombre])),
    };
  }, [client, fecha]);
  const recurso = useRecurso(cargar, {
    activo: usePantallaActiva(),
    cadaMs: SONDEO_MS * 3,
    clave: fecha,
  });
  return (
    <Cargable
      recurso={recurso}
      etiqueta="Cargando historial"
      errorTitulo="No pudimos cargar el historial"
      alto={320}
    >
      {({ visitas, incidencias, nombres }) => {
        const filas = [...visitas].sort((a, b) => b.inicio.localeCompare(a.inicio));
        const conIncidencia = new Set(incidencias.map((i) => i.visita_id));
        const final = (v: Visita) =>
          conIncidencia.has(v.id)
            ? 'Salió, con incidencia'
            : v.cierre === 'SALIDA'
              ? 'Salió del club'
              : 'Cerrada';
        const quien = (v: Visita) => nombreDe(protagonistas(v).atendio, nombres);
        return (
          <View style={{ gap: space[5] }}>
            <Panel titulo={`Visitas cerradas · ${filas.length}`}>
              {filas.length === 0 ? (
                <Vacio
                  titulo="Sin visitas cerradas"
                  detalle="Las visitas aparecen aquí cuando la persona sale del club."
                />
              ) : (
                <>
                  <Duraciones visitas={filas} />
                  <Tabla
                    filas={filas}
                    escritorio={escritorio}
                    id={(v) => v.id}
                    onPress={(v) => setAbierta(abierta === v.id ? null : v.id)}
                    etiqueta={(v) => `Visita de ${v.nombre}, ver detalle`}
                    cols={[
                      { t: 'Visitante', flex: 3, ver: (v) => <Persona v={v} /> },
                      { t: 'Atendió', flex: 1.8, ver: quien },
                      {
                        t: 'Entregó',
                        flex: 1.8,
                        ver: (v) => nombreDe(protagonistas(v).entrego, nombres),
                      },
                      {
                        t: 'Recibió',
                        flex: 1.8,
                        ver: (v) => nombreDe(protagonistas(v).recibio, nombres),
                      },
                      {
                        t: 'Cómo terminó',
                        flex: 2.8,
                        ver: (v) => <Final v={v} texto={final(v)} />,
                      },
                    ]}
                    movil={(v) => (
                      <View style={{ flex: 1, gap: space[1] }}>
                        <Persona v={v} />
                        <Text variant="caption" tone="muted">
                          Atendió: {quien(v)} · {final(v)}
                        </Text>
                      </View>
                    )}
                    debajo={(v) => (abierta === v.id ? <Detalle v={v} nombres={nombres} /> : null)}
                  />
                </>
              )}
            </Panel>
            <Panel titulo={`Incidencias · ${incidencias.length}`}>
              {incidencias.length === 0 ? (
                <Vacio titulo="Sin incidencias" detalle="Nada se interrumpió este día." />
              ) : (
                <Tabla
                  filas={[...incidencias].sort((a, b) => b.creada_at.localeCompare(a.creada_at))}
                  escritorio={escritorio}
                  id={(i) => i.id}
                  cols={[
                    { t: 'Hora', flex: 1, ver: (i) => horaBogota(i.creada_at) },
                    { t: 'Tipo', flex: 2, ver: (i) => TIPO_INCIDENCIA[i.tipo] },
                    { t: 'Descripción', flex: 5, ver: (i) => i.descripcion },
                    { t: 'Lugar', flex: 2, ver: (i) => i.lugar ?? '—' },
                    { t: 'Estado', flex: 1.4, ver: (i) => <EstadoIncidencia i={i} /> },
                  ]}
                  movil={(i) => (
                    <>
                      <View style={{ flex: 1 }}>
                        <Text variant="label">{TIPO_INCIDENCIA[i.tipo]}</Text>
                        <Text variant="caption" tone="muted">
                          {horaBogota(i.creada_at)} · {i.descripcion}
                          {i.lugar ? ` · ${i.lugar}` : ''}
                        </Text>
                      </View>
                      <EstadoIncidencia i={i} />
                    </>
                  )}
                />
              )}
            </Panel>
          </View>
        );
      }}
    </Cargable>
  );
}

/** How long each closed visit lasted, longest in gold (up to the 8 latest). */
function Duraciones({ visitas }: { visitas: readonly Visita[] }) {
  const filas = visitas
    .flatMap((v) => {
      const m = minutosEntre(v.inicio, v.fin);
      return m === null ? [] : [{ id: v.id, etiqueta: v.nombre, valor: m }];
    })
    .slice(0, 8);
  if (filas.length === 0) return null;
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="label">Duración de cada visita, en minutos</Text>
      <BarrasHorizontales
        filas={filas}
        max={maximoEscala(Math.max(0, ...filas.map((f) => f.valor)))}
        destacar={indiceMaximo(filas.map((f) => f.valor))}
        formato={(m) => `${m} min`}
        descripcion={`Duración de las últimas ${filas.length} visitas cerradas`}
      />
    </View>
  );
}

function Persona({ v }: { v: Visita }) {
  const dur = duracionTexto(v.inicio, v.fin);
  return (
    <Quien
      grow
      nombre={v.nombre}
      sub={`${v.destino} · ${horaBogota(v.inicio)}${v.fin ? ` – ${horaBogota(v.fin)}` : ''}${dur ? ` (${dur})` : ''}`}
    />
  );
}

function Final({ v, texto }: { v: Visita; texto: string }) {
  return (
    <StatusChip
      kind={texto.includes('incidencia') ? 'warning' : 'success'}
      label={texto}
      icon={v.cierre ? 'exit-outline' : undefined}
    />
  );
}

function EstadoIncidencia({ i }: { i: Incidencia }) {
  return (
    <StatusChip
      kind={i.estado === 'ABIERTA' ? 'danger' : 'success'}
      label={i.estado === 'ABIERTA' ? 'Abierta' : 'Resuelta'}
    />
  );
}

/** Timeline of one visit: time, step, who did it and the note. */
function Detalle({ v, nombres }: { v: Visita; nombres: Record<string, string> }) {
  const pasos = v.recorrido ?? [];
  return (
    <Bloque titulo={`Línea de tiempo de ${v.nombre}`}>
      {pasos.length === 0 ? (
        <Text tone="muted">Esta visita no registró pasos.</Text>
      ) : (
        <View role="list" style={{ paddingBottom: space[3] }}>
          {pasos.map((p, i) => (
            <View
              key={`${p.ts}-${p.tipo}-${i}`}
              role="listitem"
              style={{ flexDirection: 'row', gap: space[3], minHeight: 48 }}
            >
              <Text variant="caption" tone="muted" style={{ width: 44, paddingTop: 2 }}>
                {horaBogota(p.ts)}
              </Text>
              <View style={{ alignItems: 'center', width: 12 }}>
                <View
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    marginTop: 5,
                    backgroundColor: p.tipo === 'SALIDA' ? colors.forest : colors.gold,
                  }}
                />
                {i < pasos.length - 1 ? (
                  <View aria-hidden style={{ flex: 1, width: 1, backgroundColor: LINEA }} />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingBottom: space[2] }}>
                <Text variant="label">{PASO_TEXTO[p.tipo] ?? tipoTexto(p.tipo)}</Text>
                <Text variant="caption" tone="muted">
                  {nombreDe(p.actor, nombres)}
                  {p.detalle ? ` · ${p.detalle}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Bloque>
  );
}
