import { useState } from 'react';
import { View } from 'react-native';

import type { ColaItem, MiembroEquipo } from '../../../club/types';
import { Button, StatusChip, Text, colors, space } from '../../../design-system';
import { categoriaDe } from '../categorias';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import {
  CHIP_PRIORIDAD,
  ESPERA_LARGA_MIN,
  SONDEO_COLA_MS,
  esperaTexto,
  ordenarCola,
  tipoEquipo,
} from './format';
import { Cargable, LINEA, LINEA_SUAVE, Panel, Quien, Tabla, Vacio, useEscritorio } from './ui';
import { SERIE } from './Charts';

export type RecursoCola = {
  datos: ColaItem[] | null;
  error: Parameters<typeof Cargable>[0]['recurso']['error'];
  recargar: () => Promise<void>;
};

const claveItem = (c: ColaItem) => c.tarea_id ?? c.visita_id ?? c.nombre;

/**
 * People waiting for attention, most urgent first, with the wait time. "Asignar" opens the
 * list of free robots and edecanes right under the row.
 */
export function ColaView({
  cola,
  onAsignada,
}: {
  cola: RecursoCola;
  onAsignada: (mensaje: string) => void;
}) {
  const escritorio = useEscritorio();
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <Cargable
      recurso={cola}
      etiqueta="Cargando la cola"
      errorTitulo="No pudimos cargar la cola"
      alto={200}
    >
      {(datos) => {
        const filas = ordenarCola(datos);
        const maxEspera = Math.max(1, ...filas.map((c) => c.espera_min));
        return (
          <Panel titulo={filas.length ? `${filas.length} en espera` : 'Cola de atención'}>
            {filas.length === 0 ? (
              <Vacio
                titulo="Nadie en espera"
                detalle="Cuando alguien necesite un acompañante, aparecerá aquí al instante."
              />
            ) : (
              <Tabla
                filas={filas}
                escritorio={escritorio}
                id={claveItem}
                cols={[
                  { t: 'Persona', flex: 3, ver: (c) => <Persona c={c} /> },
                  { t: 'Motivo', flex: 3, ver: (c) => c.motivo ?? '—' },
                  { t: 'Prioridad', flex: 1.4, ver: (c) => <Prioridad c={c} /> },
                  { t: 'Espera', flex: 2.2, ver: (c) => <Espera c={c} max={maxEspera} /> },
                  {
                    t: '',
                    flex: 1.4,
                    ver: (c) => <Accion c={c} abierta={abierta} onAbrir={setAbierta} />,
                  },
                ]}
                movil={(c) => (
                  <View style={{ flex: 1, gap: space[2] }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                      <Persona c={c} movil />
                      <Espera c={c} max={maxEspera} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                      <Prioridad c={c} />
                      <View style={{ flex: 1 }} />
                      <Accion c={c} abierta={abierta} onAbrir={setAbierta} />
                    </View>
                  </View>
                )}
                debajo={(c) =>
                  abierta === claveItem(c) && c.visita_id ? (
                    <Asignar
                      visitaId={c.visita_id}
                      nombre={c.nombre}
                      onCerrar={() => setAbierta(null)}
                      onListo={(m) => {
                        setAbierta(null);
                        onAsignada(m);
                        void cola.recargar();
                      }}
                    />
                  ) : null
                }
              />
            )}
          </Panel>
        );
      }}
    </Cargable>
  );
}

/** Phones have no Motivo column (`movil`): the reason goes under the name. */
const sub = (c: ColaItem, movil: boolean) =>
  [movil ? c.motivo : null, c.punto_encuentro ? `Encuentro: ${c.punto_encuentro}` : null]
    .filter(Boolean)
    .join(' · ');

function Persona({ c, movil }: { c: ColaItem; movil?: boolean }) {
  return (
    <Quien
      grow={movil}
      nombre={c.nombre}
      sub={sub(c, !!movil) || categoriaDe(c.categoria).tipoPersona}
    />
  );
}

function Prioridad({ c }: { c: ColaItem }) {
  const p = CHIP_PRIORIDAD[c.prioridad];
  return <StatusChip kind={p.kind} label={p.label} />;
}

/** The wait as a bar on the queue's own scale (gold from 10 min on) and as a figure. */
function Espera({ c, max }: { c: ColaItem; max: number }) {
  const larga = c.espera_min >= ESPERA_LARGA_MIN;
  return (
    <View
      accessible
      accessibilityLabel={`Espera: ${esperaTexto(c.espera_min)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
    >
      <View aria-hidden style={{ flex: 1, minWidth: 40, height: 10, backgroundColor: LINEA_SUAVE }}>
        <View
          style={{
            width: `${Math.max(2, (c.espera_min / max) * 100)}%`,
            height: '100%',
            backgroundColor: larga ? SERIE.oro : SERIE.tinta,
          }}
        />
      </View>
      <Text
        variant="label"
        tone={larga ? 'danger' : 'muted'}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {esperaTexto(c.espera_min)}
      </Text>
    </View>
  );
}

function Accion({
  c,
  abierta,
  onAbrir,
}: {
  c: ColaItem;
  abierta: string | null;
  onAbrir: (clave: string | null) => void;
}) {
  if (!c.visita_id) return null; // a task without a visit cannot be assigned from here
  const clave = claveItem(c);
  const activa = abierta === clave;
  return (
    <Button
      size="sm"
      variant={activa ? 'ghost' : 'primary'}
      label={activa ? 'Cerrar' : 'Asignar'}
      accessibilityLabel={`${activa ? 'Cerrar asignación de' : 'Asignar acompañante a'} ${c.nombre}`}
      onPress={() => onAbrir(activa ? null : clave)}
    />
  );
}

/** Free robots and edecanes; picking one assigns them to the visit. */
function Asignar({
  visitaId,
  nombre,
  onCerrar,
  onListo,
}: {
  visitaId: string;
  nombre: string;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const { client } = useSession();
  const recurso = useRecurso(client.equipo, {
    activo: usePantallaActiva(),
    cadaMs: SONDEO_COLA_MS,
  });
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elegir = async (m: MiembroEquipo) => {
    setEnviando(m.id);
    setError(null);
    try {
      await client.asignarAcompanante(visitaId, m.id);
      onListo(`${m.nombre} acompañará a ${nombre}.`);
    } catch (e) {
      setEnviando(null);
      setError(e instanceof Error ? e.message : 'No se pudo asignar.');
    }
  };
  return (
    <View
      role="group"
      accessibilityLabel={`Acompañantes disponibles para ${nombre}`}
      style={{
        gap: space[2],
        padding: space[4],
        marginBottom: space[3],
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: LINEA,
      }}
    >
      <Text variant="label">Elige quién acompaña a {nombre}</Text>
      <Cargable
        recurso={recurso}
        etiqueta="Cargando equipo"
        errorTitulo="No pudimos cargar el equipo"
        alto={88}
      >
        {(equipo) => {
          const libres = equipo.filter((m) => m.estado === 'DISPONIBLE');
          return libres.length === 0 ? (
            <Text tone="muted">
              No hay robots ni edecanes disponibles ahora. Esta lista se actualiza sola.
            </Text>
          ) : (
            libres.map((m, i) => (
              <View
                key={m.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  paddingVertical: space[2],
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: LINEA,
                }}
              >
                <Quien
                  grow
                  nombre={m.nombre}
                  icono={m.tipo === 'ROBOT' ? 'hardware-chip-outline' : undefined}
                  sub={tipoEquipo(m.tipo)}
                />
                <Button
                  size="sm"
                  label="Elegir"
                  accessibilityLabel={`Elegir a ${m.nombre}`}
                  loading={enviando === m.id}
                  disabled={enviando !== null}
                  onPress={() => void elegir(m)}
                />
              </View>
            ))
          );
        }}
      </Cargable>
      {error ? (
        <Text role="alert" tone="danger">
          {error}
        </Text>
      ) : null}
      <Button size="sm" variant="ghost" label="Cancelar" onPress={onCerrar} />
    </View>
  );
}
