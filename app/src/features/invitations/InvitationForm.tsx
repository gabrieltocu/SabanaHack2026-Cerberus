import { useRef, useState, type ComponentRef } from 'react';
import { Switch, TextInput, View } from 'react-native';
import { Button, Text, TextField, colors, radii, space } from '../../design-system';
import { messageFor } from '../messages';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { dateLabel } from '../shared/dates';
import { OptionGroup } from '../shared/OptionGroup';
import { ErrorNotice } from '../shared/notices';
import { validateInvitation, type InvitationField, type InvitationValues } from './validation';

export type InvitationFormProps = {
  /** Simulated civil date, `AAAA-MM-DD`: the earliest the pass can be for. */
  today: string;
  meetingPoints: readonly string[];
  initialValues?: Partial<InvitationValues>;
  onSubmit: (values: InvitationValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  /** Server-side failure (`INVITATION_DUPLICATE`, `NETWORK_OFFLINE`...). Typed data is kept. */
  errorCode?: string;
};

export function InvitationForm({
  today,
  meetingPoints,
  initialValues,
  onSubmit,
  onCancel,
  submitting = false,
  errorCode,
}: InvitationFormProps) {
  const [values, setValues] = useState<InvitationValues>({
    guestName: '',
    date: today,
    meetingPoint: meetingPoints[0] ?? '',
    drink: '',
    photo: false,
    ...initialValues,
  });
  const [touched, setTouched] = useState<Partial<Record<InvitationField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const dateRef = useRef<ComponentRef<typeof TextInput>>(null);

  const set = <K extends keyof InvitationValues>(key: K, value: InvitationValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const found = validateInvitation(values, today);
  const shown = (f: InvitationField) => (touched[f] || submitted ? found[f] : undefined);
  const count = Object.keys(found).length;
  const dirty = values.guestName.trim() !== '' || values.drink.trim() !== '' || values.photo;
  const noPoints = meetingPoints.length === 0;

  const submit = () => {
    setSubmitted(true);
    if (count > 0) {
      (found.guestName ? nameRef : dateRef).current?.focus();
      return;
    }
    onSubmit({ ...values, guestName: values.guestName.trim(), drink: values.drink.trim() });
  };

  return (
    <View style={{ gap: space[5], alignSelf: 'stretch' }}>
      <TextField
        // @ts-expect-error React 19 forwards `ref` as a prop; TextField's type does not declare it.
        ref={nameRef}
        label="Nombre de tu invitado"
        hint="Solo el nombre de pila basta."
        required
        value={values.guestName}
        editable={!submitting}
        maxLength={60}
        autoComplete="off"
        onChangeText={(t) => set('guestName', t)}
        onBlur={() => setTouched((t) => ({ ...t, guestName: true }))}
        error={shown('guestName') ? messageFor(shown('guestName') as string) : undefined}
      />
      {/* ponytail: the date is typed as AAAA-MM-DD instead of picked (no new dependency); move to a native date input if a picker is needed. */}
      <TextField
        // @ts-expect-error same as above
        ref={dateRef}
        label="Fecha de la visita"
        hint="El pase solo vale ese día. Formato AAAA-MM-DD, hasta 30 días desde hoy."
        required
        value={values.date}
        editable={!submitting}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        onChangeText={(t) => set('date', t)}
        onBlur={() => setTouched((t) => ({ ...t, date: true }))}
        error={shown('date') ? messageFor(shown('date') as string) : undefined}
      />
      {noPoints ? (
        <Text tone="muted">No hay puntos de encuentro configurados.</Text>
      ) : (
        <OptionGroup
          label="Punto de encuentro"
          hint="Es donde lo esperas."
          options={meetingPoints.map((p) => ({ value: p, label: p }))}
          value={values.meetingPoint}
          disabled={submitting}
          onChange={(v) => set('meetingPoint', v)}
        />
      )}
      <TextField
        label="Bebida preferida (opcional)"
        hint="El robot se lo ofrecerá, sin darlo por hecho."
        value={values.drink}
        editable={!submitting}
        maxLength={40}
        onChangeText={(t) => set('drink', t)}
      />
      <View style={{ gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Switch
            accessibilityLabel="Foto del invitado"
            value={values.photo}
            disabled={submitting}
            onValueChange={(v) => set('photo', v)}
            trackColor={{ false: colors.borderStrong, true: colors.primary }}
            thumbColor={colors.white}
          />
          <Text variant="label">Foto del invitado</Text>
        </View>
        {values.photo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View
              role="img"
              accessible
              accessibilityLabel="Avatar del invitado"
              style={{
                width: 56,
                height: 56,
                borderRadius: radii.md,
                backgroundColor: colors.surfaceSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="h3">{(values.guestName.trim()[0] ?? '?').toUpperCase()}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {values.guestName.trim() ? (
        <Text variant="label" tone="muted">
          {`${values.guestName.trim()} · ${dateLabel(values.date)} · ${values.meetingPoint}`}
        </Text>
      ) : null}

      {submitted && count > 0 ? (
        <Text variant="label" tone="danger" role="alert" accessibilityLiveRegion="assertive">
          {count === 1 ? 'Hay 1 campo por corregir.' : `Hay ${count} campos por corregir.`}
        </Text>
      ) : null}
      {errorCode ? <ErrorNotice code={errorCode} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        <Button
          label={submitting ? 'Creando invitación…' : 'Crear invitación'}
          loading={submitting}
          disabled={noPoints}
          onPress={submit}
        />
        <Button
          label="Cancelar"
          variant="secondary"
          disabled={submitting}
          onPress={() => (dirty ? setConfirmDiscard(true) : onCancel())}
        />
      </View>

      <ConfirmDialog
        visible={confirmDiscard}
        title="¿Descartar la invitación?"
        body="Se perderán los datos escritos."
        cancelLabel="Seguir editando"
        confirmLabel="Descartar"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onCancel();
        }}
      />
    </View>
  );
}
