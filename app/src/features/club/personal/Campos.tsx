import { View } from 'react-native';

import { Text, TextField, space } from '../../../design-system';
import { Opciones } from '../edecan/ui';
import { fechasRapidas, formatoHora } from '../socio/dates';

/** Date as quick picks (today, tomorrow, next days); keeps a value outside them selectable. */
export function CampoFecha({
  hoy,
  valor,
  onCambio,
  error,
}: {
  hoy: string;
  valor: string;
  onCambio: (v: string) => void;
  error?: string;
}) {
  const base = fechasRapidas(hoy, 6);
  const opciones =
    base.some((o) => o.value === valor) || !valor
      ? base
      : [{ value: valor, label: valor }, ...base];
  return (
    <View style={{ gap: space[1] }}>
      <Opciones
        etiqueta="Fecha"
        opciones={opciones.map((o) => ({ clave: o.value, etiqueta: o.label }))}
        valor={valor || null}
        onCambio={onCambio}
      />
      {error ? (
        <Text variant="caption" tone="danger" role="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Two 24-hour fields side by side; typing `0930` becomes `09:30`. */
export function CamposHorario({
  desde,
  hasta,
  onCambio,
  errores,
}: {
  desde: string;
  hasta: string;
  onCambio: (campo: 'hora_desde' | 'hora_hasta', v: string) => void;
  errores: { hora_desde?: string; hora_hasta?: string };
}) {
  return (
    <View style={{ flexDirection: 'row', gap: space[3] }}>
      <View style={{ flex: 1 }}>
        <TextField
          label="Desde"
          value={desde}
          onChangeText={(v) => onCambio('hora_desde', formatoHora(v))}
          error={errores.hora_desde}
          keyboardType="number-pad"
          maxLength={5}
        />
      </View>
      <View style={{ flex: 1 }}>
        <TextField
          label="Hasta"
          value={hasta}
          onChangeText={(v) => onCambio('hora_hasta', formatoHora(v))}
          error={errores.hora_hasta}
          keyboardType="number-pad"
          maxLength={5}
        />
      </View>
    </View>
  );
}
