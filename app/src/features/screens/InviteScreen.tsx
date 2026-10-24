import { useState } from 'react';
import { View } from 'react-native';
import { Button, Screen, Skeleton, Text, space, useBreakpoint } from '../../design-system';
import { InvitationForm } from '../invitations/InvitationForm';
import { PassCard } from '../invitations/PassCard';
import type { InvitationValues } from '../invitations/validation';
import { Heading } from '../shared/Heading';
import { PageHeader } from '../shared/PageHeader';
import { Notice } from '../shared/notices';
import type { PassView } from '../types';

export type InviteResult = { pass: PassView } | { errorCode: string };

export type InviteScreenProps = {
  today: string;
  meetingPoints: readonly string[];
  /** Creates the invitation. Resolves with the pass or with a stable error code. */
  onCreate: (values: InvitationValues) => Promise<InviteResult>;
  /** Copies the pass link; resolves whether it could. */
  onCopyLink: (token: string) => Promise<boolean>;
  onBack: () => void;
  onOpenPass: (token: string) => void;
  /** Meeting points still loading: skeleton in place of the form. */
  loading?: boolean;
};

/** `/socio/invitar`: form, then the confirmation with the pass preview. Typed data survives errors. */
export function InviteScreen({
  today,
  meetingPoints,
  onCreate,
  onCopyLink,
  onBack,
  onOpenPass,
  loading = false,
}: InviteScreenProps) {
  const { isDesktop } = useBreakpoint();
  const [created, setCreated] = useState<{ pass: PassView } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [last, setLast] = useState<InvitationValues>();

  const submit = async (values: InvitationValues) => {
    setSubmitting(true);
    setErrorCode(undefined);
    setLast(values);
    const result = await onCreate(values);
    setSubmitting(false);
    if ('pass' in result) setCreated(result);
    else setErrorCode(result.errorCode);
  };

  if (created) {
    const { pass } = created;
    return (
      <Screen width="narrow">
        <View style={{ gap: space[5] }}>
          <Heading variant="h1" focusKey="creada">
            Invitación creada
          </Heading>
          <Notice>{`Invitación creada para ${pass.guestName}.`}</Notice>
          <PassCard pass={pass} variant="preview" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
            <Button label="Ver pase" onPress={() => onOpenPass(pass.token)} />
            <Button
              label="Copiar enlace del pase"
              variant="secondary"
              onPress={async () => setCopied(await onCopyLink(pass.token))}
            />
            <Button
              label="Invitar a otra persona"
              variant="ghost"
              onPress={() => {
                setCreated(null);
                setCopied(false);
                setLast(undefined);
                setAttempt((n) => n + 1);
              }}
            />
          </View>
          {copied ? <Notice>Enlace copiado.</Notice> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen width={isDesktop ? 'content' : 'narrow'}>
      <PageHeader title="Invitar a alguien" backLabel="Mi inicio" onBack={onBack}>
        <Text tone="muted">
          Tu invitado recibirá un pase con código QR. No necesita crear una cuenta.
        </Text>
      </PageHeader>
      {loading ? (
        <View style={{ gap: space[4] }} accessibilityLabel="Cargando formulario">
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : (
        <View style={{ maxWidth: 560, alignSelf: 'stretch' }}>
          <InvitationForm
            key={attempt}
            today={today}
            meetingPoints={meetingPoints}
            initialValues={last}
            submitting={submitting}
            errorCode={errorCode}
            onSubmit={submit}
            onCancel={onBack}
          />
        </View>
      )}
    </Screen>
  );
}
