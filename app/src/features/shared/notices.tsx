import { View } from 'react-native';
import { Button, Text, colors, radii, space } from '../../design-system';
import { messageFor } from '../messages';
import type { CopyVars } from '../orientation/copy';

/**
 * G5: what happened in plain words, a stable code underneath and, always, a way forward.
 * Never shows paths, traces or internal data: unknown codes fall back to a generic message.
 */
export function ErrorNotice({
  code,
  message,
  vars,
  onRetry,
  retryLabel = 'Reintentar',
  onDark = false,
}: {
  code: string;
  /** Replaces the catalog text when a screen has its own wording (e.g. «No pudimos comprobar tu pase.»). */
  message?: string;
  vars?: CopyVars;
  onRetry?: () => void;
  retryLabel?: string;
  onDark?: boolean;
}) {
  return (
    <View
      role="alert"
      accessibilityLiveRegion="assertive"
      style={{
        gap: space[2],
        paddingVertical: space[3],
        paddingLeft: space[4],
        paddingRight: space[3],
        borderLeftWidth: 4,
        borderLeftColor: onDark ? colors.champagne400 : colors.danger,
        backgroundColor: onDark ? colors.forest800 : colors.dangerBg,
        borderRadius: radii.sm,
        alignSelf: 'stretch',
      }}
    >
      <Text variant="label" tone={onDark ? 'onDark' : 'default'} style={{ fontSize: 15 }}>
        {message ?? messageFor(code, vars)}
      </Text>
      <Text variant="caption" tone={onDark ? 'mutedOnDark' : 'muted'}>
        {`Código: ${code}`}
      </Text>
      {onRetry ? (
        <Button
          label={retryLabel}
          size="sm"
          variant={onDark ? 'secondary' : 'primary'}
          onDark={onDark}
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

/** G6: confirmation in the place of the action, announced politely, never a floating toast. */
export function Notice({ children, onDark = false }: { children: string; onDark?: boolean }) {
  return (
    <View
      role="status"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        gap: space[3],
        alignItems: 'flex-start',
        padding: space[3],
        borderRadius: radii.sm,
        alignSelf: 'stretch',
        backgroundColor: onDark ? colors.forest800 : colors.successBg,
      }}
    >
      <Text variant="label" tone={onDark ? 'onDark' : 'success'} aria-hidden>
        ✓
      </Text>
      <Text variant="label" tone={onDark ? 'onDark' : 'default'} style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}
