import { fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Avatar, initialsOf } from '@/design-system/components/Avatar';
import { ListRow } from '@/design-system/components/ListRow';
import { useInsets } from '@/design-system/components/useInsets';
import { colors } from '@/design-system/tokens';
import { DemoFrame } from '@/features/shared/DemoRibbon';

describe('Avatar', () => {
  it('takes up to two initials', () => {
    expect(initialsOf('Andrés Gómez Ruiz')).toBe('AG');
    expect(initialsOf('  camila ')).toBe('C');
  });

  it('is decorative without a label and an image with one', async () => {
    await render(
      <>
        <Avatar name="Andrés Gómez" />
        <Avatar name="Sofía" tone="forest" label="Sofía, edecán" size={56} />
      </>,
    );
    expect(screen.getByText('AG', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Sofía, edecán' })).toBeTruthy();
    expect(screen.queryAllByRole('image')).toHaveLength(1);
  });

  it('is square, soft with ink text by default, and takes a gold ring', async () => {
    await render(
      <>
        <Avatar name="Laura Díaz" label="Laura" />
        <Avatar name="Pedro Gómez" label="Pedro" ring />
      </>,
    );
    const [plain, ring] = screen
      .getAllByRole('image')
      .map((i) => StyleSheet.flatten(i.props.style));
    expect(plain.borderRadius).toBeUndefined();
    expect(plain.backgroundColor).toBe(colors.surfaceSoft);
    expect(plain.borderWidth).toBeUndefined();
    expect(ring.borderColor).toBe(colors.gold);
  });

  it('paints the gold tone', async () => {
    await render(<Avatar name="Mario" tone="gold" label="Mario" />);
    const style = StyleSheet.flatten(screen.getByRole('image').props.style);
    expect(style.backgroundColor).toBe(colors.gold);
  });
});

describe('ListRow', () => {
  it('reads title and description, and presses', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow icon="person-outline" title="Socio VIP" description="Andrés" onPress={onPress} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Socio VIP, Andrés' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a link with Enter support when it navigates', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow
        icon="notifications-outline"
        title="Edecán"
        tint="gold"
        role="link"
        accessibilityLabel="Sofía, Edecán"
        onPress={onPress}
      />,
    );
    const row = screen.getByRole('link', { name: 'Sofía, Edecán' });
    row.props.onKeyDown({ key: 'Tab' });
    expect(onPress).not.toHaveBeenCalled();
    row.props.onKeyDown({ key: 'Enter' });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is flat: black line, gold icon, no tile and no corners', async () => {
    await render(
      <ListRow icon="construct-outline" title="Trabajador externo" onPress={jest.fn()} />,
    );
    const style = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Trabajador externo' }).props.style,
    );
    expect(style.borderColor).toBe(colors.border);
    expect(style.borderRadius).toBeUndefined();
    expect(style.boxShadow).toBeUndefined();
  });

  it('the featured row has a gold line', async () => {
    await render(<ListRow icon="home-outline" title="Entrar" featured onPress={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Entrar' }).props.style);
    expect(style.borderColor).toBe(colors.gold);
  });
});

describe('DemoFrame', () => {
  it('no pinta ningún listón y deja el inset superior a las pantallas', async () => {
    const Probe = () => {
      const i = useInsets();
      return <Text>{`top=${i.top} bottom=${i.bottom}`}</Text>;
    };
    await render(
      <SafeAreaInsetsContext.Provider value={{ top: 44, bottom: 34, left: 0, right: 0 }}>
        <DemoFrame>
          <Probe />
        </DemoFrame>
      </SafeAreaInsetsContext.Provider>,
    );
    expect(screen.getByText('top=44 bottom=34')).toBeTruthy();
    expect(screen.queryByLabelText(/demostración/i)).toBeNull();
  });
});
