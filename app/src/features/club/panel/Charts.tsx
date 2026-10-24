// Charts of the panel, drawn with Views and react-native-svg: straight bars, straight line
// segments, square corners. Series are ink and warm greys; gold marks only the key bar or point.
import { useState } from 'react';
import { View, type LayoutChangeEvent, type TextStyle } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';

import { Text, colors, fonts, space } from '../../../design-system';
import { alturasApiladas, marcas, proporciones, puntosLinea, suma } from './escalas';

export const SERIE = {
  tinta: colors.ink,
  gris: '#77726A',
  claro: '#B9B4A9',
  hueso: '#DEDAD0',
  oro: colors.gold,
} as const;
/** Gridlines: lighter than the black card lines, so the data stays the loudest thing. */
export const REJILLA = '#E1DDD3';

const NUM: TextStyle = { fontVariant: ['tabular-nums'] };
const EJE: TextStyle = { ...NUM, fontSize: 11, lineHeight: 14 };
const GUTTER = 30;

/** Axis or value label: muted, tabular, small. */
function Etiqueta({ children, style }: { children: string | number; style?: TextStyle }) {
  return (
    <Text variant="caption" tone="muted" style={{ ...EJE, ...style }}>
      {children}
    </Text>
  );
}

export type ItemLeyenda = { color: string; texto: string; valor?: string };

/** Legend with square swatches; with `valor` each row also gives its number. */
export function Leyenda({ items }: { items: readonly ItemLeyenda[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], columnGap: space[4] }}>
      {items.map((i) => (
        <View key={i.texto} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, backgroundColor: i.color }} />
          <Text variant="caption" tone="muted">
            {i.valor === undefined ? i.texto : `${i.texto} ${i.valor}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Y axis: a label per gridline, bottom-up, placed on the line it names. */
function EjeY({ max, alto }: { max: number; alto: number }) {
  return (
    <View style={{ height: alto, width: GUTTER }}>
      {marcas(max).map((t, i) => (
        <Etiqueta
          key={i}
          style={{
            position: 'absolute',
            right: 0,
            bottom: (alto - 1) * (i / 4) - 7,
            textAlign: 'right',
          }}
        >
          {t}
        </Etiqueta>
      ))}
    </View>
  );
}

function Rejilla({ alto }: { alto: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: (alto - 1) * (i / 4),
            height: 1,
            backgroundColor: i === 0 ? colors.border : REJILLA,
          }}
        />
      ))}
    </>
  );
}

export type Columna = { id: string; etiqueta: string; valores: readonly number[] };

/**
 * Vertical bars. `apilado`: the series of a column stack on top of each other (first at the
 * bottom); `agrupado`: they stand side by side. `max` is the top of the axis (see `maximoEscala`).
 * `destacar` boxes one column in gold; `valores` writes the number over every bar.
 */
export function Columnas({
  columnas,
  series,
  modo,
  max,
  alto = 168,
  etiquetaX,
  destacar = -1,
  valores = false,
  descripcion,
}: {
  columnas: readonly Columna[];
  series: readonly { texto: string; color: string }[];
  modo: 'apilado' | 'agrupado';
  max: number;
  alto?: number;
  etiquetaX: (i: number) => string;
  destacar?: number;
  valores?: boolean;
  descripcion: string;
}) {
  return (
    <View accessible accessibilityLabel={descripcion} style={{ marginTop: 18 }}>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <EjeY max={max} alto={alto} />
        <View style={{ flex: 1, height: alto }}>
          <Rejilla alto={alto} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
            {columnas.map((c, ci) => {
              const total = suma(c.valores);
              const alturas = alturasApiladas(c.valores, max, alto - 1);
              const esPico = ci === destacar;
              return (
                <View
                  key={c.id}
                  aria-hidden={total === 0}
                  style={{
                    flex: 1,
                    height: '100%',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                  }}
                >
                  {modo === 'apilado' ? (
                    <View style={{ width: '78%', maxWidth: 28, alignItems: 'center' }}>
                      {esPico ? (
                        <Etiqueta style={{ color: colors.ink, fontFamily: fonts.bodyStrong }}>
                          {total}
                        </Etiqueta>
                      ) : null}
                      <View
                        style={{
                          width: '100%',
                          flexDirection: 'column-reverse',
                          borderWidth: esPico ? 2 : 0,
                          borderColor: SERIE.oro,
                        }}
                      >
                        {series.map((s, si) => (
                          <View
                            key={s.texto}
                            style={{ height: alturas[si] ?? 0, backgroundColor: s.color }}
                          />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                      {series.map((s, si) => (
                        <View key={s.texto} style={{ width: 22, alignItems: 'center' }}>
                          {valores ? <Etiqueta>{c.valores[si] ?? 0}</Etiqueta> : null}
                          <View
                            style={{
                              width: '100%',
                              height: alturas[si] ?? 0,
                              backgroundColor: s.color,
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>
      <View
        style={{ flexDirection: 'row', marginLeft: GUTTER + space[2], gap: 3, marginTop: space[2] }}
      >
        {columnas.map((c, i) => (
          <View key={c.id} style={{ flex: 1, alignItems: 'center' }}>
            {/* Wider than its column so two digits never truncate. */}
            <Etiqueta
              style={{
                width: 30,
                flexShrink: 0,
                textAlign: 'center',
                color: i === destacar ? colors.ink : colors.textMuted,
                fontFamily: i === destacar ? fonts.bodyStrong : fonts.body,
              }}
            >
              {etiquetaX(i)}
            </Etiqueta>
            {i === destacar ? (
              <View style={{ width: 16, height: 3, marginTop: 2, backgroundColor: SERIE.oro }} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export type FilaBarra = { id: string; etiqueta: string; valor: number; texto?: string };

const ALTO_FILA = 30;

/** Horizontal bars, one per row, all on the same 0..max scale; `destacar` paints one in gold. */
export function BarrasHorizontales({
  filas,
  max,
  destacar = -1,
  formato = String,
  descripcion,
  anchoEtiqueta = 96,
}: {
  filas: readonly FilaBarra[];
  max: number;
  destacar?: number;
  formato?: (v: number) => string;
  descripcion: string;
  anchoEtiqueta?: number;
}) {
  const alto = filas.length * ALTO_FILA;
  return (
    <View accessible accessibilityLabel={descripcion} style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <View style={{ width: anchoEtiqueta }}>
          {filas.map((f) => (
            <View key={f.id} style={{ height: ALTO_FILA, justifyContent: 'center' }}>
              <Text variant="caption" numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>
                {f.etiqueta}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1, height: alto }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${i * 25}%`,
                width: 1,
                backgroundColor: i === 0 ? colors.border : REJILLA,
              }}
            />
          ))}
          {filas.map((f, i) => (
            <View key={f.id} style={{ height: ALTO_FILA, justifyContent: 'center' }}>
              <View
                style={{
                  width: max > 0 ? `${(f.valor / max) * 100}%` : '0%',
                  height: 14,
                  marginLeft: 1,
                  backgroundColor: i === destacar ? SERIE.oro : SERIE.tinta,
                }}
              />
            </View>
          ))}
        </View>
        <View style={{ width: 44 }}>
          {filas.map((f) => (
            <View key={f.id} style={{ height: ALTO_FILA, justifyContent: 'center' }}>
              <Etiqueta style={{ color: colors.ink, fontFamily: fonts.bodyStrong, fontSize: 12 }}>
                {f.texto ?? formato(f.valor)}
              </Etiqueta>
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <View style={{ width: anchoEtiqueta }} />
        <View style={{ flex: 1, height: 14 }}>
          {marcas(max).map((t, i) => (
            <Etiqueta
              key={i}
              style={{
                position: 'absolute',
                left: `${i * 25}%`,
                width: 32,
                marginLeft: i === 0 ? 0 : -16,
                textAlign: i === 0 ? 'left' : 'center',
              }}
            >
              {t}
            </Etiqueta>
          ))}
        </View>
        <View style={{ width: 44 }} />
      </View>
    </View>
  );
}

export type Parte = { id: string; texto: string; valor: number; color: string };

/** True when white text reads on that fill (the two darkest series). */
const fondoOscuro = (c: string) => c === SERIE.tinta || c === SERIE.gris;

/**
 * One 100 % stacked bar: segment widths are shares of the total. With `compacta` it is a thin
 * strip for the indicator row; otherwise it carries the count inside the wide segments and a
 * 0-100 % scale under it.
 */
export function BarraApilada100({
  partes,
  compacta = false,
  descripcion,
}: {
  partes: readonly Parte[];
  compacta?: boolean;
  descripcion: string;
}) {
  const shares = proporciones(partes.map((p) => p.valor));
  const activas = partes.filter((p) => p.valor > 0);
  return (
    <View accessible accessibilityLabel={descripcion} style={{ gap: space[1] }}>
      <View
        style={{
          flexDirection: 'row',
          height: compacta ? 10 : 34,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.paper,
        }}
      >
        {activas.map((p, i) => (
          <View
            key={p.id}
            style={{
              flexGrow: p.valor,
              flexBasis: 0,
              backgroundColor: p.color,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: i === 0 ? 0 : 1,
            }}
          >
            {!compacta && shares[partes.indexOf(p)]! >= 0.1 ? (
              <Text
                style={{
                  ...NUM,
                  fontFamily: fonts.bodyStrong,
                  fontSize: 13,
                  lineHeight: 16,
                  color: fondoOscuro(p.color) ? colors.white : colors.ink,
                }}
              >
                {p.valor}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {compacta ? null : (
        <View style={{ height: 14 }}>
          {[0, 25, 50, 75, 100].map((t, i) => (
            <Etiqueta
              key={t}
              style={{
                position: 'absolute',
                left: `${i * 25}%`,
                width: 36,
                marginLeft: i === 0 ? 0 : i === 4 ? -36 : -18,
                textAlign: i === 0 ? 'left' : i === 4 ? 'right' : 'center',
              }}
            >
              {`${t} %`}
            </Etiqueta>
          ))}
        </View>
      )}
    </View>
  );
}

/** Legend rows with the count and the share of each part. */
export function LeyendaPartes({ partes }: { partes: readonly Parte[] }) {
  const total = suma(partes.map((p) => p.valor));
  return (
    <View style={{ gap: space[1] }}>
      {partes.map((p) => (
        <View
          key={p.id}
          accessible
          accessibilityLabel={`${p.texto}: ${p.valor}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
        >
          <View style={{ width: 10, height: 10, backgroundColor: p.color }} />
          <Text variant="caption" style={{ flex: 1 }}>
            {p.texto}
          </Text>
          <Text variant="caption" style={{ ...NUM, fontFamily: fonts.bodyStrong }}>
            {p.valor}
          </Text>
          <Text variant="caption" tone="muted" style={{ ...NUM, minWidth: 40, textAlign: 'right' }}>
            {total > 0 ? `${Math.round((p.valor / total) * 100)} %` : '0 %'}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Tiny bars for the indicator row (no axis); the highest one is gold. */
export function MiniColumnas({
  valores,
  destacar = -1,
  descripcion,
}: {
  valores: readonly number[];
  destacar?: number;
  descripcion: string;
}) {
  const max = Math.max(1, ...valores);
  return (
    <View
      accessible
      accessibilityLabel={descripcion}
      style={{
        height: 28,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {valores.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: v > 0 ? Math.max(2, (v / max) * 27) : 0,
            backgroundColor: i === destacar ? SERIE.oro : SERIE.tinta,
          }}
        />
      ))}
    </View>
  );
}

/** Thin progress bar: `fraccion` (0..1) of the track is ink. */
export function MiniBarra({ fraccion, descripcion }: { fraccion: number; descripcion: string }) {
  return (
    <View
      accessible
      accessibilityLabel={descripcion}
      style={{
        height: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.paper,
      }}
    >
      <View
        style={{
          width: `${Math.min(1, Math.max(0, fraccion)) * 100}%`,
          height: '100%',
          backgroundColor: SERIE.tinta,
        }}
      />
    </View>
  );
}

/** Line of straight segments over the same 0..max axis; the last point is the gold one. */
export function Linea({
  valores,
  max,
  etiquetaX,
  alto = 168,
  descripcion,
}: {
  valores: readonly number[];
  max: number;
  etiquetaX: (i: number) => string;
  alto?: number;
  descripcion: string;
}) {
  const [ancho, setAncho] = useState(320);
  const PAD = 8;
  const puntos = puntosLinea(valores, Math.max(ancho - 2 * PAD, 1), alto - 1, max).map((p) => ({
    x: p.x + PAD,
    y: p.y,
  }));
  const ultimo = puntos[puntos.length - 1];
  return (
    <View accessible accessibilityLabel={descripcion} style={{ marginTop: 18 }}>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <EjeY max={max} alto={alto} />
        <View
          style={{ flex: 1, height: alto }}
          onLayout={(e: LayoutChangeEvent) => setAncho(Math.round(e.nativeEvent.layout.width))}
        >
          <Rejilla alto={alto} />
          <Svg width={ancho} height={alto} style={{ position: 'absolute', left: 0, top: 0 }}>
            <Polyline
              points={puntos.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={SERIE.tinta}
              strokeWidth={2}
              strokeLinejoin="miter"
              strokeLinecap="butt"
            />
            {puntos.slice(0, -1).map((p, i) => (
              <Rect key={i} x={p.x - 2.5} y={p.y - 2.5} width={5} height={5} fill={SERIE.tinta} />
            ))}
            {ultimo ? (
              <Rect
                x={ultimo.x - 4.5}
                y={ultimo.y - 4.5}
                width={9}
                height={9}
                fill={SERIE.oro}
                stroke={SERIE.tinta}
                strokeWidth={1}
              />
            ) : null}
          </Svg>
          {ultimo ? (
            <Etiqueta
              style={{
                position: 'absolute',
                left: Math.max(0, Math.min(ancho - 40, ultimo.x - 20)),
                top: Math.max(-16, ultimo.y - 24),
                width: 40,
                textAlign: 'center',
                color: colors.ink,
                fontFamily: fonts.bodyStrong,
              }}
            >
              {valores[valores.length - 1] ?? 0}
            </Etiqueta>
          ) : null}
        </View>
      </View>
      <View style={{ height: 16, marginLeft: GUTTER + space[2], marginTop: space[2] }}>
        {valores.map((_, i) => (
          <Etiqueta
            key={i}
            style={{
              position: 'absolute',
              left: puntos[i]!.x - 15,
              width: 30,
              textAlign: 'center',
            }}
          >
            {etiquetaX(i)}
          </Etiqueta>
        ))}
      </View>
    </View>
  );
}
