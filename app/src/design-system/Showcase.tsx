// Catalogue of every primitive and state. Route: /design (app/design.tsx re-exports this).
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Avatar } from './components/Avatar';
import { Badge, type BadgeKind } from './components/Badge';
import { Banner } from './components/Banner';
import { BottomTabBar } from './components/BottomTabBar';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { Divider } from './components/Divider';
import { EmptyState } from './components/EmptyState';
import { ErrorState } from './components/ErrorState';
import { ListRow } from './components/ListRow';
import { Logo } from './components/Logo';
import { MembershipCard } from './components/MembershipCard';
import { IconButton, MobileHeader } from './components/MobileHeader';
import { QuickAction } from './components/QuickAction';
import { Screen } from './components/Screen';
import { Skeleton } from './components/Skeleton';
import { Stepper, VISIT_PHASES } from './components/Stepper';
import { Text } from './components/Text';
import { TextField } from './components/TextField';
import { contrastRatio } from './contrast';
import { colors, palette, space, type TextVariant } from './tokens';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[5] }}>
      <View style={{ gap: space[3] }}>
        <Divider />
        <Text variant="h2">{title}</Text>
      </View>
      {children}
    </View>
  );
}

const row = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: space[3],
  alignItems: 'flex-start',
} as const;

const swatches: { name: string; hex: string; on: string; use: string }[] = [
  { name: 'ink', hex: palette.ink, on: palette.goldOnDark, use: 'Texto, líneas y botón principal' },
  { name: 'pine', hex: palette.pine, on: palette.white, use: 'Botón presionado' },
  { name: 'sage', hex: palette.sage, on: palette.ink, use: 'Superficies suaves' },
  { name: 'ivory', hex: palette.ivory, on: palette.ink, use: 'Fondo blanco cálido' },
  { name: 'bone', hex: palette.bone100, on: palette.ink, use: 'Separadores suaves' },
  { name: 'gold', hex: palette.gold, on: palette.ink, use: 'Detalle, nunca texto pequeño' },
  {
    name: 'gold on dark',
    hex: palette.goldOnDark,
    on: palette.ink,
    use: 'Texto dorado sobre negro',
  },
  { name: 'error', hex: palette.error, on: palette.white, use: 'Errores' },
];

const typeSpecimens: { variant: TextVariant; sample: string }[] = [
  { variant: 'display', sample: 'Bienvenido a N Club' },
  { variant: 'h1', sample: 'Su invitado llega a las cuatro' },
  { variant: 'h2', sample: 'Orientación para socios VIP' },
  { variant: 'h3', sample: 'Punto de encuentro: el salón del lago' },
  {
    variant: 'body',
    sample: 'El robot lo acompañará hasta la mesa reservada y avisará a su anfitrión.',
  },
  { variant: 'label', sample: 'Nombre del invitado' },
  { variant: 'caption', sample: 'Válido hasta las 18:00 del día de la visita' },
  { variant: 'eyebrow', sample: 'Recepción' },
];

const handoffSteps = [
  { key: 'requested', label: 'Solicitado' },
  { key: 'accepted', label: 'Aceptado' },
  { key: 'context', label: 'Contexto transferido' },
  { key: 'confirmed', label: 'Confirmado' },
];

const badgeKinds: BadgeKind[] = ['VIP', 'REGULAR', 'GUEST', 'STAFF', 'EXTERNAL'];

export default function Showcase() {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState(3);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!saving) return;
    const t = setTimeout(() => setSaving(false), 1600);
    return () => clearTimeout(t);
  }, [saving]);
  useEffect(() => {
    if (!retrying) return;
    const t = setTimeout(() => setRetrying(false), 1600);
    return () => clearTimeout(t);
  }, [retrying]);

  return (
    <Screen>
      <Card variant="dark" style={{ paddingVertical: space[8], gap: space[4] }}>
        <Logo size={44} wordmark="row" onDark />
        <Divider variant="accent" />
        <Text variant="display" tone="onDark">
          Sistema de diseño de N Club
        </Text>
        <Text tone="mutedOnDark" style={{ maxWidth: 520 }}>
          Blanco cálido, líneas negras y oro como detalle. Todas las esquinas son rectas.
        </Text>
        <View style={{ ...row, marginTop: space[3] }}>
          <Button label="Iniciar recorrido" onDark />
          <Button label="Ver invitación" variant="outline" onDark />
        </View>
      </Card>

      <Section title="Color">
        <View style={row}>
          {swatches.map((s) => (
            <View key={s.name} style={{ width: 220, flexGrow: 1, gap: space[2] }}>
              <View
                style={{
                  height: 72,
                  backgroundColor: s.hex,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  justifyContent: 'flex-end',
                  padding: space[2],
                }}
              >
                <Text variant="caption" style={{ color: s.on }}>
                  {contrastRatio(s.hex, s.on).toFixed(1)}:1
                </Text>
              </View>
              <Text variant="label">{s.name}</Text>
              <Text variant="caption" tone="muted">
                {s.hex} · {s.use}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Tipografía">
        <View style={{ gap: space[5] }}>
          {typeSpecimens.map(({ variant, sample }) => (
            <View key={variant} style={{ gap: space[1] }}>
              <Text variant="caption" tone="muted">
                {variant}
              </Text>
              <Text variant={variant}>{sample}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Botones">
        <View style={row}>
          <Button label="Confirmar visita" />
          <Button label="Ver detalle" variant="outline" />
          <Button label="Más opciones" variant="secondary" />
          <Button label="Cancelar" variant="ghost" />
          <Button label="Anular invitación" variant="destructive" />
          <Button label="Ver condiciones" variant="link" />
        </View>
        <View style={row}>
          <Button label="No disponible" disabled />
          <Button label="Guardando" loading />
          <Button
            label={saving ? 'Guardando' : 'Guardar cambios'}
            loading={saving}
            onPress={() => setSaving(true)}
          />
          <Button label="Pequeño" size="sm" />
          <Button label="Grande" size="lg" />
        </View>
      </Section>

      <Section title="Tarjetas">
        <View style={{ gap: space[3], maxWidth: 480 }}>
          <Card tone="highlight">
            <Text variant="label">Laura Díaz llegó</Text>
            <Text tone="muted">El robot la lleva a la Terraza.</Text>
          </Card>
          <Card>
            <Text variant="label">Próximas</Text>
            <Text tone="muted">Pedro Gómez, hoy a las 15:00.</Text>
          </Card>
          <Card variant="soft">
            <Text tone="muted">Superficie suave, sin línea.</Text>
          </Card>
          <MembershipCard
            name="Sofía Restrepo"
            tierLabel="Socia"
            validity="Vigente hasta dic 2026"
          />
        </View>
      </Section>

      <Section title="Avatares, listas y accesos">
        <View style={{ ...row, alignItems: 'center' }}>
          <Avatar name="Laura Díaz" />
          <Avatar name="Pedro Gómez" size={56} ring />
          <Avatar name="Sofía Restrepo" size={80} tone="sage" />
          <Avatar name="Ana Vélez" tone="forest" />
        </View>
        <View style={{ gap: space[2], maxWidth: 480 }}>
          <ListRow icon="camera-outline" title="Mi foto" onPress={() => undefined} />
          <ListRow
            icon="card-outline"
            title="Membresía"
            description="Vigente hasta dic 2026"
            featured
            onPress={() => undefined}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], maxWidth: 480 }}>
          <QuickAction icon="qr-code-outline" label="Pase" onPress={() => undefined} />
          <QuickAction icon="calendar-outline" label="Agenda" onPress={() => undefined} />
          <QuickAction icon="person-outline" label="Perfil" onPress={() => undefined} />
        </View>
      </Section>

      <Section title="Cabecera y barra inferior">
        <View style={{ maxWidth: 480, borderWidth: 1, borderColor: colors.border }}>
          <MobileHeader brand title="Hola, Sofía" safeTop={false} />
        </View>
        <View style={{ maxWidth: 480, borderWidth: 1, borderColor: colors.border }}>
          <MobileHeader
            title="Invitados"
            safeTop={false}
            onBack={() => undefined}
            right={
              <IconButton icon="add-outline" label="Nueva invitación" onPress={() => undefined} />
            }
          />
        </View>
        <View style={{ maxWidth: 480 }}>
          <BottomTabBar
            items={[
              { key: 'inicio', label: 'Inicio', icon: 'home-outline' },
              { key: 'invitados', label: 'Invitados', icon: 'people-outline' },
              { key: 'agenda', label: 'Agenda', icon: 'calendar-outline' },
              { key: 'perfil', label: 'Perfil', icon: 'person-outline' },
            ]}
            activeKey="invitados"
            onSelect={() => undefined}
          />
        </View>
      </Section>

      <Section title="Campos">
        <View style={{ gap: space[5], maxWidth: 480 }}>
          <TextField
            label="Nombre del invitado"
            hint="Como aparece en su documento."
            value={name}
            onChangeText={setName}
            onBlur={() => setTouched(true)}
            error={touched && name.trim() === '' ? 'Escriba el nombre del invitado.' : undefined}
            required
          />
          <TextField
            label="Correo electrónico"
            placeholder="nombre@correo.com"
            keyboardType="email-address"
          />
          <TextField label="Documento" value="No editable" editable={false} />
        </View>
      </Section>

      <Section title="Categorías y estados">
        <View style={row}>
          {badgeKinds.map((k) => (
            <Badge key={k} kind={k} />
          ))}
        </View>
        <View style={row}>
          <Badge kind="success" label="Validado" />
          <Badge kind="warning" label="Pendiente de relevo" />
          <Badge kind="danger" label="Vencido" />
          <Badge kind="info" label="En recorrido" />
          <Badge kind="neutral" label="Cerrado" />
        </View>
      </Section>

      <Section title="Avisos">
        <View style={{ gap: space[3] }}>
          <Banner kind="info" title="Acompañamiento activo">
            El robot guía a su invitado hasta el punto de encuentro.
          </Banner>
          <Banner kind="warning" title="Reconocimiento facial">
            No pudimos confirmar la identidad. Usa tu código QR o pide ayuda en recepción.
          </Banner>
          <Banner kind="error" title="No se pudo validar el código">
            El código venció. Pida una invitación nueva a su anfitrión.
          </Banner>
        </View>
      </Section>

      <Section title="Cargando, vacío y error">
        <View style={{ gap: space[3], maxWidth: 480 }} aria-busy>
          <Skeleton height={28} width="60%" />
          <Skeleton />
          <Skeleton width="85%" />
        </View>
        <EmptyState
          title="Aún no hay invitaciones"
          description="Cree la primera para que su invitado reciba un código de acceso."
          actionLabel="Crear invitación"
          onAction={() => undefined}
        />
        <ErrorState
          title="No pudimos cargar sus invitaciones"
          description="Revise la conexión e inténtelo de nuevo."
          onRetry={() => setRetrying(true)}
          retrying={retrying}
        />
      </Section>

      <Section title="Relevo al edecán">
        <Stepper steps={handoffSteps} current={1} accessibilityLabel="Fases del relevo" />
      </Section>

      <Section title="Fases de una visita">
        <Stepper current={step} />
        <View style={row}>
          <Button
            label="Fase anterior"
            variant="outline"
            size="sm"
            onPress={() => setStep((s) => Math.max(0, s - 1))}
          />
          <Button
            label="Fase siguiente"
            size="sm"
            onPress={() => setStep((s) => Math.min(VISIT_PHASES.length - 1, s + 1))}
          />
        </View>
      </Section>
    </Screen>
  );
}
