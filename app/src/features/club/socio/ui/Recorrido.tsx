import { View } from 'react-native';

import { Text, colors, fonts, space } from '../../../../design-system';
import type { Visita } from '../../../../club/types';
import { horaDe } from '../dates';
import { NOVEDAD, fases, novedades } from '../visitas';

const PUNTO = 12;

/**
 * Timeline of the visit: llegada, acompañamiento, (cambio de acompañante, entrega) and destino.
 * Reached steps are filled, the current one has a gold ring. Other events (help, meeting point,
 * exit) follow underneath in time order.
 */
export function Recorrido({ visita }: { visita: Visita }) {
  const pasos = fases(visita);
  const otras = novedades(visita);
  return (
    <View role="list" accessibilityLabel="Recorrido de la visita" style={{ gap: 0 }}>
      {pasos.map((f, i) => {
        const hecha = f.estado === 'hecha';
        const actual = f.estado === 'actual';
        return (
          <View
            key={f.clave}
            role="listitem"
            accessible
            accessibilityLabel={`${f.titulo}, ${hecha ? `listo a las ${f.hora}` : actual ? 'en curso' : 'pendiente'}${f.detalle ? `. ${f.detalle}` : ''}`}
            style={{ flexDirection: 'row', gap: space[3] }}
          >
            <View style={{ alignItems: 'center', width: PUNTO }}>
              <View
                aria-hidden
                style={{
                  marginTop: 4,
                  width: PUNTO,
                  height: PUNTO,
                  borderWidth: actual ? 3 : 1,
                  borderColor: hecha || actual ? colors.gold : colors.border,
                  backgroundColor: hecha ? colors.gold : colors.bg,
                }}
              />
              {i < pasos.length - 1 ? (
                <View
                  aria-hidden
                  style={{
                    flex: 1,
                    width: 1,
                    minHeight: space[4],
                    backgroundColor: hecha ? colors.gold : colors.surfaceMuted,
                  }}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: space[4] }}>
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[2] }}
              >
                <Text
                  style={{
                    flexShrink: 1,
                    fontSize: 15,
                    lineHeight: 22,
                    fontFamily: actual ? fonts.bodyStrong : fonts.body,
                    color: hecha || actual ? colors.text : colors.textMuted,
                  }}
                >
                  {f.titulo}
                </Text>
                {f.hora ? (
                  <Text variant="caption" tone="muted">
                    {f.hora}
                  </Text>
                ) : null}
              </View>
              {f.detalle ? (
                <Text variant="caption" tone="muted">
                  {f.detalle}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {otras.map((p) => (
        <View
          key={`${p.tipo}-${p.ts}`}
          role="listitem"
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: space[2],
            paddingVertical: space[2],
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="label">{NOVEDAD[p.tipo] ?? p.tipo}</Text>
            {p.detalle ? (
              <Text variant="caption" tone="muted">
                {p.detalle}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" tone="muted">
            {horaDe(p.ts)}
          </Text>
        </View>
      ))}
    </View>
  );
}
