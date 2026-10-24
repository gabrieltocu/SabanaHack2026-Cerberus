import { View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  Text,
  space,
  useBreakpoint,
  type BadgeKind,
} from '../../design-system';
import { messageFor } from '../messages';
import { Notice } from '../shared/notices';
import type { PassStatus, PassView } from '../types';
import { QrCode } from './QrCode';

const STATUS: Record<PassStatus, { label: string; kind: BadgeKind; code?: string }> = {
  VALID: { label: 'Vigente', kind: 'success' },
  NOT_YET_VALID: { label: 'Aún no válido', kind: 'warning', code: 'QR_NOT_YET_VALID' },
  EXPIRED: { label: 'Vencido', kind: 'warning', code: 'QR_EXPIRED' },
  USED: { label: 'Usado', kind: 'neutral', code: 'QR_ALREADY_USED' },
  REVOKED: { label: 'Cancelado', kind: 'danger', code: 'QR_REVOKED' },
  NOT_FOUND: { label: 'No válido', kind: 'danger', code: 'QR_NOT_FOUND' },
};

export const SIM_QR_LABEL = 'Código QR del pase';

export type PassCardProps = {
  pass: PassView;
  /** `preview` (right after creating an invitation) leaves out the help text and actions. */
  variant?: 'full' | 'preview';
  onFullScreen?: () => void;
  onCopy?: () => void;
  copied?: boolean;
  /** The connection dropped while a valid pass was already visible. */
  offline?: boolean;
};

/**
 * The pass as the guest sees it. Only a valid pass shows a QR; every other status replaces card
 * and QR with its explanation. Validity is always decided by the service, never from the link.
 */
export function PassCard({
  pass,
  variant = 'full',
  onFullScreen,
  onCopy,
  copied = false,
  offline = false,
}: PassCardProps) {
  const { width, index, gutter } = useBreakpoint();
  const status = STATUS[pass.status];
  const qrSize = Math.max(
    160,
    Math.min(index === 0 ? 280 : 320, width - gutter * 2 - space[5] * 2 - 2),
  );
  const full = variant === 'full';

  if (pass.status !== 'VALID') {
    return (
      <Card>
        <Badge kind={status.kind} label={status.label} />
        <Text variant="h2">
          {messageFor(status.code ?? 'QR_NOT_FOUND', { fecha: pass.fromLabel })}
        </Text>
        <Text variant="caption" tone="muted">{`Código: ${status.code}`}</Text>
        <HelpBlock />
      </Card>
    );
  }

  return (
    <Card>
      <Text
        role="status"
        accessibilityLiveRegion="polite"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
      >
        {`Pase vigente para el ${pass.spokenDate}`}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
        <Text variant="h2" style={{ flexShrink: 1 }}>{`Hola, ${pass.guestName}`}</Text>
        <Badge kind={status.kind} label={status.label} />
      </View>
      <Text>{`Invitación de ${pass.hostName}`}</Text>
      <Text>{`Punto de encuentro: ${pass.meetingPoint}`}</Text>
      <Text tone="muted">{pass.validityLabel}</Text>
      <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
        <QrCode value={pass.token} size={full ? qrSize : 200} />
        <Text variant="caption" tone="muted">
          {SIM_QR_LABEL}
        </Text>
      </View>
      {full ? (
        <>
          {onFullScreen ? (
            <Button
              label="Mostrar a pantalla completa"
              variant="secondary"
              fullWidth
              onPress={onFullScreen}
            />
          ) : null}
          <Text tone="muted">
            Preséntalo en recepción. El robot lo leerá y confirmará tu visita.
          </Text>
          <HelpBlock />
          {offline ? <Notice>Sin conexión: la validez se comprobará en recepción.</Notice> : null}
          {onCopy ? <Button label="Copiar enlace" variant="ghost" onPress={onCopy} /> : null}
          {copied ? <Notice>Enlace copiado.</Notice> : null}
          <Text variant="caption" tone="muted">
            Este pase se valida en recepción. Una captura de pantalla no es suficiente por sí sola.
          </Text>
        </>
      ) : null}
    </Card>
  );
}

function HelpBlock() {
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="label">¿Sin teléfono o sin QR?</Text>
      <Text tone="muted">
        Dile tu nombre a una persona de recepción. Podemos ayudarte sin que instales nada.
      </Text>
    </View>
  );
}
