import { fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { StyleSheet } from 'react-native';
import { Badge } from '@/design-system/components/Badge';
import { Banner } from '@/design-system/components/Banner';
import { Button } from '@/design-system/components/Button';
import { Card } from '@/design-system/components/Card';
import { Divider } from '@/design-system/components/Divider';
import { EmptyState } from '@/design-system/components/EmptyState';
import { ErrorState } from '@/design-system/components/ErrorState';
import { Screen } from '@/design-system/components/Screen';
import { Skeleton } from '@/design-system/components/Skeleton';
import { Stepper, VISIT_PHASES } from '@/design-system/components/Stepper';
import { Text } from '@/design-system/components/Text';
import { TextField } from '@/design-system/components/TextField';
import { fontAssets } from '@/design-system/fonts';
import { FontGate } from '@/design-system/FontGate';
import { useFonts } from 'expo-font';
import Showcase from '@/design-system/Showcase';
import { breakpoints, colors, fonts, hitSlop } from '@/design-system/tokens';

// Landmarks and live regions are not accessibility "elements" for RNTL's getByRole, so walk the tree.
const withRole = (role: string) => screen.container.queryAll((n) => n.props?.role === role);

jest.mock('expo-font', () => ({ useFonts: jest.fn() }));
const mockUseFonts = jest.mocked(useFonts);

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never);

describe('Text', () => {
  it('maps heading variants to heading roles with levels', async () => {
    await render(
      <>
        <Text variant="display">Portada</Text>
        <Text variant="h2">Sección</Text>
        <Text variant="body">Cuerpo</Text>
      </>,
    );
    expect(screen.getAllByRole('heading')).toHaveLength(2);
    expect(screen.getByText('Portada').props['aria-level']).toBe(1);
    expect(screen.getByText('Sección').props['aria-level']).toBe(2);
    expect(screen.getByText('Cuerpo').props.role).toBeUndefined();
  });

  it('uses the serif only for headings and Inter for small text', async () => {
    await render(
      <>
        <Text variant="h1">Titular</Text>
        <Text variant="caption">Pie</Text>
      </>,
    );
    expect(flat(screen.getByText('Titular')).fontFamily).toBe(fonts.display);
    expect(flat(screen.getByText('Pie')).fontFamily).toBe(fonts.body);
    expect(flat(screen.getByText('Pie')).fontSize).toBeGreaterThanOrEqual(13);
  });

  it('honours tone, alignment and an explicit heading level', async () => {
    await render(
      <Text variant="h3" level={4} tone="danger" align="center">
        Alerta
      </Text>,
    );
    const el = screen.getByText('Alerta');
    expect(el.props['aria-level']).toBe(4);
    expect(flat(el).color).toBe(colors.danger);
    expect(flat(el).textAlign).toBe('center');
  });
});

describe('Button', () => {
  it('is a button with an accessible name and a 44 px or taller target', async () => {
    const onPress = jest.fn();
    await render(<Button label="Confirmar" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Confirmar' });
    expect(flat(button).minHeight).toBeGreaterThanOrEqual(hitSlop.min);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['sm', 'md', 'lg'] as const)('keeps size %s tappable', async (size) => {
    await render(<Button label="Ir" size={size} />);
    expect(flat(screen.getByRole('button')).minHeight).toBeGreaterThanOrEqual(hitSlop.min);
  });

  it.each([
    'default',
    'primary',
    'outline',
    'secondary',
    'ghost',
    'destructive',
    'danger',
    'link',
  ] as const)('renders the %s variant', async (variant) => {
    await render(<Button label="Acción" variant={variant} />);
    expect(screen.getByRole('button', { name: 'Acción' })).toBeTruthy();
  });

  it('default is black with a gold label, outline has a black line, all corners are square', async () => {
    await render(
      <>
        <Button label="Uno" />
        <Button label="Dos" variant="outline" />
        <Button label="Tres" variant="link" />
      </>,
    );
    const [def, outline, link] = screen
      .getAllByRole('button')
      .map((b) => flat(b as { props: { style?: unknown } }));
    expect(def.backgroundColor).toBe(colors.primary);
    expect(flat(screen.getByText('Uno')).color).toBe(colors.onPrimary);
    expect(outline.backgroundColor).toBe('transparent');
    expect(outline.borderColor).toBe(colors.borderStrong);
    expect(link.borderColor).toBe('transparent');
    expect(flat(screen.getByText('Tres')).textDecorationLine).toBe('underline');
    for (const s of [def, outline, link]) expect(s.borderRadius).toBeUndefined();
  });

  it('renders on dark grounds', async () => {
    await render(
      <>
        <Button label="Uno" onDark />
        <Button label="Dos" onDark variant="secondary" />
        <Button label="Tres" onDark variant="ghost" />
        <Button label="Cuatro" onDark variant="danger" />
      </>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('exposes disabled state and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="No" disabled onPress={onPress} />);
    const button = screen.getByRole('button');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exposes busy state while loading and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="Guardar" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the focus ring only for keyboard focus and forwards focus handlers', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(<Button label="Foco" onFocus={onFocus} onBlur={onBlur} />);
    const button = () => screen.getByRole('button');
    expect(flat(button()).outlineWidth).toBeUndefined();
    await fireEvent(button(), 'focus', { target: { matches: () => false } });
    expect(flat(button()).outlineWidth).toBeUndefined();
    await fireEvent(button(), 'focus', {
      target: { matches: (s: string) => s === ':focus-visible' },
    });
    expect(flat(button()).outlineWidth).toBe(2);
    await fireEvent(button(), 'blur');
    expect(flat(button()).outlineWidth).toBeUndefined();
    expect(onFocus).toHaveBeenCalledTimes(2);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('lets a custom accessibility label replace the visible one', async () => {
    await render(<Button label="Ir" accessibilityLabel="Ir al inicio" />);
    expect(screen.getByRole('button', { name: 'Ir al inicio' })).toBeTruthy();
  });
});

describe('TextField', () => {
  it('shows a visible label, the hint and wires them to the input', async () => {
    await render(<TextField label="Nombre" hint="Como en el documento" required />);
    expect(screen.getByText('Nombre (obligatorio)')).toBeTruthy();
    expect(screen.getByText('Como en el documento')).toBeTruthy();
    const input = screen.getByLabelText('Nombre');
    expect(input.props['aria-required']).toBe(true);
    expect(input.props['aria-describedby']).toMatch(/-hint$/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces the error as an alert and marks the input invalid', async () => {
    await render(<TextField label="Nombre" error="Escriba el nombre." />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Escriba el nombre.');
    expect(alert.props.accessibilityLiveRegion).toBe('assertive');
    const input = screen.getByLabelText('Nombre');
    expect(input.props['aria-invalid']).toBe(true);
    expect(input.props['aria-describedby']).toBe(alert.props.nativeID);
  });

  it('forwards edits and focus, and styles the focused input', async () => {
    const onChangeText = jest.fn();
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(
      <TextField label="Correo" onChangeText={onChangeText} onFocus={onFocus} onBlur={onBlur} />,
    );
    const input = () => screen.getByLabelText('Correo');
    await fireEvent.changeText(input(), 'a@b.co');
    expect(onChangeText).toHaveBeenCalledWith('a@b.co');
    await fireEvent(input(), 'focus');
    expect(flat(input()).borderColor).toBe(colors.borderStrong);
    expect(flat(input()).outlineWidth).toBe(2);
    expect(flat(input()).outlineColor).toBe(colors.gold);
    await fireEvent(input(), 'blur');
    expect(flat(input()).borderColor).toBe(colors.borderStrong);
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });

  it('keeps inputs at a comfortable height and supports read-only and multiline', async () => {
    await render(
      <>
        <TextField label="Libre" />
        <TextField label="Fijo" editable={false} requiredLabel="required" required />
        <TextField label="Notas" multiline />
      </>,
    );
    expect(flat(screen.getByLabelText('Libre')).minHeight).toBeGreaterThanOrEqual(hitSlop.min);
    expect(screen.getByLabelText('Fijo').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByText('Fijo (required)')).toBeTruthy();
    expect(flat(screen.getByLabelText('Notas')).minHeight).toBeGreaterThan(hitSlop.control);
  });
});

describe('Badge', () => {
  it.each([
    ['VIP', 'VIP'],
    ['REGULAR', 'Regular'],
    ['GUEST', 'Invitado'],
    ['STAFF', 'Personal'],
    ['EXTERNAL', 'Externo'],
  ] as const)('labels category %s as %s', async (kind, text) => {
    await render(<Badge kind={kind} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByLabelText(text)).toBeTruthy();
  });

  it('renders status kinds with their own label', async () => {
    await render(
      <>
        <Badge kind="success" label="Validado" />
        <Badge kind="warning" label="Pendiente" />
        <Badge kind="danger" label="Vencido" />
        <Badge kind="info" label="En curso" />
        <Badge kind="neutral" label="Cerrado" />
      </>,
    );
    for (const t of ['Validado', 'Pendiente', 'Vencido', 'En curso', 'Cerrado']) {
      expect(screen.getByText(t)).toBeTruthy();
    }
  });
});

describe('Banner', () => {
  it('announces errors assertively and info politely', async () => {
    await render(
      <>
        <Banner kind="error" title="Falló">
          Detalle del error
        </Banner>
        <Banner title="Aviso">Informativo</Banner>
      </>,
    );
    expect(withRole('alert')[0]?.props.accessibilityLiveRegion).toBe('assertive');
    expect(withRole('status')[0]?.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('Detalle del error')).toBeTruthy();
  });

  it('renders rich children', async () => {
    await render(
      <Banner>
        <Text>Contenido</Text>
      </Banner>,
    );
    expect(screen.getByText('Contenido')).toBeTruthy();
  });
});

describe('Skeleton, Divider and Card', () => {
  it('hides decorative skeletons from assistive tech and exposes labelled ones', async () => {
    await render(
      <>
        <Skeleton />
        <Skeleton label="Cargando invitaciones" />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: 'Cargando invitaciones' })).toBeTruthy();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(1);
  });

  it('draws a separator, plain or accent', async () => {
    await render(
      <>
        <Divider />
        <Divider variant="accent" />
        <Divider onDark />
      </>,
    );
    expect(withRole('separator')).toHaveLength(3);
  });

  it('renders cards in every variant with their content', async () => {
    await render(
      <>
        <Card>
          <Text>Uno</Text>
        </Card>
        <Card variant="soft">
          <Text>Dos</Text>
        </Card>
        <Card variant="dark">
          <Text>Tres</Text>
        </Card>
      </>,
    );
    expect(screen.getByText('Tres')).toBeTruthy();
  });
});

describe('Screen', () => {
  it('renders a main landmark around the content, scrolling or not, light or dark', async () => {
    await render(
      <>
        <Screen>
          <Text>Dentro</Text>
        </Screen>
        <Screen tone="dark" width="narrow" scroll={false}>
          <Text>Fijo</Text>
        </Screen>
      </>,
    );
    expect(withRole('main')).toHaveLength(2);
    expect(screen.getByText('Fijo')).toBeTruthy();
  });
});

describe('EmptyState and ErrorState', () => {
  it('invites an action when empty', async () => {
    const onAction = jest.fn();
    await render(
      <EmptyState
        title="Sin invitaciones"
        description="Cree la primera."
        actionLabel="Crear"
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Sin invitaciones' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Crear' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action and description when not given', async () => {
    await render(<EmptyState title="Nada" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('announces the failure and retries', async () => {
    const onRetry = jest.fn();
    await render(
      <ErrorState title="No cargó" description="Revise la conexión." onRetry={onRetry} />,
    );
    expect(withRole('alert')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows retrying as busy and supports a custom label or no retry', async () => {
    await render(
      <>
        <ErrorState title="Uno" onRetry={() => undefined} retryLabel="Retry" retrying />
        <ErrorState title="Dos" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Retry' }).props.accessibilityState).toMatchObject({
      busy: true,
    });
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('Stepper', () => {
  it('lists the ten visit phases and marks only the current one', async () => {
    await render(<Stepper current={3} />);
    expect(VISIT_PHASES).toHaveLength(10);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(10);
    const current = items.filter((i) => i.props['aria-current'] === 'step');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Paso 4 de 10: Destino y necesidades, en curso');
    expect(items[0]).toHaveAccessibleName('Paso 1 de 10: Registro previo, completado');
    expect(items[9]).toHaveAccessibleName('Paso 10 de 10: Despedida, pendiente');
  });

  it('accepts custom steps, strings and orientation', async () => {
    await render(
      <Stepper
        steps={[
          { key: 'a', label: 'One' },
          { key: 'b', label: 'Two' },
        ]}
        current={0}
        orientation="horizontal"
        accessibilityLabel="Handoff"
        strings={{
          done: 'done',
          current: 'now',
          upcoming: 'later',
          position: (i, n) => `${i}/${n}`,
        }}
      />,
    );
    expect(withRole('list')[0]?.props.accessibilityLabel).toBe('Handoff');
    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName('1/2: One, now');
  });
});

describe('fonts and Showcase', () => {
  it('registers exactly the faces the tokens refer to', () => {
    const used = Object.values(fonts).map((f) => f.split(',')[0]);
    expect(Object.keys(fontAssets).sort()).toEqual([...new Set(used)].sort());
  });

  it('renders the catalogue with every component family and responds to its controls', async () => {
    await render(<Showcase />);
    expect(screen.getByRole('heading', { name: 'Sistema de diseño de N Club' })).toBeTruthy();
    for (const kind of ['VIP', 'Regular', 'Invitado', 'Personal', 'Externo']) {
      expect(screen.getAllByText(kind).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(14);

    await fireEvent.press(screen.getByRole('button', { name: 'Fase siguiente' }));
    expect(
      screen.getAllByRole('listitem').filter((i) => i.props['aria-current'] === 'step'),
    ).toHaveLength(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Fase anterior' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));

    const name = screen.getByLabelText('Nombre del invitado');
    await fireEvent(name, 'blur');
    expect(screen.getByText('Escriba el nombre del invitado.')).toBeTruthy();
    await fireEvent.changeText(name, 'Camila Ortega');
  });

  it('keeps breakpoints in sync with the brief', () => {
    expect(breakpoints).toEqual({ tablet: 768, desktop: 1200 });
  });
});

describe('FontGate', () => {
  it('waits behind an announced busy screen until fonts are ready', async () => {
    mockUseFonts.mockReturnValue([false, null]);
    await render(
      <FontGate label="Cargando fuentes">
        <Text>App</Text>
      </FontGate>,
    );
    expect(screen.queryByText('App')).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Cargando fuentes' })).toBeTruthy();
  });

  it('renders the app once fonts load, or if loading fails', async () => {
    mockUseFonts.mockReturnValue([true, null]);
    const { unmount } = await render(
      <FontGate>
        <Text>App</Text>
      </FontGate>,
    );
    expect(screen.getByText('App')).toBeTruthy();
    await unmount();
    mockUseFonts.mockReturnValue([false, new Error('x')]);
    await render(
      <FontGate>
        <Text>Sin fuentes</Text>
      </FontGate>,
    );
    expect(screen.getByText('Sin fuentes')).toBeTruthy();
  });
});
