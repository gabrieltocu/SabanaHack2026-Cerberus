// Summary of the day as a report canvas: a strip of small indicators and a grid of charts, all
// fed by the real API (summary, visits, ratings, team and queue), then a short list of events.
import { useCallback, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type {
  ColaItem,
  MiembroEquipo,
  PanelResumen,
  ResumenEvaluaciones,
  Visita,
} from '../../../club/types';
import { ErrorState, Skeleton, StatusChip, Text, fonts, space } from '../../../design-system';
import { horaBogota } from '../eventos';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import {
  BarraApilada100,
  BarrasHorizontales,
  Columnas,
  Leyenda,
  Linea,
  MiniBarra,
  MiniColumnas,
  SERIE,
} from './Charts';
import { acumulado, indiceMaximo, maximoEscala, suma } from './escalas';
import {
  CHIP_EVENTO,
  CHIP_EQUIPO,
  ESCRITORIO_MIN,
  ETIQUETA_CATEGORIA,
  FAMILIAS,
  ORDEN_CATEGORIAS,
  SONDEO_COLA_MS,
  SONDEO_MS,
  completarCategorias,
  completarFlujo,
  horaEtiqueta,
  mediaTexto,
  minutos,
  ordenarCola,
  pad2,
  porcentaje,
  tipoEquipo,
  tipoTexto,
  totalCategorias,
} from './format';
import { BarraEquipo, BarraVisitas, DistribucionEvaluaciones } from './Graficas';
import { COLOR_EQUIPO, partesEventos } from './partes';
import { CabeceraTabla, EnlaceTexto, Iniciales, Panel, Vacio, filaTabla, tarjeta } from './ui';

const GAP = space[4];
const MAX_ANCHO = 1180;

/** Columns of the canvas: 1 on phones, 2 on tablets and 1280 px windows, 3 from wide windows. */
export const columnasDe = (ancho: number) => (ancho >= 1040 ? 3 : ancho >= 560 ? 2 : 1);

/** Widths of the grid items for the width of the page content. */
function useLienzo() {
  const ventana = useWindowDimensions().width;
  const escritorio = ventana >= ESCRITORIO_MIN;
  const ancho = Math.min(MAX_ANCHO, ventana - (escritorio ? 248 + 64 : 32));
  const cols = columnasDe(ancho);
  const unidad = (ancho - GAP * (cols - 1)) / cols;
  return {
    escritorio,
    cols,
    /** Width of an item that spans `n` columns (never more than there are). */
    span: (n: number) => {
      const k = Math.min(n, cols);
      return Math.floor(unidad * k + GAP * (k - 1));
    },
  };
}

type Recurso<T> = ReturnType<typeof useRecurso<T>>;

/** A card whose data may still be loading or have failed: skeleton, quiet retry, or content. */
function Cuerpo<T>({
  recurso,
  alto,
  etiqueta,
  children,
}: {
  recurso: Recurso<T>;
  alto: number;
  etiqueta: string;
  children: (datos: T) => ReactNode;
}) {
  if (recurso.datos === null) {
    return recurso.error ? (
      <View style={{ gap: space[1], paddingVertical: space[4] }}>
        <Text tone="muted">No pudimos cargar estos datos.</Text>
        <EnlaceTexto label="Reintentar" onPress={() => void recurso.recargar()} />
      </View>
    ) : (
      <Skeleton height={alto} label={etiqueta} />
    );
  }
  return <>{children(recurso.datos)}</>;
}

function Indicador({
  titulo,
  valor,
  nota,
  etiqueta,
  grafica,
}: {
  titulo: string;
  valor: string;
  nota: string;
  /** What a screen reader says for the whole indicator. */
  etiqueta: string;
  grafica: ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={etiqueta}
      style={[tarjeta, { flexGrow: 1, flexBasis: 150, gap: space[2], padding: 14 }]}
    >
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {titulo}
      </Text>
      <Text
        style={{
          fontFamily: fonts.bodyStrong,
          fontSize: 30,
          lineHeight: 36,
          fontVariant: ['tabular-nums'],
        }}
      >
        {valor}
      </Text>
      <View aria-hidden importantForAccessibility="no-hide-descendants">
        {grafica}
      </View>
      <Text
        variant="caption"
        tone="muted"
        numberOfLines={2}
        style={{ fontSize: 12, lineHeight: 16 }}
      >
        {nota}
      </Text>
    </View>
  );
}

function Esqueleto() {
  return (
    <View
      accessible
      role="progressbar"
      accessibilityLabel="Cargando resumen"
      style={{ gap: space[4] }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexGrow: 1, flexBasis: 150 }}>
            <Skeleton height={108} />
          </View>
        ))}
      </View>
      <Skeleton height={300} />
      <Skeleton height={220} />
    </View>
  );
}

// ---- charts of the grid --------------------------------------------------------------------

const SERIES_FLUJO = [
  { texto: 'Socios', color: SERIE.tinta },
  { texto: 'Invitados', color: SERIE.gris },
  { texto: 'Personal', color: SERIE.claro },
];

function LlegadasPorHora({ datos }: { datos: PanelResumen }) {
  const flujo = completarFlujo(datos.flujo_por_hora);
  const columnas = flujo.map((h) => ({
    id: String(h.hora),
    etiqueta: pad2(h.hora),
    valores: FAMILIAS.map(([k]) => h[k]),
  }));
  const totales = columnas.map((c) => suma(c.valores));
  const total = suma(totales);
  const pico = indiceMaximo(totales);
  const fuera = Math.max(0, datos.kpis.visitas_hoy - total);
  const nota =
    total === 0
      ? 'Sin llegadas entre las 06 y las 22 h'
      : `Pico a las ${pad2(flujo[pico]!.hora)} h con ${totales[pico]}`;
  return (
    <Panel
      titulo="Llegadas por hora"
      nota={fuera > 0 ? `${nota} · ${fuera} fuera de ese horario` : nota}
    >
      <Leyenda items={SERIES_FLUJO} />
      <Columnas
        columnas={columnas}
        series={SERIES_FLUJO}
        modo="apilado"
        max={maximoEscala(Math.max(0, ...totales))}
        // The peak hour is always labelled, even when it is an odd hour.
        etiquetaX={(i) => (i === pico ? pad2(flujo[i]!.hora) : horaEtiqueta(flujo[i]!.hora))}
        destacar={pico}
        descripcion={`Flujo de visitas por hora: ${total} ${total === 1 ? 'visita' : 'visitas'} en el día`}
      />
    </Panel>
  );
}

function PorCategoria({ datos }: { datos: PanelResumen['por_categoria'] }) {
  const total = totalCategorias(datos);
  const valores = ORDEN_CATEGORIAS.map((k) => datos[k]);
  const max = maximoEscala(Math.max(0, ...valores));
  return (
    <Panel titulo="Llegadas por categoría" nota={`${total} en total`}>
      <BarrasHorizontales
        filas={ORDEN_CATEGORIAS.map((k) => ({
          id: k,
          etiqueta: ETIQUETA_CATEGORIA[k],
          valor: datos[k],
          texto: `${datos[k]} · ${porcentaje(datos[k], total)}`,
        }))}
        max={max}
        destacar={indiceMaximo(valores)}
        descripcion={`Visitas por categoría, ${total} en total`}
        anchoEtiqueta={72}
      />
    </Panel>
  );
}

function EstadoVisitas({
  recurso,
  invitaciones,
}: {
  recurso: Recurso<Visita[]>;
  invitaciones: number;
}) {
  return (
    <Panel
      titulo="Estado de las visitas"
      nota={`${invitaciones} ${invitaciones === 1 ? 'invitación activa' : 'invitaciones activas'}`}
    >
      <Cuerpo recurso={recurso} alto={140} etiqueta="Cargando visitas">
        {(visitas) => {
          return visitas.length === 0 ? (
            <Vacio titulo="Sin visitas este día" />
          ) : (
            <BarraVisitas visitas={visitas} />
          );
        }}
      </Cuerpo>
    </Panel>
  );
}

function Evaluaciones({ recurso }: { recurso: Recurso<ResumenEvaluaciones> }) {
  return (
    <Panel
      titulo="Evaluaciones"
      nota={
        recurso.datos
          ? `Robot ${mediaTexto(recurso.datos.promedio_robot ?? null)} · Club ${mediaTexto(recurso.datos.promedio_club ?? null)} · ${recurso.datos.items.length} ${recurso.datos.items.length === 1 ? 'respuesta' : 'respuestas'}`
          : 'Calificación de 1 a 5'
      }
    >
      <Cuerpo recurso={recurso} alto={200} etiqueta="Cargando evaluaciones">
        {(r) => {
          if (r.items.length === 0) return <Vacio titulo="Sin evaluaciones este día" />;
          return <DistribucionEvaluaciones items={r.items} />;
        }}
      </Cuerpo>
    </Panel>
  );
}

function EsperaEnCola({ cola, atencion }: { cola: ColaItem[] | null; atencion: number | null }) {
  const filas = cola === null ? null : ordenarCola(cola).slice(0, 6);
  const espera = filas?.map((c) => Math.round(c.espera_min)) ?? [];
  return (
    <Panel
      titulo="Espera en la cola"
      nota={
        atencion === null
          ? 'Atención promedio: sin datos'
          : `Atención promedio: ${minutos(atencion)} min`
      }
    >
      {filas === null ? (
        <Skeleton height={140} label="Cargando la cola" />
      ) : filas.length === 0 ? (
        <Vacio titulo="Nadie en espera" />
      ) : (
        <BarrasHorizontales
          filas={filas.map((c, i) => ({
            id: c.tarea_id ?? c.visita_id ?? c.nombre,
            etiqueta: c.nombre,
            valor: espera[i]!,
            texto: `${espera[i]} min`,
          }))}
          max={maximoEscala(Math.max(0, ...espera))}
          destacar={indiceMaximo(espera)}
          descripcion={`Espera en la cola: ${filas.length} ${filas.length === 1 ? 'persona' : 'personas'}`}
          anchoEtiqueta={88}
        />
      )}
    </Panel>
  );
}

function VisitasAcumuladas({ datos }: { datos: PanelResumen }) {
  const flujo = completarFlujo(datos.flujo_por_hora);
  const total = suma(flujo.map((h) => h.socios + h.invitados + h.personal));
  const serie = acumulado(flujo.map((h) => h.socios + h.invitados + h.personal));
  return (
    <Panel titulo="Visitas acumuladas" nota={`${total} hasta las 22 h`}>
      <Linea
        valores={serie}
        max={maximoEscala(total)}
        etiquetaX={(i) => horaEtiqueta(flujo[i]!.hora)}
        descripcion={`Visitas acumuladas del día: ${total}`}
      />
    </Panel>
  );
}

function EquipoEnTurno({ recurso }: { recurso: Recurso<MiembroEquipo[]> }) {
  const equipo = recurso.datos;
  const libres = equipo?.filter((m) => m.estado === 'DISPONIBLE').length ?? 0;
  return (
    <Panel
      titulo="Equipo en turno"
      nota={equipo ? `${libres} de ${equipo.length} disponibles` : undefined}
    >
      <Cuerpo recurso={recurso} alto={140} etiqueta="Cargando equipo">
        {(m) => {
          if (m.length === 0) return <Vacio titulo="Aún no hay equipo en el turno" />;
          return (
            <View style={{ gap: space[4] }}>
              <BarraEquipo equipo={m} />
              <View>
                {m.slice(0, 5).map((x, i, arr) => (
                  <View
                    key={x.id}
                    style={[
                      filaTabla(i === arr.length - 1),
                      { gap: space[3], paddingVertical: space[2] },
                    ]}
                  >
                    <Iniciales nombre={x.nombre} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text variant="label" numberOfLines={1}>
                        {x.nombre}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {tipoEquipo(x.tipo)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View
                        style={{ width: 10, height: 10, backgroundColor: COLOR_EQUIPO[x.estado] }}
                      />
                      <Text variant="caption">{CHIP_EQUIPO[x.estado].label}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {m.length > 5 ? (
                <Text variant="caption" tone="muted">
                  y {m.length - 5} más
                </Text>
              ) : null}
            </View>
          );
        }}
      </Cuerpo>
    </Panel>
  );
}

// ---- recent events ----------------------------------------------------------------------

function Actividad({
  filas,
  escritorio,
  sembrar,
}: {
  filas: PanelResumen['actividad'];
  escritorio: boolean;
  /** Quiet "load sample data" link of an empty day (ADMIN only). */
  sembrar: ReactNode;
}) {
  const visibles = filas.slice(0, 6);
  return (
    <Panel titulo="Eventos recientes" nota="Lo que reporta el robot">
      {filas.length === 0 ? (
        <Vacio
          titulo="Sin actividad todavía"
          detalle="Las llegadas y avisos del día aparecerán aquí."
          accion={sembrar}
        />
      ) : (
        <View>
          {escritorio ? (
            <CabeceraTabla
              cols={[
                { t: 'Hora', flex: 1 },
                { t: 'Evento', flex: 3 },
                { t: 'Persona', flex: 3 },
                { t: 'Destino', flex: 2.4 },
                { t: 'Estado', flex: 1.6 },
              ]}
            />
          ) : null}
          {visibles.map((f, i) => {
            const chip = CHIP_EVENTO[f.estado];
            const nombre = f.nombre ?? 'Sin identificar';
            const estado = <StatusChip kind={chip.kind} label={chip.label} />;
            const ultima = i === visibles.length - 1;
            return escritorio ? (
              <View key={f.id} style={filaTabla(ultima)}>
                <Text variant="label" style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
                  {horaBogota(f.ts)}
                </Text>
                <Text variant="label" numberOfLines={1} style={{ flex: 3 }}>
                  {tipoTexto(f.tipo)}
                </Text>
                <Text variant="label" numberOfLines={1} style={{ flex: 3 }}>
                  {nombre}
                </Text>
                <Text variant="label" tone="muted" numberOfLines={1} style={{ flex: 2.4 }}>
                  {f.destino ?? '—'}
                </Text>
                <View style={{ flex: 1.6 }}>{estado}</View>
              </View>
            ) : (
              <View key={f.id} style={filaTabla(ultima)}>
                <Iniciales nombre={f.nombre} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" numberOfLines={1}>
                    {nombre}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {`${tipoTexto(f.tipo)}${f.destino ? ` · ${f.destino}` : ''} · ${horaBogota(f.ts)}`}
                  </Text>
                </View>
                {estado}
              </View>
            );
          })}
        </View>
      )}
    </Panel>
  );
}

export function ResumenView({
  datos,
  fecha,
  esHoy,
  cola,
  error,
  sinConexion,
  onReintentar,
  onSembrar,
  sembrando = false,
}: {
  datos: PanelResumen | null;
  fecha: string;
  esHoy: boolean;
  /** Queue already polled by the screen; null while it loads. */
  cola: ColaItem[] | null;
  error: { detalle: string } | null;
  sinConexion: boolean;
  onReintentar: () => void;
  /** Present only for ADMIN: loads the sample data (POST /demo/sembrar). */
  onSembrar?: () => void;
  sembrando?: boolean;
}) {
  const { client } = useSession();
  const activa = usePantallaActiva();
  const lienzo = useLienzo();
  const visitas = useRecurso(
    useCallback(() => client.visitas({ fecha }), [client, fecha]),
    { activo: activa, cadaMs: SONDEO_MS, clave: fecha },
  );
  const evaluaciones = useRecurso(
    useCallback(() => client.evaluaciones(fecha), [client, fecha]),
    { activo: activa, cadaMs: SONDEO_MS, clave: fecha },
  );
  const equipo = useRecurso(
    useCallback(() => client.equipo(), [client]),
    { activo: activa, cadaMs: SONDEO_COLA_MS },
  );

  if (datos === null) {
    return error ? (
      <ErrorState
        title={sinConexion ? 'Sin conexión' : 'No pudimos cargar el resumen'}
        description={error.detalle}
        onRetry={onReintentar}
      />
    ) : (
      <Esqueleto />
    );
  }
  const k = datos.kpis;
  const flujo = completarFlujo(datos.flujo_por_hora);
  const categorias = completarCategorias(datos.por_categoria);
  const totales = flujo.map((h) => h.socios + h.invitados + h.personal);
  const abiertas = visitas.datos?.filter((v) => v.estado !== 'CERRADA').length ?? null;
  const robot = evaluaciones.datos?.promedio_robot ?? null;
  const respuestas = evaluaciones.datos?.items.length ?? 0;
  const eventos = partesEventos(datos.actividad.map((a) => a.estado));
  const item = (span: number): { width: number } => ({ width: lienzo.span(span) });
  return (
    <View style={{ gap: space[5] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        <Indicador
          titulo={esHoy ? 'Visitas hoy' : 'Visitas ayer'}
          valor={String(k.visitas_hoy)}
          nota={`${k.visitantes_vip} VIP · ${porcentaje(k.visitantes_vip, k.visitas_hoy)} del total`}
          etiqueta={`${esHoy ? 'Visitas hoy' : 'Visitas ayer'}: ${k.visitas_hoy}. ${k.visitantes_vip} VIP, ${porcentaje(k.visitantes_vip, k.visitas_hoy)} del total`}
          grafica={
            <MiniColumnas valores={totales} destacar={indiceMaximo(totales)} descripcion="" />
          }
        />
        <Indicador
          titulo="En el club"
          valor={abiertas === null ? '—' : String(abiertas)}
          nota={
            visitas.datos
              ? `de ${visitas.datos.length} ${visitas.datos.length === 1 ? 'visita' : 'visitas'} del día`
              : 'Cargando visitas'
          }
          etiqueta={`En el club: ${abiertas === null ? 'sin datos' : abiertas}`}
          grafica={
            <MiniBarra
              fraccion={visitas.datos?.length ? (abiertas ?? 0) / visitas.datos.length : 0}
              descripcion=""
            />
          }
        />
        <Indicador
          titulo="Alertas abiertas"
          valor={String(k.alertas_abiertas)}
          nota="Requieren atención"
          etiqueta={`Alertas abiertas: ${k.alertas_abiertas}. Requieren atención`}
          grafica={<BarraApilada100 compacta partes={eventos} descripcion="" />}
        />
        <Indicador
          titulo="Evaluación media"
          valor={mediaTexto(robot)}
          nota={`${respuestas} ${respuestas === 1 ? 'respuesta' : 'respuestas'} · del robot, sobre 5`}
          etiqueta={`Evaluación media del robot: ${mediaTexto(robot)} de 5, ${respuestas} respuestas`}
          grafica={<MiniBarra fraccion={(robot ?? 0) / 5} descripcion="" />}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        <View style={item(2)}>
          <LlegadasPorHora datos={datos} />
        </View>
        <View style={item(1)}>
          <PorCategoria datos={categorias} />
        </View>
        <View style={item(1)}>
          <EstadoVisitas recurso={visitas} invitaciones={k.invitaciones_activas} />
        </View>
        <View style={item(1)}>
          <Evaluaciones recurso={evaluaciones} />
        </View>
        <View style={item(1)}>
          <EsperaEnCola cola={cola} atencion={k.atencion_promedio_min} />
        </View>
        <View style={item(lienzo.cols >= 3 ? 2 : 1)}>
          <VisitasAcumuladas datos={datos} />
        </View>
        <View style={item(1)}>
          <EquipoEnTurno recurso={equipo} />
        </View>
      </View>
      <Actividad
        filas={datos.actividad}
        escritorio={lienzo.escritorio}
        sembrar={
          onSembrar && esHoy && k.visitas_hoy === 0 ? (
            <EnlaceTexto
              label={sembrando ? 'Cargando datos…' : 'Cargar datos iniciales'}
              disabled={sembrando}
              onPress={onSembrar}
            />
          ) : null
        }
      />
    </View>
  );
}
