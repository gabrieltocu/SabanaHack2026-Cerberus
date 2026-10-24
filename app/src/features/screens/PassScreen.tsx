import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Button, Divider, Skeleton, Text, colors, space, useBreakpoint } from '../../design-system';
import { QrCode } from '../invitations/QrCode';
import { PassCard, SIM_QR_LABEL } from '../invitations/PassCard';
import { Heading } from '../shared/Heading';
import { ErrorNotice } from '../shared/notices';
import type { PassView } from '../types';

export type PassScreenProps = {
  /** `null`: the link has no pass behind it, which reads as «No válido», never as a crash. */
  pass: PassView | null;
  status?: 'ready' | 'loading' | 'error';
  /** The connection dropped while a valid pass was already on screen. */
  offline?: boolean;
  onRetry?: () => void;
  /** Copies the link; resolves whether it could. */
  onCopyLink?: () => Promise<boolean>;
};

const NOT_FOUND: PassView = {
  token: '',
  guestName: '',
  hostName: '',
  meetingPoint: '',
  validityLabel: '',
  spokenDate: '',
  status: 'NOT_FOUND',
};

/** `/pase/[token]`: what the guest sees, with no account. Full-screen QR opens in a modal. */
export function PassScreen({
  pass,
  status = 'ready',
  offline = false,
  onRetry,
  onCopyLink,
}: PassScreenProps) {
  const { width, isTablet } = useBreakpoint();
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const view = pass ?? NOT_FOUND;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          backgroundColor: colors.bgDark,
          paddingHorizontal: space[5],
          paddingVertical: space[7],
          alignItems: 'center',
        }}
      >
        <View style={{ width: '100%', maxWidth: 480, gap: space[3] }}>
          <Text variant="h3" style={{ color: colors.champagne400 }}>
            N Club
          </Text>
          <Heading variant="h1" tone="onDark" focusKey="pase">
            Tu pase de visita
          </Heading>
        </View>
      </View>

      <View
        role="main"
        style={{ alignItems: 'center', padding: space[5], paddingBottom: space[8] }}
      >
        <View style={{ width: '100%', maxWidth: isTablet ? 480 : undefined, gap: space[4] }}>
          {status === 'loading' ? (
            <View style={{ gap: space[4] }}>
              <Skeleton height={28} width="60%" />
              <Skeleton height={20} />
              <Skeleton height={280} />
              <Text role="status" tone="muted">
                Comprobando tu pase…
              </Text>
            </View>
          ) : status === 'error' ? (
            <ErrorNotice
              code="API_UNAVAILABLE"
              message="No pudimos comprobar tu pase."
              onRetry={onRetry}
            />
          ) : (
            <PassCard
              pass={view}
              offline={offline}
              copied={copied}
              onFullScreen={view.status === 'VALID' ? () => setFull(true) : undefined}
              onCopy={
                onCopyLink && view.status === 'VALID'
                  ? async () => setCopied(await onCopyLink())
                  : undefined
              }
            />
          )}
        </View>
      </View>

      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)}>
        <View
          role="dialog"
          accessibilityViewIsModal
          accessibilityLabel="Código QR a pantalla completa"
          style={{
            flex: 1,
            backgroundColor: colors.white,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space[5],
            padding: space[5],
          }}
        >
          <QrCode value={view.token} size={Math.min(width - space[5] * 2, 480)} />
          <Text variant="caption" tone="muted">
            {SIM_QR_LABEL}
          </Text>
          <Divider />
          <Button label="Cerrar" size="lg" onPress={() => setFull(false)} />
        </View>
      </Modal>
    </ScrollView>
  );
}
