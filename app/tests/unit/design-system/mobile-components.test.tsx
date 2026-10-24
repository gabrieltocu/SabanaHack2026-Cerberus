import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { StyleSheet, Text as RNText } from 'react-native';
import { AppScreen, AppShell } from '@/design-system/components/AppShell';
import { BottomTabBar, type TabItem } from '@/design-system/components/BottomTabBar';
import { Icon } from '@/design-system/components/Icon';
import { MembershipCard } from '@/design-system/components/MembershipCard';
import { IconButton, MobileHeader } from '@/design-system/components/MobileHeader';
import { OfflineBanner } from '@/design-system/components/OfflineBanner';
import { QuickAction } from '@/design-system/components/QuickAction';
import { StatusChip } from '@/design-system/components/StatusChip';
import { Toast, useToast } from '@/design-system/components/Toast';
import { colors } from '@/design-system/tokens';
import { withRole } from '../features/withRole';
import { AppTabsLayout } from '@/design-system/AppTabsLayout';

const mockNavigate = jest.fn();
let mockTabBar: ((p: unknown) => React.ReactNode) | undefined;
let mockParams: Record<string, unknown> = {};
jest.mock('expo-router', () => ({
  Tabs: Object.assign(
    ({ tabBar }: { tabBar: (p: unknown) => React.ReactNode }) => {
      mockTabBar = tabBar;
      return null;
    },
    { Screen: () => null },
  ),
  useRouter: () => ({ navigate: mockNavigate }),
  useGlobalSearchParams: () => mockParams,
}));

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never);

const TABS: TabItem[] = [
  { key: 'index', label: 'Inicio', icon: 'home-outline', activeIcon: 'home' },
  { key: 'invitados', label: 'Invitados', icon: 'people-outline', badge: 3 },
  { key: 'perfil', label: 'Perfil', icon: 'person-outline', badge: 120 },
];

describe('Icon', () => {
  it('is hidden from screen readers unless it has a label', async () => {
    await render(
      <>
        <Icon name="home-outline" />
        <Icon name="qr-code-outline" label="Código QR" />
      </>,
    );
    expect(screen.getByRole('image', { name: 'Código QR' })).toBeTruthy();
    expect(screen.queryAllByRole('image')).toHaveLength(1);
  });
});

describe('MobileHeader and IconButton', () => {
  it('shows eyebrow, title as a level-1 heading and subtitle, with trailing actions', async () => {
    const onMenu = jest.fn();
    await render(
      <MobileHeader
        eyebrow="Sábado 24 oct"
        title="Hola, Andrés"
        subtitle="Socio VIP"
        right={<IconButton icon="ellipsis-horizontal-outline" label="Menú" onPress={onMenu} />}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Hola, Andrés' }).props['aria-level']).toBe(1);
    expect(screen.getByText('Sábado 24 oct')).toBeTruthy();
    expect(screen.getByText('Socio VIP')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Volver' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Menú' }));
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('adds a back arrow with its own name and a black band when dark', async () => {
    const onBack = jest.fn();
    await render(
      <MobileHeader title="Invitar" tone="dark" onBack={onBack} backLabel="Volver a Inicio">
        <RNText>Extra</RNText>
      </MobileHeader>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Volver a Inicio' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Extra')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Invitar' })).toBeTruthy();
  });

  it('a disabled icon button does not fire', async () => {
    const onPress = jest.fn();
    await render(
      <IconButton icon="close-outline" label="Cerrar" onPress={onPress} disabled onDark />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('BottomTabBar', () => {
  it('lists the tabs, marks the active one and reports the pressed key', async () => {
    const onSelect = jest.fn();
    await render(<BottomTabBar items={TABS} activeKey="index" onSelect={onSelect} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Inicio' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'Invitados' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
    await fireEvent.press(screen.getByRole('tab', { name: 'Invitados' }));
    expect(onSelect).toHaveBeenCalledWith('invitados');
  });

  it('shows a capped badge count and keeps every target at least 44 px', async () => {
    await render(<BottomTabBar items={TABS} activeKey="perfil" onSelect={jest.fn()} />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
    expect(flat(screen.getByRole('tab', { name: 'Inicio' })).minHeight).toBeGreaterThanOrEqual(44);
  });
});

describe('QuickAction', () => {
  it('presses, and speaks the long name when the label is short', async () => {
    const onPress = jest.fn();
    await render(
      <QuickAction
        icon="walk-outline"
        label="Acompañar"
        accessibilityLabel="Acompañamiento"
        onPress={onPress}
      />,
    );
    expect(screen.getByText('Acompañar')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Acompañamiento' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a disabled action does not fire', async () => {
    const onPress = jest.fn();
    await render(
      <QuickAction icon="person-add-outline" label="Invitar" onPress={onPress} disabled />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Invitar' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('MembershipCard', () => {
  it('reads as one card with name, tier, id and validity', async () => {
    await render(
      <MembershipCard
        name="Andrés"
        tierLabel="Socio VIP"
        memberId="V-201"
        validity="Vigente hasta dic 2026"
      />,
    );
    expect(
      screen.getByLabelText('Tarjeta de socio: Andrés, Socio VIP, Vigente hasta dic 2026'),
    ).toBeTruthy();
    expect(screen.getByText('V-201 · Vigente hasta dic 2026')).toBeTruthy();
    expect(screen.getByText('N Club')).toBeTruthy();
  });

  it('omits the detail line when there is neither id nor validity', async () => {
    await render(<MembershipCard name="Camila" tierLabel="Socia regular" brand="Club" />);
    expect(screen.getByLabelText('Tarjeta de socio: Camila, Socia regular')).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });
});

describe('StatusChip', () => {
  it('colours each category and falls back to its Spanish name', async () => {
    await render(
      <>
        <StatusChip kind="VIP" />
        <StatusChip kind="REGULAR" />
        <StatusChip kind="GUEST" />
        <StatusChip kind="STAFF" />
        <StatusChip kind="EXTERNAL" />
        <StatusChip kind="ESCALATION" />
      </>,
    );
    const expected = {
      VIP: 'VIP',
      REGULAR: 'Regular',
      GUEST: 'Invitado',
      STAFF: 'Personal',
      EXTERNAL: 'Externo',
      ESCALATION: 'Escalamiento',
    } as const;
    const fills = {
      VIP: colors.forest950,
      REGULAR: 'transparent',
      GUEST: colors.surfaceSoft,
      STAFF: colors.forest800,
      EXTERNAL: 'transparent',
      ESCALATION: colors.dangerBg,
    } as const;
    for (const [kind, label] of Object.entries(expected)) {
      const chip = screen.getByLabelText(label);
      expect(flat(chip).backgroundColor).toBe(fills[kind as keyof typeof fills]);
      expect(flat(chip).borderRadius).toBeUndefined();
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('takes a custom label, a status kind and an icon', async () => {
    await render(
      <>
        <StatusChip kind="success" label="Vigente" icon="checkmark-circle-outline" />
        <StatusChip kind="warning" label="En revisión" />
      </>,
    );
    expect(flat(screen.getByLabelText('Vigente')).backgroundColor).toBe(colors.successBg);
    expect(flat(screen.getByLabelText('En revisión')).backgroundColor).toBe(colors.warningBg);
  });
});

describe('Toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it('renders nothing while hidden', async () => {
    await render(<Toast message="Hola" visible={false} onHide={jest.fn()} />);
    expect(screen.queryByText('Hola')).toBeNull();
  });

  it('announces politely and hides itself after its duration', async () => {
    const onHide = jest.fn();
    await render(<Toast message="Enlace copiado." kind="success" visible onHide={onHide} />);
    expect(screen.getByText('Enlace copiado.')).toBeTruthy();
    expect(withRole('status')).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(3999);
    });
    expect(onHide).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('keeps an error until it is closed and offers its action', async () => {
    const onHide = jest.fn();
    const onAction = jest.fn();
    await render(
      <Toast
        message="No se pudo guardar."
        kind="error"
        visible
        onHide={onHide}
        actionLabel="Reintentar"
        onAction={onAction}
        bottomOffset={64}
      />,
    );
    expect(withRole('alert')).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(onHide).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('useToast shows a message, then hides it', async () => {
    function Demo() {
      const { show, toast } = useToast();
      return (
        <>
          <RNText onPress={() => show('Invitación creada.', 'success')}>abrir</RNText>
          <RNText onPress={() => show('Sin tipo')}>otro</RNText>
          {toast}
        </>
      );
    }
    await render(<Demo />);
    expect(screen.queryByText('Invitación creada.')).toBeNull();
    await fireEvent.press(screen.getByText('abrir'));
    expect(screen.getByText('Invitación creada.')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Invitación creada.')).toBeNull();
    await fireEvent.press(screen.getByText('otro'));
    expect(screen.getByText('Sin tipo')).toBeTruthy();
  });
});

describe('OfflineBanner', () => {
  it('says it is offline and retries only when asked to', async () => {
    const onRetry = jest.fn();
    const { rerender } = await render(<OfflineBanner />);
    expect(screen.getByText(/Sin conexión/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    await rerender(<OfflineBanner message="Sin red" onRetry={onRetry} />);
    expect(screen.getByText('Sin red')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('AppShell and AppScreen', () => {
  it('frames the content with banner, tabs and toast', async () => {
    const onSelect = jest.fn();
    await render(
      <AppShell
        tabs={{ items: TABS, activeKey: 'index', onSelect }}
        banner={<RNText>aviso</RNText>}
        toast={<RNText>brindis</RNText>}
      >
        <RNText>contenido</RNText>
      </AppShell>,
    );
    for (const t of ['contenido', 'aviso', 'brindis']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('works without tabs or banner', async () => {
    await render(
      <AppShell>
        <RNText>solo</RNText>
      </AppShell>,
    );
    expect(screen.getByText('solo')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('AppScreen puts a header over a scrolling or fixed body', async () => {
    const { rerender } = await render(
      <AppScreen title="Inicio" headerContent={<RNText>banda</RNText>}>
        <RNText>cuerpo</RNText>
      </AppScreen>,
    );
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeTruthy();
    expect(screen.getByText('banda')).toBeTruthy();
    expect(screen.getByText('cuerpo')).toBeTruthy();
    await rerender(
      <AppScreen title="Lista" scroll={false}>
        <RNText>fijo</RNText>
      </AppScreen>,
    );
    expect(screen.getByText('fijo')).toBeTruthy();
  });
});

describe('AppTabsLayout', () => {
  const tabs = [
    { key: 'index', href: '/socio', label: 'Inicio', icon: 'home-outline' as const },
    { key: 'perfil', href: '/socio/perfil', label: 'Perfil', icon: 'person-outline' as const },
  ];
  const state = { routes: [{ name: 'perfil' }], index: 0 };

  beforeEach(() => {
    mockNavigate.mockReset();
    mockTabBar = undefined;
    mockParams = {};
  });

  it('draws the bar for the active route and navigates keeping the listed params', async () => {
    mockParams = { perfil: 'V-202', otro: 'x' };
    await render(
      <AppTabsLayout
        tabs={tabs}
        hiddenRoutes={['invitar']}
        keepParams={['perfil']}
        toast={<RNText>t</RNText>}
      />,
    );
    await render(<>{mockTabBar?.({ state })}</>);
    expect(screen.getByRole('tab', { name: 'Perfil' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('tab', { name: 'Inicio' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/socio', params: { perfil: 'V-202' } });
  });

  it('drops params that are absent or not text', async () => {
    mockParams = { perfil: ['a', 'b'] };
    await render(<AppTabsLayout tabs={tabs} keepParams={['perfil', 'fecha']} />);
    await render(<>{mockTabBar?.({ state: { routes: [], index: 0 } })}</>);
    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/socio/perfil', params: {} });
  });
});
