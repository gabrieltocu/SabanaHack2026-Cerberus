// Pantallas 2 (pase) y 4 (pase en pantalla grande) del invitado con QR firmado.
import { View } from 'react-native';
import { Button, Icon, Text, Touchable, colors, space, useBreakpoint } from '../../design-system';
import type { PaseVista } from '../../club/types';
import { PaseGrande } from './Pase';
import {
  bienvenidaDe,
  estadoVista,
  lineaPase,
  primerNombre,
  relevo,
  visitaActiva,
} from './paseVista';
import { Cuerpo, Encabezado, Marca, Nota } from './ui';

export const AYUDA_ROBOT = 'Muéstralo al robot en la entrada';

export type Irse = { onAcompanamiento: () => void; onPase: () => void };

const useLado = (max: number) =>
  Math.min(max, useBreakpoint().width - space[4] * 2 - space[3] * 2 - 2);

/** Pase con QR, o el motivo por el que ya no sirve. */
function PasePanel({ p, qr, lado }: { p: PaseVista; qr: string; lado: number }) {
  const { clave, etiqueta } = estadoVista(p);
  if (clave === 'cancelada' || clave === 'vencida') {
    return (
      <Nota
        tono={clave === 'cancelada' ? 'danger' : 'warning'}
        titulo={`Invitación ${etiqueta.toLowerCase()}`}
      >
        {`Habla con ${p.anfitrion.nombre} para que te envíe un pase nuevo.`}
      </Nota>
    );
  }
  return (
    <PaseGrande
      saludo={bienvenidaDe(p)}
      nombre={primerNombre(p)}
      qr={qr}
      lado={lado}
      etiquetaQr="Código QR de tu pase. Muéstralo al robot en la entrada."
      linea={lineaPase(p)}
      ayuda={AYUDA_ROBOT}
    />
  );
}

/** Pantalla 2. Antes de llegar manda el QR; dentro del club manda quién te acompaña. */
export function MiVisita({ p, qr, onAcompanamiento, onPase }: { p: PaseVista; qr: string } & Irse) {
  const activa = visitaActiva(p);
  const aviso = activa ? relevo(activa) : null;
  const lado = useLado(260);
  return (
    <>
      <Marca />
      <Cuerpo>
        {aviso?.tipo === 'nuevo' ? (
          <Nota
            tono="success"
            titulo={`Ahora te acompaña ${aviso.nombre}`}
            icon="swap-horizontal-outline"
          />
        ) : null}
        {activa?.acompanante ? (
          <>
            <Text variant="display" level={1} align="center">
              {`Hola,\n${primerNombre(p)}`}
            </Text>
            <Touchable
              label={`Te acompaña ${activa.acompanante.nombre}. Ver acompañamiento`}
              onPress={onAcompanamiento}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: colors.gold,
                backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
                padding: space[4],
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
              })}
            >
              <Icon
                name={
                  activa.acompanante.tipo === 'ROBOT' ? 'hardware-chip-outline' : 'person-outline'
                }
                size={28}
                color={colors.gold}
              />
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">
                  Te acompaña
                </Text>
                <Text variant="h2">{activa.acompanante.nombre}</Text>
              </View>
              <Icon name="chevron-forward-outline" size={20} color={colors.ink} />
            </Touchable>
            <Button label="Ver mi pase" variant="secondary" size="lg" fullWidth onPress={onPase} />
          </>
        ) : (
          <PasePanel p={p} qr={qr} lado={lado} />
        )}
      </Cuerpo>
    </>
  );
}

/** Pantalla 4: el QR lo más grande posible. */
export function MiPase({ p, qr, onBack }: { p: PaseVista; qr: string; onBack: () => void }) {
  const lado = useLado(320);
  return (
    <>
      <Encabezado titulo="Mi pase" onBack={onBack} />
      <Cuerpo>
        <PasePanel p={p} qr={qr} lado={lado} />
      </Cuerpo>
    </>
  );
}
