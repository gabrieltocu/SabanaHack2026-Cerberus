import { useState } from 'react';
import { View } from 'react-native';

import type { Incidencia } from '../../../club/types';
import { Button, Icon, Text, TextField, Touchable, colors, space } from '../../../design-system';
import { useSession } from '../session';
import { describir } from '../socio/errors';
import { useAvisar } from './Guardia';
import { TIPOS_REPORTE } from './model';

/**
 * Report form of the team apps: four type tiles, «¿Qué pasó?» and Enviar. `visitaId` ties the
 * report to the visit the person is escorting, with no extra control.
 */
export function FormularioReporte({
  visitaId,
  onEnviado,
}: {
  visitaId?: string;
  onEnviado?: () => void | Promise<void>;
}) {
  const { client } = useSession();
  const avisar = useAvisar();
  const [tipo, setTipo] = useState<Incidencia['tipo'] | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [faltan, setFaltan] = useState<{ tipo?: string; descripcion?: string }>({});
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const f = {
      tipo: tipo ? undefined : 'Elige qué pasó.',
      descripcion: descripcion.trim() ? undefined : 'Cuéntanos qué pasó.',
    };
    setFaltan(f);
    if (f.tipo || f.descripcion || !tipo || enviando) return;
    setEnviando(true);
    try {
      await client.reportarIncidencia({
        tipo,
        descripcion: descripcion.trim(),
        ...(visitaId ? { visita_id: visitaId } : {}),
      });
      avisar('Incidencia reportada', 'success');
      setTipo(null);
      setDescripcion('');
      await onEnviado?.();
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={{ gap: space[4] }}>
      <View style={{ gap: space[2] }}>
        <View
          role="radiogroup"
          accessibilityLabel="Tipo de incidencia"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
        >
          {TIPOS_REPORTE.map((t) => {
            const activa = t.clave === tipo;
            return (
              <Touchable
                key={t.clave}
                role="radio"
                label={t.etiqueta}
                accessibilityState={{ checked: activa }}
                onPress={() => {
                  setTipo(t.clave);
                  setFaltan((f) => ({ ...f, tipo: undefined }));
                }}
                style={({ pressed }) => ({
                  flexGrow: 1,
                  flexBasis: '45%',
                  minHeight: 80,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space[2],
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: activa || pressed ? colors.surfaceSoft : colors.surface,
                })}
              >
                <Icon name={t.icon} size={24} color={colors.gold} />
                <Text variant="label">{t.etiqueta}</Text>
              </Touchable>
            );
          })}
        </View>
        {faltan.tipo ? (
          <Text variant="caption" tone="danger" role="alert">
            {faltan.tipo}
          </Text>
        ) : null}
      </View>
      <TextField
        label="¿Qué pasó?"
        value={descripcion}
        onChangeText={(v) => {
          setDescripcion(v);
          setFaltan((f) => ({ ...f, descripcion: undefined }));
        }}
        error={faltan.descripcion}
        multiline
      />
      <Button label="Enviar" size="lg" fullWidth loading={enviando} onPress={() => void enviar()} />
    </View>
  );
}
