import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import type { EstadoEquipo } from '../../../club/types';
import { Button, Icon, MobileHeader, Text, Touchable, colors, space } from '../../../design-system';
import { useSession } from '../session';
import { describir } from '../socio/errors';
import { Frame } from '../socio/ui/Frame';
import { useRecurso } from '../ui/useRecurso';
import { useAvisar } from './Guardia';
import { ESTADOS } from './model';
import { FotoPersona, HAIRLINE, Seccion } from './ui';

/** Who is signed in, the role's own controls (`children`) and "Cerrar sesión". Shared by both team apps. */
export function PerfilBase({ rol, children }: { rol: string; children?: ReactNode }) {
  const { usuario, logout, client } = useSession();
  const [saliendo, setSaliendo] = useState(false);
  if (!usuario) return null;
  const nombre = `${usuario.nombre} ${usuario.apellido}`;
  return (
    <Frame header={<MobileHeader title="Mi perfil" />}>
      <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }}>
        <FotoPersona client={client} nombre={nombre} />
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="h3" level={2}>
            {nombre}
          </Text>
          <Text variant="label" tone="muted">
            {rol}
          </Text>
        </View>
      </View>
      {children}
      <Button
        label="Cerrar sesión"
        variant="secondary"
        fullWidth
        loading={saliendo}
        onPress={() => {
          setSaliendo(true);
          void logout();
        }}
      />
    </Frame>
  );
}

/** Picker of the edecán's own state: the team board and the dispatcher read it. */
function MiEstado() {
  const { client, usuario } = useSession();
  const avisar = useAvisar();
  const cargar = useCallback(() => client.equipo(), [client]);
  const { datos } = useRecurso(cargar);
  const [elegido, setElegido] = useState<EstadoEquipo | null>(null);
  const [cambiando, setCambiando] = useState<EstadoEquipo | null>(null);
  const actual = elegido ?? datos?.find((m) => m.id === usuario?.id)?.estado ?? null;

  const cambiar = async (estado: EstadoEquipo) => {
    if (cambiando || estado === actual) return;
    setCambiando(estado);
    try {
      await client.miEstado(estado);
      setElegido(estado);
      avisar(`Estado: ${ESTADOS.find((e) => e.clave === estado)?.etiqueta ?? estado}`, 'success');
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    } finally {
      setCambiando(null);
    }
  };

  return (
    <Seccion titulo="Mi estado">
      <View role="radiogroup" accessibilityLabel="Mi estado">
        {ESTADOS.map((e) => {
          const activo = e.clave === actual;
          return (
            <Touchable
              key={e.clave}
              role="radio"
              label={`${e.etiqueta}, ${e.detalle}`}
              accessibilityState={{ checked: activo, busy: cambiando === e.clave }}
              onPress={() => void cambiar(e.clave)}
              style={({ pressed }) => ({
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                paddingVertical: space[2],
                borderBottomWidth: 1,
                borderBottomColor: HAIRLINE,
                backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
              })}
            >
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ fontSize: 16 }}>
                  {e.etiqueta}
                </Text>
                <Text variant="caption" tone="muted">
                  {e.detalle}
                </Text>
              </View>
              {activo ? <Icon name="checkmark-outline" size={24} color={colors.ink} /> : null}
            </Touchable>
          );
        })}
      </View>
    </Seccion>
  );
}

export function PerfilEdecan() {
  return (
    <PerfilBase rol="Edecán · acompañamiento">
      <MiEstado />
    </PerfilBase>
  );
}
