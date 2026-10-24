import { useState } from 'react';
import { View } from 'react-native';

import { Icon, Text, TextField, Touchable, colors, fonts, space } from '../../../../design-system';
import { ASISTENCIA, BEBIDAS, PUNTOS_ENCUENTRO } from '../catalogos';
import { fechasRapidas, formatoHora } from '../dates';
import { LUGARES } from '../model';
import type { InvitationForm } from '../useInvitationForm';
import { ChipsField } from './ChipsField';
import { Opciones } from './Opciones';
import { PhotoField, TEXTOS_CEDULA } from './PhotoField';

const TRATOS = [
  { value: 'senor', label: 'Señor' },
  { value: 'senora', label: 'Señora' },
];

const Error = ({ texto }: { texto?: string }) =>
  texto ? (
    <Text variant="caption" tone="danger" role="alert">
      {texto}
    </Text>
  ) : null;

/**
 * The invitation form body. What the API requires is always in view (who, day and hours, place);
 * the photo is a dashed box and everything optional hides behind "Más detalles", which opens by
 * itself when one of its fields has an error. The action button lives in the screen's bottom bar.
 */
export function InvitationFields({
  form,
  hoy,
  conFoto,
  disabled,
}: {
  form: InvitationForm;
  hoy: string;
  /** Edit mode manages the photos and the cédula from the detail screen instead. */
  conFoto: boolean;
  disabled: boolean;
}) {
  const { values: v, set, errores: e } = form;
  const [abierto, setAbierto] = useState(false);
  // Open while a hidden field needs attention (an error, or a cédula photo awaiting its consent).
  const visible = abierto || !!(e.fecha || e.documento || form.fotoDoc);
  return (
    <View style={{ gap: space[5] }}>
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Nombre"
            value={v.nombre}
            editable={!disabled}
            autoCapitalize="words"
            autoComplete="off"
            maxLength={40}
            onChangeText={(t) => set('nombre', t)}
            error={e.nombre}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Apellido"
            value={v.apellido}
            editable={!disabled}
            autoCapitalize="words"
            autoComplete="off"
            maxLength={40}
            onChangeText={(t) => set('apellido', t)}
            error={e.apellido}
          />
        </View>
      </View>
      <View style={{ gap: space[2] }}>
        <Opciones
          label="Trato"
          options={TRATOS}
          value={v.trato}
          disabled={disabled}
          onChange={(t) => set('trato', t as 'senor' | 'senora')}
        />
        <Error texto={e.trato} />
      </View>
      <Opciones
        label="Día"
        options={fechasRapidas(hoy, 4)}
        value={v.fecha}
        disabled={disabled}
        onChange={(f) => set('fecha', f)}
      />
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Desde"
            placeholder="HH:MM"
            value={v.hora_desde}
            editable={!disabled}
            keyboardType="number-pad"
            maxLength={5}
            onChangeText={(t) => set('hora_desde', formatoHora(t))}
            error={e.hora_desde}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Hasta"
            placeholder="HH:MM"
            value={v.hora_hasta}
            editable={!disabled}
            keyboardType="number-pad"
            maxLength={5}
            onChangeText={(t) => set('hora_hasta', formatoHora(t))}
            error={e.hora_hasta}
          />
        </View>
      </View>
      <Opciones
        label="Lugar"
        options={LUGARES.map((l) => ({ value: l, label: l }))}
        value={v.lugar}
        disabled={disabled}
        onChange={(l) => set('lugar', l)}
      />
      {conFoto ? (
        <PhotoField
          foto={form.foto}
          onFoto={form.setFoto}
          consentimiento={form.consentimiento}
          onConsentimiento={form.setConsentimiento}
          mostrarError={form.intentos > 0}
          disabled={disabled}
        />
      ) : null}

      <Touchable
        label="Más detalles"
        accessibilityState={{ expanded: visible }}
        onPress={() => setAbierto(!visible)}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTopWidth: 1,
          borderBottomWidth: visible ? 0 : 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
        })}
      >
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15 }}>Más detalles</Text>
        <Icon
          name={visible ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color={colors.text}
        />
      </Touchable>
      {visible ? (
        <View style={{ gap: space[5] }}>
          <TextField
            label="Fecha"
            hint="AAAA-MM-DD"
            value={v.fecha}
            editable={!disabled}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            onChangeText={(t) => set('fecha', t)}
            error={e.fecha}
          />
          <View style={{ gap: space[3] }}>
            <Opciones
              label="Punto de encuentro"
              options={PUNTOS_ENCUENTRO.map((p) => ({ value: p, label: p }))}
              value={v.punto_encuentro}
              disabled={disabled}
              onChange={(p) => set('punto_encuentro', p)}
              hint="Dónde lo recibe su acompañante."
            />
            <TextField
              label="O escribe otro punto"
              value={v.punto_encuentro}
              editable={!disabled}
              maxLength={60}
              onChangeText={(t) => set('punto_encuentro', t)}
            />
          </View>
          <ChipsField
            label="Bebidas que prefiere"
            opciones={BEBIDAS}
            value={v.preferencias_bebida}
            disabled={disabled}
            onChange={(b) => set('preferencias_bebida', b)}
          />
          <ChipsField
            label="Necesidades de asistencia"
            hint="El equipo lo sabe antes de que llegue."
            opciones={ASISTENCIA}
            value={v.asistencia}
            disabled={disabled}
            onChange={(a) => set('asistencia', a)}
          />
          <TextField
            label="Nota (opcional)"
            value={v.nota}
            editable={!disabled}
            multiline
            maxLength={140}
            onChangeText={(t) => set('nota', t)}
          />
          {conFoto ? (
            <View style={{ gap: space[3] }}>
              <TextField
                label="Número de cédula (opcional)"
                value={v.documento}
                editable={!disabled}
                autoComplete="off"
                maxLength={15}
                onChangeText={(t) => set('documento', t.replace(/[^A-Za-z0-9]/g, ''))}
                error={e.documento}
              />
              <PhotoField
                textos={TEXTOS_CEDULA}
                foto={form.fotoDoc}
                onFoto={form.setFotoDoc}
                consentimiento={form.consentimientoDoc}
                onConsentimiento={form.setConsentimientoDoc}
                mostrarError={form.intentos > 0}
                disabled={disabled}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
