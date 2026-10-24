import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  AppShell,
  Button,
  Card,
  Divider,
  IconButton,
  Icon,
  Skeleton,
  Text,
  Touchable,
  radii,
  colors,
  fonts,
  space,
  type IconName,
  type ListRowProps,
} from '../../design-system';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Disclosure } from '../shared/Disclosure';
import { Heading } from '../shared/Heading';
import { OptionGroup } from '../shared/OptionGroup';
import { ErrorNotice, Notice } from '../shared/notices';
import type { Profile } from '../types';

export type ProfileSelectorProps = {
  profiles: readonly Profile[];
  onSelect: (profile: Profile) => void;
  /** «Entrar a la app de socios y concierge»: the real app, outside the demonstration profiles. */
  onEnter?: () => void;
  onBack?: () => void;
  /** Guests who arrive as visits, without credentials. */
  arriving: readonly { id: string; title: string; text: string }[];
  /** The guest pass of the first invitation, with its link. */
  samplePass?: { title: string; onOpen: () => void };
  dates: readonly { value: string; label: string }[];
  date: string;
  onDateChange: (value: string) => void;
  /** Called once the presenter confirms the reset dialog. */
  onReset: () => void;
  /** A reset or date change is in flight: both controls lock. */
  busy?: boolean;
  /** Success line after a reset or a date change (G6). */
  notice?: string;
  /** Reset or date change refused by the service (stable code). */
  errorCode?: string;
  /** Facts of the data (mode and working date), in the settings menu. */
  infoLines?: readonly string[];
  activeVisits?: number;
  status?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  onOpenDesign?: () => void;
};

type Look = { icon: IconName; tint: ListRowProps['tint']; blurb: string };

/** Icon, tile colour (the category's own) and one line per perspective; the directory gives name and role. */
const LOOKS: Record<string, Look> = {
  'V-201': { icon: 'diamond-outline', tint: 'VIP', blurb: 'invitados y avisos' },
  'V-202': { icon: 'person-outline', tint: 'REGULAR', blurb: 'reservas e invitados' },
  'V-204': { icon: 'briefcase-outline', tint: 'STAFF', blurb: 'agenda y turno' },
  'U-02': { icon: 'notifications-outline', tint: 'gold', blurb: 'relevos y tareas del equipo' },
  admin: { icon: 'stats-chart-outline', tint: 'forest', blurb: 'panel web de métricas' },
  R1: { icon: 'hardware-chip-outline', tint: 'forest', blurb: 'reconoce y orienta' },
};
const FALLBACK: Look = {
  icon: 'person-outline',
  tint: 'forest',
  blurb: 'perfil del club',
};

/** Visitor categories that arrive with a pass and no account: their screen is the pass itself. */
const PASS_PROFILES: readonly Profile[] = [
  {
    id: 'guest',
    name: 'Invitado',
    roleLabel: 'Invitado',
    category: 'GUEST',
    href: '/visita?tipo=invitado',
  },
  {
    id: 'external',
    name: 'Trabajador externo',
    roleLabel: 'Trabajador externo',
    category: 'EXTERNAL',
    href: '/visita?tipo=externo',
  },
];
const PASS_LOOKS: Record<string, Look> = {
  guest: { icon: 'ticket-outline', tint: 'GUEST', blurb: 'pase sin cuenta' },
  external: { icon: 'construct-outline', tint: 'EXTERNAL', blurb: 'pase de servicio sin cuenta' },
};

function SelectorRow({
  icon,
  tint = 'forest',
  title,
  description,
  accessibilityLabel,
  onPress,
}: ListRowProps) {
  const tileColor = ['VIP', 'REGULAR', 'gold', 'EXTERNAL'].includes(tint)
    ? '#8A7350'
    : colors.forest;
  return (
    <Touchable
      role="link"
      label={accessibilityLabel ?? `${title}, ${description}`}
      onPress={onPress}
      {...({
        onKeyDown: (event: { key?: string }) => {
          if (event.key === 'Enter') onPress();
        },
      } as object)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 76,
        padding: space[3],
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.lg,
        backgroundColor: pressed ? colors.ivory : colors.paper,
      })}
    >
      <View
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: radii.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tileColor,
        }}
      >
        <Icon name={icon} size={22} color={colors.ivory} />
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text
          variant="label"
          style={{ fontFamily: fonts.displayStrong, fontSize: 22, lineHeight: 26 }}
        >
          {title}
        </Text>
        {description ? (
          <Text tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
            {description}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
}

function ProfileRow({ profile, onPress }: { profile: Profile; onPress: () => void }) {
  const look = LOOKS[profile.id] ?? PASS_LOOKS[profile.id] ?? FALLBACK;
  const pass = profile.id in PASS_LOOKS;
  const robot = profile.id === 'R1';
  const admin = profile.id === 'admin';
  return (
    <SelectorRow
      role="link"
      icon={look.icon}
      tint={look.tint}
      title={robot || pass ? profile.name : profile.roleLabel}
      description={
        admin
          ? look.blurb
          : profile.id === 'V-201'
            ? 'Sofía · invitados y avisos'
            : pass
              ? look.blurb
              : `${robot ? profile.roleLabel : profile.name} · ${look.blurb}`
      }
      accessibilityLabel={`${profile.id === 'V-201' ? 'Sofía' : profile.name}, ${pass ? look.blurb : profile.roleLabel}`}
      onPress={onPress}
    />
  );
}

/**
 * Cover of the demonstration: «¿Quién eres hoy?». The five visitor categories of the challenge
 * come first, then the club's operation (robot, attendant, concierge). The demonstration clock,
 * the reset and the facts about the data live in a discreet settings menu.
 */
export function ProfileSelector({
  profiles,
  onSelect,
  onEnter,
  onBack,
  arriving,
  samplePass,
  dates,
  date,
  onDateChange,
  onReset,
  busy = false,
  notice,
  errorCode,
  infoLines = [],
  activeVisits = 0,
  status = 'ready',
  onRetry,
  onOpenDesign,
}: ProfileSelectorProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const row = (p: Profile | undefined) =>
    p ? (
      <View key={p.id} role="listitem">
        <ProfileRow profile={p} onPress={() => onSelect(p)} />
      </View>
    ) : null;
  // Directory rows wait for the directory; the pass rows and the concierge never do.
  const ready = status === 'ready';
  const profile = (id: string) => (ready ? row(profiles.find((p) => p.id === id)) : null);
  const [guest, external] = PASS_PROFILES.map((p) => row(p));

  const directory =
    status === 'loading' ? (
      <View style={{ gap: space[3] }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={76} />
        ))}
        <Text variant="caption" tone="muted" role="status">
          Cargando…
        </Text>
      </View>
    ) : status === 'error' ? (
      <ErrorNotice code="DEMO_DATA_UNAVAILABLE" onRetry={onRetry} retryLabel="Recargar" />
    ) : null;

  const settings = menuOpen ? (
    <Card role="region" accessibilityLabel="Ajustes">
      <OptionGroup
        label="Fecha de trabajo"
        options={dates}
        value={date}
        onChange={onDateChange}
        disabled={busy}
      />
      <Text variant="caption" tone="muted">
        Cambiar la fecha reinicia los datos.
      </Text>
      <Button
        label="Reiniciar datos"
        variant="secondary"
        loading={busy}
        onPress={() => setConfirmReset(true)}
      />
      {notice ? <Notice>{notice}</Notice> : null}
      {errorCode ? <ErrorNotice code={errorCode} /> : null}
      <Divider />
      <Text role="status" accessibilityLiveRegion="polite" variant="label" tone="muted">
        {activeVisits === 0
          ? 'Sin visitas en curso'
          : activeVisits === 1
            ? '1 visita en curso'
            : `${activeVisits} visitas en curso`}
      </Text>
      {infoLines.map((line) => (
        <Text key={line} variant="caption" tone="muted">
          {line}
        </Text>
      ))}
      {onOpenDesign ? (
        <Button label="Catálogo de diseño" variant="ghost" size="sm" onPress={onOpenDesign} />
      ) : null}
    </Card>
  ) : null;

  return (
    <AppShell>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space[5],
          paddingTop: space[2],
          paddingBottom: space[7],
        }}
      >
        <View role="main" style={{ gap: space[5] }}>
          <View style={{ gap: space[5] }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 44,
              }}
            >
              {onBack ? (
                <IconButton
                  icon="arrow-back-outline"
                  label="Volver a la bienvenida"
                  onPress={onBack}
                />
              ) : null}
              <IconButton
                icon="settings-outline"
                label="Ajustes"
                onPress={() => setMenuOpen((o) => !o)}
              />
            </View>
            <View style={{ gap: space[2] }}>
              <Heading
                variant="h1"
                focusKey="home"
                style={{ fontSize: 36, lineHeight: 40, letterSpacing: -0.4, color: colors.forest }}
              >
                ¿Quién eres hoy?
              </Heading>
              <Text tone="muted" style={{ fontSize: 14, lineHeight: 21 }}>
                Selecciona tu rol para continuar en N Club.
              </Text>
            </View>
          </View>

          {settings}

          {directory}

          <View style={{ gap: space[3] }}>
            <Text variant="h3" level={2} style={{ color: colors.forest }}>
              Visitantes
            </Text>
            <View role="list" accessibilityLabel="Visitantes" style={{ gap: space[3] }}>
              {profile('V-201')}
              {profile('V-202')}
              {guest}
              {profile('V-204')}
              {external}
            </View>
          </View>

          <View style={{ gap: space[3] }}>
            <Text variant="h3" level={2} style={{ color: colors.forest }}>
              Operación del club
            </Text>
            <View role="list" accessibilityLabel="Operación del club" style={{ gap: space[3] }}>
              {onEnter ? (
                <View role="listitem">
                  <SelectorRow
                    role="link"
                    icon="notifications-outline"
                    tint="gold"
                    title="Concierge"
                    description="Llegadas y atención de salas"
                    onPress={onEnter}
                  />
                </View>
              ) : null}
              {profile('U-02')}
              {profile('R1')}
              {row({
                id: 'admin',
                name: 'Administración',
                roleLabel: 'Administración',
                href: '/entrar?cuenta=admin@nclub.demo',
              })}
            </View>
          </View>

          <Disclosure title="Llegan como visitas">
            <Text variant="caption" tone="muted">
              Sin credenciales: no son perfiles que se eligen aquí.
            </Text>
            <View style={{ gap: space[5] }}>
              {arriving.map((a) => (
                <View key={a.id} style={{ gap: 2 }}>
                  <Text variant="label">{a.title}</Text>
                  <Text tone="muted">{a.text}</Text>
                </View>
              ))}
              {samplePass ? (
                <View style={{ gap: space[2] }}>
                  <Text variant="label">{samplePass.title}</Text>
                  <Button
                    label="Abrir su pase"
                    variant="secondary"
                    size="sm"
                    onPress={samplePass.onOpen}
                  />
                </View>
              ) : null}
            </View>
          </Disclosure>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmReset}
        title="¿Reiniciar los datos?"
        body="Se borran las visitas, invitaciones y relevos creados y vuelven los datos iniciales."
        cancelLabel="Cancelar"
        confirmLabel="Reiniciar"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          onReset();
        }}
      />
    </AppShell>
  );
}
